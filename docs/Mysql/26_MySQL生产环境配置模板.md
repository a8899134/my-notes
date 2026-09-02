## 一、文档概述
### 1.1 文档目的
本文档提供一套可直接复用的 MySQL 生产环境配置模板和标准部署 SOP(标准操作流程) ，确保新服务器到货后，能在 30 分钟内完成一台可用的 MySQL 数据库交付。
### 1.2 适用版本与系统
|项目|说明|
|---|---|
|MySQL 版本|8.0.x(二进制包安装)|
|操作系统|Rocky Linux 8 / 9|
|硬件推荐|16GB 内存起，SSD 存储|
### 1.3 部署目标
```text
新机器到货 → 系统调优 → 安装 MySQL → 初始化配置 → 启动验证 → 交付完成
                           总耗时：30 分钟内
```

## 二、系统层调优
**重要：** 以下三项调优是生产环境部署 MySQL 前的必要步骤，直接影响数据库的稳定性和性能。按照 16GB 内存配置给出建议值。
### 2.1 关闭 NUMA
```bash
# 编辑 GRUB 配置文件
sudo vi /etc/default/grub
```
在 GRUB_CMDLINE_LINUX 末尾添加 numa=off：
```text
GRUB_CMDLINE_LINUX="... numa=off"
```
重启服务
```bash
# 重新生成 GRUB 配置
sudo grub2-mkconfig -o /boot/grub2/grub.cfg

# 重启服务器
sudo reboot
```
### 2.2 调整 swappiness
```bash
# 设置为 1，优先使用物理内存
echo "vm.swappiness = 1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```
### 2.3 调整 ulimit
```bash
# 设置文件描述符限制
sudo vi /etc/security/limits.conf
```
添加以下内容：
```text
mysql soft nofile 65535
mysql hard nofile 65535
mysql soft nproc 65535
mysql hard nproc 65535
```

## 三、MySQL 安装
### 3.1 创建用户和目录
```bash
# 创建 mysql 用户
sudo useradd -r -s /sbin/nologin mysql

# 创建目录
sudo mkdir -p /data/mysql
sudo mkdir -p /var/log/mysql
sudo mkdir -p /var/run/mysqld

# 设置权限
sudo chown -R mysql:mysql /data/mysql
sudo chown -R mysql:mysql /var/log/mysql
sudo chown -R mysql:mysql /var/run/mysqld
```
### 3.2 解压二进制包
```bash
cd /usr/local/src

# 下载 MySQL 二进制包(以 8.0.41 为例)
sudo wget https://mirrors.tuna.tsinghua.edu.cn/mysql/downloads/MySQL-8.0/mysql-8.0.41-linux-glibc2.28-x86_64.tar.xz

# 解压并移动到 /usr/local/mysql
sudo tar -xvf mysql-8.0.41-linux-glibc2.28-x86_64.tar.xz -C /usr/local/
sudo mv /usr/local/mysql-8.0.41-linux-glibc2.28-x86_64 /usr/local/mysql

# 设置权限
sudo chown -R root:root /usr/local/mysql
```
### 3.3 配置环境变量
```bash
# 添加到 PATH
echo 'export PATH=/usr/local/mysql/bin:$PATH' | sudo tee /etc/profile.d/mysql.sh
source /etc/profile.d/mysql.sh
```
### 3.4 初始化数据目录
```bash
sudo /usr/local/mysql/bin/mysqld --initialize \
  --user=mysql \
  --basedir=/usr/local/mysql \
  --datadir=/data/mysql \
  --log-error=/var/log/mysql/error.log

# 查看临时密码
sudo grep 'temporary password' /var/log/mysql/error.log
```
⚠️ 记录临时密码，首次登录必须使用。

## 四、生产环境 my.cnf 模板
### 4.1 配置文件
```bash
sudo vi /etc/my.cnf
```
输入以下内容
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
port = 3306
server-id = 1

# ============================================
# 字符集
# ============================================
character-set-server = utf8mb4
collation-server = utf8mb4_general_ci
init-connect = 'SET NAMES utf8mb4'

# ============================================
# 连接配置
# ============================================
max_connections = 1000
max_connect_errors = 10000
connect_timeout = 10
wait_timeout = 28800
interactive_timeout = 28800
max_allowed_packet = 64M

# ============================================
# InnoDB 缓冲池(16GB 内存 → 8GB~10GB)
# ============================================
innodb_buffer_pool_size = 8G
innodb_buffer_pool_instances = 8
innodb_buffer_pool_dump_at_shutdown = ON
innodb_buffer_pool_load_at_startup = ON

# ============================================
# InnoDB Redo Log
# ============================================
innodb_redo_log_capacity = 4G
innodb_log_buffer_size = 64M
innodb_flush_log_at_trx_commit = 1

# ============================================
# InnoDB 文件与 I/O
# ============================================
innodb_file_per_table = ON
innodb_io_capacity = 2000
innodb_io_capacity_max = 4000
innodb_read_io_threads = 8
innodb_write_io_threads = 8
innodb_flush_neighbors = 0

# ============================================
# InnoDB 锁
# ============================================
innodb_lock_wait_timeout = 10
innodb_deadlock_detect = ON
innodb_print_all_deadlocks = ON

# ============================================
# 日志配置
# ============================================
# 错误日志
log_error = /var/log/mysql/error.log

# 慢查询日志
slow_query_log = ON
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
log_queries_not_using_indexes = ON

# 二进制日志
log_bin = /var/log/mysql/mysql-bin
binlog_format = ROW
binlog_expire_logs_seconds = 604800
sync_binlog = 1

# ============================================
# 缓存配置
# ============================================
tmp_table_size = 64M
max_heap_table_size = 64M
sort_buffer_size = 4M
join_buffer_size = 4M
table_open_cache = 2000
table_definition_cache = 2000
thread_cache_size = 256
open_files_limit = 65535

# ============================================
# 安全配置
# ============================================
skip_external_locking
skip_name_resolve
secure_file_priv = /var/lib/mysql-files
sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'

# ============================================
# 其他
# ============================================
default-time-zone = +08:00
max_allowed_packet = 64M
thread_cache_size = 256

[client]
port = 3306
socket = /tmp/mysql.sock
default-character-set = utf8mb4

[mysql]
default-character-set = utf8mb4
prompt = "mysql> "
```
### 4.2 参数速查表
|参数|值|说明|
|---|---|---|
|`innodb_buffer_pool_size`|8G|16GB 内存建议值，物理内存的 50%~80%|
|`max_connections`|1000|最大连接数|
|`innodb_redo_log_capacity`|4G|Redo Log 容量|
|`binlog_expire_logs_seconds`|604800|Binlog 保留 7 天|
|`slow_query_log`|ON|开启慢查询日志|
|`long_query_time`|2|慢查询阈值 2 秒|

## 五、启动与安全配置
### 5.1 配置 systemd 服务
```bash
sudo vi /etc/systemd/system/mysqld.service
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
RuntimeDirectory=mysqld
RuntimeDirectoryMode=0755
ExecStart=/usr/local/mysql/bin/mysqld --defaults-file=/etc/my.cnf
LimitNOFILE=65535
LimitNPROC=65535
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```
### 5.2 启动 MySQL
```bash
sudo systemctl daemon-reload
sudo systemctl start mysqld
sudo systemctl enable mysqld
sudo systemctl status mysqld
```
### 5.3 修改 root 密码
```bash
mysql -u root -p
# 输入初始化时的临时密码
```

```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Mysql@Root2026';
FLUSH PRIVILEGES;
EXIT;
```
### 5.4 运行安全配置脚本
```bash
sudo /usr/local/mysql/bin/mysql_secure_installation
```
⚠️ 注意：如果在使用 mysql_secure_installation 时遇到 unknown variable 'default-character-set=utf8mb4' 错误，请使用完整路径并加 --no-defaults 参数：
```bash
sudo /usr/local/mysql/bin/mysql_secure_installation --no-defaults
```

## 六、验证与交付
### 6.1 验证清单
```bash
# 1. 检查服务状态
sudo systemctl status mysqld

# 2. 检查端口监听
sudo netstat -tlnp | grep 3306

# 3. 测试登录
mysql -u root -p -e "SELECT VERSION();"

# 4. 检查数据目录
ls -la /data/mysql/

# 5. 检查日志
sudo tail -20 /var/log/mysql/error.log
```
### 6.2 验证 SQL
```sql
-- 查看版本
SELECT VERSION();

-- 查看数据库列表
SHOW DATABASES;

-- 查看关键参数
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';
SHOW VARIABLES LIKE 'max_connections';
SHOW VARIABLES LIKE 'slow_query_log';

-- 查看运行状态
SHOW STATUS LIKE 'uptime';
```
### 6.3 交付清单
```
☐ 服务器 IP：______________________
☐ MySQL 版本：8.0.41
☐ 数据目录：/data/mysql
☐ 日志目录：/var/log/mysql
☐ root 密码：已设置(单独交付)
☐ 服务状态：running
☐ 开机自启：enabled
☐ 端口：3306
☐ 慢查询日志：已开启
☐ Binlog：已开启
```

## 七、附录
### 7.1 部署 SOP 总览
| 步骤            | 耗时   | 操作摘要                                      |
| ------------- | ---- | ----------------------------------------- |
| 1. 系统调优       | 5 分钟 | 关闭 NUMA、设置 swappiness=1、ulimit 65535      |
| 2. 创建用户和目录    | 2 分钟 | 创建 mysql 用户，创建 /data/mysql、/var/log/mysql |
| 3. 解压二进制包     | 3 分钟 | 下载解压 MySQL 二进制包到 /usr/local/mysql         |
| 4. 初始化数据目录    | 2 分钟 | mysqld --initialize，记录临时密码                |
| 5. 覆盖 my.cnf  | 3 分钟 | 复制生产模板配置文件                                |
| 6. 启动服务       | 2 分钟 | systemd 配置、启动、开机自启                        |
| 7. 设置 root 密码 | 2 分钟 | 登录修改 root 密码，运行安全配置                       |
| 8. 验证交付       | 3 分钟 | 验证服务状态、端口、日志、关键参数                         |
### 7.2 不同内存大小的配置参考
|服务器内存|`innodb_buffer_pool_size`|`innodb_redo_log_capacity`|
|---|---|---|
|8GB|4GB ~ 5GB|2GB|
|16GB|8GB ~ 12GB|4GB|
|32GB|16GB ~ 24GB|6GB|
|64GB|32GB ~ 48GB|8GB|
### 7.3 常用命令速查
| 操作           | 命令                                      |
| ------------ | --------------------------------------- |
| 查看服务状态       | sudo systemctl status mysqld            |
| 查看错误日志       | sudo tail -100 /var/log/mysql/error.log |
| 查看慢查询日志      | sudo tail -100 /var/log/mysql/slow.log  |
| 查看 Binlog 列表 | SHOW BINARY LOGS;                       |
| 查看当前连接数      | SHOW STATUS LIKE 'Threads_connected';   |
### 7.4 总结
新机器到货后，按 SOP 顺序执行：系统调优 → 创建用户和目录 → 解压二进制包 → 初始化 → 覆盖 my.cnf → 启动 → 设置密码 → 验证。全套流程 30 分钟内完成，交付一台可直接上线的 MySQL 数据库实例。