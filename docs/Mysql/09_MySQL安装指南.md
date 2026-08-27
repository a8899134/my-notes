## 一、安装方式
| 安装方式         | 适用场景               | 优点                          | 缺点             |
| ------------ | ------------------ | --------------------------- | -------------- |
| YUM / DNF 安装 | 开发环境、快速部署、有网络的环境   | 安装简单、自动处理依赖、方便后续升级更新        | 版本受仓库限制、定制化程度低 |
| 二进制包安装(生产推荐) | 生产环境、离线部署、需要版本精确控制 | 版本可控、可指定安装路径、方便批量部署、不依赖网络仓库 | 手动步骤较多、需要处理依赖  |

生产环境必须使用二进制包安装，版本完全可控，支持离线部署。

官方网页: `https://dev.mysql.com/downloads/mysql/`

💡 选择 Linux - Generic 类型，不要选 “Red Hat”(那是 RPM 包)。

## 二、安装前准备
### 2.1 检查系统版本
```
# 查看操作系统版本
cat /etc/rocky-release

# 查看内核版本
uname -r

# 查看系统架构
arch
```
### 2.2 检查并卸载已有 MySQL 或 MariaDB
Rocky Linux 可能预装了 MariaDB(MySQL 的分支)，需要先卸载，避免端口和文件冲突。
```
# 检查是否已安装 MySQL 或 MariaDB
rpm -qa | grep -E 'mysql|mariadb'

# 如果有输出，先停止服务
sudo systemctl stop mysqld 2>/dev/null
sudo systemctl stop mariadb 2>/dev/null

# 卸载已安装的包(根据实际输出调整包名)
sudo dnf remove -y mariadb-server mariadb mysql-server 2>/dev/null

# 清理残留文件和目录
sudo rm -rf /var/lib/mysql
sudo rm -rf /etc/my.cnf
sudo rm -rf /etc/mysql
```

## 三、操作系统层调优
⚠️ 这是生产环境部署 MySQL 前必须完成的一步，直接影响数据库的稳定性和性能。
### 3.1 关闭 NUMA
NUMA(Non-Uniform Memory Access)是现代多 CPU 服务器的内存架构。在 NUMA 架构下，每个 CPU 有自己"本地"的内存，访问本地内存速度快，访问其他 CPU 的内存速度慢。

MySQL 是内存密集型应用，InnoDB 的 Buffer Pool 会占用大量内存。在 NUMA 架构下，MySQL 的内存可能被分配到多个 NUMA 节点上，导致内存访问延迟不均，甚至出现内存不足的假象(明明有内存，但分配不到)。

关闭 NUMA 的三种方法：

1. 方法一：通过 BIOS 关闭(最彻底，需要重启服务器)

重启服务器，进入 BIOS 设置界面，找到 NUMA 相关选项并禁用。不同品牌服务器路径不同，通常位于 System Configuration → NUMA 或 Advanced → Memory Configuration。

2. 方法二：通过内核引导参数关闭(推荐，需要重启服务器)
修改 GRUB 内核引导参数：
```
# 编辑 GRUB 配置文件
sudo vi /etc/default/grub
```
在 `GRUB_CMDLINE_LINUX` 行中添加 `numa=off`：
```
GRUB_CMDLINE_LINUX="... console=tty0 numa=off"
```
重新生成 GRUB 配置：
```
# Rocky Linux 8
sudo grub2-mkconfig -o /boot/grub2/grub.cfg

# Rocky Linux 9
sudo grub2-mkconfig -o /boot/grub2/grub.cfg
```
重启服务器使其生效：
```
sudo reboot
```
重启后验证 NUMA 是否已关闭：
```
dmesg | grep -i numa
numactl --hardware
```
如果 numactl --hardware 显示只有一个节点，说明 NUMA 已关闭。

3. 方法三：使用 numactl 启动 MySQL(临时生效，不用重启)

如果不想重启服务器，可以在启动 MySQL 时使用 `numactl` 绑定内存节点：
```
numactl --interleave=all /usr/local/mysql/bin/mysqld --defaults-file=/etc/my.cnf &
```
这种方法不需要重启，但每次启动都需要加 `numactl` 前缀。在 systemd 服务文件中可以配置：
```
ExecStart=/usr/bin/numactl --interleave=all /usr/local/mysql/bin/mysqld --defaults-file=/etc/my.cnf
```
### 3.2 调整 vm.swappiness 参数
什么是 swappiness？
vm.swappiness 控制 Linux 内核使用交换分区(swap)的倾向程度。取值范围是 0~100：
- 值越高(如 60，默认值)：内核更倾向于把不常用的内存数据交换到磁盘
- 值越低(如 1)：内核尽量不使用交换分区，优先使用物理内存
为什么要改为 1？
MySQL 是内存密集型应用，InnoDB 的 Buffer Pool 会占用大量内存。如果 swappiness 过高，MySQL 可能会被交换到磁盘，导致查询响应时间从毫秒变成秒级，数据库性能骤降。
配置方法(临时生效)：
```
sudo sysctl vm.swappiness=1
```
永久配置(重启后依然生效)：
```
echo "vm.swappiness = 1" | sudo tee -a /etc/sysctl.conf

# 使配置生效
sudo sysctl -p
```
验证是否生效：
```
sysctl vm.swappiness
# 输出应为 vm.swappiness = 1
```
### 3.3 调整文件描述符限制(ulimit -n)
什么是文件描述符？
在 Linux 中，一切皆文件。MySQL 每打开一个表、每个连接、每个日志文件都需要占用一个文件描述符。如果文件描述符限制太低，MySQL 会报错 Too many open files。

为什么要设为 65535？

MySQL 在高并发场景下可能需要同时打开数千甚至上万个文件(表文件、日志文件、临时文件)，默认的 1024 远远不够。将限制提高到 65535 可以避免文件句柄不足的问题。

配置方法：

第 1 步：修改系统级别的 limits.conf
```
sudo vi /etc/security/limits.conf
```
在文件末尾添加以下内容：
```
# MySQL 用户的文件描述符限制
mysql soft nofile 65535
mysql hard nofile 65535
# 进程数限制也建议同时设置
mysql soft nproc 65535
mysql hard nproc 65535
```
第 2 步：如果使用 systemd 管理 MySQL(生产环境常用)，还需要修改 systemd 服务文件：
```
sudo mkdir -p /etc/systemd/system/mysqld.service.d
sudo vi /etc/systemd/system/mysqld.service.d/limits.conf
```
写入以下内容：
```
[Service]
LimitNOFILE=65535
LimitNPROC=65535
```
第 3 步：重新加载 systemd 配置
```
sudo systemctl daemon-reload
```
第 4 步：验证是否生效
重启 MySQL 服务后，查看进程的 limits：
```
# 找到 MySQL 进程 ID
ps -ef | grep mysqld

# 查看进程的限制
cat /proc/[MySQL进程ID]/limits | grep -E "open files|Max open files"
```
输出应显示 Max open files 65535。
### 3.4 磁盘 I/O 调度器优化(SSD 环境推荐)
如果服务器使用 SSD 硬盘，建议将磁盘 I/O 调度器改为 none(或 noop)，减少不必要的调度开销。
```
# 查看当前调度器
cat /sys/block/sda/queue/scheduler

# 临时修改
echo none > /sys/block/sda/queue/scheduler

# 永久修改(通过内核引导参数)
# 在 GRUB_CMDLINE_LINUX 中添加
# elevator=none
sudo vi /etc/default/grub
# 添加 elevator=none 后重新生成 GRUB 配置
```
### 3.5 系统层调优验证清单
|检查项|验证命令|期望结果|
|---|---|---|
|NUMA 关闭|`numactl --hardware`|只有一个 node|
|swappiness|`sysctl vm.swappiness`|= 1|
|文件描述符|`ulimit -n`|65535|
|磁盘调度器|`cat /sys/block/sda/queue/scheduler`|none 或 noop|

## 四、YUM / DNF 安装
### 4.1 YUM / DNF 说明
YUM(Yellowdog Updater Modified)和 DNF(Dandified YUM)是 rhel系列 的包管理工具。它们从配置好的软件仓库中自动下载软件包，并自动解决依赖关系。

### 4.2 使用默认仓库安装
```
# 安装 MySQL 服务器
sudo dnf install -y mysql-server

# 启动 MySQL 服务
sudo systemctl start mysqld

# 设置开机自启动
sudo systemctl enable mysqld

# 查看 MySQL 版本
mysql --version
```

### 4.3 使用 MySQL 官方 YUM 仓库安装
使用官方仓库可以安装最新版本的 MySQL，并且后续可以通过 dnf update 方便地升级。
```
# Rocky Linux 8
sudo dnf install -y https://dev.mysql.com/get/mysql80-community-release-el8-1.noarch.rpm

# Rocky Linux 9
sudo dnf install -y https://dev.mysql.com/get/mysql80-community-release-el9-1.noarch.rpm
```
验证仓库是否添加成功：
```
sudo dnf repolist enabled | grep mysql
```
禁用 AppStream 中的 MySQL 模块(Rocky Linux 8 必须)：
```
sudo dnf module disable mysql -y
```
安装 MySQL 服务器：
```
sudo dnf install -y mysql-community-server
```
### 4.4 启动服务并获取临时密码
```
# 启动 MySQL 服务
sudo systemctl start mysqld

# 设置开机自启动
sudo systemctl enable mysqld

# 查看临时密码
sudo grep 'temporary password' /var/log/mysqld.log
```
输出示例：
```
2024-01-09T09:25:40.123456Z 6 [Note] A temporary password is generated for root@localhost: 7fj3!dHk9a
```
记下这个临时密码(如 7fj3!dHk9a)，首次登录时需要用到。

## 五、二进制包安装
### 5.1 下载 MySQL 二进制包
```
# 查看 glibc 版本，确定下载哪个包
ldd --version
```
💡 ldd --version 用于确认系统 glibc 版本，确保下载的二进制包与系统兼容：

|glibc 版本|对应 Rocky Linux|下载的 MySQL 包|
|---|---|---|
|2.28|Rocky Linux 8| `linux-glibc2.28` |
|2.34|Rocky Linux 9| `linux-glibc2.28`(向下兼容)|

如果选错版本，MySQL 启动时会报 version GLIBC_2.XX not found 错误。

```
# 进入下载目录
cd /usr/local/src

# 下载 MySQL 8.0.41(以 8.0.41 为例，实际版本号请查看官网)
sudo wget https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.41-linux-glibc2.28-x86_64.tar.xz
```
💡 选择 Linux - Generic 类型，不要选 "Red Hat"(那是 RPM 包)。
### 5.2 安装依赖包
```
sudo dnf install -y libaio numactl-libs ncurses-compat-libs
```
各依赖包的作用：
- libaio：MySQL 异步 I/O 必需，不装会导致启动失败
- numactl-libs：多 CPU 机器的内存分配支持
- ncurses-compat-libs：MySQL 8.0.28+ 版本的 ncurses 兼容库
### 5.3 创建 mysql 用户和组
```
# 创建 mysql 用户(-r 表示系统用户，-s /sbin/nologin 表示不允许登录)
	sudo useradd -r -s /sbin/nologin mysql
```
### 5.4 解压并安装
```
# 解压二进制包
sudo tar -xvf mysql-8.0.41-linux-glibc2.28-x86_64.tar.xz -C /usr/local/

# 重命名目录
sudo mv /usr/local/mysql-8.0.41-linux-glibc2.28-x86_64 /usr/local/mysql
```
- 使用固定路径便于后续脚本管理
- `/usr/local/` 是 Unix 系统存放本地编译/第三方软件的标准路径
### 5.5 设置目录权限
```
# 安装目录(程序文件)归 root 所有
sudo chown -R root:root /usr/local/mysql

# 创建数据目录
sudo mkdir -p /data/mysql
sudo mkdir -p /var/log/mysql

# 数据目录和日志目录归 mysql 用户所有
sudo chown -R mysql:mysql /data/mysql
sudo chown -R mysql:mysql /var/log/mysql
```
### 5.6 配置环境变量
```
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
```
mysql  Ver 8.0.41 for Linux on x86_64 (MySQL Community Server - GPL)
```
`mysql` 客户端命令已经可以被系统正确识别，环境变量配置生效。
### 5.7 初始化数据库
```
sudo /usr/local/mysql/bin/mysqld --initialize \
  --user=mysql \
  --basedir=/usr/local/mysql \
  --datadir=/data/mysql \
  --log-error=/var/log/mysql/error.log
```
**命令解释**：
- -- initialize：初始化数据库，生成系统表和初始数据
- --user=mysql：指定运行用户
- --basedir：MySQL 安装目录
- --datadir：MySQL 数据目录
- --log-error：错误日志路径
```
# 查看临时密码
sudo grep 'temporary password' /var/log/mysql/error.log
```
⚠️ 记下这个临时密码，首次登录必须使用！
### 5.8 创建配置文件
```
sudo vi /etc/my.cnf
```
写入以下内容：
```
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
innodb_buffer_pool_size = 8G
innodb_buffer_pool_instances = 8
innodb_buffer_pool_dump_at_shutdown = ON
innodb_buffer_pool_load_at_startup = ON

# ============================================
# InnoDB Redo Log(MySQL 8.0.30+ 推荐使用新参数)
# ============================================
innodb_redo_log_capacity = 4G
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
### 5.9 创建 PID 目录
MySQL 的 pid-file 配置指向 /var/run/mysqld/mysqld.pid，但该目录默认不存在，需要提前创建。
```
sudo mkdir -p /var/run/mysqld
sudo chown mysql:mysql /var/run/mysqld

# 验证
ls -ld /var/run/mysqld
```
💡 /var/run/ 是临时文件系统，每次系统重启会被清空。后续通过 systemd 的 RuntimeDirectory 指令可以在服务启动时自动创建该目录，无需每次手动干预。
### 5.10 配置 systemd 服务
```
sudo vi /etc/systemd/system/mysqld.service
```
写入以下内容：
```
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

```
# 重新加载 systemd 配置
sudo systemctl daemon-reload

# 启动 MySQL
sudo systemctl start mysqld

# 设置开机自启动
sudo systemctl enable mysqld

# 查看状态
sudo systemctl status mysqld
```

## 六、安装后安全配置
有两种方法，一种是手动执行命令，一种是运行安全配置脚本，建议使用脚本。
### 6.1 使用临时密码登录
```
mysql -u root -p
```
### 6.2 修改 root 密码
```
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Mysql@root123';
FLUSH PRIVILEGES;
```
⚠️ 密码策略：MySQL 8.0 默认密码策略要求密码至少 8 位，包含大小写字母、数字和特殊字符。
### 6.3 运行安全配置脚本(推荐)
⚠️ 执行 mysql_secure_installation 前需要注意：
如果你的 /etc/my.cnf 中 [client] 段有 default-character-set=utf8mb4，执行脚本会报错：
```
mysql_secure_installation: [ERROR] unknown variable 'default-character-set=utf8mb4'
```
解决方法一：临时注释掉该参数
```
sudo vi /etc/my.cnf
# 在 [client] 段中，将 default-character-set=utf8mb4 注释掉
sudo mysql_secure_installation
# 执行完后再取消注释恢复
```
解决方法二：使用 --no-defaults 参数
```
sudo /usr/local/mysql/bin/mysql_secure_installation --no-defaults
```
执行脚本

方法一：修改 sudo PATH(一次修改，终身省事)
```
sudo visudo
```
找到这行：
```
Defaults    secure_path = /sbin:/bin:/usr/sbin:/usr/bin
```
改成：
```
Defaults    secure_path = /sbin:/bin:/usr/sbin:/usr/bin:/usr/local/mysql/bin
```
保存退出后，直接执行：
```
sudo mysql_secure_installation
```

方法二：使用完整路径(不修改任何配置)
```
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
### 6.4 配置数据库运维账户
MySQL 的用户账号由 '用户名'@'主机' 组成，主机 部分决定允许从哪些 IP 连接。通过设置主机为 192.168.100.%，可以确保只有该网段的客户端能登录。

⚠️ **注意**：`'192.168.100.%'` 中的 `%` 是通配符，表示 `192.168.100.0~255` 任意主机。如果需要更精确的单个 IP，可以写成 `'192.168.100.50'`。

1. 创建新用户时指定网段
```sql
# 创建账户
CREATE USER 'app_user'@'192.168.100.%' IDENTIFIED BY 'APPuser@123';
# 给账号赋予 mydb库 增删改查的权限。
# 如需授权所有数据库，请将 mydb.* 替换为 *.*
GRANT SELECT, INSERT, UPDATE, DELETE ON mydb.* TO 'app_user'@'192.168.100.%';
# 刷新权限
FLUSH PRIVILEGES;
```
2. 修改现有用户的主机限制
如果用户已存在，可以重命名或重建：
```sql
-- 删除旧用户(注意先确认没有业务在用)
DROP USER 'app_user'@'%';

-- 重新创建，限定网段
CREATE USER 'app_user'@'192.168.100.%' IDENTIFIED BY '原密码';
GRANT 原有权限 ON mydb.* TO 'app_user'@'192.168.100.%';
FLUSH PRIVILEGES;
```
或者使用 `RENAME USER`(MySQL 5.7+)：
```
RENAME USER 'app_user'@'%' TO 'app_user'@'192.168.100.%';
```
3. 验证用户主机
```sql
SELECT User, Host FROM mysql.user WHERE User='app_user';
```
### 6.5 配置防火墙规则
即使 MySQL 用户只允许内网 IP，如果防火墙没有限制 3306 端口，外网依然可以尝试连接 MySQL(虽然登录会被拒绝，但会暴露 MySQL 服务)。因此，强烈建议在防火墙层面只允许内网 IP 访问 3306 端口。
```
# 移除之前可能开放的 3306 端口(如果有)
sudo firewall-cmd --permanent --remove-port=3306/tcp

# 只允许 192.168.100.0/24 网段访问 3306
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.100.0/24" port protocol="tcp" port="3306" accept'

# 重新加载生效
sudo firewall-cmd --reload

# 验证规则
sudo firewall-cmd --list-rich-rules
```
备注： 如果 MySQL 只服务于内网，可以强制 MySQL 只监听内网 IP：
```
sudo vi /etc/my.cnf
[mysqld]
bind-address = 192.168.100.10   # 替换为服务器实际内网 IP
```
### 6.6 移除防火墙规则
```
# 查看当前所有富规则
sudo firewall-cmd --list-rich-rules

# 删除指定的富规则(必须与添加时的写法完全一致)
sudo firewall-cmd --permanent --remove-rich-rule='rule family="ipv4" source address="192.168.100.0/24" port protocol="tcp" port="3306" accept'

# 重新加载使生效
sudo firewall-cmd --reload
```

## 七、安装后验证
```
-- 查看版本
SELECT VERSION();

-- 查看当前用户
SELECT USER();

-- 查看所有数据库
SHOW DATABASES;

-- 查看系统变量
SHOW VARIABLES LIKE '%version%';

-- 查看运行状态
SHOW STATUS LIKE 'uptime';
```

```
# 检查端口监听
sudo netstat -tlnp | grep 3306
# 应看到 3306 和 33060 两个端口
```

## 八、root 忘记密码重置
```
# 1. 停止 MySQL
sudo systemctl stop mysqld

# 2. 跳过权限表启动
sudo /usr/local/mysql/bin/mysqld_safe --skip-grant-tables --skip-networking &

# 3. 无密码登录
mysql -u root

# 4. 清空并重置密码
FLUSH PRIVILEGES;
ALTER USER 'root'@'localhost' IDENTIFIED BY '你的新密码';
FLUSH PRIVILEGES;
EXIT;

# 5. 杀掉进程并重启
sudo pkill mysqld
sudo systemctl start mysqld

# 6. 用新密码登录验证
mysql -u root -p
```

## 九、附录
### 9.1 常用命令速查
| 操作              | 命令                                                                  |
| --------------- | ------------------------------------------------------------------- |
| 启动 MySQL        | `sudo systemctl start mysqld`                                       |
| 停止 MySQL        | `sudo systemctl stop mysqld`                                        |
| 重启 MySQL        | `sudo systemctl restart mysqld`                                     |
| 查看状态            | `sudo systemctl status mysqld`                                      |
| 开机自启            | `sudo systemctl enable mysqld`                                      |
| 查看临时密码(二进制包)    | `sudo grep 'temporary password' /var/log/mysql/error.log`           |
| 查看临时密码(YUM 安装)  | `sudo grep 'temporary password' /var/log/mysqld.log`                |
| 查看错误日志          | `sudo tail -100 /var/log/mysql/error.log`                           |
| 查看慢查询日志         | `sudo tail -100 /var/log/mysql/slow.log`                            |
| 查看 Binlog 文件列表  | `mysql -u root -p -e "SHOW BINARY LOGS;"`                           |
| 登录 MySQL        | `mysql -u root -p`                                                  |
| 安全配置(修改 PATH 后) | `sudo mysql_secure_installation`                                    |
| 安全配置(完整路径)      | `sudo /usr/local/mysql/bin/mysql_secure_installation --no-defaults` |
| 查看端口监听          | `sudo netstat -tlnp \| grep 3306`                                   |
### 9.2 重要文件路径
| 文件           | 路径                                   |
| ------------ | ------------------------------------ |
| 安装目录         | `/usr/local/mysql`                   |
| 数据目录         | `/data/mysql`                        |
| 配置文件         | `/etc/my.cnf`                        |
| 错误日志         | `/var/log/mysql/error.log`           |
| 慢查询日志        | `/var/log/mysql/slow.log`            |
| Binlog 文件    | `/var/log/mysql/mysql-bin.xxxxxx`    |
| Binlog 索引    | `/var/log/mysql/mysql-bin.index`     |
| systemd 服务文件 | `/etc/systemd/system/mysqld.service` |
| PID 文件       | `/var/run/mysqld/mysqld.pid`         |
| Socket 文件    | `/tmp/mysql.sock`                    |
| 临时密码记录       | `/var/log/mysql/error.log`(初始化时)     |
