MySQL 运行过程中会遇到各种各样的错误。本手册将常见报错按类型分类整理，提供错误信息、原因分析、解决方案三要素，方便快速查阅和应急处理。
## 一、应急处理原则
遇到报错时，遵循以下原则：

|原则|说明|
|---|---|
|先看日志|错误日志是定位问题的第一手资料|
|先止损后根治|紧急情况下先恢复服务，再找根因|
|操作前备份|任何修复操作前，确保有备份可回退|
|记录操作|记录所有操作步骤，便于复盘和知识沉淀|

## 二、连接类报错
### 2.1 `Access denied for user 'xxx'@'xxx'`
错误信息：
```
ERROR 1045 (28000): Access denied for user 'app'@'192.168.1.100' (using password: YES)
```
原因分析：

|可能原因|说明|
|---|---|
|用户名或密码错误|最常见原因|
|用户不存在|该用户未创建|
|主机名不匹配|用户创建时指定的主机名与连接来源不匹配|
|密码过期|密码已过期，需要重置|

应急处理：
```
-- 1. 确认用户是否存在
SELECT User, Host FROM mysql.user WHERE User = 'app';

-- 2. 确认主机名是否匹配
-- 如果创建的是 'app'@'localhost'，从远程连接会报错
-- 如果创建的是 'app'@'%'，从本机连接可能因优先匹配 localhost 而报错

-- 3. 重置密码
ALTER USER 'app'@'host' IDENTIFIED BY '新密码';
FLUSH PRIVILEGES;

-- 4. 解锁用户(如果被锁定)
ALTER USER 'app'@'host' ACCOUNT UNLOCK;
```
主机名匹配规则：

|创建的用户|允许连接的来源|说明|
|---|---|---|
| `'app'@'localhost'` |仅数据库本机|通过 Unix socket 连接|
| `'app'@'127.0.0.1'` |仅本机 IPv 4|通过 TCP/IP 连接本机|
| `'app'@'192.168.1.%'` |192.168.1.x 网段|指定网段|
| `'app'@'%'` |任意主机|生产环境不建议|
### 2.2 `Can't connect to local MySQL server through socket`
错误信息：
```
ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/tmp/mysql.sock' (2)
```
原因分析：

|可能原因|说明|
|---|---|
|MySQL 服务未启动|最常见的 Socket 连接错误|
|Socket 文件路径不对|客户端和服务端的 socket 路径不一致|
|Socket 文件权限不对|mysql 用户没有读写权限|

应急处理：
```
# 1. 检查 MySQL 是否运行
sudo systemctl status mysqld
ps -ef | grep mysqld

# 2. 如果未启动，启动服务
sudo systemctl start mysqld

# 3. 检查 socket 文件是否存在
ls -l /tmp/mysql.sock

# 4. 如果 socket 路径不对，检查配置
grep socket /etc/my.cnf

# 5. 紧急连接方式(指定主机和端口绕过 socket)
mysql -u root -p -h 127.0.0.1 -P 3306
```
### 2.3 `Can't connect to MySQL server on 'xxx'`
错误信息：
```
ERROR 2003 (HY000): Can't connect to MySQL server on '192.168.1.100' (111)
```
原因分析：

|可能原因|说明|
|---|---|
|MySQL 服务未启动|目标服务器上的 MySQL 未运行|
|防火墙拦截|3306 端口未开放|
|bind-address 配置|MySQL 只监听 localhost，不接受远程连接|
|网络不通|网络路由或防火墙问题|

应急处理：
```
# 1. 检查 MySQL 是否运行
ssh user@target_server "sudo systemctl status mysqld"

# 2. 检查端口是否监听
sudo netstat -tlnp | grep 3306

# 3. 检查 bind-address 配置
grep bind-address /etc/my.cnf
# 如果是 bind-address = 127.0.0.1，改为 0.0.0.0 以接受远程连接

# 4. 检查防火墙
sudo firewall-cmd --list-ports
sudo firewall-cmd --permanent --add-port=3306/tcp
sudo firewall-cmd --reload

# 5. 测试网络连通性
telnet target_ip 3306
nc -zv target_ip 3306
```
### 2.4 `Too many connections`
错误信息：
```
ERROR 1040 (HY000): Too many connections
```
原因分析：

|可能原因|说明|
|---|---|
|应用连接池配置过大|连接数超过 max_connections|
|连接泄漏|应用未正确释放数据库连接|
|突发流量|短时间内大量连接涌入|

应急处理：
```
-- 1. 立即扩容连接数(临时解决)
SET GLOBAL max_connections = 2000;

-- 2. 查看当前连接数和连接上限
SHOW STATUS LIKE 'Threads_connected';
SHOW VARIABLES LIKE 'max_connections';

-- 3. 查看历史峰值
SHOW STATUS LIKE 'Max_used_connections';

-- 4. 查看哪些用户占用了最多连接
SELECT user, COUNT(*) AS connections 
FROM information_schema.processlist 
GROUP BY user 
ORDER BY connections DESC;

-- 5. 杀掉空闲连接(释放资源)
SELECT CONCAT('KILL ', id, ';') AS kill_query 
FROM information_schema.processlist 
WHERE command = 'Sleep' AND time > 300;  -- 超过5分钟的空闲连接
-- 将生成的 KILL 语句执行
```
长期解决方案：
```
# 在 my.cnf 中调整
max_connections = 1000
wait_timeout = 300       # 减少空闲连接超时时间
thread_cache_size = 256  # 增加线程缓存，减少连接创建开销
```

## 三、权限类报错
### 3.1 `command denied to user`
错误信息：
```
ERROR 1142 (42000): SELECT command denied to user 'app'@'localhost' for table 'users'
```
原因分析：用户没有执行该操作的权限。

应急处理：
```
-- 1. 查看当前用户权限
SHOW GRANTS FOR 'app'@'localhost';

-- 2. 授予必要权限
GRANT SELECT, INSERT, UPDATE, DELETE ON app_db.* TO 'app'@'localhost';
FLUSH PRIVILEGES;

-- 3. 如果是 DDL 操作被拒绝
-- 应用账号不应该有 DDL 权限，联系 DBA 执行
```
### 3.2 `Table 'xxx' doesn't exist`
错误信息：
```
ERROR 1146 (42S02): Table 'mydb.users' doesn't exist
```
原因分析：

|可能原因|说明|
|---|---|
|表确实不存在|未创建或被误删|
|数据库名或表名写错|大小写敏感问题(Linux 区分大小写)|
|表空间文件丢失|.ibd 文件被删除或损坏|

应急处理：
```
-- 1. 确认表是否存在
SHOW TABLES LIKE 'users';

-- 2. 查看实际表名(大小写敏感)
SHOW TABLES;

-- 3. 如果表存在但报错，检查表空间文件是否完整
-- 查看错误日志，可能有 Tablespace is missing 提示
```

## 四、服务启动类报错
### 4.1 `Can't check PID filepath`
错误信息：
```
[ERROR] [MY-011811] [Server] Can't start server: can't check PID filepath: No such file or directory
```
原因分析：pid-file 指定的目录不存在。

应急处理：
```
# 1. 查看配置的 pid-file 路径
grep pid-file /etc/my.cnf

# 2. 创建目录并设置权限
sudo mkdir -p /var/run/mysqld
sudo chown mysql:mysql /var/run/mysqld

# 3. 重新启动
sudo systemctl start mysqld
```
### 4.2 `ibdata1 is of a different size`
错误信息：
```
[ERROR] [MY-012263] [InnoDB] The Auto-extending innodb_system data file './ibdata1' is of a different size 768 pages than specified in the .cnf file: initial 65536 pages
```
原因分析：配置文件中指定了 innodb_data_file_path = ibdata1:1G:autoextend，但数据目录中已存在 ibdata1 且大小不是 1G。

应急处理：
```
# 方法一：注释掉该配置行
sudo vi /etc/my.cnf
# 将 innodb_data_file_path = ibdata1:1G:autoextend 注释掉

# 方法二：将配置改为与实际文件匹配
# 查看实际文件大小
ls -lh /var/lib/mysql/ibdata1
# 将配置改为实际大小
innodb_data_file_path = ibdata1:实际大小M:autoextend

# 重启服务
sudo systemctl restart mysqld
```
### 4.3 `InnoDB: Cannot allocate memory`
错误信息：
```
[ERROR] [InnoDB] Cannot allocate memory for the buffer pool
```
原因分析：innodb_buffer_pool_size 设置过大，超过系统可用物理内存。

应急处理：
```
# 1. 查看系统可用内存
free -h

# 2. 临时降低 buffer pool 大小
sudo vi /etc/my.cnf
# 将 innodb_buffer_pool_size 调低，如 8G → 4G

# 3. 重启 MySQL
sudo systemctl restart mysqld
```
### 4.4 `Port 3306 already in use`
错误信息：
```
[ERROR] [MY-010087] [Server] Can't start server: Bind on TCP/IP port: Address already in use
```
原因分析：3306 端口已被其他进程占用。

应急处理：
```
# 1. 查看谁占用了端口
sudo netstat -tlnp | grep 3306
sudo lsof -i :3306

# 2. 如果被其他 MySQL 进程占用
sudo systemctl stop mysqld
sudo kill -9 [PID]  # 确认是残留进程后执行

# 3. 如果被其他服务占用，修改 MySQL 端口
sudo vi /etc/my.cnf
# 将 port = 3306 改为其他端口，如 3307
sudo systemctl start mysqld
```

## 五、数据操作类报错
### 5.1 `Duplicate entry` (主键冲突)
错误信息：
```
ERROR 1062 (23000): Duplicate entry '1' for key 'PRIMARY'
```
原因分析：插入或更新的数据与表中已存在的主键或唯一索引冲突。

应急处理：
```
-- 1. 查看冲突的数据
SELECT * FROM users WHERE id = 1;

-- 2. 使用 INSERT IGNORE 跳过冲突(不报错，但会丢失数据)
INSERT IGNORE INTO users (id, name) VALUES (1, '张三');

-- 3. 使用 REPLACE INTO 覆盖旧数据
REPLACE INTO users (id, name) VALUES (1, '张三');

-- 4. 使用 ON DUPLICATE KEY UPDATE 更新
INSERT INTO users (id, name) VALUES (1, '张三') 
ON DUPLICATE KEY UPDATE name = VALUES(name);
```
### 5.2 `Data too long`(数据超长)
错误信息：
```
ERROR 1406 (22001): Data too long for column 'name' at row 1
```
原因分析：插入的数据长度超过了列定义的最大长度。
应急处理：
```
-- 1. 查看表结构，确认列长度
DESC users;

-- 2. 临时放宽长度限制
ALTER TABLE users MODIFY COLUMN name VARCHAR(255);

-- 3. 或者截断数据
INSERT INTO users (name) VALUES (LEFT('非常长的字符串', 50));
```
### 5.3 `Cannot add foreign key constraint`
错误信息：
```
ERROR 1215 (HY000): Cannot add foreign key constraint
```
原因分析：外键约束添加失败。

常见原因：

|原因|说明|
|---|---|
|引用列不是主键或唯一索引|被引用列必须有索引|
|数据类型不匹配|外键列和被引用列类型必须一致|
|字符集或排序规则不一致|两边的字符集必须相同|
|被引用的表使用 MyISAM 引擎|MyISAM 不支持外键|

应急处理：
```
-- 1. 检查被引用表是否有索引
SHOW INDEX FROM orders;

-- 2. 检查数据类型是否匹配
DESC orders;   -- 查看外键列类型
DESC users;    -- 查看被引用列类型

-- 3. 确保被引用表使用 InnoDB
SHOW TABLE STATUS LIKE 'orders';

-- 4. 先建索引再建外键
CREATE INDEX idx_user_id ON orders(user_id);
ALTER TABLE orders ADD FOREIGN KEY (user_id) REFERENCES users(id);
```
### 5.4 `Deadlock found`(死锁)
错误信息：
```
ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction
```
原因分析：两个或多个事务互相持有对方需要的锁，形成循环等待。

应急处理：
```
-- 1. 查看最近一次死锁信息
SHOW ENGINE INNODB STATUS\G
-- 查找 LATEST DETECTED DEADLOCK 部分

-- 2. 查看当前事务
SELECT * FROM information_schema.innodb_trx\G

-- 3. 查看锁等待(MySQL 8.0)
SELECT * FROM performance_schema.data_locks;
SELECT * FROM performance_schema.data_lock_waits;

-- 4. 杀掉长时间运行的事务
SELECT CONCAT('KILL ', trx_mysql_thread_id, ';') AS kill_query
FROM information_schema.innodb_trx
WHERE trx_started < NOW() - INTERVAL 60 SECOND;
```
应用层处理：
```
# 伪代码：重试机制
max_retries = 3
for attempt in range(max_retries):
    try:
        execute_transaction()
        break
    except DeadlockError:
        if attempt < max_retries - 1:
            time.sleep(0.1 * (attempt + 1))  # 退避等待
            continue
        else:
            raise
```

## 六、磁盘与空间类报错
### 6.1 `No space left on device`
错误信息：
```
ERROR 3 (HY000): Error writing file '/tmp/xxx' (Errcode: 28 - No space left on device)
```
原因分析：磁盘空间已满。

应急处理：
```
# 1. 查看磁盘使用情况
df -h

# 2. 查看数据目录下哪些文件最大
du -sh /var/lib/mysql/* | sort -hr | head -20

# 3. 检查 binlog 占用
ls -lh /var/lib/mysql/mysql-bin.*
du -sh /var/lib/mysql/mysql-bin.*

# 4. 紧急清理 binlog
mysql -u root -p -e "PURGE BINARY LOGS BEFORE NOW() - INTERVAL 3 DAY;"

# 5. 检查错误日志大小
ls -lh /var/log/mysql/error.log

# 6. 清理大日志文件(谨慎)
sudo > /var/log/mysql/error.log
```
### 6.2 `Table is full`
错误信息：
```
ERROR 1114 (HY000): The table 'xxx' is full
```
原因分析：

|可能原因|说明|
|---|---|
|磁盘空间满|数据目录所在磁盘已满|
|临时表空间满| `tmp_table_size` 或 `max_heap_table_size` 设置过小|
|InnoDB 表空间满|系统表空间或独立表空间已满|

应急处理：
```
-- 1. 检查磁盘空间(通过系统命令)
-- df -h

-- 2. 检查临时表设置
SHOW VARIABLES LIKE 'tmp_table_size';
SHOW VARIABLES LIKE 'max_heap_table_size';

-- 3. 增大临时表空间
SET GLOBAL tmp_table_size = 128M;
SET GLOBAL max_heap_table_size = 128M;

-- 4. 清理无用数据
DELETE FROM logs WHERE created_at < NOW() - INTERVAL 30 DAY;
OPTIMIZE TABLE logs;
```

## 七、InnoDB 引擎类报错
### 7.1 `Tablespace is missing`
错误信息：
```
[ERROR] [InnoDB] Tablespace 'mydb/users' is missing
```
原因分析：表对应的 .ibd 文件丢失或损坏。

应急处理：
```
# 方法一：从备份恢复
# 1. 恢复整个数据库或单表

# 方法二：重建表空间(有风险，数据会丢失)
# 1. 删除表定义(先备份建表语句)
SHOW CREATE TABLE users;

# 2. 删除 .frm 和 .ibd 文件
sudo rm /var/lib/mysql/mydb/users.ibd

# 3. 删除表(如果还能删除)
DROP TABLE users;

# 4. 重新建表
CREATE TABLE users (...);
```
### 7.2 `InnoDB: Corruption`
错误信息：
```
[ERROR] [InnoDB] Database page corruption on disk
```
原因分析：数据页损坏，可能由磁盘故障、硬件错误导致。

应急处理：
```
# 1. 启用强制恢复模式
sudo vi /etc/my.cnf
# 添加：
innodb_force_recovery = 1

# 2. 重启 MySQL(此时只能读不能写)
sudo systemctl restart mysqld

# 3. 导出数据
mysqldump -u root -p --all-databases > /backup/forced_recovery.sql

# 4. 清除损坏的数据库
DROP DATABASE corrupted_db;

# 5. 关闭强制恢复模式
# 注释掉 innodb_force_recovery
sudo systemctl restart mysqld

# 6. 恢复数据
mysql -u root -p < /backup/forced_recovery.sql
```
innodb_force_recovery 级别：

|级别|行为|适用场景|
|---|---|---|
|1|不强制启动，仅跳过一些检查|轻度损坏|
|2|跳过刷盘操作|重做日志损坏|
|3|不执行事务回滚|崩溃恢复失败|
|4|不应用插入缓冲|索引损坏|
|5|不查看 Undo Log|Undo Log 损坏|
|6|不进行前滚恢复|最严重的损坏|

## 八、主从复制类报错
### 8.1 `Duplicate entry` in replication
错误信息：
```
Last_Error: Error 'Duplicate entry '1' for key 'PRIMARY'' on query. Default database: 'mydb'. Query: 'INSERT INTO users (id, name) VALUES (1, '张三')'
```
原因分析：从库已存在该数据，主库再次插入导致冲突。

应急处理：
```
-- 1. 查看复制状态
SHOW SLAVE STATUS\G

-- 2. 临时跳过该错误
STOP SLAVE;
SET GLOBAL sql_slave_skip_counter = 1;
START SLAVE;

-- 3. 确认复制恢复
SHOW SLAVE STATUS\G

-- 4. 或者忽略指定错误(在 my.cnf 中配置)
slave_skip_errors = 1062
```
### 8.2 `Could not execute Update_rows event`
错误信息：
```
Last_Error: Could not execute Update_rows event on table mydb.users; Can't find record in 'users'
```
原因分析：从库找不到要更新的记录，主从数据不一致。

应急处理：
```
-- 1. 从主库重新导出该表
mysqldump -u root -p --single-transaction mydb users > /tmp/users.sql

-- 2. 在从库导入
mysql -u root -p mydb < /tmp/users.sql

-- 3. 重新启动复制
STOP SLAVE;
START SLAVE;
```
### 8.3 `Master has purged binary logs`
错误信息：
```
Last_IO_Error: Got fatal error 1236 from master when reading data from binary log: 'The slave is connecting using CHANGE MASTER TO MASTER_LOG_FILE = 'mysql-bin.000010', MASTER_LOG_POS = 1234, but the master has purged binary logs containing GTIDs that the slave requires.'
```
原因分析：主库已经清理了从库需要的 Binlog 文件。

应急处理：
```
# 方案一：重新搭建从库
# 1. 从主库导出全量备份
mysqldump -u root -p --all-databases --master-data=2 > /backup/full.sql

# 2. 在从库恢复
mysql -u root -p < /backup/full.sql

# 3. 重新配置主从
CHANGE MASTER TO ...
START SLAVE;

# 方案二：如果 GTID 模式，可以尝试自动恢复
STOP SLAVE;
CHANGE MASTER TO MASTER_AUTO_POSITION = 1;
START SLAVE;
```

## 九、数据恢复与备份类报错
### 9.1 mysqldump 常见报错
|报错|原因|解决方案|
|---|---|---|
|`mysqldump: Got error: 1045: Access denied`|用户权限不足|授予 `SELECT, LOCK TABLES, SHOW VIEW, PROCESS, RELOAD`|
|`mysqldump: Error: 'Lost connection to MySQL server'`|网络超时或数据量大|增加 `--net_buffer_length` 和 `--max_allowed_packet`|
|`mysqldump: Unknown table 'xxx'`|表不存在|确认表名是否正确|

生产环境备份命令：
```
mysqldump -u root -p \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --master-data=2 \
  --all-databases \
  --max_allowed_packet=1G \
  | gzip > /backup/all_$(date +%F).sql.gz
```
### 9.2 数据恢复常见报错
| 报错                                                 | 原因                        | 解决方案                     |
| -------------------------------------------------- | ------------------------- | ------------------------ |
| `ERROR 1046 (3D000): No database selected`         | 备份文件中没有 `CREATE DATABASE` | 先创建数据库再恢复                |
| `ERROR 2006 (HY000): MySQL server has gone away`   | 数据包过大                     | 增大 `max_allowed_packet`  |
| `ERROR 1419 (HY000): doesn't have SUPER privilege` | 恢复包含存储过程                  | 使用 `--skip-definer` 参数恢复 |

## 十、应急处理流程
### 10.1 常见应急场景处理流程
#### 10.1.1 MySQL 服务无法启动
```
systemctl start mysqld 失败
    ↓
查看错误日志：tail -100 /var/log/mysql/error.log
    ↓
┌──────────────────────────────────────────────┐
│ 根据具体错误定位问题(参考第四章)            │
│ 常见问题：                                   │
│ - PID 目录不存在 → mkdir + chown           │
│ - ibdata1 size mismatch → 注释配置行        │
│ - port already in use → kill 或改端口       │
└──────────────────────────────────────────────┘
    ↓
修复后重新启动
```
#### 10.1.2 连接数打满
```
应用报错：Too many connections
    ↓
紧急扩容：SET GLOBAL max_connections = 2000;
    ↓
查看连接状态：SHOW PROCESSLIST;
    ↓
杀掉空闲连接(超过5分钟的 Sleep 连接)
    ↓
排查根因：连接泄漏？突发流量？连接池配置过大？
    ↓
永久修复：调整 max_connections 和 wait_timeout
```
#### 10.1.3 磁盘空间写满
```
应用报错：No space left on device
    ↓
查看磁盘使用：df -h
    ↓
定位大文件：du -sh /var/lib/mysql/* | sort -hr
    ↓
┌──────────────────────────────────────────────┐
│ 根据大文件类型处理                           │
│ - binlog 过大 → PURGE BINARY LOGS          │
│ - 错误日志过大 → 轮转/清理                  │
│ - 数据文件过大 → 清理数据或扩容              │
└──────────────────────────────────────────────┘
    ↓
扩容或清理后，验证服务恢复
```
#### 10.1.4 表损坏
```
查询报错：Table 'xxx' is marked as crashed
    ↓
方法一(MyISAM)：REPAIR TABLE xxx;
    ↓
方法二(InnoDB)：启用 innodb_force_recovery
    ↓
导出数据 → 重建表 → 导入数据
```
#### 10.1.5 主从复制中断
```
查看复制状态：SHOW SLAVE STATUS\G
    ↓
确认 Last_Error 错误类型
    ↓
┌──────────────────────────────────────────────┐
│ 临时跳过：STOP SLAVE; sql_slave_skip_counter │
│ 重建表：从主库导出该表恢复                   │
│ 重新搭建：全量备份 + 重新配置                │
└──────────────────────────────────────────────┘
```

## 十一、附录
### 11.1 报错速查表
| 错误代码 | 常见错误信息                        | 章节参考 |
| ---- | ----------------------------- | ---- |
| 1045 | Access denied                 | 2.1  |
| 2002 | Can't connect through socket  | 2.2  |
| 2003 | Can't connect to MySQL server | 2.3  |
| 1040 | Too many connections          | 2.4  |
| 1142 | command denied                | 3.1  |
| 1146 | Table doesn't exist           | 3.2  |
| 1062 | Duplicate entry               | 5.1  |
| 1406 | Data too long                 | 5.2  |
| 1215 | Cannot add foreign key        | 5.3  |
| 1213 | Deadlock found                | 5.4  |
| 3    | No space left on device       | 6.1  |
| 1114 | Table is full                 | 6.2  |
| 1046 | No database selected          | 9.2  |
| 2006 | MySQL server has gone away    | 9.2  |
### 11.2 常用应急命令速查
| 场景           | 命令                                                 |
| ------------ | -------------------------------------------------- |
| 查看错误日志       | `sudo tail -100 /var/log/mysql/error.log`          |
| 查看服务状态       | `sudo systemctl status mysqld`                     |
| 启动 MySQL     | `sudo systemctl start mysqld`                      |
| 停止 MySQL     | `sudo systemctl stop mysqld`                       |
| 重启 MySQL     | `sudo systemctl restart mysqld`                    |
| 查看端口         | `sudo netstat -tlnp \| grep 3306`                  |
| 查看连接         | `SHOW PROCESSLIST;`                                |
| 查看当前连接数      | `SHOW STATUS LIKE 'Threads_connected';`            |
| 查看复制状态       | `SHOW SLAVE STATUS\G`                              |
| 查看 InnoDB 状态 | `SHOW ENGINE INNODB STATUS\G`                      |
| 查看磁盘空间       | `df -h /var/lib/mysql`                             |
| 查看大文件        | `du -sh /var/lib/mysql/* \| sort -hr \| head -10`  |
| 清理 binlog    | `PURGE BINARY LOGS BEFORE NOW() - INTERVAL 3 DAY;` |
