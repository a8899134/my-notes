## 一、MySQL 日志详解
如果把 MySQL 数据库比作一个繁忙的工厂，那么日志就是工厂里的监控摄像头和运行记录仪。没有日志，数据库出了故障就像“黑匣子”丢失，你根本不知道问题出在哪里。MySQL 提供了多种日志，其中日常中最需要关注的是以下四类。
### 1.1 错误日志(Error Log)
它是什么？
错误日志是 MySQL 的“病历本”，记录了 MySQL 服务器在启动、运行或停止过程中出现的所有错误、警告和重要信息。
它记什么？
- 服务器启动和关闭的时间与状态
- 数据库崩溃、无法启动等严重错误
- 权限问题、配置错误等警告信息
- 线程崩溃、网络连接丢失等运行时异常
它在哪？
默认情况下，错误日志是默认开启的，通常存放在 MySQL 数据目录下。你可以通过以下命令查看当前错误日志的位置：
```
SHOW VARIABLES LIKE 'log_error';
```
怎么配置？

如果需要修改错误日志的位置，可以在 MySQL 配置文件(Linux 下通常是 /etc/my.cnf 或 /etc/mysql/mysql.conf.d/mysqld.cnf)中添加：
```
[mysqld]
log-error = /var/log/mysql/mysql_error.log
```
这行配置的意思是：把错误日志写到 /var/log/mysql/ 目录下，文件名为 mysql_error.log。

日常怎么看？

实时查看错误日志的最新内容：
```
tail -f /var/log/mysql/mysql_error.log
```
tail -f 会持续输出日志的新增内容，方便你一边操作数据库一边观察是否有报错。
### 1.2 二进制日志(Binary Log / Binlog)
它是什么？
二进制日志是 MySQL 最重要的日志之一。它以二进制格式记录了所有修改数据的操作—比如插入(INSERT)、更新(UPDATE)、删除(DELETE)，以及创建表、修改表结构等 DDL 操作。

注意： SELECT 或 SHOW 这类只读操作不会被记录。

它有什么用？
1. 数据恢复：当数据库崩溃或数据误删时，可以通过 binlog 将数据恢复到任意时间点
2. 主从复制：把 binlog 传到另一台服务器，实现数据同步

它在哪？
默认情况下，二进制日志是关闭的，需要手动开启。开启后，日志文件通常存放在数据目录下，文件名格式为 主机名-bin.000001、主机名-bin.000002……依次递增。

怎么开启和配置？

在配置文件中添加：
```
[mysqld]
# 开启二进制日志，指定文件名前缀
log-bin = /var/log/mysql/mysql-bin

# 单个binlog文件的最大大小(默认1GB)，超过后自动创建新文件
max_binlog_size = 100M
```
- log-bin：指定 binlog 的存放路径和文件名前缀
- max_binlog_size：单个 binlog 文件的上限，达到后自动切分

查看是否已开启：
```
SHOW VARIABLES LIKE 'log_bin';
```
如果返回值为 ON，表示已开启。

查看当前有哪些 binlog 文件：
```
SHOW BINARY LOGS;
```
这会列出所有 binlog 文件及其大小。
### 1.3 通用查询日志(General Query Log)
它是什么？

通用查询日志是 MySQL 的“监控录像”，记录了所有发送到 MySQL 服务器的 SQL 语句—不管你是连接数据库、查询数据、还是修改数据，全都会被记下来。

它有什么用？
- 审计用户的所有操作
- 排查问题时还原操作场景
- 发现异常的 SQL 行为

⚠️ 重要警告：
通用查询日志极其耗费磁盘空间。如果你的数据库很繁忙，它可能以每小时几个GB的速度增长。因此，生产环境绝对不建议长期开启，只在排查问题时临时开启。

怎么开启和关闭？

在配置文件中：
```
[mysqld]
# 1表示开启，0表示关闭
general_log = 1
general_log_file = /var/log/mysql/mysql_general.log
```
也可以在运行时动态开关，不需要重启 MySQL：
```
-- 开启
SET GLOBAL general_log = ON;

-- 关闭
SET GLOBAL general_log = OFF;
```
### 1.4 慢查询日志(Slow Query Log)
它是什么？

慢查询日志记录执行时间超过设定阈值的 SQL 语句。默认阈值是 10 秒。

它有什么用？

慢查询日志是性能优化的利器。通过它，你可以找出哪些 SQL 语句执行太慢，然后针对性地优化(比如加索引、改写 SQL)。

怎么开启和配置？

在配置文件中：
```
[mysqld]
# 开启慢查询日志
slow_query_log = 1

# 日志文件位置
slow_query_log_file = /var/log/mysql/mysql_slow.log

# 阈值：超过2秒的查询会被记录
long_query_time = 2
```
- long_query_time = 2：执行超过 2 秒的查询会被记入慢查询日志
生产环境中，建议根据业务情况设置合理的阈值—1秒或3秒都是常见选择。

## 二、各日志的清理策略
日志文件如果不清理，会像垃圾一样越堆越多，最终撑爆磁盘。不同类型的日志，清理策略也不一样。
### 2.1 二进制日志的清理
binlog 是最占空间的日志类型，必须制定清理策略。

1. 方法一：自动清理(推荐)

在配置文件中设置过期时间，MySQL 会自动删除过期的 binlog 文件。

MySQL 5.7 及更早版本：
```
[mysqld]
# binlog保留7天，超过7天的自动删除
expire_logs_days = 7
```
MySQL 8.0 及以上版本：
```
[mysqld]
# binlog保留7天(7×24×60×60 = 604800秒)
binlog_expire_logs_seconds = 604800
```
注意：MySQL 8.0 中 expire_logs_days 已被弃用，推荐使用 binlog_expire_logs_seconds。MySQL 8.0.10 及以后版本的默认值是 30 天(2592000 秒)。

binlog 保留多久合适？

一般建议至少保留7天。如果磁盘空间充足，可以保留更长时间以便恢复更早的数据。如果有主从复制，binlog 的保留时间还要考虑从库的同步延迟。

2. 方法二：手动清理(紧急情况)

当磁盘快满、来不及修改配置文件重启时，可以手动清理：
```
-- 删除 mysql-bin.000009 之前的所有 binlog 文件(000009及之后保留)
PURGE BINARY LOGS TO 'mysql-bin.000009';
```

```
-- 删除 2024-07-15 00:00:00 之前的所有 binlog 文件
PURGE BINARY LOGS BEFORE '2024-07-15 00:00:00';
```
⚠️ 重要安全警告：手动删除 binlog 前，务必确认：
- 已有最新的数据库备份
-  不需要用这些 binlog 做时间点恢复
-  如果有主从复制，确保从库已经同步了这些 binlog
3. 方法三：手动删除文件(不推荐)

直接去磁盘上 rm 删除 binlog 文件是危险操作，因为 MySQL 的索引文件(.index)里还记录着这些文件，会导致 MySQL 找不到日志而出错。除非万不得已，否则不要这样做。

### 2.2 错误日志的清理
错误日志增长速度相对较慢，通常不需要频繁清理。
1. 清理方法：使用 logrotate(Linux 推荐)

MySQL 不会自动轮转错误日志文件。在 Linux 系统中，推荐使用 logrotate 工具来自动轮转和清理。

创建或编辑 /etc/logrotate.d/mysql 文件：
```
/var/log/mysql/mysql_error.log {
    daily          # 每天轮转一次
    rotate 7       # 保留最近7个轮转后的文件
    compress       # 轮转后压缩旧文件
    missingok      # 如果日志文件不存在，不报错
    notifempty     # 如果日志为空，不轮转
    create 640 mysql mysql  # 轮转后创建新文件，权限640
}
```
配置说明：
- daily：每天执行一次轮转
- rotate 7：保留最近 7 天的日志文件，更早的自动删除
- compress：对轮转后的旧日志进行压缩，节省空间
- create 640 mysql mysql：创建新日志文件，属主为 mysql 用户，权限为 640
配置好后，logrotate 会自动运行，无需人工干预。
2. 手动清理：
如果磁盘空间告急，也可以直接清空或删除错误日志文件：
```
# 清空日志内容(文件保留)
> /var/log/mysql/mysql_error.log

# 或者删除后让MySQL自动重建
rm /var/log/mysql/mysql_error.log
# 然后刷新日志
mysqladmin flush-logs
```
mysqladmin flush-logs 命令会告诉 MySQL 关闭当前日志文件并打开新的日志文件。
### 2.3 通用查询日志的清理
用查询日志是最难伺候的日志—因为 MySQL 官方没有提供任何自动清理的参数或命令。你必须自己想办法。
1. 策略一：平时关闭，用时再开(最推荐)
生产环境默认关闭通用查询日志。只有在排查问题时临时开启，查完立刻关闭并清理。
```
-- 排查时开启
SET GLOBAL general_log = ON;

-- 查完后关闭
SET GLOBAL general_log = OFF;
```
2. 策略二：使用 logrotate 自动轮转
和错误日志一样，可以用 logrotate 来管理通用查询日志。在 /etc/logrotate.d/mysql 中添加：
```
/var/log/mysql/mysql_general.log {
    daily
    rotate 3
    compress
    missingok
    notifempty
    create 640 mysql mysql
}
```
通用查询日志增长极快，建议保留天数比错误日志短(比如只保留 3 天)。
3. 策略三：写脚本定时清理
写一个 shell 脚本，每天凌晨执行日志切换和删除：
```
#!/bin/bash
# 切换日志
mysqladmin flush-logs
# 删除3天前的通用查询日志
find /var/log/mysql/ -name "mysql_general.log.*" -mtime +3 -delete
```
然后用 crontab 设置每天凌晨执行：
```
0 2 * * * /path/to/cleanup_general_log.sh
```
### 2.4 慢查询日志的清理
慢查询日志增长速度一般不快，只要持续优化慢 SQL，慢查询会越来越少。
和通用查询日志类似，MySQL 也没有提供慢查询日志的自动清理参数。可以用以下方式：
1. 方法一：logrotate 自动轮转
在 /etc/logrotate.d/mysql 中添加：
```
/var/log/mysql/mysql_slow.log {
    weekly         # 每周轮转一次(慢日志增长慢，不用每天)
    rotate 4       # 保留最近4份(约1个月)
    compress
    missingok
    notifempty
    create 640 mysql mysql
}
```
2. 方法二：定期手动重命名
每周或每月手动重命名慢查询日志文件，MySQL 会自动创建新的：
```
# 重命名旧日志
mv /var/log/mysql/mysql_slow.log /var/log/mysql/mysql_slow_$(date +%Y%m%d).log
# 刷新日志，让MySQL创建新文件
mysqladmin flush-logs
# 保留最近4周的，更早的删除
find /var/log/mysql/ -name "mysql_slow_*.log" -mtime +28 -delete
```
### 2.5 清理策略总结

|日志类型|增长速度|推荐保留天数|清理方式|
|---|---|---|---|
|二进制日志|很快(取决于写入量)|7-30 天| expirelogsdays / binlogexpirelogs_seconds 自动清理|
|错误日志|慢|30-90 天|logrotate 自动轮转|
|通用查询日志|极快|不建议长期开启，用完即删|logrotate 或 shell 脚本|
|慢查询日志|中等|30 天|logrotate 或 shell 脚本|

## 三、磁盘报警怎么处理
当收到“磁盘空间不足”的报警时，不要慌，按以下步骤处理。
### 3.1 确认磁盘空间
MySQL 的磁盘空间主要被以下几类东西占用：
1. 数据文件(表数据)
2. 二进制日志(binlog)
3. 其他日志(错误日志、通用查询日志、慢查询日志)
4. 临时文件(排序、join 等操作产生的临时文件)
首先登录服务器，查看磁盘使用情况：
```
df -h
```
然后进入 MySQL 数据目录，查看哪些文件最大：
```
# 进入数据目录
cd /var/lib/mysql

# 按大小排序，查看最大的文件
du -sh * | sort -rh | head -20
```
- du -sh *：显示当前目录下每个文件/文件夹的大小
- sort -rh：按大小从大到小排序
- head -20：只显示前 20 个最大的
### 3.2 应急处理步骤
1. 第一步：检查 binlog 是否过多
```
-- 查看所有binlog文件及其大小
SHOW BINARY LOGS;
```
如果 binlog 文件数量很多且总大小很大，说明需要清理。检查当前的自动清理配置：
```
-- MySQL 5.7
SHOW VARIABLES LIKE 'expire_logs_days';

-- MySQL 8.0
SHOW VARIABLES LIKE 'binlog_expire_logs_seconds';
```
如果值为 0，说明没有开启自动清理，这就是磁盘爆满的元凶。

紧急清理 binlog：
```
-- 保留最近3天的binlog，删除更早的
PURGE BINARY LOGS BEFORE NOW() - INTERVAL 3 DAY;
```
⚠️ 执行前确认没有从库依赖这些即将被删除的 binlog。

2. 第二步：检查通用查询日志是否误开启
```
SHOW VARIABLES LIKE 'general_log';
```
如果返回 ON，且你并不需要它，立刻关闭：
```
SET GLOBAL general_log = OFF;
```
然后删除或移走已经生成的通用查询日志文件，释放空间。

3. 第三步：检查是否有大事务或长事务
长事务会导致 undo 日志无法释放，持续占用磁盘空间。

查看当前正在运行的事务：
```
-- 查看当前所有事务
SELECT * FROM information_schema.INNODB_TRX\G
```

重点关注 trx_started(事务开始时间)和 trx_rows_locked(锁定的行数)。如果发现有运行了很久的事务，考虑提交或回滚它。

4. 第四步：清理临时文件
MySQL 在执行排序、join 等操作时会产生临时文件，通常存放在临时目录(如 /tmp)。这些文件在操作完成后会自动删除，但如果进程异常终止，可能会残留。
```
# 查看临时目录中的大文件
ls -lh /tmp/mysql*
```
确认是临时文件后可以安全删除。

### 3.3 MySQL 在磁盘满时的行为
当磁盘写满时，MySQL 会表现出以下行为：
1. 写入操作失败：任何需要写入数据的操作(INSERT、UPDATE、DELETE 等)都会报错 "no space left on device"
2. 每10分钟记录一次警告：MySQL 会每隔 10 分钟在错误日志中写入一条磁盘已满的警告
3. 数据库可能被锁定：某些云数据库在磁盘满时会自动将实例设为只读状态，防止数据损坏
处理原则：先释放空间，再继续操作。你只需要释放足够的磁盘空间，MySQL 就会自动恢复正常。
### 3.4 如何预防磁盘报警
与其等报警了再救火，不如提前预防：

1. 设置监控告警

建议在磁盘使用率达到 **80%** 时就触发预警，给自己留出处理时间。
2. 开启 binlog 自动清理

这是最重要的一步。在配置文件中设置合理的过期时间：
```
[mysqld]
# MySQL 8.0
binlog_expire_logs_seconds = 604800   # 7天
```
3. 定期巡检

每个月检查一次日志文件大小，及时发现异常增长。

4. 日志与数据分开存放

把日志文件放在独立的分区或磁盘上，即使日志写满，也不会影响数据库数据文件的写入。

## 四、常用命令速查
### 4.1 查看日志状态
```
-- 查看错误日志位置
SHOW VARIABLES LIKE 'log_error';

-- 查看binlog是否开启
SHOW VARIABLES LIKE 'log_bin';

-- 查看所有binlog文件
SHOW BINARY LOGS;

-- 查看binlog自动清理配置(MySQL 5.7)
SHOW VARIABLES LIKE 'expire_logs_days';

-- 查看binlog自动清理配置(MySQL 8.0)
SHOW VARIABLES LIKE 'binlog_expire_logs_seconds';

-- 查看通用查询日志是否开启
SHOW VARIABLES LIKE 'general_log';

-- 查看慢查询日志是否开启
SHOW VARIABLES LIKE 'slow_query_log';

-- 查看慢查询阈值
SHOW VARIABLES LIKE 'long_query_time';
```
### 4.2 手动清理日志
```
-- 删除指定binlog之前的所有binlog
PURGE BINARY LOGS TO 'mysql-bin.000010';

-- 删除指定时间之前的binlog
PURGE BINARY LOGS BEFORE '2024-07-01 00:00:00';

-- 删除3天前的binlog
PURGE BINARY LOGS BEFORE NOW() - INTERVAL 3 DAY;
```
### 4.3 刷新日志
```
-- 刷新所有日志(关闭当前日志文件，打开新文件)
FLUSH LOGS;
```
或在命令行执行：
```
mysqladmin flush-logs
```
### 4.4 总结
MySQL 的日志体系可以概括为四句话：
1. 错误日志记录“病”在哪里—故障排查必备，默认开启，增长慢
2. 二进制日志记录“改”了什么—数据恢复和复制的命根子，必须开启，最占空间，必须设置自动清理
3. 通用查询日志记录“做”了什么—审计利器，但极度耗空间，生产环境别开
4. 慢查询日志记录“慢”在哪里—性能优化的眼睛，建议开启，定期清理

清理策略的核心原则：
- 二进制日志：设置 expire_logs_days(5.7)或 binlog_expire_logs_seconds(8.0)，保留 7-30 天
- 错误日志：用 logrotate 轮转，保留 30-90 天
- 通用查询日志：平时关闭，用时再开，用完即删
- 慢查询日志：用 logrotate 轮转，保留 30 天左右

磁盘报警的黄金法则：收到报警不慌张，先查 binlog 再查通用日志，找到元凶后清理空间，最后补上自动清理配置，避免下次再犯。