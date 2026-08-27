## 一、目录结构概述
MySQL 安装完成后，会在 Linux 文件系统中创建两类核心目录：

|目录类型|作用|升级时|备份必要性|
|---|---|---|---|
|安装目录|存放可执行程序、库文件、头文件等|需要替换|几乎不需要备份|
|数据目录|存放实际数据、日志文件、表文件等|保留不动|必须定期备份|

核心原则：升级 MySQL 时，只替换安装目录，不动数据目录。

查看数据目录位置：
```
SHOW VARIABLES LIKE 'datadir';
```
查看安装目录位置：
```
which mysqld
```

## 二、安装目录
### 2.1安装目录位置
| 安装方式         | 默认安装目录                               |
| ------------ | ------------------------------------ |
| 二进制包(生产推荐)   | `/usr/local/mysql`                   |
| YUM / DNF 安装 | 文件分散在 `/usr/bin`、`/usr/lib64` 等系统目录中 |
| RPM 安装       | 文件分散在系统目录中                           |
### 2.2 安装目录下的核心子目录
以二进制包安装为例，安装目录(`/usr/local/mysql`)下的目录结构：
```
/usr/local/mysql/
├── bin/               # 可执行文件目录
│   ├── mysqld         # MySQL 服务器主程序
│   ├── mysql          # MySQL 客户端程序
│   ├── mysqld_safe    # 安全启动脚本
│   ├── mysqladmin     # 管理工具
│   ├── mysqldump      # 备份工具
│   ├── mysqlbinlog    # 二进制日志查看工具
│   └── mysql_secure_installation  # 安全配置脚本
├── lib/               # 库文件目录(动态链接库和静态库)
├── include/           # 头文件目录(如 mysql.h)
├── share/             # 共享文件目录(字符集、错误信息、时区等)
└── support-files/     # 支持文件目录(启动脚本、示例配置文件)
```
#### 2.2.1 `bin/` — 可执行文件目录
存放 MySQL 的所有可执行命令。

|文件|作用|
|---|---|
| mysqld |MySQL 服务器主程序|
| mysql |MySQL 客户端程序|
| mysqldsafe |安全启动脚本，崩溃后自动重启|
| mysqladmin |管理工具(关闭服务、刷新权限等)|
| mysqldump |备份工具，导出 SQL 文件|
| mysqlbinlog |二进制日志查看工具|
| mysqlsecure_installation |安全配置脚本|
查看 bin 目录内容：
```
ls -l /usr/local/mysql/bin/
```
#### 2.2.2 `lib/` — 库文件目录
存放 MySQL 运行所需的动态链接库和静态库文件。
#### 2.2.3 `include/` — 头文件目录
存放 MySQL 的头文件(如 mysql.h)，编译客户端程序时需要。
#### 2.2.4 `share/` — 共享文件目录
存放字符集文件、错误信息文件、时区信息等。
#### 2.2.5 `support-files/` — 支持文件目录
存放启动脚本(如 mysql.server)和示例配置文件。

## 三、数据目录
### 3.1 查看数据目录位置
```
SHOW VARIABLES LIKE 'datadir';
```

### 3.2 默认数据目录位置
|安装方式|默认数据目录|
|---|---|
|二进制包|`/usr/local/mysql/data/` 或自定义(如 `/data/mysql`)|
|YUM / DNF 安装|`/var/lib/mysql/`|
### 3.3 数据目录的核心结构
```
/var/lib/mysql/
├── 数据库名/              # 每个数据库一个子目录
│   ├── 表名.ibd          # InnoDB 表数据+索引
│   └── 表名.frm          # MySQL 5.7 表结构定义
├── ibdata1               # InnoDB 系统表空间
├── mysql.ibd             # MySQL 8.0 系统表数据
├── ib_logfile0           # Redo Log(8.0.30 前)
├── ib_logfile1           # Redo Log(8.0.30 前)
├── #innodb_redo/         # Redo Log 目录(8.0.30+)
├── auto.cnf              # 服务器自动生成配置(含 server_uuid)
├── mysqld-auto.cnf       # 持久化全局系统变量
├── 主机名.pid            # 进程 ID 文件
├── 主机名.err            # 错误日志
└── mysql-bin.000001      # 二进制日志文件
```
#### 3.3.1 数据库子目录
每个子目录对应一个数据库，目录名即数据库名。
例如：数据库 shop → 目录 /var/lib/mysql/shop/
#### 3.3.2 系统文件
| 文件                          | 作用                            |
| --------------------------- | ----------------------------- |
| `ibdata1`                   | InnoDB 系统表空间(数据字典 + Undo Log) |
| `mysql.ibd`                 | MySQL 8.0 系统表数据文件             |
| `ib_logfile0`、`ib_logfile1` | Redo Log(8.0.30 前)            |
| `#innodb_redo/`             | Redo Log 存储目录(8.0.30+)        |
| `auto.cnf`                  | 服务器自动生成的配置文件(含 server_uuid)   |
| `mysqld-auto.cnf`           | 持久化的全局系统变量                    |
| `*.pid`                     | 进程 ID 文件                      |
### 3.4 查看数据目录的内容
```
cd /var/lib/mysql
ls -l
```

## 四、数据目录中的文件类型
### 4.1 InnoDB 存储引擎的文件
#### 4.1.1 `.ibd` 文件(独立表空间)
- 作用：存储 InnoDB 表的数据 + 索引
- 触发条件：innodb_file_per_table = ON(默认开启)
- 位置：数据目录/数据库名/表名.ibd
#### 4.1.2 `ibdata1`(系统表空间)
存储数据字典、Undo Log、双写缓冲区等公共数据。会随着数据增长自动扩展，不能直接删除。
#### 4.1.3 Redo Log 文件
- MySQL 8.0.30 之前：ib_logfile0、ib_logfile1
- MySQL 8.0.30 之后：#innodb_redo/ 目录下
用于崩溃恢复，固定大小，循环写入。
### 4.2 MyISAM 存储引擎的文件
每个 MyISAM 表生成三个文件：

|文件扩展名|作用|
|---|---|
| `.frm`(5.7)/ `.sdi`(8.0)|表结构定义|
| `.MYD` |表数据|
| `.MYI` |表索引|
```
/var/lib/mysql/shop/user.frm
/var/lib/mysql/shop/user.MYD
/var/lib/mysql/shop/user.MYI
```
### 4.3 MySQL 8.0 的重要变化
|MySQL 版本|表结构存储方式|
|---|---|
|5.7 及之前|`.frm` 文件(每个表一个)|
|8.0 及之后|存储在系统表空间(`mysql.ibd`)中，MyISAM 表用 `.sdi`|

## 五、系统数据库
MySQL 安装完成后，自动创建以下系统数据库：
### 5.1 `mysql` — 核心系统数据库
存储用户账号、权限信息、存储过程、时区信息等。

⚠️ 绝对不能随意修改或删除，否则可能导致 MySQL 无法启动。
### 5.2 `information_schema` — 元数据库
提供数据库元数据的视图(有哪些库、哪些表、列定义等)，是虚拟只读的，不占用磁盘空间。
### 5.3 `performance_schema` — 性能监控数据库
提供运行时性能监控数据(线程、锁等待、内存、I/O、SQL 执行统计等)，用于性能调优和故障排查。
### 5.4 `sys` — 性能诊断数据库(MySQL 5.7+)
将 performance_schema 的数据整合为更易读的视图和函数。
```
-- 查看当前正在执行的语句
SELECT * FROM sys.processlist;

-- 查看最耗时的语句
SELECT * FROM sys.statement_analysis ORDER BY total_latency DESC LIMIT 10;
```

## 六、配置文件
### 6.1 配置文件的位置
|优先级|路径|
|---|---|
|1|`/etc/my.cnf`|
|2|`/etc/mysql/my.cnf`|
|3|`$MYSQL_HOME/my.cnf`|
|4|`~/.my.cnf`(用户级)|

查找配置文件的实际路径：
```
mysqld --help --verbose | grep -A 1 "Default options"
```
查看正在使用的配置文件：
```
ps aux | grep mysqld | grep -E 'my.cnf|defaults-file'
```
### 6.2 配置文件的结构
```
[mysqld]
port = 3306
datadir = /var/lib/mysql

[client]
port = 3306
socket = /tmp/mysql.sock

[mysql]
prompt = "mysql> "
```

## 七、日志文件
### 7.1 日志类型对比
| 日志类型   | 记录内容          | 用途        | 生产环境    |
| ------ | ------------- | --------- | ------- |
| 错误日志   | 错误、警告、启动/关闭信息 | 故障排查      | ✅ 必须开启  |
| 二进制日志  | 所有数据变更操作      | 主从复制、数据恢复 | ✅ 必须开启  |
| 慢查询日志  | 执行慢的 SQL      | SQL 性能优化  | ✅ 建议开启  |
| 通用查询日志 | 所有连接和 SQL     | 调试、审计     | ❌ 不建议开启 |
### 7.2 日志文件默认位置
|日志类型|YUM/DNF 安装|二进制包安装|
|---|---|---|
|错误日志|`/var/log/mysqld.log`|`/var/log/mysql/error.log`|
|二进制日志|`/var/lib/mysql/mysql-bin.xxxxxx`|`/data/mysql/mysql-bin.xxxxxx`|
|慢查询日志|`/var/lib/mysql/主机名-slow.log`|`/var/log/mysql/slow.log`|
### 7.3 查看日志配置
```
SHOW VARIABLES LIKE 'log_error';
SHOW VARIABLES LIKE 'log_bin%';
SHOW VARIABLES LIKE 'slow_query_log%';
```
### 7.4 查看日志内容
```
# 错误日志(YUM/DNF)
sudo tail -50 /var/log/mysqld.log

# 错误日志(二进制包)
sudo tail -50 /var/log/mysql/error.log

# 慢查询日志
sudo tail -50 /var/log/mysql/slow.log
```
**总结：** 
1. 安装目录 = 程序文件(升级时替换，平时不用管)。
2. 数据目录 = 核心资产(数据库、表、索引、日志—定期备份，重点保护)。
3. 配置文件 = 运行规则(改完重启生效)。
4. 日志文件 = 运行记录(排错和优化的第一手资料)。