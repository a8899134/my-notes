## 一、慢查询概述
### 1.1 慢查询概念
慢查询(Slow Query) 是指执行时间超过预设阈值(long_query_time)的 SQL 语句。这些 SQL 语句通常存在性能问题，例如缺少索引、全表扫描、锁等待或数据量过大等。

通俗理解：慢查询就像在超市结账时排到了“慢速队伍”—收银员动作慢、商品需要逐一扫码、前面的顾客还在翻钱包，整个队伍行进缓慢。即使其他队伍畅通无阻，这条队伍也会拖慢整体效率。
### 1.2 为什么要关注慢查询

| 问题      | 影响                           |
| ------- | ---------------------------- |
| 响应时间变长  | 用户等待时间增加，体验下降                |
| 数据库负载增高 | CPU、内存、磁盘 I/O 资源被耗尽          |
| 连接数堆积   | 慢查询占用连接不释放，导致其他请求被阻塞         |
| 级联故障    | 数据库响应变慢导致应用服务器连接池耗尽，进而影响整个系统 |

核心认知：
- 80% 的性能问题由 20% 的 SQL 引起
- 优化一条慢查询，可能提升整个系统 10 倍性能
- 慢查询分析是 DBA 和开发者的核心技能之一

## 二、慢查询日志
### 2.1 开启慢查询日志
#### 2.1.1 查看当前状态
```sql
-- 查看慢查询日志是否开启
SHOW VARIABLES LIKE 'slow_query_log';

-- 查看慢查询日志文件位置
SHOW VARIABLES LIKE 'slow_query_log_file';

-- 查看慢查询阈值(秒)
SHOW VARIABLES LIKE 'long_query_time';

-- 查看是否记录未使用索引的查询
SHOW VARIABLES LIKE 'log_queries_not_using_indexes';
```
#### 2.1.2 临时开启(当前会话或全局)
```sql
-- 开启慢查询日志(全局，重启后失效)
SET GLOBAL slow_query_log = ON;

-- 设置慢查询阈值(2秒)
SET GLOBAL long_query_time = 2;

-- 设置日志文件路径
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';

-- 记录未使用索引的查询
SET GLOBAL log_queries_not_using_indexes = ON;
```
#### 2.1.3 永久开启(配置文件)
在 /etc/my.cnf 中添加：
```ini
[mysqld]
# 开启慢查询日志
slow_query_log = ON

# 日志文件路径
slow_query_log_file = /var/log/mysql/slow.log

# 慢查询阈值(秒)
long_query_time = 2

# 记录未使用索引的查询
log_queries_not_using_indexes = ON

# 记录满扫描行数的查询(可选)
min_examined_row_limit = 100
```
修改配置后重启 MySQL：
```bash
sudo systemctl restart mysqld
```
### 2.2 配置参数详解

|参数|说明|建议值|
|---|---|---|
| slowquerylog |是否开启慢查询日志| ON |
| slowquerylogfile |日志文件路径| /var/log/mysql/slow.log |
| longquerytime |慢查询阈值(秒)| 2(OLTP)/ 1(核心业务)|
| logqueriesnotusingindexes |记录未使用索引的查询| ON |
| minexaminedrowlimit |扫描行数低于此值不记录| 100 |
| logslowadmin_statements |记录慢管理语句(ALTER TABLE 等)| ON |

⚠️ 生产环境建议：慢查询日志对性能影响极小(约 1-3%)，生产环境建议开启，便于问题排查。
### 2.3 查看慢查询统计
```sql
-- 查看慢查询总数
SHOW STATUS LIKE 'Slow_queries';

-- 查看慢查询阈值设置
SHOW VARIABLES LIKE 'long_query_time';

-- 查看日志是否开启
SHOW VARIABES LIKE 'slow_query_log%';
```

## 三、慢查询日志分析工具
### 3.1 直接查看日志
慢查询日志格式示例：
```text
# Time: 2026-07-24T10:30:00.123456Z
# User@Host: app_user[app_user] @ localhost []
# Query_time: 5.123456  Lock_time: 0.000123  Rows_sent: 1000  Rows_examined: 500000
SELECT * FROM orders WHERE customer_id = 12345 AND status = 'pending' ORDER BY created_at DESC;
```
字段说明：

|字段|含义|
|---|---|
| Time |查询执行时间|
| User@Host |执行用户和来源|
| Querytime |总执行时间(秒)|
| Locktime |锁等待时间(秒)|
| Rowssent |返回的行数|
| Rowsexamined |扫描的行数(关键指标)|
| SQL |具体的 SQL 语句|

查看日志：
```bash
# 查看最后 20 条慢查询
sudo tail -20 /var/log/mysql/slow.log

# 实时监控
sudo tail -f /var/log/mysql/slow.log

# 查看所有慢查询(grep)
sudo grep "Query_time:" /var/log/mysql/slow.log
```
### 3.2 mysqldumpslow(MySQL 官方工具)
mysqldumpslow 是 MySQL 自带的慢查询日志汇总工具。
```bash
# 基本用法
mysqldumpslow /var/log/mysql/slow.log

# 按执行时间排序(前10条)
mysqldumpslow -t 10 -s t /var/log/mysql/slow.log

# 按扫描行数排序
mysqldumpslow -s r /var/log/mysql/slow.log

# 按查询次数排序
mysqldumpslow -s c /var/log/mysql/slow.log
```
参数说明：

|参数|说明|
|---|---|
| -s t |按执行时间排序|
| -s c |按执行次数排序|
| -s r |按扫描行数排序|
| -t N |只显示前 N 条|
| -g pattern |按正则表达式过滤|
### 3.3 pt-query-digest(Percona 工具)
pt-query-digest 是 Percona Toolkit 中的慢查询分析工具，功能更强大。
安装：
```bash
# 安装 Percona Toolkit
sudo yum install -y percona-toolkit

# 或下载安装
wget https://www.percona.com/downloads/percona-toolkit/3.5.0/binary/redhat/8/x86_64/percona-toolkit-3.5.0-1.el8.x86_64.rpm
sudo rpm -ivh percona-toolkit-3.5.0-1.el8.x86_64.rpm
```
基本用法：
```bash
# 分析慢查询日志
pt-query-digest /var/log/mysql/slow.log

# 输出到文件
pt-query-digest /var/log/mysql/slow.log > /tmp/slow_analysis.txt

# 分析当前 MySQL 进程列表
pt-query-digest --processlist h=localhost,u=root,p=password

# 分析 tcpdump 抓包
tcpdump -s 65535 -x -nn -q -tttt -i any port 3306 | pt-query-digest --type tcpdump
```
输出解读：
```text
# Profile
# Rank Query ID           Response time   Calls  R/Call  V/M   Item
# ==== ================== =============== ====== ======= ===== ===============
#    1 0x1234567890ABCDEF  120.5678 75.2%    12 10.0473  0.56 SELECT orders
#    2 0xFEDCBA0987654321   25.1234 15.7%    45  0.5583  0.12 SELECT users
```

|字段|含义|
|---|---|
| `Rank` |排名|
| `Response time` |总执行时间和占比|
| `Calls` |执行次数|
| `R/Call` |平均每次执行时间|
| `Item` |SQL 摘要|

## 四、执行计划分析(EXPLAIN)
找到慢查询后，需要分析其执行计划，找出慢的原因。
### 4.1 EXPLAIN 基本用法
```sql
-- 查看执行计划
EXPLAIN SELECT * FROM orders WHERE customer_id = 12345;

-- 查看更详细的执行计划(MySQL 8.0+)
EXPLAIN FORMAT=JSON SELECT * FROM orders WHERE customer_id = 12345;

-- 查看实际执行情况(包含执行统计)
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 12345;
```
### 4.2 EXPLAIN 输出关键字段

|字段|含义|重点关注|
|---|---|---|
| id |SELECT 执行顺序|越大越先执行|
| selecttype |查询类型| SIMPLE 简单查询；PRIMARY 最外层查询；SUBQUERY 子查询；DERIVED 派生表；UNION 联合查询|
| table |访问的表|—|
| type |访问类型|ALL 最差(全表扫描)，需要优化|
| possiblekeys |可能使用的索引|—|
| key |实际使用的索引|NULL 表示未使用索引|
| key_len |使用的索引长度|越长匹配越精准|
| rows |预估扫描行数|越小越好|
| filtered |过滤比例|越高越好|
| Extra |额外信息|Using filesort、Using temporary、Using index|
### 4.3 type 访问类型(从好到差)
```text
system > const > eq_ref > ref > range > index > ALL
  ↑ 好                                    差 ↓
```

|type|含义|说明|
|---|---|---|
|system|系统表，只有一行|最好，极少出现|
|const|常量查询，最多匹配一行|主键或唯一索引查询|
|eq_ref|唯一索引关联查询|JOIN 时使用主键或唯一索引|
|ref|非唯一索引查询|使用普通索引|
|range|范围查询| BETWEEN、>、<、IN |
|index|索引全扫描|遍历整个索引树|
|ALL|全表扫描|⚠️ 最差，必须优化|
### 4.4 Extra 关键信息

|Extra|含义|处理方式|
|---|---|---|
|Using index|覆盖索引，不回表|✅ 好|
|Using where|需要过滤数据|正常|
|Using index condition|索引条件下推|正常|
|Using filesort|需要额外排序|⚠️ 需要优化|
|Using temporary|使用临时表|⚠️ 需要优化|
|Using join buffer|使用 JOIN 缓冲|⚠️ 可能需要加索引|

## 五、慢查询常见原因
### 5.1 索引相关

| 问题       | 说明             | 示例                                        |
| -------- | -------------- | ----------------------------------------- |
| 未建索引     | WHERE 条件字段没有索引 | WHERE customerid = 12345(customerid 无索引)  |
| 索引失效     | 有索引但没用上        | 对索引列使用函数、隐式类型转换                           |
| 索引选择性差   | 索引列重复值太多       | WHERE status = 'active'(90% 的数据都是 active) |
| 组合索引顺序不对 | 未遵循最左前缀原则      | 索引 (a,b,c)，查询只用 b                         |
### 5.2 SQL 写法问题
|问题|示例|
|---|---|
|`SELECT *`|`SELECT * FROM orders WHERE ...`|
|无 `LIMIT` 的大查询|`SELECT * FROM logs WHERE ...`(没有 LIMIT)|
|`LIKE '%xxx'`|`LIKE '%keyword%'`(前缀通配符导致索引失效)|
|`OR` 条件|`WHERE a = 1 OR b = 2`(部分字段无索引)|
|`NOT IN` / `NOT EXISTS`|`WHERE id NOT IN (SELECT ...)`|
|子查询不当|使用子查询替代 JOIN|
### 5.3 数据库设计问题
|问题|说明|
|---|---|
|表数据量过大|单表超过 5000 万行，索引效果下降|
|字段类型不当|用 `VARCHAR` 存数字、`TEXT` 存短文本|
|范式过高/过低|过度范式化导致过多 JOIN，范式化不足导致数据冗余|
|未分区|大数据量表未做分区，全表扫描代价大|
### 5.4 服务器资源问题
| 问题             | 说明                |
| -------------- | ----------------- |
| Buffer Pool 太小 | 数据无法全部缓存，频繁磁盘 I/O |
| 磁盘 I/O 瓶颈      | 机械硬盘速度慢，SSD 未启用   |
| 内存不足           | 发生 Swap，性能急剧下降    |
| CPU 不足         | 复杂查询计算量大          |

## 六、慢查询优化方法
### 6.1 索引优化(最常用)
#### 6.1.1 添加索引
```sql
-- 为 WHERE 条件字段建索引
CREATE INDEX idx_customer_id ON orders (customer_id);

-- 为组合查询建组合索引
CREATE INDEX idx_customer_status ON orders (customer_id, status);

-- 为排序字段建索引
CREATE INDEX idx_created_at ON orders (created_at);

```
#### 6.1.2 组合索引最左前缀原则
```sql
-- 索引：idx_a_b_c (a, b, c)
-- ✅ 能使用索引
WHERE a = 1
WHERE a = 1 AND b = 2
WHERE a = 1 AND b = 2 AND c = 3

-- ⚠️ 部分使用(只用 a)
WHERE a = 1 AND c = 3

-- ❌ 不能使用索引
WHERE b = 2
WHERE b = 2 AND c = 3
```
#### 6.1.3 使用覆盖索引
```sql
-- 需要回表(查询所有列)
SELECT * FROM orders WHERE customer_id = 12345;

-- 覆盖索引(只查索引中的列)
SELECT id, customer_id, status FROM orders WHERE customer_id = 12345;
-- 建索引：CREATE INDEX idx_customer_id_status ON orders (customer_id, status);
```
### 6.2 SQL 重写优化
#### 6.2.1 避免 `SELECT *`
```sql
-- ❌ 查询所有列
SELECT * FROM orders WHERE customer_id = 12345;

-- ✅ 只查询需要的列
SELECT id, order_no, amount, status FROM orders WHERE customer_id = 12345;
```
#### 6.2.2 使用 `LIMIT` 限制返回行数
```sql
-- ❌ 返回全部
SELECT * FROM orders WHERE customer_id = 12345;

-- ✅ 返回前 100 条
SELECT * FROM orders WHERE customer_id = 12345 LIMIT 100;
```
#### 6.2.3 避免 `LIKE` 前缀通配符
```sql
-- ❌ 索引失效
SELECT * FROM users WHERE name LIKE '%张三%';

-- ✅ 索引可用
SELECT * FROM users WHERE name LIKE '张三%';
```
#### 6.2.4 用 `EXISTS` 替代 `IN`(子查询数据量大时)
```sql
-- ❌ 子查询
SELECT * FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE status = 'active');

-- ✅ EXISTS
SELECT * FROM orders o WHERE EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.status = 'active');
```
#### 6.2.5 用 `JOIN` 替代子查询
```sql
-- ❌ 子查询
SELECT * FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE vip_level = 1);

-- ✅ JOIN
SELECT o.* FROM orders o JOIN customers c ON o.customer_id = c.id WHERE c.vip_level = 1;
```
### 6.3 数据库结构优化
#### 6.3.1 分区表
```sql
-- 按时间分区
CREATE TABLE orders (
    id INT,
    order_no VARCHAR(50),
    amount DECIMAL(10,2),
    created_at DATETIME
) PARTITION BY RANGE (YEAR(created_at)) (
    PARTITION p2022 VALUES LESS THAN (2023),
    PARTITION p2023 VALUES LESS THAN (2024),
    PARTITION p2024 VALUES LESS THAN (2025)
);
```
#### 6.3.2 归档历史数据
```sql
-- 将 3 年前的数据移到归档表
INSERT INTO orders_archive SELECT * FROM orders WHERE created_at < NOW() - INTERVAL 3 YEAR;
DELETE FROM orders WHERE created_at < NOW() - INTERVAL 3 YEAR;
```
### 6.4 服务器配置优化

|参数|作用|建议值|
|---|---|---|
| innodbbufferpoolsize |数据缓存|物理内存的 50%~80%|
| innodbiocapacity |I/O 吞吐量|SSD 设 2000+|
| sortbuffersize |排序缓冲|4 M ~ 8 M|
| joinbuffer_size |JOIN 缓冲|4 M ~ 8 M|

## 七、慢查询处理流程
### 7.1 标准处理流程
```
┌─────────────────────────────────────────────────────────────────┐
│  1. 发现慢查询                                                   │
│     - 监控告警(Zabbix/Prometheus)                             │
│     - 用户反馈慢                                                │
│     - 定期巡检                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. 定位慢查询                                                   │
│     - 查看慢查询日志                                            │
│     - 使用 mysqldumpslow / pt-query-digest 汇总                │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. 分析执行计划                                                 │
│     - EXPLAIN 查看执行计划                                      │
│     - 确认 type、key、rows、Extra 是否异常                     │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. 确定优化方案                                                 │
│     - 加索引                                                    │
│     - 重写 SQL                                                  │
│     - 调整配置                                                  │
│     - 结构优化                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. 执行优化                                                     │
│     - 测试环境验证                                              │
│     - 生产环境执行(低峰期)                                    │
│     - 监控效果                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. 验证效果                                                     │
│     - 对比优化前后的 Query_time                                 │
│     - 确认 Rows_examined 是否下降                              │
└─────────────────────────────────────────────────────────────────┘
```
