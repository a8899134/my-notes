## 一、巡检与排查概述
### 1.1 日常巡检作用
数据库和汽车一样，不保养不检查，出问题就是大问题。日常巡检的目的不是“等出事了再修”，而是在问题变成故障之前就发现它。

|巡检价值|说明|
|---|---|
|隐患提前发现|磁盘快满了、连接数在涨、慢查询在增多—这些问题都有“前兆”|
|性能趋势掌握|知道数据库是变快了还是变慢了，而不是凭感觉|
|故障快速定位|平时熟悉了数据库的“正常状态”，出异常时一眼就能看出来|
|容量提前规划|知道什么时候该扩容，而不是等磁盘写满才慌|
### 1.2 巡检 vs 故障排查

|     | 日常巡检        | 故障排查          |
| --- | ----------- | ------------- |
| 时机  | 定期执行(每天/每周) | 出问题时执行        |
| 目标  | 发现隐患，预防故障   | 定位根因，恢复服务     |
| 心态  | 从容、有计划      | 紧急、有压力        |
| 产出  | 巡检报告        | 故障根因分析 + 修复方案 |

核心理念：好的巡检，能让故障排查的频率越来越低。

## 二、日常巡检清单
### 2.1 系统层巡检
数据库跑在操作系统上，系统层出问题，数据库一定出问题。系统层巡检是数据库巡检的“地基”。
#### 2.1.1 CPU 使用率
```
# 查看整体 CPU 使用率
top -n1 | head -5

# 查看 MySQL 进程 CPU 使用率
top -p $(pgrep mysqld) -n1

# 查看 CPU 各核心负载
mpstat -P ALL 1 3
```
正常表现：CPU 使用率长期在 80% 以下。如果持续超过 80%，说明计算压力大，需要排查慢查询或索引问题。
#### 2.1.2 内存使用
```
# 查看内存使用情况
free -h

# 查看 MySQL 内存占用
ps aux | grep mysqld

# 查看内存详细信息
cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable|SwapTotal|SwapFree"
```
关键检查：
- 可用内存(MemAvailable)是否充足
- Swap 是否被大量使用(如果 Swap 使用率高，说明物理内存不足)
#### 2.1.3 磁盘空间
```
# 查看数据目录磁盘空间
df -h /var/lib/mysql

# 查看各数据库目录大小
du -sh /var/lib/mysql/* | sort -hr | head -10

# 查看 InnoDB 表空间文件大小
ls -lh /var/lib/mysql/ibdata1
```
正常表现：磁盘可用空间 > 20%。磁盘写满是生产环境最严重的故障之一，一旦写满，数据库将无法写入。
#### 2.1.4 磁盘 I/O
```
# 查看磁盘 I/O 状态
iostat -x 1 3

# 重点关注字段：
# - await：平均 I/O 等待时间(正常 < 20ms)
# - util：磁盘使用率(正常 < 80%)
# - r/s / w/s：每秒读写次数
```
正常表现：await < 20ms，util < 80%。如果 I/O 等待过高，说明磁盘可能是性能瓶颈。
### 2.2 MySQL 状态巡检
#### 2.2.1 连接数检查
```
-- 查看当前连接数
SHOW STATUS LIKE 'Threads_connected';

-- 查看最大连接数配置
SHOW VARIABLES LIKE 'max_connections';

-- 查看历史最大连接数
SHOW STATUS LIKE 'Max_used_connections';

-- 查看连接使用率
SELECT 
  (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME = 'Threads_connected') 
  / 
  (SELECT VARIABLE_VALUE FROM performance_schema.global_variables WHERE VARIABLE_NAME = 'max_connections') 
  * 100 AS connection_usage_pct;
```
正常表现：当前连接数 < max_connections 的 80%。如果超过 80%，需要关注是否有连接泄漏或需要调大 max_connections。
#### 2.2.2 活跃线程检查
```
-- 查看正在执行的查询数
SHOW STATUS LIKE 'Threads_running';

-- 查看当前所有活跃连接(非 Sleep 状态)
SELECT id, user, host, db, command, time, state, info 
FROM information_schema.processlist 
WHERE command != 'Sleep' 
ORDER BY time DESC;

-- 查看执行时间超过 10 秒的查询
SELECT id, user, host, db, time, state, info 
FROM information_schema.processlist 
WHERE time > 10 AND command != 'Sleep';
```
正常表现：活跃线程数不高，且没有长时间运行的查询。如果发现大量长时间运行的查询，说明有慢 SQL 或锁等待。
#### 2.2.3 QPS / TPS 检查
```
-- 查看当前的 Questions 和 Uptime
SHOW STATUS LIKE 'Questions';
SHOW STATUS LIKE 'Uptime';

-- 计算 QPS(建议取两次值的差值除以时间间隔)
-- Questions / Uptime = 平均 QPS

-- 查看事务相关统计
SHOW STATUS LIKE 'Com_commit';
SHOW STATUS LIKE 'Com_rollback';
```
正常表现：QPS 稳定在合理范围内。如果 QPS 突然掉底，可能数据库卡住了；如果 QPS 突然飙升，可能有大量查询涌入。
#### 2.2.4 慢查询检查
```
-- 查看慢查询数量
SHOW STATUS LIKE 'Slow_queries';

-- 查看慢查询阈值配置
SHOW VARIABLES LIKE 'long_query_time';

-- 查看慢查询日志是否开启
SHOW VARIABLES LIKE 'slow_query_log%';
```
正常表现：慢查询数量稳定，没有突然增长。如果慢查询突然增多，需要分析慢查询日志。
#### 2.2.5 表锁与行锁检查
```
-- 查看表锁等待情况
SHOW STATUS LIKE 'Table_locks_waited';

-- 查看行锁等待情况
SHOW STATUS LIKE 'Innodb_row_lock_waits';
SHOW STATUS LIKE 'Innodb_row_lock_time_avg';

-- 查看当前锁等待详情(MySQL 8.0)
SELECT * FROM performance_schema.data_locks;
SELECT * FROM performance_schema.data_lock_waits;
```
正常表现：锁等待数量少，平均等待时间短。如果锁等待频繁或等待时间长，说明存在锁竞争。
#### 2.2.6 InnoDB Buffer Pool 命中率
```
-- 查看 Buffer Pool 读取统计
SHOW STATUS LIKE 'Innodb_buffer_pool_read%';

-- 计算命中率
-- 命中率 = (1 - Innodb_buffer_pool_reads / Innodb_buffer_pool_read_requests) * 100%
```
正常表现：命中率 > 99%。如果低于 95%，说明 Buffer Pool 太小或数据访问模式不佳。
#### 2.2.7 主从复制状态
```
-- 查看复制状态
SHOW SLAVE STATUS\G

-- 重点关注字段：
-- Slave_IO_Running：IO 线程是否运行(应为 Yes)
-- Slave_SQL_Running：SQL 线程是否运行(应为 Yes)
-- Seconds_Behind_Master：复制延迟秒数(应尽可能小)
-- Last_Error：最近的错误信息
```

正常表现：两个线程都是 Yes，延迟在可接受范围内(通常 < 60 秒)。
### 2.3 日志巡检
#### 2.3.1 错误日志
```
# 查看错误日志最后 100 行
sudo tail -100 /var/log/mysql/error.log

# 查找错误日志中的 ERROR 级别信息
sudo grep -i "error" /var/log/mysql/error.log | tail -20

# 查找最近出现的警告
sudo grep -i "warning" /var/log/mysql/error.log | tail -20
```
正常表现：错误日志中不应频繁出现 ERROR 或 WARNING。如果出现大量错误，需要排查。
#### 2.3.2 慢查询日志
```
# 查看慢查询日志最后 50 行
sudo tail -50 /var/log/mysql/slow.log

# 统计慢查询日志中出现最多的查询
sudo pt-query-digest /var/log/mysql/slow.log
```
如果安装了 Percona Toolkit，可以使用 pt-query-digest 分析慢查询日志。如果没有，可以手动查看日志中最常见的慢 SQL。
### 2.4 备份巡检
```
# 查看最近的备份文件
ls -lht /backup/ | head -10

# 检查备份文件大小是否正常
ls -lh /backup/

# 检查备份日志中是否有错误
tail -50 /var/log/mysql/backup.log
```
正常表现：备份文件存在、大小正常(和前几天差不多)、没有报错。

## 三、故障排查方法论
### 3.1 排查的五个步骤
遇到数据库问题时，不要慌，按这五个步骤来：
```
第一步：确认现象
    ↓
   “到底发生了什么？”
    ↓
第二步：缩小范围
    ↓
   “是系统问题还是数据库问题？是全局问题还是局部问题？”
    ↓
第三步：收集信息
    ↓
   “看日志、看状态、看监控”
    ↓
第四步：定位根因
    ↓
   “到底是什么原因导致的？”
    ↓
第五步：修复验证
    ↓
   “修好了吗？还会再发生吗？”
```
每一步的具体操作：

|步骤|做什么|用什么命令/工具|
|---|---|---|
|确认现象|用户反馈什么？监控显示什么？|用户描述、监控面板|
|缩小范围|是慢？是连不上？是报错？是全局还是某个库/表？| SHOW PROCESSLIST、SHOW STATUS |
|收集信息|看日志、看状态、看系统指标| tail、SHOW ENGINE INNODB STATUS、top、iostat |
|定位根因|分析收集到的信息|结合日志和状态分析|
|修复验证|执行修复操作，确认问题解决| KILL、ALTER、重启、扩容|
### 3.2 排查前的信息收集
出问题的时候，第一件事不是“想解决方案”，而是“收集现场信息”。因为很多信息在重启后就没了。
```
# 1. 记录当前时间和问题现象
date

# 2. 收集系统状态
top -n1 -b > /tmp/mysql_debug_top.txt
free -h > /tmp/mysql_debug_mem.txt
iostat -x 1 5 > /tmp/mysql_debug_io.txt
df -h > /tmp/mysql_debug_disk.txt

# 3. 收集 MySQL 状态
mysql -u root -p -e "SHOW PROCESSLIST;" > /tmp/mysql_debug_processlist.txt
mysql -u root -p -e "SHOW ENGINE INNODB STATUS\G" > /tmp/mysql_debug_innodb.txt
mysql -u root -p -e "SHOW STATUS;" > /tmp/mysql_debug_status.txt

# 4. 收集日志
tail -200 /var/log/mysql/error.log > /tmp/mysql_debug_error.log
tail -200 /var/log/mysql/slow.log > /tmp/mysql_debug_slow.log
```

## 四、常见故障场景排查
### 4.1 MySQL 服务无法启动
现象：systemctl start mysqld 失败。

排查步骤：
```
# 第一步：查看服务状态
sudo systemctl status mysqld

# 第二步：查看错误日志(最重要)
sudo tail -100 /var/log/mysql/error.log

# 第三步：尝试前台启动查看详细错误
sudo /usr/local/mysql/bin/mysqld --defaults-file=/etc/my.cnf
```
常见原因及解决方案：

| 错误信息                                         | 原因             | 解决方案                                                                    |
| -------------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| Can't start server: can't check PID filepath | PID 目录不存在      | sudo mkdir -p /var/run/mysqld && sudo chown mysql:mysql /var/run/mysqld |
| ibdata1 is of a different size               | 配置文件与已有数据文件不匹配 | 注释掉 innodbdatafilepath 配置                                               |
| InnoDB: Cannot allocate memory               | 内存不足           | 检查 innodbbufferpoolsize 是否超过物理内存                                        |
| Table 'mysql.user' doesn't exist             | 数据目录损坏或初始化不完整  | 需要重新初始化或从备份恢复                                                           |
| Port 3306 already in use                     | 端口被占用          | netstat -tlnp \| grep 3306 查看占用进程                                       |
### 4.2 连接不上数据库
现象：ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/tmp/mysql.sock'

排查步骤：
```
# 1. 检查 MySQL 是否在运行
sudo systemctl status mysqld
ps -ef | grep mysqld

# 2. 检查 socket 文件是否存在
ls -l /tmp/mysql.sock

# 3. 检查端口是否在监听
sudo netstat -tlnp | grep 3306

# 4. 如果服务在运行但 socket 路径不对，检查配置文件
grep socket /etc/my.cnf
```
常见原因及解决方案：

|错误|原因|解决方案|
|---|---|---|
| Can't connect through socket |MySQL 未启动| sudo systemctl start mysqld |
| Access denied for user |用户名或密码错误|确认账号密码，或重置密码|
| Can't connect to MySQL server on 'host' |网络不通或端口被防火墙拦截|检查防火墙、bind-address 配置|
| Too many connections |连接数打满| SET GLOBAL max_connections = 2000; 临时扩容|
### 4.3 数据库响应变慢
现象：应用反馈查询变慢，页面加载时间变长。

排查步骤：
```
# 1. 先看当前在做什么
mysql -u root -p -e "SHOW PROCESSLIST;"

# 2. 看是否有锁等待
mysql -u root -p -e "SHOW ENGINE INNODB STATUS\G" | grep -A 20 "LATEST DETECTED DEADLOCK"

# 3. 看系统资源
top -n1
iostat -x 1 3

# 4. 看慢查询日志
sudo tail -50 /var/log/mysql/slow.log
```
常见原因及排查方向：

|现象|可能原因|排查方向|
|---|---|---|
|大量查询在 Sending data 状态|全表扫描或缺少索引|用 EXPLAIN 分析查询计划|
|大量查询在 Locked 状态|行锁或表锁竞争|查看 INNODBTRX 和锁等待|
|CPU 飙升|复杂查询或大量并发|查看活跃线程执行的 SQL|
|I/O 等待高|磁盘性能瓶颈或 Buffer Pool 太小|检查 iostat 和 Buffer Pool 命中率|
|连接数满|连接泄漏或连接池配置不当|检查 Threadsconnected 和 max_connections |

常用排查 SQL：
```
-- 查看当前正在执行的查询(按执行时间排序)
SELECT id, user, host, db, time, state, info 
FROM information_schema.processlist 
WHERE command != 'Sleep' 
ORDER BY time DESC;

-- 查看 InnoDB 事务状态
SELECT * FROM information_schema.innodb_trx\G

-- 查看锁等待关系(8.0)
SELECT * FROM performance_schema.data_lock_waits\G

-- 查看表统计信息
SELECT table_schema, table_name, table_rows, data_length, index_length 
FROM information_schema.tables 
WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys')
ORDER BY data_length DESC LIMIT 10;
```
### 4.4 主从复制延迟或中断
#### 4.4.1 复制延迟(Seconds_Behind_Master 持续增大)
排查步骤：
```
-- 查看复制状态
SHOW SLAVE STATUS\G

-- 重点关注 Seconds_Behind_Master
```
常见原因：

|原因|说明|解决方案|
|---|---|---|
|从库硬件差|从库性能不足以跟上主库|升级从库硬件或优化主库写入|
|从库有大量查询|从库承担了读业务|将读业务分流到其他从库|
|大事务|主库执行了大事务|拆分大事务|
|网络延迟|主从之间网络不稳定|检查网络质量|
|从库 binlog 应用慢|SQL 线程效率低|检查从库的慢查询|
#### 4.4.2 复制中断(Slave_IO_Running 或 Slave_SQL_Running 为 No)
排查步骤：
```
SHOW SLAVE STATUS\G
-- 查看 Last_Error 字段
```
常见错误及处理：

|错误|原因|解决方案|
|---|---|---|
| Duplicate entry 'xxx' for key |从库已存在该数据| SET GLOBAL sqlslaveskipcounter = 1; START SLAVE; |
| Could not execute Updaterows event |数据不一致|需要重新同步该表或重新搭建从库|
| Got fatal error 1236 |Binlog 文件丢失或损坏|重新搭建从库|
| Master has purged binary logs |Binlog 已被清理|重新搭建从库|

临时跳过错误(仅用于紧急恢复，需要确认数据一致)：
```
STOP SLAVE;
SET GLOBAL sql_slave_skip_counter = 1;
START SLAVE;
SHOW SLAVE STATUS\G
```
⚠️ 警告：跳过错误会导致主从不一致，只应在紧急恢复时使用，之后需要修复数据一致性。
### 4.5 磁盘空间写满
现象：MySQL 报 No space left on device，无法写入数据。

排查步骤：
```
# 1. 查看磁盘使用情况
df -h

# 2. 查看数据目录下哪些文件最大
du -sh /var/lib/mysql/* | sort -hr | head -20

# 3. 查看 binlog 占用空间
ls -lh /var/lib/mysql/mysql-bin.*

# 4. 查看错误日志大小
ls -lh /var/log/mysql/error.log
```
常见原因及解决方案：

|原因|解决方案|
|---|---|
|Binlog 过多|检查 binlogexpirelogs_seconds 配置，手动清理旧 binlog|
|错误日志过大|日志轮转，清理旧日志|
|InnoDB 表空间过大|清理无用数据，或扩容磁盘|
|慢查询日志过大|日志轮转，清理旧日志|

紧急清理命令：
```
# 清理 7 天前的 binlog(在 MySQL 中执行)
PURGE BINARY LOGS BEFORE NOW() - INTERVAL 7 DAY;

# 或者清理到指定文件
PURGE BINARY LOGS TO 'mysql-bin.000123';

# 清理错误日志(谨慎操作)
sudo > /var/log/mysql/error.log
```
### 4.6 死锁(Deadlock)
现象：应用报错 Deadlock found when trying to get lock; try restarting transaction。

排查步骤：
```
-- 查看最近一次死锁信息
SHOW ENGINE INNODB STATUS\G
-- 查找 LATEST DETECTED DEADLOCK 部分

-- 查看当前事务和锁等待
SELECT * FROM information_schema.innodb_trx\G
SELECT * FROM performance_schema.data_locks\G
SELECT * FROM performance_schema.data_lock_waits\G
```
死锁的典型特征：两个或多个事务互相持有对方需要的锁，形成循环等待。

预防死锁的措施：

|措施|说明|
|---|---|
|统一访问顺序|所有事务按相同的顺序访问表/行|
|缩短事务|事务越短，持有锁的时间越短|
|使用 RC 隔离级别|RC 没有间隙锁，死锁概率更低|
|合理使用索引|确保 UPDATE/DELETE 走索引，避免锁升级|
|重试机制|应用层捕获死锁错误并重试|

## 五、巡检脚本报告模板
仅供参考
```
#!/bin/bash
# ============================================
# MySQL 每日巡检脚本
# 适用系统：Linux(CentOS / Rocky / Ubuntu)
# MySQL 版本：5.7 / 8.0
# ============================================

# ---------- 配置区域 ----------
# MySQL 连接配置
MYSQL_USER="root"
MYSQL_PASS="你的密码"
MYSQL_HOST="localhost"
MYSQL_PORT="3306"

# 数据目录(用于磁盘检查)
DATA_DIR="/var/lib/mysql"

# 错误日志路径(根据实际安装方式调整)
# YUM/DNF 安装：/var/log/mysqld.log
# 二进制包安装：/var/log/mysql/error.log
ERROR_LOG="/var/log/mysql/error.log"

# 慢查询日志路径
SLOW_LOG="/var/log/mysql/slow.log"

# 备份目录
BACKUP_DIR="/backup"

# 巡检报告保存目录
REPORT_DIR="/var/log/mysql_check"

# ---------- 颜色输出 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ---------- 函数：执行 SQL ----------
mysql_query() {
    mysql -u"$MYSQL_USER" -p"$MYSQL_PASS" -h"$MYSQL_HOST" -P"$MYSQL_PORT" -N -e "$1" 2>/dev/null
}

# ---------- 函数：获取状态值 ----------
get_status() {
    mysql_query "SHOW GLOBAL STATUS LIKE '$1';" | awk '{print $2}'
}

# ---------- 函数：获取变量值 ----------
get_variable() {
    mysql_query "SHOW GLOBAL VARIABLES LIKE '$1';" | awk '{print $2}'
}

# ---------- 函数：计算百分比 ----------
calc_pct() {
    if [ "$2" = "0" ] || [ -z "$2" ]; then
        echo "0"
    else
        echo "scale=2; $1 * 100 / $2" | bc 2>/dev/null || echo "0"
    fi
}

# ---------- 开始巡检 ----------
DATE=$(date '+%Y-%m-%d %H:%M:%S')
REPORT_FILE="$REPORT_DIR/check_$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$REPORT_DIR"

# 清空报告文件
> "$REPORT_FILE"

# ---------- 写入报告头 ----------
{
    echo "========================================"
    echo "MySQL 日常巡检报告"
    echo "巡检时间：$DATE"
    echo "巡检人员：$(whoami)"
    echo "========================================"
    echo ""
} >> "$REPORT_FILE"

# ============================================
# 一、系统资源
# ============================================
{
    echo "【系统资源】"
} >> "$REPORT_FILE"

# CPU 使用率
CPU_IDLE=$(top -bn1 | grep "Cpu(s)" | awk '{print $8}' | cut -d. -f1)
if [ -z "$CPU_IDLE" ] || [ "$CPU_IDLE" = "" ]; then
    CPU_IDLE=$(top -bn1 | grep "%Cpu" | awk '{print $8}' | cut -d. -f1)
fi
if [ -z "$CPU_IDLE" ]; then
    CPU_USAGE="无法获取"
else
    CPU_USAGE=$((100 - CPU_IDLE))
fi
{
    echo "- CPU 使用率：${CPU_USAGE}%"
} >> "$REPORT_FILE"

# 内存使用率
MEM_TOTAL=$(free -m | awk '/^Mem:/ {print $2}')
MEM_AVAIL=$(free -m | awk '/^Mem:/ {print $7}')
if [ -z "$MEM_AVAIL" ]; then
    MEM_AVAIL=$(free -m | awk '/^Mem:/ {print $4}')
fi
if [ -n "$MEM_TOTAL" ] && [ "$MEM_TOTAL" -gt 0 ]; then
    MEM_USAGE=$(( (MEM_TOTAL - MEM_AVAIL) * 100 / MEM_TOTAL ))
else
    MEM_USAGE="无法获取"
fi
{
    echo "- 内存使用率：${MEM_USAGE}%"
} >> "$REPORT_FILE"

# 磁盘空间
DISK_USAGE=$(df -h "$DATA_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
DISK_AVAIL=$(df -h "$DATA_DIR" | awk 'NR==2 {print $4}')
{
    echo "- 磁盘空间：${DISK_USAGE}%(可用 ${DISK_AVAIL})"
} >> "$REPORT_FILE"

# 磁盘 I/O 等待
IO_AWAIT=$(iostat -x 1 2 2>/dev/null | awk '/^[a-z]/ {print $10}' | tail -1)
if [ -z "$IO_AWAIT" ]; then
    IO_AWAIT="无法获取"
fi
{
    echo "- 磁盘 I/O 等待：${IO_AWAIT} ms"
    echo ""
} >> "$REPORT_FILE"

# ============================================
# 二、MySQL 状态
# ============================================
{
    echo "【MySQL 状态】"
} >> "$REPORT_FILE"

# 连接数
THREADS_CONNECTED=$(get_status "Threads_connected")
MAX_CONNECTIONS=$(get_variable "max_connections")
if [ -z "$MAX_CONNECTIONS" ] || [ "$MAX_CONNECTIONS" = "0" ]; then
    MAX_CONNECTIONS=151
fi
{
    echo "- 当前连接数：${THREADS_CONNECTED} / ${MAX_CONNECTIONS}"
} >> "$REPORT_FILE"

# 活跃线程数
THREADS_RUNNING=$(get_status "Threads_running")
{
    echo "- 活跃线程数：${THREADS_RUNNING}"
} >> "$REPORT_FILE"

# QPS
QUESTIONS=$(get_status "Questions")
UPTIME=$(get_status "Uptime")
if [ -n "$UPTIME" ] && [ "$UPTIME" -gt 0 ]; then
    QPS=$(echo "scale=2; $QUESTIONS / $UPTIME" | bc 2>/dev/null)
else
    QPS="0"
fi
{
    echo "- QPS：${QPS}"
} >> "$REPORT_FILE"

# 慢查询数(本次)
SLOW_QUERIES=$(get_status "Slow_queries")
# 计算上次巡检到现在的增量
LAST_SLOW_FILE="$REPORT_DIR/last_slow_queries.txt"
if [ -f "$LAST_SLOW_FILE" ]; then
    LAST_SLOW=$(cat "$LAST_SLOW_FILE" 2>/dev/null)
    if [ -n "$LAST_SLOW" ] && [ -n "$SLOW_QUERIES" ]; then
        SLOW_INCR=$((SLOW_QUERIES - LAST_SLOW))
    else
        SLOW_INCR="无法计算"
    fi
else
    SLOW_INCR="首次巡检"
fi
echo "$SLOW_QUERIES" > "$LAST_SLOW_FILE"
{
    echo "- 慢查询数：${SLOW_QUERIES}(自上次巡检增加 ${SLOW_INCR})"
} >> "$REPORT_FILE"

# Buffer Pool 命中率
BP_READ_REQUESTS=$(get_status "Innodb_buffer_pool_read_requests")
BP_READS=$(get_status "Innodb_buffer_pool_reads")
if [ -n "$BP_READ_REQUESTS" ] && [ "$BP_READ_REQUESTS" -gt 0 ]; then
    BP_HIT=$(echo "scale=2; (1 - $BP_READS / $BP_READ_REQUESTS) * 100" | bc 2>/dev/null)
else
    BP_HIT="0"
fi
{
    echo "- Buffer Pool 命中率：${BP_HIT}%"
    echo ""
} >> "$REPORT_FILE"

# ============================================
# 三、复制状态
# ============================================
{
    echo "【复制状态】"
} >> "$REPORT_FILE"

# 检查是否是从库
SLAVE_STATUS=$(mysql_query "SHOW SLAVE STATUS\G")
if [ -n "$SLAVE_STATUS" ]; then
    IO_RUNNING=$(echo "$SLAVE_STATUS" | grep "Slave_IO_Running:" | awk '{print $2}')
    SQL_RUNNING=$(echo "$SLAVE_STATUS" | grep "Slave_SQL_Running:" | awk '{print $2}')
    SECONDS_BEHIND=$(echo "$SLAVE_STATUS" | grep "Seconds_Behind_Master:" | awk '{print $2}')
    {
        echo "- IO 线程：${IO_RUNNING}"
        echo "- SQL 线程：${SQL_RUNNING}"
        echo "- 复制延迟：${SECONDS_BEHIND} 秒"
    } >> "$REPORT_FILE"
else
    {
        echo "- 状态：未配置主从复制(或非从库)"
    } >> "$REPORT_FILE"
fi
{
    echo ""
} >> "$REPORT_FILE"

# ============================================
# 四、日志检查
# ============================================
{
    echo "【日志检查】"
} >> "$REPORT_FILE"

# 错误日志
if [ -f "$ERROR_LOG" ]; then
    ERRORS_24H=$(sudo grep -c "ERROR" "$ERROR_LOG" 2>/dev/null)
    if [ -z "$ERRORS_24H" ] || [ "$ERRORS_24H" = "0" ]; then
        ERRORS_24H="0"
    fi
    {
        echo "- 错误日志：最近 24 小时 ${ERRORS_24H} 条 ERROR"
    } >> "$REPORT_FILE"
else
    {
        echo "- 错误日志：文件不存在，请检查路径配置"
    } >> "$REPORT_FILE"
fi

# 慢查询日志
if [ -f "$SLOW_LOG" ]; then
    SLOW_24H=$(sudo grep -c "Query_time" "$SLOW_LOG" 2>/dev/null)
    if [ -z "$SLOW_24H" ] || [ "$SLOW_24H" = "0" ]; then
        SLOW_24H="0"
    fi
    {
        echo "- 慢查询日志：最近 24 小时 ${SLOW_24H} 条"
    } >> "$REPORT_FILE"
else
    {
        echo "- 慢查询日志：文件不存在(可能未开启慢查询日志)"
    } >> "$REPORT_FILE"
fi
{
    echo ""
} >> "$REPORT_FILE"

# ============================================
# 五、备份检查
# ============================================
{
    echo "【备份检查】"
} >> "$REPORT_FILE"

if [ -d "$BACKUP_DIR" ]; then
    LATEST_BACKUP=$(ls -lt "$BACKUP_DIR"/*.sql* 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        BACKUP_TIME=$(stat -c "%y" "$LATEST_BACKUP" 2>/dev/null | cut -d. -f1 | sed 's/ / /')
        if [ -z "$BACKUP_TIME" ]; then
            BACKUP_TIME=$(stat -f "%Sm" "$LATEST_BACKUP" 2>/dev/null)
        fi
        BACKUP_SIZE=$(du -h "$LATEST_BACKUP" 2>/dev/null | cut -f1)
        {
            echo "- 最近备份时间：${BACKUP_TIME}"
            echo "- 备份文件大小：${BACKUP_SIZE}"
        } >> "$REPORT_FILE"
    else
        {
            echo "- 最近备份：未找到备份文件"
        } >> "$REPORT_FILE"
    fi
else
    {
        echo "- 备份目录：不存在(${BACKUP_DIR})"
    } >> "$REPORT_FILE"
fi
{
    echo ""
} >> "$REPORT_FILE"

# ============================================
# 六、问题与建议
# ============================================
{
    echo "【问题与建议】"
} >> "$REPORT_FILE"

ISSUE_COUNT=0

# 检查：磁盘空间 > 80%
if [ -n "$DISK_USAGE" ] && [ "$DISK_USAGE" -gt 80 ]; then
    ISSUE_COUNT=$((ISSUE_COUNT + 1))
    {
        echo "- [!] 磁盘空间使用率 ${DISK_USAGE}%，已超过 80%，建议扩容或清理"
    } >> "$REPORT_FILE"
fi

# 检查：连接数 > 80%
if [ -n "$THREADS_CONNECTED" ] && [ -n "$MAX_CONNECTIONS" ] && [ "$MAX_CONNECTIONS" -gt 0 ]; then
    CONN_PCT=$((THREADS_CONNECTED * 100 / MAX_CONNECTIONS))
    if [ "$CONN_PCT" -gt 80 ]; then
        ISSUE_COUNT=$((ISSUE_COUNT + 1))
        {
            echo "- [!] 连接数使用率 ${CONN_PCT}%，已超过 80%，建议调大 max_connections 或排查连接泄漏"
        } >> "$REPORT_FILE"
    fi
fi

# 检查：Buffer Pool 命中率 < 95%
if [ -n "$BP_HIT" ] && [ "$BP_HIT" != "0" ]; then
    BP_HIT_INT=$(echo "$BP_HIT" | cut -d. -f1)
    if [ -n "$BP_HIT_INT" ] && [ "$BP_HIT_INT" -lt 95 ]; then
        ISSUE_COUNT=$((ISSUE_COUNT + 1))
        {
            echo "- [!] Buffer Pool 命中率 ${BP_HIT}%，低于 95%，建议增大 innodb_buffer_pool_size"
        } >> "$REPORT_FILE"
    fi
fi

# 检查：复制延迟 > 60 秒
if [ -n "$SECONDS_BEHIND" ] && [ "$SECONDS_BEHIND" != "NULL" ] && [ "$SECONDS_BEHIND" -gt 60 ]; then
    ISSUE_COUNT=$((ISSUE_COUNT + 1))
    {
        echo "- [!] 主从复制延迟 ${SECONDS_BEHIND} 秒，超过 60 秒，请检查从库性能"
    } >> "$REPORT_FILE"
fi

# 检查：复制线程停止
if [ -n "$IO_RUNNING" ] && [ "$IO_RUNNING" != "Yes" ]; then
    ISSUE_COUNT=$((ISSUE_COUNT + 1))
    {
        echo "- [!!] 复制 IO 线程状态为 ${IO_RUNNING}，请立即检查主从复制"
    } >> "$REPORT_FILE"
fi
if [ -n "$SQL_RUNNING" ] && [ "$SQL_RUNNING" != "Yes" ]; then
    ISSUE_COUNT=$((ISSUE_COUNT + 1))
    {
        echo "- [!!] 复制 SQL 线程状态为 ${SQL_RUNNING}，请立即检查主从复制"
    } >> "$REPORT_FILE"
fi

# 检查：慢查询过多
if [ -n "$SLOW_INCR" ] && [ "$SLOW_INCR" != "无法计算" ] && [ "$SLOW_INCR" != "首次巡检" ] && [ "$SLOW_INCR" -gt 50 ]; then
    ISSUE_COUNT=$((ISSUE_COUNT + 1))
    {
        echo "- [!] 自上次巡检新增慢查询 ${SLOW_INCR} 条，建议分析慢查询日志并优化"
    } >> "$REPORT_FILE"
fi

# 无问题
if [ "$ISSUE_COUNT" -eq 0 ]; then
    {
        echo "- 未发现异常，请继续保持"
    } >> "$REPORT_FILE"
fi

# ---------- 报告结尾 ----------
{
    echo ""
    echo "========================================"
} >> "$REPORT_FILE"

# ---------- 输出报告到屏幕 ----------
cat "$REPORT_FILE"

# ---------- 检查关键问题并发送告警 ----------
# 如果发现紧急问题，可以在这里添加邮件/钉钉通知
# 例如：
# if [ "$ISSUE_COUNT" -gt 0 ]; then
#     mail -s "MySQL 巡检发现 ${ISSUE_COUNT} 个问题" dba@example.com < "$REPORT_FILE"
# fi

echo ""
echo "巡检报告已保存至：$REPORT_FILE"
```
设置定时任务
```
# 每天上午 3:00 执行巡检
crontab -e

# 添加以下行
0 3 * * * /usr/local/bin/mysql_check.sh
```