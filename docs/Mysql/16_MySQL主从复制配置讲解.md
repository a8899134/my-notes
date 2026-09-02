## 一、主从复制概述
### 1.1 主从复制作用
主从复制(Master-Slave Replication)是将主库(Master)的数据变更实时同步到从库(Slave)的机制。主库负责处理写操作(INSERT、UPDATE、DELETE)，从库通过读取主库的 Binlog 并重放这些操作，保持与主库数据一致。

通俗理解：主库是“生产车间”，从库是“复制车间”。主库每生产一件产品(完成一次数据变更)，就把生产记录(Binlog)发给从库，从库按照记录复制出一件完全一样的产品。
### 1.2 主从复制的价值
| 应用场景 | 说明                    |
| ---- | --------------------- |
| 读写分离 | 主库处理写入，从库处理查询，分散数据库压力 |
| 数据备份 | 从库作为热备，主库故障时快速切换      |
| 报表分析 | 在从库运行复杂查询，不影响主库性能     |
| 异地容灾 | 跨机房部署从库，应对机房级故障       |

## 二、主从复制的工作原理
### 2.1 核心组件
主从复制依赖三个核心组件：

| 组件                 | 位置  | 作用                         |
| ------------------ | --- | -------------------------- |
| Binlog(二进制日志)      | 主库  | 记录所有数据变更操作                 |
| IO 线程(I/O Thread)  | 从库  | 从主库读取 Binlog 并写入 Relay Log |
| SQL 线程(SQL Thread) | 从库  | 读取 Relay Log 并在从库重放执行      |
| Relay Log(中继日志)    | 从库  | 暂存从主库读取的 Binlog 事件         |

### 2.2 复制流程
主从复制的完整流程如下：
```
主库(Master)：
    │
    ├── 1. 应用程序执行 UPDATE/INSERT/DELETE
    │
    ├── 2. MySQL 将变更记录写入 Binlog
    │
    └── 3. Binlog 等待被从库读取

从库(Slave)：
    │
    ├── 4. IO 线程连接到主库，请求 Binlog
    │
    ├── 5. 主库的 Binlog Dump 线程将 Binlog 发送给从库
    │
    ├── 6. IO 线程接收 Binlog，写入 Relay Log
    │
    └── 7. SQL 线程读取 Relay Log，在从库执行 SQL(重放)
```
### 2.3 两个线程的关键作用
1. IO 线程(I/O Thread)
从库通过 CHANGE MASTER TO 命令连接主库后，IO 线程在主从间持续运行，负责将主库新产生的 Binlog 事件实时拉取到从库，并写入 Relay Log。如果网络中断，IO 线程会持续重连，网络恢复后自动断点续传，无需人工干预。
2. SQL 线程(SQL Thread)
SQL 线程负责读取 Relay Log，将其中记录的操作在从库上顺序重放。由于 Binlog 和 Relay Log 都是按事务提交顺序严格记录的，SQL 线程重放保证了从库以与主库相同的顺序应用变更，最终数据状态与主库一致。
### 2.4 复制格式

| 格式        | 说明           | 优缺点                            |
| --------- | ------------ | ------------------------------ |
| STATEMENT | 记录执行的 SQL 语句 | 日志量小，但非确定性语句(如 NOW())可能导致主从不一致 |
| ROW       | 记录每行数据的变化    | 最安全、最准确，但日志量大                  |
| MIXED     | 混合模式，自动切换    | 兼顾两者，但逻辑复杂                     |

生产环境推荐：binlog_format = ROW

## 三、主从复制架构类型
### 3.1 一主一从
```
     ┌─────────┐
     │ Master  │
     └────┬────┘
          │
          ▼
     ┌─────────┐
     │ Slave   │
     └─────────┘
```

- 适用场景：小规模业务、读写分离入门
- 优点：架构简单，易于维护
- 缺点：从库单点，故障后无备用
### 3.2 一主多从
```
     ┌─────────┐
     │ Master  │
     └────┬────┘
          │
    ┌─────┼─────┐
    ▼     ▼     ▼
 ┌─────┐┌─────┐┌─────┐
 │Slave││Slave││Slave│
 └─────┘└─────┘└─────┘
```
- 适用场景：读多写少的业务、读写分离
- 优点：分散读压力，高可用
- 缺点：主库写入压力不变，主库故障影响所有从库
### 3.3 级联复制
```
     ┌─────────┐
     │ Master  │
     └────┬────┘
          ▼
     ┌─────────┐
     │ Slave 1 │  ← 既是从库，也是中继主库
     └────┬────┘
          │
          ▼
     ┌─────────┐
     │ Slave 2 │
     └─────────┘
```

- 适用场景：跨机房部署、减轻主库压力
- 优点：减轻主库的 Binlog 发送压力
- 缺点：链路越长，延迟越大

## 四、SSL 加密复制配置
### 4.1 确认主库 SSL 状态
在主库执行：
```sql
SHOW VARIABLES LIKE 'have_ssl';
```
- YES：SSL 已启用 → 继续下一步
- DISABLED：SSL 未启用，需要先启用
### 4.2 主库启用 SSL
如果 have_ssl = DISABLED，
1. 确认证书文件存在
```bash
ls -la /data/mysql/*.pem
```
应看到 ca.pem、server-cert.pem、server-key.pem。

2. 在主库 my.cnf 的 [mysqld] 段添加
```ini
ssl_ca = /data/mysql/ca.pem
ssl_cert = /data/mysql/server-cert.pem
ssl_key = /data/mysql/server-key.pem
```
3. 重启主库
```bash
sudo systemctl restart mysqld
```
4. 验证 SSL 是否启动
```sql
SHOW VARIABLES LIKE 'have_ssl';
-- 应返回 YES
```
 
## 五、主从复制配置(基于 Binlog)

### 5.1 环境要求
|项目|要求|
|---|---|
|MySQL 版本|主从版本尽量一致(或从库 >= 主库)|
|网络|主从之间网络互通，端口 3306 开放|
|数据一致性|主从数据初始状态一致|
|server-id|主从的 server-id 必须不同|
### 5.2 核心机制
这种方式的核心是手动管理一个“书签”，即主库 binlog 的文件名和位置(Position)。
- **核心机制：**
1. 从库通过 CHANGE MASTER TO 命令，指定要从主库的哪个 MASTER_LOG_FILE(文件)和 MASTER_LOG_POS(位置)开始复制。
- **主要痛点：**
1. 维护复杂：一旦发生主从切换(比如主库宕机，把某个从库提升为新主库)，其他所有从库都需要重新找到新主库的 binlog 文件和位置，这个过程非常繁琐且容易出错。
2. 故障恢复困难：如果主从复制因故中断(比如网络闪断)，DBA 需要登录数据库，手动定位并指定一个新的同步点来恢复复制。
3. 数据一致性风险：在复杂的复制拓扑或故障切换中，人工操作极易出错，可能导致数据不一致或复制链路中断。
- **操作顺序：**
1. 在主库获取 Binlog 位置(FLUSH TABLES WITH READ LOCK + SHOW MASTER STATUS)
2. 导出主库数据(mysqldump)并传输到从库(scp)，然后 UNLOCK TABLES
3. 在主库创建复制用户并授权
4. 在从库导入数据并配置 CHANGE MASTER TO
5. 启动复制并验证 SHOW SLAVE STATUS
### 5.3 参数检查
1. 检查主从的 server-id
```
-- 在主库和从库分别执行
SHOW VARIABLES LIKE 'server_id';
```
确保主库和从库的 server_id 不同(如主库=1，从库=2)。
2. 主库开启 Binlog
```
-- 检查 Binlog 是否开启
SHOW VARIABLES LIKE 'log_bin%';
```
如果 `log_bin` 为 `OFF`，修改 /etc/my.cnf 中 [mysqld] 段的 log_bin 参数，指定 binlog 文件的路径和前缀：
```
[mysqld]
log_bin = /var/log/mysql/mysql-bin
```
修改后执行 sudo systemctl restart mysqld 重启服务，然后执行 SHOW VARIABLES LIKE 'log_bin%'; 验证是否已开启。
### 5.4 主库配置
1. 修改主库配置文件
在 /etc/my.cnf 中添加以下配置：
```
[mysqld]
# 服务器唯一 ID(必须唯一)
server-id = 1

# 开启 Binlog
log_bin = /var/log/mysql/mysql-bin

# Binlog 格式(推荐 ROW)
binlog_format = ROW

# Binlog 保留时间(7天)
binlog_expire_logs_seconds = 604800

# 需要同步的数据库(可选，不指定则同步所有)
# binlog_do_db = mydb

# 不需要同步的数据库(可选)
# binlog_ignore_db = mysql
```
注意：不要添加 ssl=0 或 skip_ssl，否则 SSL 功能会被关闭。
参数说明：
- server-id，服务器唯一标识，主从架构中每个节点必须不同
-  log_bin，Binlog 文件路径和前缀
-  binlog_format，Binlog 格式，ROW 最安全
-  binlog_expire_logs_seconds，Binlog 自动清理时间
- 
 2.  重启主库 MySQL
```
sudo systemctl restart mysqld
```
3. 获取主库 Binlog 位置
```
-- 锁定所有表(确保备份时数据一致)
FLUSH TABLES WITH READ LOCK;

-- 查看当前 Binlog 位置
SHOW MASTER STATUS;
```
**注意:**  如果采用XtraBackup 方式进行备份，不需要锁表
输出示例：
```
+------------------+----------+--------------+------------------+
| File             | Position | Binlog_Do_DB | Binlog_Ignore_DB |
+------------------+----------+--------------+------------------+
| mysql-bin.000001 |      154 |              |                  |
+------------------+----------+--------------+------------------+
```
记录下 File 和 Position 的值(如 mysql-bin.000001 和 154)，配置从库时需要用到。

⚠️注意：执行 FLUSH TABLES WITH READ LOCK 后，主库处于只读状态。对于使用 InnoDB 且开启 --single-transaction 的备份方式，可以用 mysqldump 的 --master-data 参数自动获取位置，避免手动锁表。
### 5.5 导出主库数据
如果从库还没有数据，需要从主库导出初始数据，然后复制到从库的目录下
1. mysqldump(逻辑备份，适合小数据量)
```
# 导出主库所有数据库(保留 Binlog 位置信息)
mysqldump -u root -p --all-databases --master-data=2 --single-transaction > /tmp/full_backup.sql
# 将备份文件传输到从库
scp /tmp/full_backup.sql 用户名@从库IP:/tmp/
```
参数说明
- `--master-data=2`：在备份文件中记录 Binlog 位置(注释形式)
- `--single-transaction`：使用事务保证一致性，不锁表
- `--all-databases`：备份所有数据库
```
# 解锁主库表
UNLOCK TABLES;
```
2. XtraBackup(物理备份，适合大数据量，推荐生产环境)
```
# 在主库执行全量备份
sudo xtrabackup --backup --target-dir=/tmp/full_backup \
  --user=root \
  --password='Mysql@root123'

# 准备备份(应用 redo log，使备份文件一致)
sudo xtrabackup --prepare --target-dir=/tmp/full_backup
# 将整个备份目录传输到从库
sudo scp -r /tmp/full_backup 用户名@从库IP:/tmp/
```
### 5.6 创建复制用户
在主库上创建用于复制的专用用户：
```
-- 创建复制用户(使用 mysql_native_password)
CREATE USER 'repl'@'%' IDENTIFIED WITH mysql_native_password BY 'Repl@Pass123';

-- 授予复制权限(最小权限原则)
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
FLUSH PRIVILEGES;
```
权限说明：
- REPLICATION SLAVE：允许该用户从主库读取 Binlog
- 不需要授予其他任何权限，遵循最小权限原则

 💡 **提示**：如果备份时先创建了复制用户，备份文件中会包含 `CREATE USER` 语句，从库导入后启动复制可能触发 1396 错误。此时可执行 `STOP SLAVE; SET GLOBAL sql_slave_skip_counter = 1; START SLAVE;` 跳过该语句。本文档顺序已按“先备份后创建用户”编排，可避免此问题。
### 5.7 从库配置
1. 修改从库配置文件
创建 `relay_log ` 路径目录
```
sudo mkdir -p /var/log/mysql
sudo chown mysql:mysql /var/log/mysql
```
在 /etc/my.cnf 中添加以下配置：
```
[mysqld]
# 服务器唯一 ID(必须与主库不同)
server-id = 2

# 开启 Relay Log
relay_log = /var/log/mysql/mysql-relay-bin

# 只读模式(从库对外只读，防止写入导致不一致)
read_only = ON

# 超级用户也只读(可选)
# super_read_only = ON

# 需要同步的数据库(可选)
# replicate_do_db = mydb

# 不需要同步的数据库(可选)
# replicate_ignore_db = mysql
```

参数说明：
- server-id，必须与主库不同，建议与主机 IP 后两位相关
- relay_log，中继日志文件路径和前缀
- read_only，从库只读，防止误写入
- super_read_only，超级用户也只读(MySQL 8.0+)

⚠️ 注意：从库的 server-id 不能与主库或其他从库相同，否则复制无法正常工作。

3. 重启从库 MySQL
```
sudo systemctl restart mysqld
```
### 5.8 导入主库数据
1. 导入备份(mysqldump)
```
# 导入备份(mysqldump)
mysql -u root -p < /tmp/full_backup.sql
```
💡 mysqldump 是逻辑备份，直接导入即可，不需要清空数据目录。

如果从库是全新搭建且需要完整覆盖，可以先初始化数据目录再导入：
```
# 全新从库：先初始化数据目录
sudo systemctl stop mysqld
sudo rm -rf /data/mysql/*
sudo /usr/local/mysql/bin/mysqld --initialize --user=mysql --basedir=/usr/local/mysql --datadir=/data/mysql
sudo systemctl start mysqld

# 导入备份
mysql -u root -p < /tmp/full_backup.sql
```

2. 导入备份(XtraBackup)
```
# 1. 停止 MySQL
sudo systemctl stop mysqld

# 2. 清空数据目录(⚠️ 确认无业务数据，且备份文件已完整传输)
sudo rm -rf /data/mysql/*

# 3. 恢复备份到数据目录
xtrabackup --copy-back --target-dir=/tmp/full_backup

# 4. 设置目录权限
sudo chown -R mysql:mysql /data/mysql

# 5. 启动 MySQL
sudo systemctl start mysqld

# 6. 查看 binlog 位置(用于配置复制)
cat /tmp/full_backup/xtrabackup_binlog_info
# 输出示例: mysql-bin.000005 157
```
⚠️ 重要说明：无论使用 mysqldump 还是 XtraBackup，导入/恢复后，从库的 root 密码都会变成主库的 root 密码。

3.  获取主库最新 Binlog 位置
```sql
SHOW MASTER STATUS;
```
记录 File 和 Position。
### 5.9 从库配置主库信息
⚠️ **重要提示：** Binlog 位置模式不需要执行 `RESET MASTER` , `RESET MASTER` 是 GTID 模式下的专属操作，用于清空从库的 GTID 执行历史。
1. 从库参数配置
注意：主库 SSL 启用(have_ssl = YES)后，从库的 CHANGE MASTER TO 必须配置 MASTER_SSL = 1，否则复制连接会因握手失败报 Access denied。
```
-- Binlog 位置模式：直接从备份文件读取 binlog 位置
grep "CHANGE MASTER" /tmp/full_backup.sql
-- 或 XtraBackup：cat /tmp/full_backup/xtrabackup_binlog_info

CHANGE MASTER TO
  MASTER_HOST = '主库IP',
  MASTER_USER = 'repl',
  MASTER_PASSWORD = 'Repl@Pass123',
  MASTER_LOG_FILE = 'mysql-bin.000005',   -- 从备份文件读取
  MASTER_LOG_POS = 157,                  -- 从备份文件读取
  MASTER_SSL = 1,
  MASTER_SSL_VERIFY_SERVER_CERT = 0;

START SLAVE;
```
参数说明：

| 参数                | 说明                                                 |
| ----------------- | -------------------------------------------------- |
| `MASTER_HOST`     | 主库 IP 地址或主机名                                       |
| `MASTER_PORT`     | 主库端口(默认 3306)                                      |
| `MASTER_USER`     | 复制用户名(在主库创建的)                                      |
| `MASTER_PASSWORD` | 复制用户密码                                             |
| `MASTER_LOG_FILE` | 主库当前的 Binlog 文件名(`SHOW MASTER STATUS` 获取的 File)    |
| `MASTER_LOG_POS`  | 主库当前的 Binlog 位置(`SHOW MASTER STATUS` 获取的 Position) |
2. 启动复制
```
-- 启动从库复制
START SLAVE;

-- 查看复制状态
SHOW SLAVE STATUS\G
```
3. 验证复制状态
重点关注以下字段：
```
Slave_IO_Running: Yes       ← IO 线程正常
Slave_SQL_Running: Yes      ← SQL 线程正常
Seconds_Behind_Master: 0    ← 延迟为 0
Last_Error:                 ← 无错误
```
- Slave_IO_Running = Yes：从库能正常读取主库 Binlog
- Slave_SQL_Running = Yes：从库能正常重放 SQL
- Seconds_Behind_Master = 0：主从数据已同步
### 5.10 验证同步
1. 在主库创建测试数据
```sql
CREATE DATABASE test_sync;
USE test_sync;
CREATE TABLE users (id INT, name VARCHAR(20));
INSERT INTO users VALUES (1, 'zhangsan'), (2, 'lisi');
```
2. 在从库查询验证
```
SHOW DATABASES;
USE test_sync;
SELECT * FROM users;
```

## 6、主从复制配置(基于 GTID)
### 6.1 GTID 概念
GTID(Global Transaction Identifier，全局事务标识符) 是 MySQL 5.6 引入的特性，为每个事务生成一个全局唯一的 ID。
GTID 格式：server_uuid:transaction_id
例如：3E11FA47-71CA-11E1-9E33-C80AA9429562:1-5
### 6.2 GTID 的核心机制与优势
- **核心机制：**
GTID(Global Transaction Identifier)是一个由 server_uuid:transaction_id 组成的全局唯一标识符。每个在主库上提交的事务都会被分配一个 GTID。
- **主要优势**：

| 对比项   | 基于 Binlog 位置 | 基于 GTID     |
| ----- | ------------ | ----------- |
| 配置复杂度 | 需要手动记录位置     | 自动管理，无需手动记录 |
| 故障切换  | 复杂，需要找新位置    | 简单，自动定位     |
| 主从重建  | 需要重新获取位置     | 自动跳过已执行事务   |
| 可读性   | 不易理解         | 直观，全局唯一     |

结论：生产环境推荐使用 GTID 模式。
### 6.3.主库配置
1. 在 /etc/my.cnf 中添加：
```
[mysqld]
server-id = 1
log_bin = /var/log/mysql/mysql-bin
binlog_format = ROW

# GTID 相关配置
gtid_mode = ON
enforce_gtid_consistency = ON

# Binlog 保留时间
binlog_expire_logs_seconds = 604800
```
2. 重启主库
```
sudo systemctl restart mysqld
```
### 6.4 导出备份
如果从库还没有数据，需要从主库导出初始数据，然后复制到从库的目录下
1. mysqldump(逻辑备份，适合小数据量)
```
# 导出主库所有数据库(保留 Binlog 位置信息)
mysqldump -u root -p --all-databases --master-data=2 --single-transaction > /tmp/full_backup.sql
# 将备份文件传输到从库
scp /tmp/full_backup.sql 用户名@从库IP:/tmp/
```
参数说明
- `--master-data=2`：在备份文件中记录 Binlog 位置(注释形式)
- `--single-transaction`：使用事务保证一致性，不锁表
- `--all-databases`：备份所有数据库
2. XtraBackup(物理备份，适合大数据量，推荐生产环境)
```
# 在主库执行全量备份
sudo xtrabackup --backup --target-dir=/tmp/full_backup \
  --user=root \
  --password='Mysql@root123'

# 准备备份(应用 redo log，使备份文件一致)
sudo xtrabackup --prepare --target-dir=/tmp/full_backup
# 将整个备份目录传输到从库
sudo scp -r /tmp/full_backup 用户名@从库IP:/tmp/
```
3. 获取主库的 `Executed_Gtid_Set` 值
```
SHOW MASTER STATUS;
```
### 6.5 创建复制用户
```
CREATE USER 'repl'@'%' IDENTIFIED WITH mysql_native_password BY 'Repl@Pass123';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
FLUSH PRIVILEGES;
```

### 6.6 从库配置
1. 在 /etc/my.cnf 中添加：
```
[mysqld]
server-id = 2
relay_log = /var/log/mysql/mysql-relay-bin
read_only = ON

# GTID 相关配置
gtid_mode = ON
enforce_gtid_consistency = ON
```
2. 重启从库
```
sudo systemctl restart mysqld
```
### 6.7 导入备份
1. mysqldump(逻辑备份恢复)
```
# 在从库执行导入(MySQL 需处于运行状态)
mysql -u root -p < /tmp/full_backup.sql
```
 💡 `mysqldump` 是逻辑备份，直接导入即可，不需要清空数据目录。
如果从库是全新搭建且需要完整覆盖，可以先初始化数据目录再导入：
```
sudo systemctl stop mysqld
sudo rm -rf /data/mysql/*
sudo /usr/local/mysql/bin/mysqld --initialize --user=mysql --basedir=/usr/local/mysql --datadir=/data/mysql
sudo systemctl start mysqld
mysql -u root -p < /tmp/full_backup.sql

- 清空 GTID 执行历史(仅首次配置时执行)
RESET MASTER;
```
2. XtraBackup(物理备份恢复)
清空 GTID 执行历史(重要！新环境必须执行)
```bash
# 1. 停止 MySQL
sudo systemctl stop mysqld

# 2. 直接删除整个目录再重建(不然经常删除不干掉)
sudo rm -rf /data/mysql/*
sudo mkdir -p /data/mysql

# 4. 恢复备份到数据目录
sudo xtrabackup --copy-back --target-dir=/tmp/full_backup

# 5. 设置目录权限
sudo chown -R mysql:mysql /data/mysql
sudo chown -R mysql:mysql /var/log/mysql
sudo chmod 755 /var/log/mysql

# 6. 启动 MySQL
sudo systemctl start mysqld

# 7. 查看 GTID 信息
cat /tmp/full_backup/xtrabackup_binlog_info
# 输出示例: mysql-bin.000005 157 c777888a-b6df-11e2-a604-080027635ef5:1-4
```
清空 GTID 执行历史
```sql
-- 8. 清空 GTID 执行历史
RESET MASTER;

-- 9. 设置 gtid_purged(从 xtrabackup_binlog_info 读取)
SET GLOBAL gtid_purged='c777888a-b6df-11e2-a604-080027635ef5:1-4';
```
⚠️ **注意**：`RESET MASTER` 会清空从库的 binlog 文件，仅适用于首次配置 GTID 复制。如果从库已有业务数据或已运行复制，请勿执行此命令，否则会破坏现有数据。
### 6.8 配置主从(GTID 模式)

```sql
-- 在从库上配置主库(进入数据库里)
CHANGE MASTER TO
  MASTER_HOST = '主库IP',
  MASTER_PORT = 3306,
  MASTER_USER = 'repl',
  MASTER_PASSWORD = 'Repl@Pass123',
  MASTER_AUTO_POSITION = 1,        -- GTID 自动定位
  MASTER_SSL = 1,                  -- 启用 SSL 加密连接
  MASTER_SSL_VERIFY_SERVER_CERT = 0; -- 自签名证书跳过验证

-- 启动复制
START SLAVE;

-- 查看状态
SHOW SLAVE STATUS\G
```
GTID 模式的核心区别：不需要手动指定 MASTER_LOG_FILE 和 MASTER_LOG_POS，MySQL 自动通过 GTID 定位同步位置。
### 6.9 验证同步
1. 在主库创建测试数据
```sql
CREATE DATABASE test_sync_gtid;
USE test_sync_gtid;
CREATE TABLE users (id INT, name VARCHAR(20));
INSERT INTO users VALUES (1, 'zhangsan'), (2, 'lisi');
FLUSH PRIVILEGES;
```
2. 在从库查询验证
```
SHOW DATABASES;
USE test_sync_gtid;
SELECT * FROM users;
```

## 七、主从复制状态监控
### 7.1 查看复制状态
```
-- 查看从库复制状态
SHOW SLAVE STATUS\G

-- 查看复制线程状态
SHOW PROCESSLIST;
```
### 7.2 关键指标说明
| 指标                  | 说明                    | 正常值  |
| ------------------- | --------------------- | ---- |
| SlaveIORunning      | IO 线程是否运行             | Yes  |
| SlaveSQLRunning     | SQL 线程是否运行            | Yes  |
| SecondsBehindMaster | 复制延迟(秒)               | < 60 |
| LastError           | 最近错误信息                | 空    |
| MasterLogFile       | 主库当前 Binlog 文件        | —    |
| RelayLogFile        | 当前 Relay Log 文件       | —    |
| RelayLogPos         | Relay Log 当前位置        | —    |
| ExecutedGtid_Set    | 已执行的 GTID 集合(GTID 模式) | —    |
### 7.3 监控复制延迟
复制延迟过大时，需要排查以下问题：
```
-- 查看从库正在执行的查询(确认是否有长时间运行的查询)
SELECT * FROM information_schema.processlist WHERE command != 'Sleep';

-- 查看从库 I/O 线程状态
SHOW SLAVE STATUS\G
-- 关注 Last_IO_Error
```

### 7.4 复制延迟的常见原因
| 原因            | 解决方案       |
| ------------- | ---------- |
| 从库硬件性能差       | 升级从库配置     |
| 从库有大量查询(读业务)  | 将查询分流到其他从库 |
| 主库有大事务        | 拆分大事务      |
| 网络延迟          | 检查网络质量     |
| 从库 binlog 应用慢 | 检查从库慢查询日志  |
### 7.5 常用运维命令
| 操作                | 命令                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------- |
| 查看主库 binlog 位置    | `SHOW MASTER STATUS;`                                                                   |
| 查看从库复制状态          | `SHOW SLAVE STATUS\G`                                                                   |
| 查看复制错误详情          | `SELECT * FROM performance_schema.replication_applier_status_by_worker\G`               |
| 跳过错误(Binlog 位置模式) | `STOP SLAVE; SET GLOBAL sql_slave_skip_counter = 1; START SLAVE;`                       |
| 跳过错误(GTID 模式)     | `STOP SLAVE; SET GTID_NEXT='具体值'; BEGIN; COMMIT; SET GTID_NEXT=AUTOMATIC; START SLAVE;` |
| 启动复制              | `START SLAVE;`                                                                          |
| 停止复制              | `STOP SLAVE;`                                                                           |
| 重置复制配置            | `RESET SLAVE ALL;`                                                                      |
| 查看复制用户            | `SELECT User, Host, plugin FROM mysql.user WHERE User='repl';`                          |
| 查看 SSL 状态         | `SHOW VARIABLES LIKE 'have_ssl';`                                                       |
| 查看 server-id      | `SHOW VARIABLES LIKE 'server_id';`                                                      |
| 查看 GTID 执行状态      | `SHOW VARIABLES LIKE 'gtid_executed';`                                                  |
| 查看 GTID 清理状态      | `SHOW VARIABLES LIKE 'gtid_purged';`                                                    |
| 关闭只读(临时写操作)       | `SET GLOBAL read_only = OFF; SET GLOBAL super_read_only = OFF;`                         |
| 恢复只读              | `SET GLOBAL read_only = ON; SET GLOBAL super_read_only = ON;`                           |


## 八、常见问题与处理
### 8.1 IO 线程问题
IO 线程负责从主库拉取 binlog，出现异常时复制会中断，`Slave_IO_Running: No` 或 `Connecting`。以下是几种常见情况：
1. Access denied(认证失败)

**现象：**
```text
Last_IO_Error: Access denied for user 'repl'@'%' (using password: YES)
```

**原因：**
- 主库复制用户密码被修改
- 主库复制用户被删除
- 认证插件不匹配(MySQL 8.0 默认 `caching_sha2_password`)

**排查：**
```sql
-- 在主库检查复制用户是否存在
SELECT User, Host, plugin FROM mysql.user WHERE User='repl';
```

**解决：**
```sql
-- 在主库重新设置密码
ALTER USER 'repl'@'%' IDENTIFIED WITH mysql_native_password BY 'Repl@Pass123';
FLUSH PRIVILEGES;

-- 在从库重新配置密码
STOP SLAVE;
CHANGE MASTER TO MASTER_PASSWORD = 'Repl@Pass123';
START SLAVE;
```

2. `Can't connect` (网络不通)

**现象：**
```text
Last_IO_Error: Can't connect to MySQL server on '主库IP' (111)
```


**原因：**
- 网络不通
- 防火墙拦截 3306 端口
- 主库 `bind-address` 未监听外网 IP
- 主库 MySQL 服务未启动

**排查：**
```bash
# 测试网络连通性
ping 主库IP
telnet 主库IP 3306

# 检查主库 bind-address
SHOW VARIABLES LIKE 'bind_address';
```

**解决：**
```bash
# 开放防火墙端口(主库执行)
sudo firewall-cmd --permanent --add-port=3306/tcp
sudo firewall-cmd --reload

# 或修改 bind-address(my.cnf)
bind-address = 0.0.0.0
```

3. `Master has purged binary logs`(Binlog 已被清理)

**现象：**
```text
Last_IO_Error: Got fatal error 1236 from master when reading data from binary log: 'The slave is connecting using CHANGE MASTER TO MASTER_LOG_FILE = 'mysql-bin.000010', MASTER_LOG_POS = 1234, but the master has purged binary logs containing GTIDs that the slave requires.'
```

**原因：**
主库的 Binlog 文件已被清理，从库需要的 Binlog 已不存在。

**解决(重新搭建从库)：**
```bash
# 1. 主库重新导出备份
mysqldump -u root -p --all-databases --master-data=2 --single-transaction > /tmp/full_backup.sql

# 2. 从库重新导入
mysql -u root -p < /tmp/full_backup.sql

# 3. 重新配置复制
CHANGE MASTER TO ...
START SLAVE;
```

4. SSL 握手失败(MySQL 8.0 常见踩坑)

**现象：**
```text
Last_IO_Error: Source command COM_REGISTER_REPLICA failed: Access denied for user 'repl'@'%' (using password: YES)
```
或
```text
Last_IO_Error: Got an error reading communication packets
```

**原因：**
主库 SSL 启用(`have_ssl = YES`)，但从库 `CHANGE MASTER TO` 未配置 `MASTER_SSL = 1`，复制连接在握手阶段被拒绝。

MySQL 8.0 默认启用 SSL，即使 `my.cnf` 中没有配置 `ssl_*` 参数，也会自动生成自签名证书并启用 SSL。

**排查：**
```sql
-- 在主库检查 SSL 状态
SHOW VARIABLES LIKE 'have_ssl';
-- 如果返回 YES，说明 SSL 已启用
```
**解决(从库重新配置，启用 SSL)：**
```sql
STOP SLAVE;
RESET SLAVE ALL;

CHANGE MASTER TO
  MASTER_HOST = '主库IP',
  MASTER_USER = 'repl',
  MASTER_PASSWORD = 'Repl@Pass123',
  MASTER_LOG_FILE = 'mysql-bin.000006',
  MASTER_LOG_POS = 157,
  MASTER_SSL = 1,
  MASTER_SSL_VERIFY_SERVER_CERT = 0;

START SLAVE;
SHOW SLAVE STATUS\G
```
MASTER_SSL_VERIFY_SERVER_CERT = 0 表示不验证主库证书合法性(自签名证书场景)。
### 8.2 SQL 线程问题
SQL 线程负责重放 Relay Log，报错 `Slave_SQL_Running: No` 通常意味着从库数据与主库不一致。
1. `Duplicate entry`(主键冲突)

**现象：**
```text
Last_SQL_Error: Error 'Duplicate entry '1' for key 'PRIMARY'' on query
```

**原因：**
从库已存在相同主键的数据，主库再次插入时冲突。

**解决(跳过该事务，GTID 模式不可用 `sql_slave_skip_counter`)：**

Binlog 位置模式：
```sql
STOP SLAVE;
SET GLOBAL sql_slave_skip_counter = 1;
START SLAVE;
```
GTID 模式：
```sql
STOP SLAVE;
SET GTID_NEXT = '具体GTID值';
BEGIN; COMMIT;
SET GTID_NEXT = AUTOMATIC;
START SLAVE;
```
2. `Can't find record`(找不到要更新的记录)

**现象：**
```text
Last_SQL_Error: Could not execute Update_rows event on table mydb.users; Can't find record in 'users'
```

**原因：**
从库缺少主库要更新的数据行。

**解决：**
```bash
# 1. 在主库备份该表
mysqldump -u root -p mydb users > /tmp/users.sql

# 2. 在从库导入该表
mysql -u root -p mydb < /tmp/users.sql

# 3. 重启复制
STOP SLAVE;
START SLAVE;
```
3. `CREATE USER` 冲突(1396 错误)

**现象：**
```text
Last_SQL_Error: Worker 1 failed executing transaction 'ANONYMOUS' ... Error 'Operation CREATE USER failed for 'repl'@'%''
```

**原因：**
从库已存在 `repl` 用户，主库的 `CREATE USER` 操作在从库重放时冲突。

**解决(跳过该事务)：**
```sql
STOP SLAVE;
SET GLOBAL sql_slave_skip_counter = 1;
START SLAVE;
SHOW SLAVE STATUS\G
```
**预防**：先备份导出，再创建 `repl` 用户，备份文件中不会包含 `CREATE USER` 语句。

### 8.3 复制延迟问题

**现象：**
```text
Seconds_Behind_Master: 持续增大(> 60 秒)
```

**原因：**
- 从库硬件性能较差(CPU、内存、磁盘 I/O)
- 从库有大量查询负载(业务读请求打到从库)
- 主库有大事务(大批量 INSERT/UPDATE/DELETE)
- 主从之间网络延迟高
- 从库的 `relay_log` 写入慢

**解决：**
1. 升级从库硬件配置
2. 将读查询分流到其他从库
3. 拆分主库大事务为多个小事务
4. 检查主从之间的网络质量
5. 监控从库的磁盘 I/O 和 CPU 使用率

### 8.4 GTID 模式特有错误
1. `GTID_NEXT` 冲突
**现象：**
```text
Last_SQL_Error: Error executing row event: 'Cannot execute statement: impossible to write to binary log since BINLOG_FORMAT = ROW and at least one table uses a storage engine limited to statement-based logging.'
```

**原因：**

GTID 模式下，从库的 `gtid_executed` 与主库不一致。

**解决：**
```sql
-- 查看当前 GTID 状态
SHOW VARIABLES LIKE 'gtid_executed';
SHOW VARIABLES LIKE 'gtid_purged';

-- 如果需要重置，清空 GTID 执行历史(仅限首次搭建的从库)
RESET MASTER;
```
2. MASTER_AUTO_POSITION 无法定位

**现象：**

```text
Last_IO_Error: The slave is connecting using MASTER_AUTO_POSITION, but the master has purged binary logs containing GTIDs that the slave requires.
```
**原因：**

主库已清理从库需要的 GTID 事务，从库无法从 GTID 自动定位。

**解决(重新搭建从库)：**
```bash
# 使用 XtraBackup 或 mysqldump 重新从主库导出并恢复
```
### 8.5 主从切换后的问题
1. 新主库写入后，原主库恢复复制报错

**现象：**
```text
Last_SQL_Error: Error 'Duplicate entry' / 'Can't find record'
```

**原因：**

故障期间，新主库已有新数据写入，原主库恢复后数据与主库不一致。

**解决：**
```sql
-- 方案一：跳过冲突(GTID 模式下按具体事务跳过)
STOP SLAVE;
SET GTID_NEXT = '具体GTID值';
BEGIN; COMMIT;
SET GTID_NEXT = AUTOMATIC;
START SLAVE;

-- 方案二：重新从主库导出该表或整库恢复
```
### 8.6 配置参数相关
1. server-id 冲突

**现象：**
```text
Last_IO_Error: Fatal error: The slave I/O thread stops because master and slave have equal MySQL server ids.
```

**原因：**

主库和从库的 `server-id` 相同。

**解决：**
```sql
-- 在从库修改 server-id
SHOW VARIABLES LIKE 'server_id';
-- 如果与主库相同，修改 my.cnf
server-id = 2
-- 重启从库
sudo systemctl restart mysqld
```
2. 只读模式下无法写入

**现象：**
```text
ERROR 1290 (HY000): The MySQL server is running with the --read-only option so it cannot execute this statement
```
**原因：**

从库开启了 `read_only` 或 `super_read_only`。

**解决(临时关闭只读，仅在需要写入数据时执行)：**
```sql
SET GLOBAL read_only = OFF;
SET GLOBAL super_read_only = OFF;
-- 执行需要的写操作后，恢复只读
SET GLOBAL read_only = ON;
SET GLOBAL super_read_only = ON;

```
### 8.7 主库对调位置
正常情况
```
应用服务器 → 主库IP(192.168.100.54)→ 主库(可写)
                              ↓ 复制
                          从库(只读，不对外暴露IP)
```
- 开发只知道主库IP
- 从库IP只有你(运维)知道
- 从库通过主从复制同步数据
主库挂了之后的故障切换(手动操作)
1. 登录从库，提升为主库
```bash
mysql -u root -p
```
输入以下命令
```sql
-- 1. 停止复制
STOP SLAVE;
-- 2. 重置复制信息(清除从库身份)
RESET SLAVE ALL;
-- 3. 关闭只读模式
SET GLOBAL read_only = OFF;
SET GLOBAL super_read_only = OFF;
```
从库本身已经是主库的数据副本(只是只读而已)，执行以上操作后就变成了可写的独立主库。
2. 修改 IP
通知开发，修改配置文件，或者直接修改从库服务器 IP 成主库 IP。
3. 原主库恢复后，变成从库
原主库修复后，执行：
```
CHANGE MASTER TO
  MASTER_HOST = '新主库IP',
  MASTER_USER = 'repl',
  MASTER_PASSWORD = 'Repl@Pass123',
  MASTER_AUTO_POSITION = 1,
  MASTER_SSL = 1,
  MASTER_SSL_VERIFY_SERVER_CERT = 0;
START SLAVE;
```
