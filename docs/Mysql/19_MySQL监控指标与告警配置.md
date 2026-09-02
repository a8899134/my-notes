## 一、监控概述
### 1.1 监控作用
数据库是业务系统的核心，一旦出现问题，影响面往往波及整个应用。如果没有完善的监控体系，当系统突然变慢或宕机时，只能被动响应—“等 DBA 连上去看看”，这一来一回可能已经过去了十几分钟，业务损失已经造成。
一套完善的监控体系可以做到：

| 能力   | 说明                            |
| ---- | ----------------------------- |
| 实时感知 | QPS 突然掉底、连接数打满，立刻知道           |
| 故障预警 | Buffer Pool 命中率下降、磁盘空间不足，提前扩容 |
| 排障加速 | 出问题时不用“我觉得慢了”，直接看指标定位         |
| 容量规划 | 根据历史趋势决定什么时候扩容                |

数据不会说谎。嘴上说“不慢”没用，监控图表才说了算。

## 二、核心监控指标
监控不是随便看几个数字，需要有体系地覆盖 MySQL 运行的各个维度。以下将 MySQL 的核心监控指标分为五个维度。
### 2.1 资源使用指标
这类指标反映 MySQL 所在服务器的硬件资源消耗情况，是判断“数据库是不是快扛不住了”的第一道防线。
#### 2.1.1 CPU 使用率
含义：MySQL 进程占用的 CPU 百分比。

监控命令：
```
# 查看 MySQL 进程 CPU 使用率
top -p $(pgrep mysqld) -n1

# 或用 pidstat
pidstat -p $(pgrep mysqld) 1 3
```
健康阈值：持续 < 80%。如果 CPU 长期高于 80%，说明数据库计算压力过大，可能的原因包括：大量复杂查询、缺少索引导致全表扫描、锁竞争等。
#### 2.1.2 内存使用
含义：MySQL 进程占用的内存大小，重点是 InnoDB Buffer Pool 的使用情况。

监控命令：
```
# 查看系统内存
free -h

# 查看 MySQL 内存占用
ps aux | grep mysqld
```
健康阈值：InnoDB Buffer Pool 实际使用量 < 可用内存的 90%。如果内存不足，MySQL 会被操作系统交换到磁盘(Swap)，性能急剧下降。
#### 2.1.3 磁盘 I/O
含义：磁盘读写速度和延迟，是数据库性能的常见瓶颈。

监控命令：
```
# 查看磁盘 I/O
iostat -x 1 3

# 重点关注：await(平均等待时间)、util(使用率)
```
#### 2.1.4 磁盘空间
含义：数据目录的可用空间。

监控命令：
```
df -h /var/lib/mysql
```
健康阈值：可用空间 > 20%。磁盘写满是生产环境最严重的故障之一，会导致数据库无法写入，业务彻底停摆
### 2.2 连接与线程指标
这类指标反映有多少人在用数据库、连接池是否快满了。
#### 2.2.1 当前连接数(Threads_connected)
含义：当前有多少个客户端连接到了 MySQL。

监控命令：
```
SHOW STATUS LIKE 'Threads_connected';
SHOW VARIABLES LIKE 'max_connections';
```
健康阈值：当前连接数 < max_connections 的 80%。连接数打满时，新的连接请求会被拒绝，应用会报错“Too many connections”。
#### 2.2.2 活跃线程数(Threads_running)
含义：当前正在执行查询的线程数(不包含空闲连接)。

监控命令：
```
SHOW STATUS LIKE 'Threads_running';
```
健康阈值：活跃线程数长期居高不下(比如持续 > 50)，说明数据库内部存在大量的锁等待或慢查询。
#### 2.2.3 最大历史连接数(Max_used_connections)
含义：自 MySQL 启动以来，同时连接数的历史峰值。

监控命令：
```
SHOW STATUS LIKE 'Max_used_connections';
```
作用：用于评估 max_connections 设置是否合理。如果历史峰值已经接近上限，说明需要调整。
#### 2.2.4 连接来源和状态
作用：快速定位“哪个用户、从哪来的、在做什么、已经跑了多久”。

监控命令：
```
-- 查看所有非空闲连接
SELECT user, host, db, command, time, state 
FROM information_schema.processlist 
WHERE command != 'Sleep' 
ORDER BY time DESC;
```

### 2.3 查询性能指标
这类指标反映数据库正在处理多少请求、查询效率如何。
#### 2.3.1 QPS(每秒查询数)
作用：QPS 是衡量 MySQL 负载的核心指标。QPS 突然掉底，可能意味着有锁等待或数据库卡住了。

含义：Queries Per Second，每秒执行的查询总数(包含所有类型的 SQL)。

计算方法：
```
-- 先记录当前的 Questions 和 Uptime
SHOW STATUS LIKE 'Questions';
SHOW STATUS LIKE 'Uptime';

-- 等待一段时间(如 60 秒)后再次执行
SHOW STATUS LIKE 'Questions';
SHOW STATUS LIKE 'Uptime';

-- QPS = (第二次 Questions - 第一次 Questions) / 时间差(秒)
```

#### 2.3.2 TPS(每秒事务数)
TPS = (提交数 + 回滚数) / 时间差。对于 InnoDB 表，主要关注 Com_commit。

含义：Transactions Per Second，每秒提交的事务数。

计算方法：
```
SHOW STATUS LIKE 'Com_commit';
SHOW STATUS LIKE 'Com_rollback';
```

#### 2.3.3 慢查询数(Slow_queries)
含义：执行时间超过 long_query_time 阈值的 SQL 数量。

监控命令：
```
SHOW STATUS LIKE 'Slow_queries';
```

健康阈值：慢查询数 < 50/秒。如果慢查询突然飙升，说明 SQL 性能退化或缺少索引。
#### 2.3.4 全表扫描次数(Select_scan)
含义：执行全表扫描的查询次数。

监控命令：
```
SHOW STATUS LIKE 'Select_scan';
```
作用：全表扫描增长说明索引使用不佳，需要优化查询或添加索引。
### 2.4 InnoDB 引擎指标
InnoDB 是 MySQL 的默认存储引擎，它的内部状态直接影响数据库性能。
#### 2.4.1 Buffer Pool 命中率(核心)
含义：数据请求在 Buffer Pool(内存)中命中的比例。

监控命令：
```
SHOW STATUS LIKE 'Innodb_buffer_pool_read%';
```
计算公式：
```
命中率 = (1 - Innodb_buffer_pool_reads / Innodb_buffer_pool_read_requests) × 100%
```
- Innodb_buffer_pool_read_requests：从 Buffer Pool 读取的总请求数
- Innodb_buffer_pool_reads：需要从磁盘读取的次数
健康阈值：命中率 > 99%。如果命中率低于 95%，说明 Buffer Pool 太小，需要增大 innodb_buffer_pool_size。
#### 2.4.2 脏页刷新率
含义：每秒从 Buffer Pool 刷到磁盘的数据页数量。
监控命令：
```
SHOW STATUS LIKE 'Innodb_buffer_pool_pages_flushed';
```
作用：刷新率突然升高，说明写入压力大，可能磁盘 I/O 成为瓶颈。
#### 2.4.3 行锁等待
含义：事务在等待行锁的次数和时间。
监控命令：
```
SHOW STATUS LIKE 'Innodb_row_lock_waits';
SHOW STATUS LIKE 'Innodb_row_lock_time_avg';
```
作用：行锁等待过多，说明存在锁竞争或长事务。
### 2.5 主从复制指标
如果使用了主从复制架构，需要额外监控复制健康状态。
#### 2.5.1 复制延迟(Seconds_Behind_Master)
含义：从库落后主库的秒数。
监控命令：
```
SHOW SLAVE STATUS\G
-- 查看 Seconds_Behind_Master 字段
```
健康阈值：< 60 秒。延迟超过 60 秒说明复制跟不上主库的写入速度，可能的原因包括：网络抖动、从库负载过高、长事务等。
#### 2.5.2 复制状态(Slave_IO_Running / Slave_SQL_Running)
含义：从库的两个复制线程是否正常运行。
监控命令：
```
SHOW SLAVE STATUS\G
-- 查看 Slave_IO_Running 和 Slave_SQL_Running
```
健康阈值：两个状态都应为 Yes。任何一个为 No，说明复制已中断。
#### 2.5.3 复制相关错误
监控命令：
```
SHOW SLAVE STATUS\G
-- 查看 Last_Error 和 Last_IO_Error
```
作用：记录复制过程中出现的错误信息，是排查复制故障的第一手资料。

## 三、告警配置
### 3.1 告警阈值参考
基于生产环境最佳实践，以下是各核心指标的告警阈值建议：

|监控指标|告警阈值|持续时间|告警级别|
|---|---|---|---|
|CPU 使用率|> 80%|持续 5 分钟|⚠️ 重要|
|内存使用率|> 90%|持续 5 分钟|⚠️ 重要|
|磁盘空间使用率|> 80%|持续 10 分钟|🔴 紧急|
|连接数使用率|> 80%|持续 3 个周期|⚠️ 重要|
|Buffer Pool 命中率| 50/秒|持续 5 分钟|⚠️ 重要|
|主从复制延迟|> 60 秒|持续 3 个周期|🔴 紧急|
|复制线程停止|任一为 No|立即|🔴 紧急|
### 3.2 告警级别定义

|级别|说明|响应时间|
|---|---|---|
|🔴 紧急(Critical)|业务已受影响，需要立即处理|5 分钟内|
|⚠️ 重要(Warning)|存在潜在风险，需要关注|30 分钟内|
|ℹ️ 提示(Info)|异常情况，但不影响业务|工作时间处理|
### 3.3 告警规则配置示例
#### 3.3.1 Prometheus + AlertManager 配置示例
```
groups:
- name: mysql_alerts
  rules:
  # 连接数告警
  - alert: MySQLHighConnections
    expr: mysql_global_status_threads_connected / mysql_global_variables_max_connections > 0.8
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "MySQL 连接数使用率过高"
      description: "当前连接数使用率 {{ $value | humanizePercentage }}"

  # 主从复制延迟告警
  - alert: MySQLReplicationLag
    expr: mysql_slave_status_seconds_behind_master > 60
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "MySQL 主从复制延迟过高"
      description: "当前延迟 {{ $value }} 秒"

  # Buffer Pool 命中率告警
  - alert: MySQLBufferPoolHitRateLow
    expr: (1 - mysql_global_status_innodb_buffer_pool_reads / mysql_global_status_innodb_buffer_pool_read_requests) < 0.95
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "MySQL Buffer Pool 命中率过低"
      description: "当前命中率 {{ $value | humanizePercentage }}"
```
#### 3.3.2 告警通知配置要点
告警通知应满足以下要求：

|配置项|建议|
|---|---|
|通知方式|邮件 + 短信 + 即时通讯(钉钉/企业微信)|
|通知对象|值班 DBA + 运维负责人|
|告警收敛|同一告警 1 小时内只发 1 次，避免消息轰炸|
|告警升级|重要告警 10 分钟未确认，自动升级通知更高级别|

## 四、监控工具
### 4.1 工具对比

| 工具                      | 适用场景            | 优点                 | 缺点            |
| ----------------------- | --------------- | ------------------ | ------------- |
| Prometheus + Grafana    | 中小规模、云原生环境      | 开源、生态丰富、可视化强       | 需要自行搭建和维护     |
| PMM(Percona Monitoring) | MySQL 专业监控、性能攻坚 | 开箱即用，围绕 MySQL 深度优化 | 对非 MySQL 支持较弱 |
| Zabbix                  | 全栈监控、多实例环境      | 功能全面，支持分布式         | 配置较复杂         |
| 云厂商监控(RDS)              | 云上 RDS 实例       | 免运维，开箱即用           | 只能监控云上实例      |
### 4.2 PMM(Percona Monitoring and Management)简介
PMM 是 Percona 提供的开源 MySQL 监控工具。它集成了 Prometheus + Grafana + 专用 Exporter，开箱即用，围绕 MySQL 做了深度优化。

适用场景：MySQL 性能深度诊断、索引与锁分析、复制拓扑与健康度监控。
### 4.3 快速搭建 Prometheus + Grafana 监控栈
```
Node Exporter(系统指标)
    ↓
mysqld_exporter(MySQL 指标)
    ↓
Prometheus(采集 + 存储)
    ↓
Grafana(可视化 + 告警)
```
组件说明：

|组件|作用|
|---|---|
|nodeexporter|采集服务器系统指标(CPU、内存、磁盘、网络)|
|mysqldexporter|采集 MySQL 指标(连接数、查询速率、InnoDB、复制延迟)|
|Prometheus|定期拉取指标数据并存储|
|Grafana|可视化展示 + 告警配置|
### 4.4 常用系统监控命令
```
# CPU 使用率
top -p $(pgrep mysqld) -n1

# 内存使用
free -h

# 磁盘 I/O
iostat -x 1 3

# 磁盘空间
df -h /var/lib/mysql

# 网络流量
sar -n DEV 1 3
```
