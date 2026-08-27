## 一、my.cnf 简述
### 1.1 my.cnf 的作用
my.cnf 是 MySQL 在 Linux 系统下的主配置文件，它决定了 MySQL 服务器如何运行。可以把它理解为 MySQL 的“运行说明书”—你告诉它要用多大内存、监听哪个端口、数据存在哪里、日志怎么写，它就按你说的执行。

## 二、配置文件位置与加载顺序
### 2.1 默认查找路径
MySQL 启动时会按固定顺序在多个位置查找配置文件，后读取的会覆盖先读取的相同参数。

| 优先级 | 路径                              | 说明             |
| --- | ------------------------------- | -------------- |
| 1   | /etc/my.cnf                     | 全局配置文件，最常用     |
| 2   | /etc/mysql/my.cnf               | 全局配置文件(备选位置)   |
| 3   | $MYSQL_HOME/my.cnf              | 服务器特定配置(仅限服务器) |
| 4   | ~/.my.cnf                       | 用户级配置(仅当前用户生效) |
| 5   | 命令行 --defaults-extra-file 指定的文件 | 额外配置文件         |

⚠️ 注意：通过 RPM 包安装的 MySQL 默认没有 /etc/my.cnf 文件，需要手动创建。

### 2.2 查看当前生效的配置文件
```
# 查看 MySQL 实际读取了哪些配置文件
mysqld --help --verbose | grep -A 1 "Default options"
```
输出示例：
```
Default options are read from the following files in the given order:
/etc/my.cnf /etc/mysql/my.cnf /usr/local/mysql/etc/my.cnf ~/.my.cnf
```
### 2.3 查看当前正在使用的配置文件
```
# 通过进程查看
ps aux | grep mysqld | grep -E 'my.cnf|defaults-file'
```

## 三、配置文件的基本结构
### 3.1 配置段(Section)
my.cnf 使用 INI 文件格式，由多个配置段(Section)组成，每个段用方括号 [ ] 包围。
```
[mysqld]
# 服务器端配置
port = 3306

[client]
# 客户端通用配置
port = 3306

[mysql]
# mysql 命令行客户端专属配置
prompt = "mysql> "
```
### 3.2 常见配置段说明
| 配置段             | 作用                    | 重要性     |
| --------------- | --------------------- | ------- |
| `[mysqld]`      | MySQL 服务器的核心配置        | ⭐⭐⭐|
| `[client]`      | 所有客户端程序的默认配置          | ⭐⭐|
| `[mysql]`       | `mysql` 命令行客户端的专属配置   | ⭐  |
| `[mysqld_safe]` | `mysqld_safe` 守护进程的配置 | ⭐ |

⚠️ 关键点：只有 ` [mysqld]` 段的配置会影响数据库服务器的运行，其他段只影响客户端工具。
### 3.3 注释
以 # 开头的行是注释，不会被 MySQL 读取。
```
# 这是一行注释
port = 3306  # 行尾也可以加注释
```

## 四、核心参数详解
### 4.1 基础路径配置

| 参数       | 作用           | 示例值                        | 说明                             |
| -------- | ------------ | -------------------------- | ------------------------------ |
| basedir  | MySQL 安装目录   | /usr/local/mysql           | 二进制包安装时需指定                     |
| datadir  | 数据文件存储目录     | /data/mysql                | 建议挂载独立磁盘，避免系统盘写满               |
| socket   | Unix 套接字文件路径 | /tmp/mysql.sock            | 本地连接使用，客户端和服务端需一致              |
| pid-file | 进程 ID 文件路径   | /var/run/mysqld/mysqld.pid | 记录 MySQL 进程的 PID               |
| port     | 监听端口         | 3306                       | 生产环境建议改为非默认端口(如 33060)降低暴力破解风险 |

配置示例：
```
[mysqld]
basedir = /usr/local/mysql
datadir = /data/mysql
socket = /tmp/mysql.sock
pid-file = /var/run/mysqld/mysqld.pid
port = 3306
```
### 4.2 连接配置

| 参数                 | 作用          | 建议值      | 说明                       |
| ------------------ | ----------- | -------- | ------------------------ |
| maxconnections     | 最大并发连接数     | 500~2000 | 根据业务并发量调整，过高会消耗大量内存      |
| maxconnecterrors   | 最大连接错误次数    | 10000    | 超过后服务器会拒绝该主机的连接          |
| connecttimeout     | 连接超时时间(秒)   | 10       | 握手超时时间                   |
| waittimeout        | 非交互式连接超时(秒) | 28800    | 超过此时间无活动则断开连接            |
| interactivetimeout | 交互式连接超时(秒)  | 28800    | 与 waittimeout 类似，针对交互式连接 |
| maxallowed_packet  | 最大数据包大小     | 64 M     | 影响大数据写入和查询结果返回           |

配置示例：
```
[mysqld]
max_connections = 1000
max_connect_errors = 10000
connect_timeout = 10
wait_timeout = 28800
interactive_timeout = 28800
max_allowed_packet = 64M
```
### 4.3 字符集配置

|参数|作用|建议值|说明|
|---|---|---|---|
| character-set-server |服务器默认字符集| utf8mb4 |MySQL 8.0 默认就是 utf 8 mb 4|
| collation-server |服务器默认排序规则| utf8mb4generalci | ci 表示不区分大小写|
| init-connect |每个连接初始执行的 SQL| 'SET NAMES utf8mb4' |保证客户端字符集一致|
| skip-character-set-client-handshake |忽略客户端字符集设置|不设置|保证服务端字符集不被客户端覆盖|

⚠️ 为什么必须用 utf8mb4？ MySQL 的 utf8 只支持 3 字节，存不下 emoji 和部分生僻字。utf8mb4 才是“真正的 UTF-8”。

配置示例：
```
[mysqld]
character-set-server = utf8mb4
collation-server = utf8mb4_general_ci
init-connect = 'SET NAMES utf8mb4'
```
### 4.4 InnoDB 存储引擎配置
InnoDB 是 MySQL 的默认存储引擎，以下参数直接决定数据库的性能。
#### 4.4.1 缓冲池(Buffer Pool)

| 参数                             | 作用           | 建议值             | 说明                  |
| ------------------------------ | ------------ | --------------- | ------------------- |
| innodbbufferpoolsize           | InnoDB 缓冲池大小 | 物理内存的 50%~80%   | 最重要的参数，决定数据在内存中的缓存量 |
| innodbbufferpoolinstances      | 缓冲池实例数       | CPU 核心数(不超过 16) | 多实例减少锁竞争            |
| innodbbufferpooldumpatshutdown | 关闭时导出缓冲池信息   | ON              | 加速重启后的预热            |
| innodbbufferpoolloadatstartup  | 启动时加载缓冲池信息   | ON              | 配合上一项使用             |
#### 4.4.2 Redo Log(重做日志)

|参数|作用|建议值|说明|
|---|---|---|---|
| innodbredologcapacity |Redo Log 总容量(8.0.30+)|4 G~8 G|替代旧版的 innodblogfilesize 和 innodblogfilesingroup |
| innodblogbuffersize |Redo Log 缓冲区大小|64 M|事务执行过程中的日志缓存|
| innodbflushlogattrxcommit |Redo Log 刷盘策略| 1(最安全)| 1 =每次提交刷盘，2 =每秒刷盘，0 =每秒刷盘(可能丢数据)|
#### 4.4.3 文件与 I/O 配置

|参数|作用|建议值|说明|
|---|---|---|---|
| innodbfilepertable |每个表独立表空间| ON |每个 InnoDB 表生成独立的 .ibd 文件|
| innodbiocapacity |I/O 吞吐量上限|2000(SSD)|SSD 可设更高|
| innodbiocapacitymax |I/O 吞吐量上限(峰值)|4000(SSD)|突发 I/O 时的上限|
| innodbreadiothreads |读 I/O 线程数|8|提高并行读取能力|
| innodbwriteiothreads |写 I/O 线程数|8|提高并行写入能力|
| innodbflushneighbors |是否刷新相邻页| 0(SSD)|SSD 建议设为 0|
#### 4.4.4 锁配置

|参数|作用|建议值|说明|
|---|---|---|---|
| innodblockwaittimeout |锁等待超时时间(秒)|10|超过此时间自动回滚事务|
| innodbdeadlockdetect |是否启用死锁检测| ON |高并发下可关闭以提升性能|
| innodbprintalldeadlocks |是否记录所有死锁信息| ON |便于排查死锁问题|
InnoDB 配置示例：
```
[mysqld]
# 缓冲池(根据实际内存调整，建议 50%~80%)
innodb_buffer_pool_size = 8G
innodb_buffer_pool_instances = 8
innodb_buffer_pool_dump_at_shutdown = ON
innodb_buffer_pool_load_at_startup = ON

# Redo Log
innodb_redo_log_capacity = 4G
innodb_log_buffer_size = 64M
innodb_flush_log_at_trx_commit = 1

# 文件与 I/O
innodb_file_per_table = ON
innodb_io_capacity = 2000
innodb_io_capacity_max = 4000
innodb_read_io_threads = 8
innodb_write_io_threads = 8
innodb_flush_neighbors = 0

# 锁
innodb_lock_wait_timeout = 10
innodb_deadlock_detect = ON
innodb_print_all_deadlocks = ON
```
### 4.5 日志配置

|参数|作用|建议值|说明|
|---|---|---|---|
| logerror |错误日志路径| /var/log/mysql/error.log |故障排查的第一站|
| slowquerylog |是否开启慢查询日志| ON |SQL 性能优化的核心工具|
| slowquerylogfile |慢查询日志路径| /var/log/mysql/slow.log |—|
| longquerytime |慢查询阈值(秒)| 2 |超过此时间的 SQL 会被记录|
| logqueriesnotusingindexes |记录未使用索引的查询| ON |帮助发现索引缺失|
| logbin |二进制日志前缀| /var/log/mysql/mysql-bin |主从复制和数据恢复必需|
| binlogformat |二进制日志格式| ROW |ROW 格式最安全|
| binlogexpirelogsseconds |Binlog 保留时间(秒)| 604800(7 天)|自动清理过期 binlog|
| syncbinlog |Binlog 刷盘策略| 1 | 1 =每次提交刷盘，最安全|

日志配置示例：
```
[mysqld]
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
```
### 4.6 缓存与临时表配置

|参数|作用|建议值|说明|
|---|---|---|---|
| tmptablesize |内存临时表最大大小|64 M|超过此值会转换为磁盘临时表|
| maxheaptablesize |内存表最大大小|64 M|与 tmptablesize 保持一致|
| sortbuffersize |排序缓冲区大小|4 M|每个排序操作分配的内存|
| joinbuffersize |连接缓冲区大小|4 M|每个 JOIN 操作分配的内存|
| tableopencache |表缓存数量|2000|提高表打开速度|
| tabledefinitioncache |表定义缓存数量|2000|提高表定义读取速度|
| threadcachesize |线程缓存数量|256|减少线程创建开销|
| openfiles_limit |文件描述符限制|65535|与系统 ulimit 配合|

⚠️ 查询缓存(Query Cache)已在 MySQL 8.0 中彻底移除，不再配置

缓存配置示例：
```
[mysqld]
tmp_table_size = 64M
max_heap_table_size = 64M
sort_buffer_size = 4M
join_buffer_size = 4M
table_open_cache = 2000
table_definition_cache = 2000
thread_cache_size = 256
open_files_limit = 65535
```
### 4.7 安全配置

|参数|作用|建议值|说明|
|---|---|---|---|
| skipexternallocking |禁用外部锁定|不设置|避免外部锁定导致性能下降|
| skipnameresolve |跳过 DNS 反向解析|不设置|加速连接，减少 DNS 查询|
| securefilepriv |限制导入导出路径| /var/lib/mysql-files |防止通过 LOAD DATA 等读取任意文件|
| sql_mode |SQL 模式|见下方|控制 SQL 语句的严格程度|

推荐的 sql_mode：
```
sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'
```

|模式|作用|
|---|---|
| STRICTTRANSTABLES |严格模式，非法值会报错而非警告|
| NOZEROINDATE |不允许日期中出现零|
| NOZERODATE |不允许 0000-00-00 日期|
| ERRORFORDIVISIONBYZERO |除零操作报错|
| NOENGINE_SUBSTITUTION |指定的存储引擎不可用时直接报错|
### 4.8 其他常用配置

|参数|作用|建议值|说明|
|---|---|---|---|
| server-id |服务器唯一 ID| 1(单机)/ 主从架构需唯一|主从复制必需|
| default-time-zone |默认时区| +08:00 |避免时区转换错误|
| default-storage-engine |默认存储引擎| InnoDB |MySQL 8.0 默认已是 InnoDB|
| maxallowedpacket |最大数据包| 64M |影响大数据操作|

## 五、参数的生效方式
MySQL 的参数分为两类：
### 5.1 静态参数
特点：修改后必须重启 MySQL 服务才能生效。
常见静态参数：
- datadir(数据目录)
- port(端口)
- character-set-server(字符集)
- innodbbufferpoolsize(缓冲池大小)(MySQL 5.7.5+ 后支持动态调整)
- innodbredologcapacity(Redo Log 容量)
### 5.2 动态参数
特点：修改后立即生效，无需重启。
修改方式：
```
-- 在当前会话生效(仅当前连接)
SET SESSION 参数名 = 值;

-- 全局生效(所有新连接，但重启后失效)
SET GLOBAL 参数名 = 值;

-- 全局生效 + 持久化到配置文件(MySQL 8.0)
SET PERSIST 参数名 = 值;
```
💡 MySQL 8.0 的 SET PERSIST 会将参数写入 mysqld-auto.cnf 文件，重启后依然生效。
常见动态参数：
- max_connections(最大连接数)
- wait_timeout(连接超时)
- slow_query_log(慢查询日志开关)
- innodb_lock_wait_timeout(锁等待超时)
### 5.3 查看参数值
```
-- 查看单个参数
SHOW VARIABLES LIKE '参数名';

-- 查看一类参数
SHOW VARIABLES LIKE 'innodb%';

-- 查看所有参数
SHOW VARIABLES;
```
## 六、生产环境配置模板
以下配置适用于单机生产环境，物理内存 16GB，可根据实际情况调整。

 ⚠️路径说明：以上路径为二进制包安装的默认路径。若通过 YUM/DNF/RPM 安装，`datadir` 默认为 `/var/lib/mysql`，`socket` 默认为 `/var/lib/mysql/mysql.sock`，请根据实际情况调整。
```
[mysqld]
# ============================================
# 基础路径
# ============================================
basedir = /usr/local/mysql
datadir = /data/mysql
socket = /tmp/mysql.sock
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
# 连接
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
# 日志
# ============================================
log_error = /var/log/mysql/error.log
slow_query_log = ON
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
log_queries_not_using_indexes = ON
log_bin = /var/log/mysql/mysql-bin
binlog_format = ROW
binlog_expire_logs_seconds = 604800
sync_binlog = 1

# ============================================
# 缓存
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
# 安全
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
# ============================================
# 客户端
# ============================================
port = 3306
socket = /tmp/mysql.sock
default-character-set = utf8mb4


[mysql]
# ============================================
# mysql 命令行客户端
# ============================================
default-character-set = utf8mb4
prompt = "mysql> "
```

## 七、附录：常用命令速查
| 操作              | 命令                                                       |
| --------------- | -------------------------------------------------------- |
| 查看配置文件加载顺序      | `mysqld --help --verbose \| grep -A 1 "Default options"` |
| 查看某个参数值         | `SHOW VARIABLES LIKE '参数名';`                             |
| 查看所有参数          | `SHOW VARIABLES;`                                        |
| 动态修改参数(全局)      | `SET GLOBAL 参数名 = 值;`                                    |
| 动态修改参数(持久化，8.0) | `SET PERSIST 参数名 = 值;`                                   |
| 查看当前连接数         | `SHOW STATUS LIKE 'Threads_connected';`                  |
| 查看最大历史连接数       | `SHOW STATUS LIKE 'Max_used_connections';`               |
| 检查配置文件语法        | `mysqld --defaults-file=/etc/my.cnf --verbose --help`    |
| 重新加载配置文件        | `sudo systemctl restart mysqld`                          |

