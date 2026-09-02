本文档以 二进制部署为基础，XtraBackup 为备份方案，GTID 为复制协议，MGR 实现高可用，ProxySQL 实现读写分离，构建了一套完整的 MySQL 高可用架构方案。

## 一、架构简介
### 1.1 架构优势
| 场景       | 技术选型       | 说明                                   |
| -------- | ---------- | ------------------------------------ |
| MySQL 安装 | 二进制包       | ✅ 版本可控，路径标准，生产唯一选择                   |
| 备份恢复     | XtraBackup | ✅物理备份，速度快，生产必用                       |
| 主从复制     | GTID       | ✅ 自动定位同步点，无需手动指定 binlog 文件与位置，不断线    |
| 主库宕机     | MGR        | ✅ MySQL 官方原生高可用方案，内置自动选举，切换时间约 3-5 秒 |
| 读写分离     | ProxySQL   | ✅对应用透明，路由灵活，生产标准组件                   |
### 1.2 应用场景
- 日均 50 万 ~ 1000 万 PV 的业务
- 注册用户 500 万 ~ 5000 万 级别
- 读多写少的典型互联网业务
### 1.3 架构图
```ini
用户请求
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ProxySQL(192.168.100.234:6033)                                         │
│  职责：读写分离                                                          │
│  ├── SELECT → 路由到读组(hostgroup=2)→ node2/node3                       │
│  └── INSERT/UPDATE/DELETE → 路由到写组(hostgroup=0)→ node1               │
└─────────────────────────────────┬───────────────────────────────────────┘
                                 │
┌─────────────────────────────────┼───────────────────────────────────────┐
│  MGR 三节点集群                                                          │
│                                                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                │
│  │   node1       │  │   node2       │  │   node3       │                │
│  │   PRIMARY     │◄─►│   SECONDARY   │◄─►│   SECONDARY │                │
│  │   (可写)     │  │   (只读)     │  │   (只读)         │                │
│  │   3306        │  │   3306        │  │   3306        │                │
│  └───────────────┘  └───────────────┘  └───────────────┘                │
│         │                  │                  │                         │
│         └──────────────────┼──────────────────┘                         │
│                            │                                            │
│                      33061 端口(MGR 内部通信)                            │
│                      Paxos 协议自动选举                                  │
└─────────────────────────────────────────────────────────────────────────┘
```
### 1.4 安装顺序图
```ini
┌──────────────────────────────────────────────────────────────────────────────┐
│                    MGR + ProxySQL安装顺序图                                   │
│                                                                              │
│  1. 三台机器安装 MySQL 8.0.41(node1/node2/node3)                              │
│     ├── 下载二进制包、解压、创建用户、初始化数据库                               │
│     ├── 创建数据目录、日志目录、PID 目录                                        │
│     ├── 配置 systemd 服务、设置开机自启                                        │
│     └── 运行安全配置脚本(mysql_secure_installation)                           │
│     │                                                                        │
│     ▼                                                                        │
│  2. 配置三台 my.cnf(基础参数，不含 group_replication 参数)                     │
│     ├── SSL 加密配置(ssl_ca/cert/key)                                        │
│     ├── GTID 开启(gtid_mode=ON, enforce_gtid_consistency=ON)                │
│     ├── server-id(node1=1, node2=2, node3=3)                                │
│     ├── report_host设置                                                      │
│     ├── Binlog 配置(ROW 格式、7天过期、sync_binlog=1)                         │
│     ├── InnoDB 配置(缓冲池、Redo Log、并发等)                                 │
│     └── 其他基础配置(连接、字符集、慢查询、SQL模式等)                           │
│     │                                                                        │
│     ▼                                                                        │
│  3. 三台安装 group_replication 插件                                          │
│     ├── 启动 MySQL 服务(systemctl start mysqld)                              │
│     ├── 确认 SSL/GTID 状态正常                                                │
│     └── 执行插件加载(以下二选一)                                               │
│         ├── 方案一(推荐)：INSTALL PLUGIN group_replication SONAME ...         │
│         └── 方案二(兜底)：my.cnf 中添加 plugin_load_add = group_replication.so │
│     │                                                                        │
│     ▼                                                                        │
│  4. 添加 group_replication 参数到 my.cnf                                     │
│     ├── disabled_storage_engines(禁用非事务引擎)                             │
│     ├── group_replication_group_name(集群 UUID)                             │
│     ├── group_replication_local_address(本机 IP:33061)                      │
│     ├── group_replication_group_seeds(三台种子节点)                          │
│     ├── group_replication_bootstrap_group = OFF                              │
│     ├── group_replication_start_on_boot = OFF                                │
│     ├── group_replication_single_primary_mode = ON                           │
│     ├── group_replication_ip_allowlist(白名单网段)                           │
│     ├── group_replication_exit_state_action = READ_ONLY                      │
│     └── group_replication_member_expel_timeout = 5                           │
│     │                                                                        │
│     ▼                                                                        │
│  5. 重启三台 MySQL，验证配置生效                                              │
│     ├── systemctl restart mysqld                                             │
│     ├── 验证 have_ssl = YES                                                  │
│     ├── 验证 gtid_mode = ON                                                  │
│     ├── 验证 server_id = 1/2/3                                              │
│     └── 验证 group_replication 插件 = ACTIVE                                 │
│     │                                                                        │
│     ▼                                                                        │
│  6. 搭建 MGR 集群                                                             │
│     ├── node1(192.168.100.231)引导启动(bootstrap)                            │
│     │   └── SET GLOBAL group_replication_bootstrap_group = ON;              │
│     │   └── START GROUP_REPLICATION;                                        │
│     │   └── SET GLOBAL group_replication_bootstrap_group = OFF;             │
│     ├── node2(192.168.100.232)加入集群                                     │
│     │   └── START GROUP_REPLICATION;                                        │
│     ├── node3(192.168.100.233)加入集群                                     │
│     │   └── START GROUP_REPLICATION;                                        │
│     ├── 三台安装 Clone 插件(支持新节点全量恢复)                              │
│     │   └── INSTALL PLUGIN clone SONAME 'mysql_clone.so';                   │
│     │   └── 为 repl 用户授予 BACKUP_ADMIN 权限                              │
│     │                                                                        │
│     ▼                                                                        │
│  7. 验证 MGR 集群状态(三台 ONLINE，一台 PRIMARY)                              │
│     └── SELECT * FROM performance_schema.replication_group_members;         │
│     │                                                                        │
│     ▼                                                                        │
│  8. 创建应用用户和监控用户(在 node1 执行，MGR 自动同步)                         │
│     ├── app_user(业务用，密码 App@Pass123)                                   │
│     └── monitor(ProxySQL 监控用)                                             │
│     │                                                                        │
│     ▼                                                                        │
│  9. 第四台机器安装 ProxySQL 3.x                                              │
│     ├── 下载安装 ProxySQL 二进制包或 RPM                                      │
│     ├── 配置 systemd 服务                                                    │
│     └── 启动 ProxySQL(service proxysql start)                              │
│     │                                                                        │
│     ▼                                                                        │
│  10. 配置 ProxySQL                                                           │
│      ├── 连接管理口并修改密码(mysql -u admin -p -h 127.0.0.1 -P 6032)       │
│      ├── 配置 MGR 主机组映射(写组=0，读组=2，离线组=3)                      │
│      ├── 添加三台 MGR 节点(hostgroup_id=0)                                 │
│      ├── 配置监控用户(monitor)                                             │
│      ├── 开启 MGR 监控(mysql-monitor_enable_group_replication=true)        │
│      ├── 配置读写分离规则(SELECT→读组，INSERT/UPDATE/DELETE→写组)          │
│      └── 添加 app_user 用户映射(用于应用连接认证)                           │
│      │                                                                        │
│      ▼                                                                        │
│  11. 验证读写分离 + MGR 高可用                                                │
│      ├── SELECT 查询走 node2/node3(读组)                                   │
│      ├── INSERT/UPDATE/DELETE 走 node1(写组)                               │
│      ├── node1 宕机后，node2/node3 自动选举新 PRIMARY                        │
│      └── ProxySQL 自动感知切换，写组路由到新主库                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 二、前置条件
### 2.1 虚拟机规划

| 虚拟机      | 角色                | IP              | 说明               |
| -------- | ----------------- | --------------- | ---------------- |
| Node 1   | MGR 节点(PRIMARY)   | 192.168.100.231 | 可写节点，MGR 集群第 1 台 |
| Node 2   | MGR 节点(SECONDARY) | 192.168.100.232 | 只读节点，MGR 集群第 2 台 |
| Node 3   | MGR 节点(SECONDARY) | 192.168.100.233 | 只读节点，MGR 集群第 3 台 |
| ProxySQL | 读写分离中间件           | 192.168.100.234 | 独立部署，对应用透明路由     |

**说明：** 4 台虚拟机是生产级最小可行配置。MGR 最少需要 3 个节点才能实现高可用，ProxySQL 独立部署避免资源争抢。

💡 如果资源有限，ProxySQL 可以与 Node 3 共用一台机器，但生产环境建议独立部署。
### 2.2 系统跟软件
1. 系统 :RockyLinux 8.10
2. 数据库：MySQL 8.0.41
3. 数据备份:Percona XtraBackup 8.0.35-36
4. 中间件读写分离: ProxySQL  3.0.x 稳定版
5. MGR管理 ：MySQL Shell  8.0.41+
6. MGR :  8.0.41 或更新版本(跟数据库一致)
### 2.3 端口用途总结
| 端口    | 用途              | 对内网开放          | 对外网开放                |
| ----- | --------------- | -------------- | -------------------- |
| 3306  | MySQL 服务端口      | ✅ 必须           | ❌不开放(通过 ProxySQL 访问) |
| 33061 | MGR 节点间通信(XCom) | ✅ 必须(三节点互连)    | ❌ 不开放                |
| 6032  | ProxySQL 管理端口   | ⚠️ 仅限 DBA 管理网段 | ❌ 不开放                |
| 6033  | ProxySQL 应用连接端口 | ✅ 必须(应用连接)     | ⚠️ 仅限应用服务器网段         |
### 2.4 防火墙设置
```ini
┌─────────────────────────────────────────────────────────────────────────┐
│  应用服务器(192.168.100.0/24 或独立网段)                                   │
│  └── 只允许访问 ProxySQL:6033                                            │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ProxySQL(192.168.100.234)                                              │
│  ├── 6033：应用连接(应用服务器网段)                                       │
│  └── 6032：管理端口(DBA 网段)                                            │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  MGR 三节点(192.168.100.231~234)                                          │
│  ├── 3306：允许 ProxySQL IP 访问                                         │
│  └── 33061：三节点互连(同网段)                                            │
└─────────────────────────────────────────────────────────────────────────┘
```
 ✅ 隔离逻辑完整，应用无法直连数据库。
1. 所有 MGR 节点(Node1、Node2、Node3)
```bash
# 允许 192.168.100.0/24 网段的所有机器访问本机的 3306 端口(MySQL 服务端口)
# 这样 ProxySQL 和同网段的管理工具可以连接数据库，但外部网络无法访问
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.100.0/24" port port="3306" protocol="tcp" accept'

# 允许 192.168.100.0/24 网段访问本机的 33061 端口(MGR 节点间通信端口)
# 三台 MGR 节点需要通过此端口进行 Paxos 协议通信和心跳检测
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.100.0/24" port port="33061" protocol="tcp" accept'

# 重新加载防火墙配置，使上述规则立即生效
sudo firewall-cmd --reload
```
2. ProxySQL 节点
```bash
# 允许 192.168.100.0/24 网段访问 6032 端口(ProxySQL 管理端口)
# DBA 通过此端口执行 SHOW 命令、修改路由规则、查看统计信息等管理操作
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.100.0/24" port port="6032" protocol="tcp" accept'

# 允许应用服务器网段访问 6033 端口(ProxySQL 应用连接端口)
# 应用程序通过此端口发送 SQL 请求，由 ProxySQL 解析后路由到主库或从库
# 注意："应用服务器网段"需要替换为实际的网段，如 192.168.20.0/24
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="应用服务器网段" port port="6033" protocol="tcp" accept'

# 重新加载防火墙配置，使规则生效
sudo firewall-cmd --reload
```
3. SELinux 权限设置
```bash
sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config
```
### 2.5 主机名解析配置
**说明：** 后续新增 MGR 节点时，需在所有现有节点的 `/etc/hosts` 中追加新节点的映射，保持全网一致。
```bash
# 所有 MGR 节点均执行
sudo cat >> /etc/hosts << 'EOF'
192.168.100.231 Node1
192.168.100.232 Node2
192.168.100.233 Node3
EOF

# 如果后续新增节点，也需同步更新所有机器的 /etc/hosts
```
配置后验证：
```
ping -c 1 Node1 && ping -c 1 Node2 && ping -c 1 Node3 && echo "All hosts resolved OK"
```
返回 All hosts resolved OK 即全部解析正常。

## 三、安装 MySQL 数据库
**注意** ：本章节所有操作需在三台 MGR 节点(Node 1、Node 2、Node 3)上分别执行。
### 3.1 下载安装包
```bash
# 查看 glibc 版本，确定下载哪个包
ldd --version
```
💡 ldd --version 用于确认系统 glibc 版本，确保下载的二进制包与系统兼容：
```bash
# 进入下载目录
cd /usr/local/src

# 下载 MySQL 8.0.41(以 8.0.41 为例，实际版本号请查看官网)
sudo wget https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.41-linux-glibc2.28-x86_64.tar.xz
```
💡 选择 Linux - Generic 类型，不要选 "Red Hat"(那是 RPM 包)。
### 3.2 安装依赖包
```bash
sudo dnf install -y libaio numactl-libs ncurses-compat-libs
```
### 3.3 创建 mysql 用户和组
```bash
# 创建 mysql 用户(-r 表示系统用户，-s /sbin/nologin 表示不允许登录)
sudo useradd -r -s /sbin/nologin mysql
```
### 3.4 解压并安装
```bash
# 解压二进制包
sudo tar -xvf mysql-8.0.41-linux-glibc2.28-x86_64.tar.xz -C /usr/local/

# 重命名目录
sudo mv /usr/local/mysql-8.0.41-linux-glibc2.28-x86_64 /usr/local/mysql
```
- 使用固定路径便于后续脚本管理
- `/usr/local/` 是 Unix 系统存放本地编译/第三方软件的标准路径
### 3.5 设置目录权限
```bash
# 安装目录(程序文件)归 root 所有
sudo chown -R root:root /usr/local/mysql

# 创建数据目录
sudo mkdir -p /data/mysql
sudo mkdir -p /var/log/mysql

# 数据目录和日志目录归 mysql 用户所有
sudo chown -R mysql:mysql /data/mysql
sudo chown -R mysql:mysql /var/log/mysql
```
### 3.6 配置环境变量
```bash
# 编辑 /etc/profile
sudo vi /etc/profile

# 在文件末尾添加
export PATH=/usr/local/mysql/bin:$PATH

# 使配置生效
source /etc/profile

# 验证
mysql --version
```
输出以下内容
```text
mysql  Ver 8.0.41 for Linux on x86_64 (MySQL Community Server - GPL)
```
### 3.7 初始化数据库
```bash
sudo /usr/local/mysql/bin/mysqld --initialize \
  --user=mysql \
  --basedir=/usr/local/mysql \
  --datadir=/data/mysql \
  --log-error=/var/log/mysql/error.log
```
查看临时密码(首次登录需要密码)
```text
sudo grep 'temporary password' /var/log/mysql/error.log
```
### 3.8 创建配置文件
**说明：** 本实验环境每台虚拟机内存分配 2 GB，因此 `innodb_buffer_pool_size` 设置为 1 GB。
```bash
sudo vi /etc/my.cnf
```
写入以下内容：
```ini
[mysqld]
# ============================================
# 基础路径
# ============================================
basedir = /usr/local/mysql
datadir = /data/mysql
socket = /tmp/mysql.sock
log-error = /var/log/mysql/error.log
pid-file = /var/run/mysqld/mysqld.pid

# ============================================
# 连接配置
# ============================================
port = 3306
max_connections = 1000
max_connect_errors = 10000
connect_timeout = 10
wait_timeout = 28800
interactive_timeout = 28800

# ============================================
# 字符集
# ============================================
character-set-server = utf8mb4
collation-server = utf8mb4_general_ci
init-connect = 'SET NAMES utf8mb4'

# ============================================
# 错误日志
# ============================================
log_error = /var/log/mysql/error.log

# ============================================
# 慢查询日志(生产环境必须开启)
# ============================================
slow_query_log = ON
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
log_queries_not_using_indexes = ON
min_examined_row_limit = 100

# 通用查询日志(生产环境不建议开启，仅在排查问题时开启)
# general_log = OFF
# general_log_file = /var/log/mysql/general.log

# ============================================
# Binlog 配置
# ============================================
log_bin = /var/log/mysql/mysql-bin
log_bin_index = /var/log/mysql/mysql-bin.index
binlog_format = ROW
binlog_row_image = FULL
binlog_cache_size = 32K
max_binlog_size = 1G
binlog_expire_logs_seconds = 604800   # 7天
sync_binlog = 1

# ============================================
# InnoDB 缓冲池(★ 最重要，根据实际内存调整)
# ============================================
# 建议：物理内存的 50%~80%
# 16G内存 → 8G~10G，32G内存 → 16G~24G，64G内存 → 32G~48G
innodb_buffer_pool_size = 1G
innodb_buffer_pool_instances = 8
innodb_buffer_pool_dump_at_shutdown = ON
innodb_buffer_pool_load_at_startup = ON

# ============================================
# InnoDB Redo Log(MySQL 8.0.30+ 推荐使用新参数)
# ============================================
innodb_redo_log_capacity = 1G
innodb_log_buffer_size = 64M
innodb_flush_log_at_trx_commit = 1

# ============================================
# InnoDB 文件配置
# ============================================
innodb_file_per_table = ON
# ⚠️ 不要手动设置 innodb_data_file_path，让 MySQL 使用默认值
# 如果已经初始化过数据目录，设置此参数会导致启动失败

# ============================================
# InnoDB 并发配置
# ============================================
innodb_thread_concurrency = 0
innodb_read_io_threads = 8
innodb_write_io_threads = 8
innodb_io_capacity = 2000
innodb_io_capacity_max = 4000
innodb_flush_neighbors = 0

# ============================================
# InnoDB 锁配置
# ============================================
innodb_lock_wait_timeout = 10
innodb_deadlock_detect = ON
innodb_print_all_deadlocks = ON

# ============================================
# InnoDB 双写缓冲(生产环境保持开启)
# ============================================
innodb_doublewrite = ON

# ============================================
# 临时表配置
# ============================================
tmp_table_size = 64M
max_heap_table_size = 64M

# ============================================
# 排序与连接缓冲区
# ============================================
sort_buffer_size = 4M
join_buffer_size = 4M
read_buffer_size = 2M
read_rnd_buffer_size = 4M

# ============================================
# 表缓存
# ============================================
table_open_cache = 2000
table_definition_cache = 2000
open_files_limit = 65535

# ============================================
# SQL 模式(根据业务调整)
# ============================================
sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'

# ============================================
# 其他优化
# ============================================
max_allowed_packet = 64M
thread_cache_size = 256


[client]
# ============================================
# 客户端配置
# ============================================
port = 3306
socket = /tmp/mysql.sock
default-character-set = utf8mb4


[mysql]
# ============================================
# mysql 命令行客户端配置
# ============================================
default-character-set = utf8mb4
prompt = "mysql> "
```
### 3.9 创建 PID 目录
MySQL 的 pid-file 配置指向 /var/run/mysqld/mysqld.pid，但该目录默认不存在，需要提前创建。
```bash
sudo mkdir -p /var/run/mysqld
sudo chown mysql:mysql /var/run/mysqld

# 验证
ls -ld /var/run/mysqld
```
💡 /var/run/ 是临时文件系统，每次系统重启会被清空。后续通过 systemd 的 RuntimeDirectory 指令可以在服务启动时自动创建该目录，无需每次手动干预。
### 3.10 配置 systemd 服务
```bash
sudo vim /etc/systemd/system/mysqld.service
```
输入以下内容
```ini
[Unit]
Description=MySQL Server
Documentation=http://dev.mysql.com/doc/refman/en/using-systemd.html
After=network.target

[Service]
User=mysql
Group=mysql

# 自动创建 /run/mysqld 目录(/var/run 是 /run 的软链接)
RuntimeDirectory=mysqld
RuntimeDirectoryMode=0755

# 启动命令
ExecStart=/usr/local/mysql/bin/mysqld --defaults-file=/etc/my.cnf

# 资源限制
LimitNOFILE=65535
LimitNPROC=65535

# 崩溃后自动重启
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```
### 3.11 设置开机自启动
```bash
# 重新加载 systemd 配置
sudo systemctl daemon-reload

# 开机自启动 MySQL
sudo systemctl enable --now mysqld

# 查看状态
sudo systemctl status mysqld
```
### 3.12 运行安全配置脚本
数据库账号 root，密码统一设置 Mysql@root123
```bash
sudo /usr/local/mysql/bin/mysql_secure_installation
```
交互式配置选项：

| 问题              | 建议操作 | 说明          |
| --------------- | ---- | ----------- |
| 是否设置 root 密码？   | 输入 Y | 如果已设置，会跳过   |
| 是否移除匿名用户？       | 输入 Y | 强烈建议，防止匿名访问 |
| 是否禁止 root 远程登录？ | 输入 Y | 生产环境建议      |
| 是否删除测试数据库？      | 输入 Y | 删除 test 数据库 |
| 是否重新加载权限表？      | 输入 Y | 使更改立即生效     |

## 四、配置 my.conf 
### 4.1 主库配置
#### 4.1.1 SSL 加密复制配置
1. 确认主库 SSL 状态，Mysql 一般是默认自动
```sql
SHOW VARIABLES LIKE 'have_ssl';
```
- YES：SSL 已启用 → 继续下一步
- DISABLED：SSL 未启用，需要先启用
2. 确认证书文件存在
```bash
ls -la /data/mysql/*.pem
```
应看到 ca.pem、server-cert.pem、server-key.pem。

3. 在主库 my.cnf 的 [mysqld] 段添加
```ini
# ============================================
# SSL加密复制配置
# ============================================
ssl_ca = /data/mysql/ca.pem
ssl_cert = /data/mysql/server-cert.pem
ssl_key = /data/mysql/server-key.pem
```
4. 重启主库
```bash
sudo systemctl restart mysqld
```
5. 验证 SSL 是否启动
```sql
SHOW VARIABLES LIKE 'have_ssl';
-- 应返回 YES
```
#### 4.1.2 GTID 开启
```bash
sudo vim /etc/my.cnf
```
添加以下内容
```ini
# ============================================
# GTID 配置(MGR 必须开启)
# ============================================
gtid_mode = ON
enforce_gtid_consistency = ON
# MGR 强制要求：从库应用的日志也写入本机 Binlog 
log_slave_updates = ON
```
#### 4.1.3 server-id 设置
```bash
sudo vim /etc/my.cnf
```
添加以下内容
```ini
# ============================================
# 服务ID
# ============================================
server-id=1
```
#### 4.1.4 report_host 设置
```bash
sudo vim /etc/my.cnf
```
添加以下内容
```
# ============================================
# 上报给其他 MGR 节点的通信地址(建议使用 IP)
# 作用：覆盖操作系统 hostname，避免因 DNS 解析失败导致节点无法互相连接
# 节点分别配置为本机 IP
# ============================================
report_host = 192.168.100.231
```
#### 4.1.5 强制要求表必须有主键
```
# ============================================
# 强制要求表必须有主键(MGR 必须)
# ============================================
sql_require_primary_key = ON
```
#### 4.1.6 插件加载与 group_replication 参数
```bash
sudo vim /etc/my.cnf
```
添加以下内容
```ini
# ============================================
# 插件加载(必须先加载，否则 MGR 参数无法识别)
# ============================================
# 兼容性更好的写法(loose_前缀，MySQL不支持该参数时只报warning不影响启动)：
# loose_plugin_load_add = group_replication.so
# 当前使用的写法(实测可用)：
plugin_load_add = group_replication.so
# ============================================
# MGR 配置
# ============================================
disabled_storage_engines = "MyISAM,BLACKHOLE,FEDERATED,ARCHIVE,MEMORY"
group_replication_group_name = "095fe5ec-dd46-478f-aba4-f3d0cfc938a4"
group_replication_local_address = "192.168.100.231:33061"
group_replication_group_seeds = "192.168.100.231:33061,192.168.100.232:33061,192.168.100.233:33061"
group_replication_bootstrap_group = OFF
group_replication_start_on_boot = OFF
group_replication_single_primary_mode = ON
group_replication_ip_allowlist = "192.168.100.0/24"
group_replication_exit_state_action = READ_ONLY
group_replication_member_expel_timeout = 5
```
### 4.2 从库服务器配置
从库服务器有 2 台，根据两台从库进行一些参数修改。
#### 4.2.1 SSL 加密复制配置
1. 在从库 my.cnf 的 [mysqld] 段添加
```ini
# ============================================
# SSL加密复制配置
# ============================================
ssl_ca = /data/mysql/ca.pem
ssl_cert = /data/mysql/server-cert.pem
ssl_key = /data/mysql/server-key.pem
```
#### 4.2.2 GTID 开启
```bash
sudo vim /etc/my.cnf
```
添加以下内容
```ini
# ============================================
# GTID 配置(MGR 必须开启)
# ============================================
gtid_mode = ON
enforce_gtid_consistency = ON
# MGR 强制要求：从库应用的日志也写入本机 Binlog 
log_slave_updates = ON
```
#### 4.2.3 server-id 设置
server-id 配置 每台机器都不一样,一台从库是 2，第二台从库是 3
```bash
sudo vim /etc/my.cnf
```
添加以下内容
```ini
# ============================================
# 服务ID(第一台从库是2，第二台从库是3)
# ============================================
server-id=2
```
#### 4.2.4 report_host 设置
覆盖操作系统 hostname，避免因 DNS 解析失败导致节点无法互相连接
```bash
sudo vim /etc/my.cnf
```
添加以下内容
```
# ============================================
# 上报给其他 MGR 节点的通信地址(建议使用 IP)
# 作用：覆盖操作系统 hostname，避免因 DNS 解析失败导致节点无法互相连接
# 节点分别配置为本机 IP
# ============================================
report_host = 192.168.100.232
```
#### 4.2.5 强制要求表必须有主键
```
# ============================================
# 强制要求表必须有主键(MGR 必须)
# ============================================
sql_require_primary_key = ON
```
#### 4.2.6插件加载与 group_replication 参数
group_replication_local_address =“ip:33061”,IP 根据 2 台从库不同进行相对应修改
```bash
sudo vim /etc/my.cnf
```
添加以下内容
```ini
# ============================================
# 插件加载(必须先加载，否则 MGR 参数无法识别)
# ============================================
# 兼容性更好的写法(loose_前缀，MySQL不支持该参数时只报warning不影响启动)：
# loose_plugin_load_add = group_replication.so
# 当前使用的写法(实测可用)：
plugin_load_add = group_replication.so
# ============================================
# MGR 配置
# ============================================
disabled_storage_engines = "MyISAM,BLACKHOLE,FEDERATED,ARCHIVE,MEMORY"
group_replication_group_name = "095fe5ec-dd46-478f-aba4-f3d0cfc938a4"
# IP地址改成192.168.100.232:33061,192.168.100.233:33061
group_replication_local_address = "192.168.100.232:33061"
group_replication_group_seeds = "192.168.100.231:33061,192.168.100.232:33061,192.168.100.233:33061"
group_replication_bootstrap_group = OFF
group_replication_start_on_boot = OFF
group_replication_single_primary_mode = ON
group_replication_ip_allowlist = "192.168.100.0/24"
group_replication_exit_state_action = READ_ONLY
group_replication_member_expel_timeout = 5
```
### 4.3 重启 MySQL
三台主从机器都重启 MySQL 服务
```bash
sudo systemctl restart mysqld
```
### 4.4 验证状态
三台机器都验证下
```sql
# 输出 YES
SHOW VARIABLES LIKE 'have_ssl';

# 验证GTID，输出 ON
SHOW VARIABLES LIKE 'gtid_mode';

# 验证 server-id
SHOW VARIABLES LIKE 'server_id';

#查看插件是否安装 应输出 group_replication | ACTIVE。
SELECT PLUGIN_NAME, PLUGIN_STATUS FROM INFORMATION_SCHEMA.PLUGINS WHERE PLUGIN_NAME = 'group_replication';
```

## 五、搭建 MGR 集群
**说明 :** 三台 MySQL 当前都是全新空库(初始化后未写入业务数据)，数据完全一致。MGR 启动时会自动完成节点间的数据同步，不需要人工干预。
#### 5.1 创建复制用户
三台机器都创建同个用户
```sql
-- 允许整个网段
CREATE USER 'repl'@'192.168.100.%' IDENTIFIED WITH mysql_native_password BY 'Repl@Pass123';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'192.168.100.%';
FLUSH PRIVILEGES;
```
#### 5.2 配置恢复通道
三台机器都执行以下操作
```sql
-- 1. 清空 GTID 执行记录和 binlog(仅全新实例可用，注意风险)
RESET MASTER;
-- 2. 清空所有复制通道配置
RESET REPLICA ALL;
-- 3. 配置恢复通道
CHANGE REPLICATION SOURCE TO 
  SOURCE_USER='repl', 
  SOURCE_PASSWORD='Repl@Pass123' 
FOR CHANNEL 'group_replication_recovery';
```
 **注意：** 此步骤中的 `RESET MASTER` 会清空所有 binlog 文件和 GTID执行记录，仅在全新实例首次搭建时使用。如果某节点已有业务数据，切勿执行此操作，需改用其他方式处理 GTID 冲突。
### 5.3 主库引导启动
```sql
SET GLOBAL group_replication_bootstrap_group = ON;
START GROUP_REPLICATION;
SET GLOBAL group_replication_bootstrap_group = OFF;
```
### 5.4 从库加入集群
2 台从库数据库要加入集群
```sql
START GROUP_REPLICATION;
```
### 5.5 验证 MGR 集群状态
三台都可以执行验证
```sql
SELECT * FROM performance_schema.replication_group_members;
```
输出以下内容
```text
mysql> SELECT * FROM performance_schema.replication_group_members;
+---------------------------+--------------------------------------+-----------------+-------------+--------------+-------------+----------------+----------------------------+
| CHANNEL_NAME              | MEMBER_ID                            | MEMBER_HOST     | MEMBER_PORT | MEMBER_STATE | MEMBER_ROLE | MEMBER_VERSION | MEMBER_COMMUNICATION_STACK |
+---------------------------+--------------------------------------+-----------------+-------------+--------------+-------------+----------------+----------------------------+
| group_replication_applier | 16a04515-8fd6-11f1-9812-000c2994df28 | 192.168.100.231 |        3306 | ONLINE       | PRIMARY     | 8.0.41         | XCom                       |
| group_replication_applier | 3d9ccad8-8fd7-11f1-8f51-000c29104a28 | 192.168.100.233 |        3306 | ONLINE       | SECONDARY   | 8.0.41         | XCom                       |
| group_replication_applier | a0f5757b-8fd6-11f1-9348-000c2968e4a3 | 192.168.100.232 |        3306 | ONLINE       | SECONDARY   | 8.0.41         | XCom                       |
+---------------------------+--------------------------------------+-----------------+-------------+--------------+-------------+----------------+----------------------------+
3 rows in set (0.00 sec)
```
- MEMBER_STATE 字段显示 ONLINE，就代表都正常
### 5.6 安装 Clone 插件
**说明：** 新节点加入 MGR 集群时，如果与现有节点数据差异较大，MGR 会使用 Clone 插件进行全量数据恢复。建议在所有 MGR 节点(现有 + 未来新增)上提前安装，确保自动恢复能力。
```sql
INSTALL PLUGIN clone SONAME 'mysql_clone.so';
```
验证是否安装成功：
```sql
SELECT PLUGIN_NAME, PLUGIN_STATUS 
FROM INFORMATION_SCHEMA.PLUGINS 
WHERE PLUGIN_NAME = 'clone';
```
输出以下内容

| PLUGIN_NAME | PLUGIN_STATUS |
| ----------- | ------------- |
| clone       | ACTIVE        |

注意： 为支持 Clone 全量恢复，复制用户 repl 需额外拥有 BACKUP_ADMIN 权限：
```sql
GRANT BACKUP_ADMIN ON *.* TO 'repl'@'192.168.100.%';
FLUSH PRIVILEGES;
```

## 六、创建应用用户和监控用户
**说明：** 仅在 Node1(PRIMARY 节点)执行
- 账号 app_user
用途： 给应用程序(你的业务代码)连接数据库用的账号。应用通过 ProxySQL 的 6033 端口连接到数据库时，使用的就是这个账号。
- 账号 monitor
用途： 给 ProxySQL 用来监控后端 MySQL 节点健康状态的账号。ProxySQL 会定期用这个账号连接每一台 MGR 节点，检测节点是否存活、复制延迟、主从角色等。
```sql
-- ✅ 应用用户：允许同网段内所有应用服务器连接
CREATE USER 'app_user'@'192.168.100.%' IDENTIFIED WITH mysql_native_password BY 'App@Pass123';
GRANT SELECT, INSERT, UPDATE, DELETE ON *.* TO 'app_user'@'192.168.100.%';

-- ✅ 监控用户：仅允许 ProxySQL 本机 IP 连接
CREATE USER 'monitor'@'192.168.100.234' IDENTIFIED BY 'Monitor@Pass123';
GRANT REPLICATION CLIENT ON *.* TO 'monitor'@'192.168.100.234';
GRANT SELECT ON performance_schema.* TO 'monitor'@'192.168.100.234';
GRANT PROCESS ON *.* TO 'monitor'@'192.168.100.234';

FLUSH PRIVILEGES;
```

## 七、配置 ProxySQL
⚠️ 在第四台机器(192.168.100.234)上执行
### 7.1 下载与安装
```bash
# 下载
cd /usr/local/src
sudo wget https://github.com/sysown/proxysql/releases/download/v3.0.9/proxysql-3.0.9-1.almalinux8.x86_64.rpm
# 安装 proxysql
sudo dnf install proxysql-3.0.9-1.almalinux8.x86_64.rpm -y
# 安装mysql客户端
sudo dnf install mysql -y
# 开机自启动
sudo systemctl enable --now proxysql

```
💡 更多安装包可访问：https://github.com/sysown/proxysql/releases
### 7.2 连接管理口
登录 ProxySQL 管理接口
```bash
mysql -u admin -padmin -h 127.0.0.1 -P 6032
```
修改管理员凭证
```sql
-- 查看当前凭证
SELECT variable_value FROM global_variables WHERE variable_name='admin-admin_credentials';

-- 更新为新用户和密码(格式：用户名:密码)
UPDATE global_variables SET variable_value='admin:Proxy@Pass123' WHERE variable_name='admin-admin_credentials';

-- 加载到运行时环境(立即生效)
LOAD ADMIN VARIABLES TO RUNTIME;

-- 持久化到磁盘(重启后依然生效)
SAVE ADMIN VARIABLES TO DISK;
```
### 7.3 配置监控用户并开启 MGR 监控
```sql
-- 配置监控用户
UPDATE global_variables SET variable_value='monitor' WHERE variable_name='mysql-monitor_username';
UPDATE global_variables SET variable_value='Monitor@Pass123' WHERE variable_name='mysql-monitor_password';
-- 开启 MGR 监控
UPDATE global_variables SET variable_value='true' WHERE variable_name='mysql-monitor_enable_group_replication';

LOAD MYSQL VARIABLES TO RUNTIME;
SAVE MYSQL VARIABLES TO DISK;
```
### 7.4 配置 MGR 主机组映射
⚠️ 在 ProxySQL 管理接口(6032)中执行
```sql
-- 1. 删除之前硬编码的服务器配置(如果有)
DELETE FROM mysql_servers;

-- 2. 配置 MGR 主机组映射(核心步骤)
INSERT INTO mysql_group_replication_hostgroups 
    (writer_hostgroup, backup_writer_hostgroup, reader_hostgroup, offline_hostgroup, active, max_writers, writer_is_also_reader) 
VALUES 
    (0, 1, 2, 3, 1, 1, 0);

-- 3. 添加所有 MGR 节点，hostgroup_id 可以暂时都设为 0
--    ProxySQL 会根据 MGR 状态自动将它们移动到正确的 Hostgroup
INSERT INTO mysql_servers (hostgroup_id, hostname, port) VALUES 
(0, '192.168.100.231', 3306),
(0, '192.168.100.232', 3306),
(0, '192.168.100.233', 3306);

-- 4. 加载并保存配置
LOAD MYSQL SERVERS TO RUNTIME;
SAVE MYSQL SERVERS TO DISK;
```
### 7.5 验证节点分配
查看节点是否被正确分配到写组/读组
```sql
SELECT hostgroup_id, hostname, port, status 
FROM runtime_mysql_servers 
ORDER BY hostgroup_id;
```
输出以下内容
```text
mysql> SELECT hostgroup_id, hostname, port, status 
    -> FROM runtime_mysql_servers 
    -> ORDER BY hostgroup_id;
+--------------+-----------------+------+--------+
| hostgroup_id | hostname        | port | status |
+--------------+-----------------+------+--------+
| 0            | 192.168.100.231 | 3306 | ONLINE |
| 2            | 192.168.100.232 | 3306 | ONLINE |
| 2            | 192.168.100.233 | 3306 | ONLINE |
+--------------+-----------------+------+--------+
3 rows in set (0.00 sec)
```
- hostgroup 0：写组，只有 PRIMARY
- hostgroup 2：读组，两个 SECONDARY
- 三台状态均为 ONLINE
### 7.6 配置读写分离规则
在 ProxySQL 管理接口(6032)中执行：
```sql
-- ============================================
-- 清理已有规则(如有)
-- ============================================
DELETE FROM mysql_query_rules;

-- ============================================
-- 规则1：START TRANSACTION 必须走写组(优先级最高)
-- 防止事务开启时被误路由到读组，确保事务从开启到结束始终在写组连接上完成。
-- ============================================
INSERT INTO mysql_query_rules (rule_id, active, match_digest, destination_hostgroup, apply)
VALUES (5, 1, '^START TRANSACTION', 0, 1);

-- ============================================
-- 规则2：SELECT ... FOR UPDATE 必须走写组(优先级第二)
-- ============================================
INSERT INTO mysql_query_rules (rule_id, active, match_digest, destination_hostgroup, apply)
VALUES (10, 1, '^SELECT.*FOR UPDATE', 0, 1);

-- ============================================
-- 规则3：普通 SELECT 走读组
-- ============================================
INSERT INTO mysql_query_rules (rule_id, active, match_digest, destination_hostgroup, apply)
VALUES (20, 1, '^SELECT', 2, 1);

-- ============================================
-- 规则4：所有其他语句(INSERT/UPDATE/DELETE等)走写组
-- ============================================
INSERT INTO mysql_query_rules (rule_id, active, match_digest, destination_hostgroup, apply)
VALUES (30, 1, '^.*', 0, 1);

-- ============================================
-- 加载并持久化
-- ============================================
LOAD MYSQL QUERY RULES TO RUNTIME;
SAVE MYSQL QUERY RULES TO DISK;
```
### 7.7 添加用户映射
ProxySQL 需要将用户添加到 mysql_users 表中，客户端通过 6033 端口连接时才能认证通过。
在 ProxySQL 管理口 6032 执行
```sql
-- ============================================
-- 添加 app_user 用户映射
-- ============================================
INSERT INTO mysql_users (username, password, active, default_hostgroup, transaction_persistent) 
VALUES ('app_user', 'App@Pass123', 1, 0, 1);

LOAD MYSQL USERS TO RUNTIME;
SAVE MYSQL USERS TO DISK;

-- 验证用户已添加
SELECT username, active, default_hostgroup, transaction_persistent 
FROM mysql_users 
WHERE username = 'app_user';
```
### 7.8 Proxy 服务验证
1. 确认节点是否正常
```sql
SELECT hostgroup_id, hostname, port, status FROM runtime_mysql_servers ORDER BY hostgroup_id;
```
输出以下内容
```text
mysql> SELECT hostgroup_id, hostname, port, status FROM runtime_mysql_servers ORDER BY hostgroup_id;
+--------------+-----------------+------+--------+
| hostgroup_id | hostname        | port | status |
+--------------+-----------------+------+--------+
| 0            | 192.168.100.231 | 3306 | ONLINE |
| 2            | 192.168.100.232 | 3306 | ONLINE |
| 2            | 192.168.100.233 | 3306 | ONLINE |
+--------------+-----------------+------+--------+
3 rows in set (0.00 sec)
```
**判断标准：** hostgroup_id 中，0 代表写组，2 代表读组。
写组只有 1 个 PRIMARY，读组是 2 个 SECONDARY，三台均为 ONLINE → 正常
2. 确认读写分离规则已加载
```sql
SELECT rule_id, active, match_digest, destination_hostgroup FROM mysql_query_rules ORDER BY rule_id;
```
输出以下内容
```text
mysql> SELECT rule_id, active, match_digest, destination_hostgroup FROM mysql_query_rules ORDER BY rule_id;
+---------+--------+----------------------+-----------------------+
| rule_id | active | match_digest         | destination_hostgroup |
+---------+--------+----------------------+-----------------------+
| 10      | 1      | ^SELECT.*FOR UPDATE$ | 0                     |
| 20      | 1      | ^SELECT              | 2                     |
| 30      | 1      | ^.*                  | 0                     |
+---------+--------+----------------------+-----------------------+
3 rows in set (0.00 sec)
```
**判断标准：** 三条规则均 active=1，且匹配顺序正确(FOR UPDATE 优先于普通 SELECT)→ 正常
3. 确认 app_user 用户映射已添加
```sql
SELECT username, active, default_hostgroup FROM mysql_users WHERE username='app_user';
```
输出以下内容
```text
mysql> SELECT username, active, default_hostgroup FROM mysql_users WHERE username='app_user';
+----------+--------+-------------------+
| username | active | default_hostgroup |
+----------+--------+-------------------+
| app_user | 1      | 0                 |
+----------+--------+-------------------+
1 row in set (0.01 sec)
```
**判断标准：** app_user 已添加，active=1(启用)，default_hostgroup=0(兜底写组)，客户端可通过 6033 端口连接认证。
4. 确认监控用户已配置并生效
```sql
SELECT * FROM monitor.mysql_server_group_replication_log ORDER BY time_start_us DESC LIMIT 5;
```
输出以下内容
```text
mysql> SELECT * FROM monitor.mysql_server_group_replication_log ORDER BY time_start_us DESC LIMIT 5;
+-----------------+------+------------------+-----------------+------------------+-----------+---------------------+-------+
| hostname        | port | time_start_us    | success_time_us | viable_candidate | read_only | transactions_behind | error |
+-----------------+------+------------------+-----------------+------------------+-----------+---------------------+-------+
| 192.168.100.233 | 3306 | 1785912676349219 | 2218            | YES              | YES       | 0                   | NULL  |
| 192.168.100.232 | 3306 | 1785912676349118 | 2237            | YES              | YES       | 0                   | NULL  |
| 192.168.100.231 | 3306 | 1785912676348817 | 2399            | YES              | NO        | 0                   | NULL  |
| 192.168.100.233 | 3306 | 1785912671348968 | 2242            | YES              | YES       | 0                   | NULL  |
| 192.168.100.232 | 3306 | 1785912671348943 | 2294            | YES              | YES       | 0                   | NULL  |
+-----------------+------+------------------+-----------------+------------------+-----------+---------------------+-------+
5 rows in set (0.00 sec)
```
**判断标准：**
- `read_only=NO` 的是 PRIMARY(231)→ 正确
- `read_only=YES` 的是 SECONDARY(232/233)→ 正确
- 全部 `viable_candidate=YES`(可作为候选主节点)→ 正常
- 全部 `error=NULL`(无错误)→ 正常

## 八、验证功能
### 8.1 验证读写分离
1. 用 root 先创建好测试环境(在 Node1 上执行)
```sql
-- 登录 主库(PRIMARY)MySQL
mysql -u root -pMysql@root123
```
输入以下内容
```
CREATE DATABASE test_db;
USE test_db;
CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(20));
INSERT INTO users VALUES (1, 'initial');
```
2. 用 app_user 通过 ProxySQL 6033 端口验证读写分离
```bash
# 在任意能访问 6033 端口的机器执行
mysql -u app_user -p'App@Pass123' -h 192.168.100.234 -P 6033
```
输入以下内容
```sql
SELECT * FROM test_db.users;              -- 读操作，预期走读组
INSERT INTO test_db.users VALUES (2, 'test');  -- 写操作，预期走写组
UPDATE test_db.users SET name = 'updated' WHERE id = 2;  -- 写操作
DELETE FROM test_db.users WHERE id = 2;    -- 写操作
```
3. 在 ProxySQL 管理端口查看路由统计
```sql
SELECT hostgroup, digest_text, count_star FROM stats_mysql_query_digest ORDER BY count_star DESC LIMIT 20;
```
### 8.2 验证 MGR 高可用
1. 查看当前集群状态(从库服务器上执行)
```sql
SELECT MEMBER_HOST, MEMBER_PORT, MEMBER_STATE, MEMBER_ROLE 
FROM performance_schema.replication_group_members;
```

2. 模拟主库故障：(主库执行)
```bash
sudo systemctl stop mysqld
```
**说明:**  sudo systemctl stop mysqld 会彻底关闭 MySQL 服务，恢复时需重新启动并重新加入 MGR。使用 STOP GROUP_REPLICATION 仅停止 MGR 插件，更轻量、更快速。

3. 查看集群状态：(从库操作)
```sql
SELECT MEMBER_HOST, MEMBER_PORT, MEMBER_STATE, MEMBER_ROLE 
FROM performance_schema.replication_group_members;
```
**说明：** 因配置了 `group_replication_member_expel_timeout=5`，集群约需 5~10 秒完成故障检测和选举。 从库其中一台 应变为 PRIMARY。

4. 查看 ProxySQL 节点分组
```sql
SELECT hostgroup_id, hostname, port, status 
FROM runtime_mysql_servers 
ORDER BY hostgroup_id;
```
输出以下内容
```
mysql> SELECT hostgroup_id, hostname, port, status 
    -> FROM runtime_mysql_servers 
    -> ORDER BY hostgroup_id;
+--------------+-----------------+------+---------+
| hostgroup_id | hostname        | port | status  |
+--------------+-----------------+------+---------+
| 0            | 192.168.100.233 | 3306 | ONLINE  |
| 2            | 192.168.100.232 | 3306 | ONLINE  |
| 3            | 192.168.100.231 | 3306 | SHUNNED |
+--------------+-----------------+------+---------+
3 rows in set (0.01 sec)
```
新 PRIMARY 应自动移入写组(0)，旧 PRIMARY 移出写组，SHUNNED 是 ProxySQL 对故障节点的隔离状态。

5. 恢复原主库节点
```bash
sudo systemctl start mysqld
```
进入数据库
```bash
mysql -uroot -pMysql@root123
```
重新加入集群
```sql
START GROUP_REPLICATION;
```
6. 再次查看集群状态
```sql
SELECT MEMBER_HOST, MEMBER_PORT, MEMBER_STATE, MEMBER_ROLE 
FROM performance_schema.replication_group_members;
```
**说明：** 恢复后的原主节点会自动以 SECONDARY 身份加入集群，不会抢占 PRIMARY。如需手动切回，可使用 `group_replication_set_as_primary()` 函数。
### 8.3 验证业务读写
进入数据库
```bash
mysql -u app_user -p'App@Pass123' -h 192.168.100.234 -P 6033
```
输入以下内容
```sql
INSERT INTO test_db.users VALUES (4, 'after_recovery');
SELECT * FROM test_db.users;
```

## 九、常见事项汇总
### 9.1 服务器重设写组
1. 获取 机器的 MEMBER_ID(在任一节点执行)
```sql
SELECT MEMBER_ID, MEMBER_HOST, MEMBER_ROLE 
FROM performance_schema.replication_group_members 
WHERE MEMBER_HOST = '192.168.100.231';
```
假设返回的 MEMBER_ID 是 16a04515-8fd6-11f1-9812-000c2994df28(根据你之前的记录，231 的 ID 就是这个值)。

2. 执行切换命令(在任一 MGR 节点上执行)
```sql
SELECT group_replication_set_as_primary('16a04515-8fd6-11f1-9812-000c2994df28');
```
执行位置： 任意一台 MGR 节点(Node1/Node2/Node3)的 MySQL 客户端(3306 端口)，不是 ProxySQL 管理口(6032)。

3. 验证切换结果
```sql
SELECT MEMBER_HOST, MEMBER_ROLE FROM performance_schema.replication_group_members;
```

4. 确认 ProxySQL 自动感知

切换完成后，在 ProxySQL 管理口(6032)查看：
```sql
SELECT hostgroup_id, hostname, port, status 
FROM runtime_mysql_servers 
ORDER BY hostgroup_id;
```
**说明：** 通常不需要手动切回，让当前 PRIMARY 继续服务即可，避免不必要的切换风险。手动切换期间，集群会有短暂只读(约 1~2 秒)，ProxySQL 会自动感知并路由写流量到新主，应用无感知。
### 9.2 新增 MGR 节点
**场景：** 当业务增长或需要替换故障节点时，需向现有 MGR 集群中添加新的 MySQL 节点。

**前提条件：** 现有集群已正常运行(3 节点)，新节点已安装 MySQL 8.0.41(按照第三章操作)。

#### 9.2.1 新节点基础配置
1. 配置 /etc/hosts(可选，便于日志查看和脚本执行)
```bash
sudo cat >> /etc/hosts << 'EOF'
192.168.100.231 Node1
192.168.100.232 Node2
192.168.100.233 Node3
192.168.100.235 Node4
EOF

```
2. 防火墙配置(按文档 2.4 节执行)
```bash
# 允许 MGR 网段访问 3306 和 33061
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.100.0/24" port port="3306" protocol="tcp" accept'
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.100.0/24" port port="33061" protocol="tcp" accept'
sudo firewall-cmd --reload
```
3. SELinux 设置
```bash
sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config
```
#### 9.2.2 配置my.cnf
基于文档第四章的配置模板，修改以下参数：
```ini
[mysqld]
# ============================================
# ★★★ 以下参数需要修改 ★★★
# ============================================

# 服务 ID：必须与现有节点不同(现有 1、2、3，新节点用 4)
server-id = 4

# 上报地址：填写新节点本机 IP
report_host = 192.168.100.235

# 本机 MGR 通信地址
group_replication_local_address = "192.168.100.235:33061"

# seeds 列表需包含新节点自身
group_replication_group_seeds = "192.168.100.231:33061,192.168.100.232:33061,192.168.100.233:33061,192.168.100.235:33061"

# ============================================
# ★★★ 以下参数与现有集群保持一致，无需修改 ★★★
# ============================================

# 基础路径(按文档 3.8 节配置)
basedir = /usr/local/mysql
datadir = /data/mysql
socket = /tmp/mysql.sock
log-error = /var/log/mysql/error.log
pid-file = /var/run/mysqld/mysqld.pid

# 连接配置
port = 3306
max_connections = 1000
max_connect_errors = 10000
connect_timeout = 10
wait_timeout = 28800
interactive_timeout = 28800

# 字符集
character-set-server = utf8mb4
collation-server = utf8mb4_general_ci
init-connect = 'SET NAMES utf8mb4'

# 错误日志
log_error = /var/log/mysql/error.log

# 慢查询日志
slow_query_log = ON
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
log_queries_not_using_indexes = ON
min_examined_row_limit = 100

# Binlog 配置
log_bin = /var/log/mysql/mysql-bin
log_bin_index = /var/log/mysql/mysql-bin.index
binlog_format = ROW
binlog_row_image = FULL
binlog_cache_size = 32K
max_binlog_size = 1G
binlog_expire_logs_seconds = 604800
sync_binlog = 1

# InnoDB 配置(根据新节点内存调整)
innodb_buffer_pool_size = 1G
innodb_buffer_pool_instances = 8
innodb_buffer_pool_dump_at_shutdown = ON
innodb_buffer_pool_load_at_startup = ON
innodb_redo_log_capacity = 1G
innodb_log_buffer_size = 64M
innodb_flush_log_at_trx_commit = 1
innodb_file_per_table = ON
innodb_thread_concurrency = 0
innodb_read_io_threads = 8
innodb_write_io_threads = 8
innodb_io_capacity = 2000
innodb_io_capacity_max = 4000
innodb_flush_neighbors = 0
innodb_lock_wait_timeout = 10
innodb_deadlock_detect = ON
innodb_print_all_deadlocks = ON
innodb_doublewrite = ON

# 临时表配置
tmp_table_size = 64M
max_heap_table_size = 64M

# 排序与连接缓冲区
sort_buffer_size = 4M
join_buffer_size = 4M
read_buffer_size = 2M
read_rnd_buffer_size = 4M

# 表缓存
table_open_cache = 2000
table_definition_cache = 2000
open_files_limit = 65535

# SQL 模式
sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'

# 其他优化
max_allowed_packet = 64M
thread_cache_size = 256

# SSL 加密复制
ssl_ca = /data/mysql/ca.pem
ssl_cert = /data/mysql/server-cert.pem
ssl_key = /data/mysql/server-key.pem

# GTID 配置
gtid_mode = ON
enforce_gtid_consistency = ON
log_slave_updates = ON

# 强制主键
sql_require_primary_key = ON

# 插件加载
plugin_load_add = group_replication.so

# MGR 配置(除 server-id、local_address、report_host、seeds 外，其余与集群一致)
disabled_storage_engines = "MyISAM,BLACKHOLE,FEDERATED,ARCHIVE,MEMORY"
group_replication_group_name = "095fe5ec-dd46-478f-aba4-f3d0cfc938a4"
group_replication_bootstrap_group = OFF
group_replication_start_on_boot = OFF
group_replication_single_primary_mode = ON
group_replication_ip_allowlist = "192.168.100.0/24"
group_replication_exit_state_action = READ_ONLY
group_replication_member_expel_timeout = 5

[client]
port = 3306
socket = /tmp/mysql.sock
default-character-set = utf8mb4

[mysql]
default-character-set = utf8mb4
prompt = "mysql> "

```
**说明：** 新节点加入后，建议在所有现有节点的 group_replication_group_seeds 中追加新节点 IP(需重启 MySQL)。此操作非必需，但有利于节点重启后快速加入集群。
#### 9.2.3 启动新节点 MySQL
```bash
sudo systemctl enable --now mysqld
sudo systemctl status mysqld
```
#### 9.2.4 创建复制用户并配置恢复通道
```sql
-- 登录新节点 MySQL
mysql -uroot -pMysql@root123

-- 创建复制用户(与文档 5.1 节一致)
CREATE USER 'repl'@'192.168.100.%' IDENTIFIED WITH mysql_native_password BY 'Repl@Pass123';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'192.168.100.%';
GRANT BACKUP_ADMIN ON *.* TO 'repl'@'192.168.100.%';
FLUSH PRIVILEGES;

-- 配置恢复通道(与文档 5.2 节一致)
CHANGE REPLICATION SOURCE TO 
  SOURCE_USER='repl', 
  SOURCE_PASSWORD='Repl@Pass123' 
FOR CHANNEL 'group_replication_recovery';
```
#### 9.2.5 安装 Clone 插件
```sql
INSTALL PLUGIN clone SONAME 'mysql_clone.so';
```
验证：
```sql
-- PLUGIN_STATUS状态显示ACTIVE
SELECT PLUGIN_NAME, PLUGIN_STATUS 
FROM INFORMATION_SCHEMA.PLUGINS 
WHERE PLUGIN_NAME = 'clone';
```
#### 9.2.6 XtraBackup 恢复数据(可选)
**适用场景：** 当集群数据量较大(建议超过 50 GB)或希望减少 MGR Clone 对生产环境的影响时，建议先通过 XtraBackup 恢复数据到新节点，再执行加入操作。如果数据量较小，可直接跳过此步骤，由 MGR 自动完成 Clone 全量恢复。

**建议：** 如果数据量较小(< 50 GB)，可跳过此步骤，直接执行 9.2.7 加入集群。

1. 安装 Percona XtraBackup(从库节点执行)
```bash
# Node2 或 Node3 上执行
sudo dnf install -y https://repo.percona.com/yum/percona-release-latest.noarch.rpm
sudo percona-release enable-only tools
sudo dnf install -y percona-xtrabackup-80

# 验证安装
xtrabackup --version
```
2. 创建备份用户(在主库节点执行)
```sql
CREATE USER 'backup_user'@'192.168.100.%' IDENTIFIED BY 'Backup@Pass123';
GRANT RELOAD, PROCESS, LOCK TABLES, REPLICATION CLIENT ON *.* TO 'backup_user'@'192.168.100.%';
GRANT SELECT ON performance_schema.* TO 'backup_user'@'192.168.100.%';
FLUSH PRIVILEGES;
```
3. 在从库执行全量备份
```bash
# Node2 或 Node3 上执行
mkdir -p /backup/mysql


xtrabackup --backup \
  --target-dir=/backup/mysql/full_$(date +%Y%m%d_%H%M%S) \
  --host=192.168.100.232 \
  --port=3306 \
  --user=backup_user \
  --password='Backup@Pass123' \
  --backup-lock-timeout=60

# 先查看具体目录名
ls -la /backup/mysql/full_*
# 使用具体目录名执行 prepare(请将下面的路径替换为实际目录名)
xtrabackup --prepare --target-dir=/backup/mysql/full_20250101_020000

# 压缩备份
tar -czf /backup/mysql/full_backup.tar.gz -C /backup/mysql $(ls -t /backup/mysql | grep full_ | head -1)
```
4. 将备份文件传输到新节点
```bash
# Node2 或 Node3 上执行
scp /backup/mysql/full_backup.tar.gz root@192.168.100.235:/backup/
```
5. 停止新节点 MySQL 并清空数据目录
```bash
# 新节点执行
sudo systemctl stop mysqld
sudo rm -rf /data/mysql/*
```
6. 解压并恢复数据到新节点
```bash
# 新节点执行
mkdir -p /backup/restore
tar -xzf /backup/full_backup.tar.gz -C /backup/restore

# 先查看解压后的目录名
ls -la /backup/restore/
# 使用具体目录名执行恢复
xtrabackup --copy-back --target-dir=/backup/restore/full_20250101_020000 --datadir=/data/mysql

sudo chown -R mysql:mysql /data/mysql
```
7. 启动新节点 MySQL
```bash
sudo systemctl start mysqld
sudo systemctl status mysqld
```
**说明：**  恢复完成后，新节点拥有与备份时刻一致的数据。执行 START GROUP_REPLICATION 时，MGR 会自动通过增量恢复追平备份后产生的增量事务，无需全量 Clone。

#### 9.2.7 新节点加入集群
⚠️ 严禁执行 SET GLOBAL group_replication_bootstrap_group = ON，仅执行 START
```sql
START GROUP_REPLICATION;
```
#### 9.2.8 验证加入状态
1. 查看集群成员列表(在任意节点执行)
```sql
SELECT MEMBER_HOST, MEMBER_PORT, MEMBER_STATE, MEMBER_ROLE 
FROM performance_schema.replication_group_members 
ORDER BY MEMBER_HOST;
```
新节点状态先为 RECOVERING(正在同步数据)，完成后变为 ONLINE。

2. 监控恢复进度(新节点执行)
```sql
SELECT STATE, STAGE, ESTIMATE, DATA_DOWNLOADED 
FROM performance_schema.clone_status;
```
如果跳过了 9.2.6 XtraBackup 恢复，此表可查看 Clone 进度；如果已通过 XtraBackup 恢复，此表可能为空，属正常现象。

#### 9.2.9 确认 ProxySQL 自动识别
在 ProxySQL 管理口(6032)执行：
```sql
SELECT hostgroup_id, hostname, port, status 
FROM runtime_mysql_servers 
ORDER BY hostgroup_id;
```
### 9.3 故障节点重新加入
**场景：** 某节点因网络抖动、宕机、MGR 插件异常等原因被集群踢出后，需要手动重新加入。

**前提条件：** 该节点的 MySQL 进程正常，数据目录未被损坏，且 GTID 与集群一致。

1. 查看节点当前状态(在 PRIMARY 执行)
```sql
SELECT MEMBER_HOST, MEMBER_PORT, MEMBER_STATE, MEMBER_ROLE 
FROM performance_schema.replication_group_members;
```
2. 停止 MGR 并重置配置(在故障节点执行)
如果该节点尚处于 MGR 启动状态，需先停止：
```sql
STOP GROUP_REPLICATION;
RESET REPLICA ALL;
```
3. 配置恢复通道(在故障节点执行)
```sql
CHANGE REPLICATION SOURCE TO 
  SOURCE_USER='repl', 
  SOURCE_PASSWORD='Repl@Pass123' 
FOR CHANNEL 'group_replication_recovery';
```
4. 重新加入集群(在故障节点执行)
```sql
START GROUP_REPLICATION;
```
5. 验证(在任意节点执行)
```sql
SELECT MEMBER_HOST, MEMBER_PORT, MEMBER_STATE, MEMBER_ROLE 
FROM performance_schema.replication_group_members;
```
### 9.4 数据备份
**场景：** 4 节点 MGR 集群正常运行，需对数据进行周期性备份，用于灾难恢复或数据重建。

**说明：**  固定选择一台 SECONDARY 节点(如 Node 2)执行备份，避免对 PRIMARY 造成性能影响。在生产环境的 4 节点 MGR 集群中，每周执行一次 XtraBackup 全量备份是标准操作。

1. 安装 Percona XtraBackup
```bash
sudo dnf install -y https://repo.percona.com/yum/percona-release-latest.noarch.rpm
sudo percona-release enable-only tools
sudo dnf install -y percona-xtrabackup-80

# 验证安装
xtrabackup --version
```
2. 创建备份用户(在 PRIMARY 执行)
```sql
CREATE USER 'backup_user'@'192.168.100.%' IDENTIFIED BY 'Backup@Pass123';
GRANT RELOAD, PROCESS, LOCK TABLES, REPLICATION CLIENT ON *.* TO 'backup_user'@'192.168.100.%';
GRANT SELECT ON performance_schema.* TO 'backup_user'@'192.168.100.%';
FLUSH PRIVILEGES;
```
3. 创建备份目录
```bash
sudo mkdir -p /backup/mysql
sudo chown -R root:root /backup/mysql
```
原因： crontab 以 root 执行，备份目录属主为 root 最自然，不会产生权限问题。

4. 创建全量备份脚本
在 Node2 创建 /usr/local/bin/mysql_full_backup.sh：
```bash
sudo vi /usr/local/bin/mysql_full_backup.sh
```
写入以下内容：
```bash
#!/bin/bash
# ============================================
# 全量备份脚本(在 SECONDARY 节点执行)
# ============================================

BACKUP_DIR="/backup/mysql"
DATE=$(date +%Y%m%d_%H%M%S)
FULL_BACKUP_DIR="${BACKUP_DIR}/full_${DATE}"
RETENTION_DAYS=28
BACKUP_USER="backup_user"
BACKUP_PASSWORD="Backup@Pass123"
BACKUP_HOST="192.168.100.232"

mkdir -p ${BACKUP_DIR}

# 1. 执行全量备份
/usr/bin/xtrabackup --backup \
  --target-dir=${FULL_BACKUP_DIR} \
  --host=${BACKUP_HOST} \
  --port=3306 \
  --user=${BACKUP_USER} \
  --password=${BACKUP_PASSWORD} \
  --backup-lock-timeout=60 \
  --datadir=/data/mysql

# 2. 检查备份是否成功
if [ $? -ne 0 ]; then
    echo "Backup failed at $(date)" >> /var/log/mysql_backup.log
    exit 1
fi

# 3. 准备备份(应用 redo log，使数据一致性)
/usr/bin/xtrabackup --prepare --target-dir=${FULL_BACKUP_DIR}

# 4. 删除超过保留期的备份
find ${BACKUP_DIR} -maxdepth 1 -name "full_*" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \;
find ${BACKUP_DIR} -maxdepth 1 -name "inc_*" -type d -mtime +7 -exec rm -rf {} \;

# 5. 记录日志
echo "Full backup completed: ${FULL_BACKUP_DIR} at $(date)" >> /var/log/mysql_backup.log
```
5. 创建增量备份脚本
```bash
sudo vi /usr/local/bin/mysql_incremental_backup.sh
```
写入以下内容：
```bash
#!/bin/bash
# ============================================
# 增量备份脚本(在 SECONDARY 节点执行)
# ============================================

BACKUP_DIR="/backup/mysql"
DATE=$(date +%Y%m%d)
INC_BACKUP_DIR="${BACKUP_DIR}/inc_${DATE}_$(date +%H%M%S)"
BACKUP_USER="backup_user"
BACKUP_PASSWORD="Backup@Pass123"
BACKUP_HOST="192.168.100.232"

# 1. 查找最近一次全量备份目录
FULL_BACKUP_DIR=$(ls -dt ${BACKUP_DIR}/full_* 2>/dev/null | head -1)

if [ -z "${FULL_BACKUP_DIR}" ]; then
    echo "No full backup found, skipping incremental backup at $(date)" >> /var/log/mysql_backup.log
    exit 1
fi

# 2. 执行增量备份
/usr/bin/xtrabackup --backup \
  --target-dir=${INC_BACKUP_DIR} \
  --incremental-basedir=${FULL_BACKUP_DIR} \
  --host=${BACKUP_HOST} \
  --port=3306 \
  --user=${BACKUP_USER} \
  --password=${BACKUP_PASSWORD}

# 3. 检查备份是否成功
if [ $? -ne 0 ]; then
    echo "Incremental backup failed at $(date)" >> /var/log/mysql_backup.log
    exit 1
fi

# 4. 记录日志
echo "Incremental backup completed: ${INC_BACKUP_DIR} at $(date)" >> /var/log/mysql_backup.log
```
6. 赋予脚本执行权限
```bash
sudo chmod +x /usr/local/bin/mysql_full_backup.sh
sudo chmod +x /usr/local/bin/mysql_incremental_backup.sh
```
7. 测试脚本
```bash
# 先执行全量备份
sudo /usr/local/bin/mysql_full_backup.sh
# 确认全量备份完成后，再执行增量备份(验证依赖关系)
sudo /usr/local/bin/mysql_incremental_backup.sh
```
8. 设置定时任务
```bash
sudo crontab -e
```
添加以下内容：
```bash
# 每周日凌晨 2:00 执行全量备份
0 2 * * 0 /usr/local/bin/mysql_full_backup.sh >> /var/log/mysql_backup.log 2>&1
# 每天凌晨 3:00 执行增量备份
0 3 * * * /usr/local/bin/mysql_incremental_backup.sh >> /var/log/mysql_backup.log 2>&1
```
9. 验证定时任务
```bash
sudo crontab -l
```
### 9.5 数据恢复
**场景：** 节点数据损坏、误删数据、或需要将整个集群恢复到某个时间点。

**说明：** 数据恢复为紧急操作，通常在以下情况触发：
- 某节点数据目录损坏，需从备份重建
- 误执行 `DROP TABLE` / `DROP DATABASE` / `UPDATE` 不带 WHERE，需回滚数据
- 机房灾难，需从零恢复整个集群

**前提条件：** 存在可用的全量备份(以及对应的增量备份，如有)。
#### 9.5.1 恢复前准备
1. 停止待恢复节点的 MySQL 服务
```bash
sudo systemctl stop mysqld
```
2. 清空数据目录
```bash
sudo rm -rf /data/mysql/*
```
3. 确认备份文件存在
```bash
ls -la /backup/mysql/
```
#### 9.5.2 从全量备份恢复
1. 准备全量备份(应用 redo log)
```bash
FULL_BACKUP_DIR=$(ls -dt /backup/mysql/full_* | head -1)
xtrabackup --prepare --target-dir=${FULL_BACKUP_DIR}
```
2. 恢复数据到数据目录
```bash
xtrabackup --copy-back --target-dir=${FULL_BACKUP_DIR} --datadir=/data/mysql
```
3. 修改目录权限
```bash
sudo chown -R mysql:mysql /data/mysql
```
#### 9.5.3 应用增量备份(如有)
如果存在增量备份，按创建顺序依次 apply：
```bash
# 按时间顺序列出增量备份目录
ls -lt /backup/mysql/inc_*

# 依次 apply(将路径替换为实际目录名)
xtrabackup --prepare --target-dir=${FULL_BACKUP_DIR} --incremental-dir=/backup/mysql/inc_20250102_030000
xtrabackup --prepare --target-dir=${FULL_BACKUP_DIR} --incremental-dir=/backup/mysql/inc_20250103_030000
```
#### 9.5.4 恢复 binlog 到指定时间点(可选)
如果误操作发生在增量备份之后，且 binlog 仍可用，可通过 `mysqlbinlog` 回放 binlog 到误操作前一刻：
```bash
# 查看 binlog 文件
mysqlbinlog /var/log/mysql/mysql-bin.* | grep -B 5 -A 5 "DROP TABLE"

# 回放多个 binlog 文件到指定时间点
mysqlbinlog --stop-datetime="2025-01-03 15:30:00" /var/log/mysql/mysql-bin.000001 /var/log/mysql/mysql-bin.000002 | mysql -uroot -pMysql@root123
```
⚠️ 此操作需在业务停写前提下执行，且需确认误操作的 GTID 已排除。
#### 9.5.5 启动 MySQL 并重新加入 MGR
1. 启动 MySQL
```bash
sudo systemctl start mysqld
```
2. 重新加入 MGR 集群
```sql
START GROUP_REPLICATION;
```
#### 9.5.6 验证恢复结果
1. 查看集群状态
```sql
SELECT MEMBER_HOST, MEMBER_PORT, MEMBER_STATE, MEMBER_ROLE 
FROM performance_schema.replication_group_members 
ORDER BY MEMBER_HOST;
```
2. 验证数据完整性
```sql
-- 检查关键表数据
SELECT COUNT(*) FROM your_critical_table;
```
