## 一、索引的作用
### 1.1 索引概念
想象你去图书馆找一本书《MySQL 从入门到精通》。
- 没有索引：你从图书馆的第一排书架开始，一本一本地翻看书名，直到走完所有书架才找到目标。如果图书馆有十万本书，这个查找过程可能要花几个小时。
- 有索引：你直接去查图书馆的书目索引柜，按拼音找到“M”开头的区域，再找到“MySQL”，书架上标着“3楼B区5列”。你直接走过去，30秒拿到书。

数据库索引，就是这本书目索引柜。 它本身不存储完整的数据，只存储“关键字 → 数据所在位置”的映射关系。

MySQL官方对索引的定义是：索引(Index)是帮助MySQL高效获取数据的数据结构。
### 1.2 索引本质
索引的本质就是一种数据结构。MySQL中最常用的索引结构是 B+树(B+Tree) 。
B+树的特点(只需要记住两条) ：
1. 矮胖：树的高度很低(通常3-4层)，即使是千万级数据，也只需要3-4次磁盘I/O就能找到目标。
2. 有序：所有数据在叶子节点上按顺序排列，既支持等值查询(=)，也支持范围查询(>、<、BETWEEN)。
### 1.3 索引优缺点
| 优点                              | 缺点                                    |
| ------------------------------- | ------------------------------------- |
| 极大提升查询速度(尤其是大数据量)               | 占用额外的磁盘空间(约数据量的5%~10%)                |
| 加速排序(`ORDER BY`)和分组(`GROUP BY`) | 插入、更新、删除时需要同步维护索引，写操作变慢(约增加20%~50%开销) |
| 唯一索引可以保证数据唯一性                   | 索引越多，维护成本越高，单表建议不超过6个                 |

结论：索引不是越多越好，而是要根据查询需求精准设计。

## 二、索引的类型
### 2.1 按功能分类
#### 2.1.1 普通索引(INDEX)
定义：最基本的索引类型，没有任何限制。索引列的值可以重复，也可以为空。

作用：仅加速查询。

适用场景：频繁出现在 WHERE 条件中，但不需要唯一性约束的字段(如用户名、分类ID)。

#### 2.1.2 唯一索引(UNIQUE INDEX)
定义：索引列的值必须唯一，但允许有空值(NULL) 。如果是组合唯一索引，则列值的组合必须唯一。

作用：加速查询 + 保证列值唯一。

适用场景：需要唯一约束的字段，如邮箱、手机号、身份证号。
#### 2.1.3 主键索引(PRIMARY KEY)
定义：一种特殊的唯一索引，不允许有空值(NOT NULL) 。一张表只能有一个主键索引。

作用：加速查询 + 列值唯一 + 数据行唯一标识。

特别说明：在 InnoDB 中，主键索引就是聚簇索引(Clustered Index) — 数据行本身按照主键的顺序存储在磁盘上。所以主键的选择对性能影响极大。
#### 2.1.4 全文索引(FULLTEXT)
定义：对文本内容进行分词，然后建立索引，用于全文搜索。

作用：加速文本内容的搜索。

适用场景：文章内容搜索、商品描述搜索等。MySQL 5.6之后，InnoDB 也支持全文索引。

注意：全文索引的创建和维护开销较大，只适合对较大的文本字段使用。
#### 2.1.5 组合索引(复合索引 / Composite Index)
定义：由多个列共同组成的一个索引。

作用：专门用于组合查询条件，效率高于多个单列索引的合并。

核心原则：遵循 “最左前缀匹配原则” 。

适用场景：查询条件经常同时涉及多个字段时(如 WHERE customer_id = ? AND order_date > ?)。
### 2.2 按存储结构分类
| 索引类型  | 数据结构   | 适用场景                         |
| ----- | ------ | ---------------------------- |
| B+树索引 | B+Tree | 等值查询、范围查询、排序 — InnoDB默认，最常用 |
| 哈希索引  | Hash表  | 仅等值查询(不支持范围查询)— Memory引擎使用  |
| 全文索引  | 倒排索引   | 文本内容搜索                       |

## 三、索引的创建与管理
### 3.1 创建索引的三种方式
#### 3.1.1 建表时创建索引
在 CREATE TABLE 语句中直接定义索引。
```
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,           -- 主键索引
    username VARCHAR(50) UNIQUE,                 -- 唯一索引(建表时直接定义)
    email VARCHAR(100),
    age INT,
    city VARCHAR(50),
    INDEX idx_age (age),                         -- 普通索引：idx_age
    INDEX idx_city_age (city, age)               -- 组合索引：city + age
);
```
解释：
- PRIMARY KEY：自动创建主键索引
- UNIQUE：自动创建唯一索引
- INDEX 索引名 (列名)：手动创建普通索引或组合索引
#### 3.1.2 使用 `CREATE INDEX` 语句
在已有表上添加索引。
基本语法：
```
CREATE [UNIQUE] INDEX 索引名 ON 表名 (列1, 列2, ...);
```
示例：
```
-- 创建普通单列索引
CREATE INDEX idx_username ON users (username);

-- 创建唯一索引
CREATE UNIQUE INDEX idx_email ON users (email);

-- 创建组合索引
CREATE INDEX idx_city_age ON users (city, age);
```
参数说明：
1. UNIQUE，可选。加了这个关键字，创建的是唯一索引
2. 索引名，给你索引起的名字，在表中必须唯一
3. 表名，要在哪个表上创建索引
4. (列 1, 列 2, ...)，要在哪些列上创建索引。多列就是组合索引

💡 注意：CREATE INDEX 不能用于创建主键索引，主键只能用 ALTER TABLE 或在建表时定义。
#### 3.1.3 使用 `ALTER TABLE` 语句
在已有表上添加索引。
基本语法：
```
ALTER TABLE 表名 ADD INDEX 索引名 (列1, 列2, ...);
ALTER TABLE 表名 ADD UNIQUE 索引名 (列);
ALTER TABLE 表名 ADD PRIMARY KEY (列);
ALTER TABLE 表名 ADD FULLTEXT 索引名 (列);
```
示例：
```
-- 添加普通索引
ALTER TABLE users ADD INDEX idx_age (age);

-- 添加唯一索引
ALTER TABLE users ADD UNIQUE idx_phone (phone);

-- 添加主键索引(表中没有主键时)
ALTER TABLE users ADD PRIMARY KEY (id);

-- 添加全文索引
ALTER TABLE articles ADD FULLTEXT idx_content (content);
```
### 3.2 查看索引
#### 3.2.1 查看表中的所有索引
```
SHOW INDEX FROM 表名;
```
示例：
```
SHOW INDEX FROM users\G
```
输出关键字段说明：
1. Table，表名
2. Non_unique，0=唯一索引，1=普通索引
3. Key_name，索引名称(`PRIMARY` 表示主键索引)
4. Seq_in_index，在组合索引中的位置(从 1 开始)
5. Column_name，索引列名
6. Cardinality，索引中唯一值的数量(越接近行数，选择性越高)
7. Index_type，索引类型(BTREE、HASH、FULLTEXT)
#### 3.2.2 查看表的建表语句(含索引定义)
```
SHOW CREATE TABLE 表名;
```
### 3.3 删除索引
#### 3.3.1 使用 `DROP INDEX`
```
DROP INDEX 索引名 ON 表名;
```
示例：
```
DROP INDEX idx_age ON users;
```
#### 3.3.2 使用 `ALTER TABLE`
```
ALTER TABLE 表名 DROP INDEX 索引名;
ALTER TABLE 表名 DROP PRIMARY KEY;  -- 删除主键索引
```
示例：
```
ALTER TABLE users DROP INDEX idx_age;
ALTER TABLE users DROP PRIMARY KEY;
```
### 3.4 修改索引

MySQL 没有直接修改索引的命令。修改索引 = 删除旧索引 + 创建新索引。
```
-- 先删后建
DROP INDEX idx_old ON users;
CREATE INDEX idx_new ON users (new_column);
```
或者用 `ALTER TABLE` 一步完成(先删再加)：
```
ALTER TABLE users DROP INDEX idx_old, ADD INDEX idx_new (new_column);
```

## 四、索引的使用原则
### 4.1 什么时候应该建索引

在日常 SQL 审核或慢查询日志分析中，如果你看到以下两个信号，说明这条 SQL 必须建索引，否则随着数据量增长，它会拖垮整个数据库。

1. 信号一：type = ALL

含义：MySQL 进行了全表扫描，从头到尾遍历了整张表的每一行数据。

为什么危险：

|数据量|全表扫描的影响|
|---|---|
|几百行|没感觉，瞬间完成|
|几万行|几十毫秒，勉强能接受|
|几百万行|几秒钟，用户开始抱怨|
|几千万行|几十秒甚至几分钟，数据库连接池被耗尽，整个服务不可用|

看到 type=ALL 时，通知开发做的事情：
```
-- 1. 找出查询中 WHERE 条件里的字段
-- 2. 给这些字段建索引
CREATE INDEX idx_xxx ON 表名 (字段名);
```
举例：
```
EXPLAIN SELECT * FROM orders WHERE customer_id = 12345\G
-- type = ALL，说明 customer_id 没有索引
-- → 通知开发：给 customer_id 建索引
CREATE INDEX idx_customer_id ON orders (customer_id);
```

2. 信号二：Extra = Using filesort

含义：MySQL 无法利用索引完成排序，需要在内存或磁盘上进行额外的排序操作。

为什么危险：
- 排序操作需要额外的内存和 CPU 资源
- 如果结果集太大，内存放不下，会使用磁盘临时文件，速度下降几个数量级
- 排序操作会阻塞其他查询，影响整体数据库性能

看到 Using filesort 时，通知开发做的事情：
```
-- 1. 找出 ORDER BY 子句中的字段
-- 2. 检查这些字段是否在索引中
-- 3. 如果不在，建索引；如果在，检查组合索引的字段顺序
CREATE INDEX idx_xxx ON 表名 (排序字段);
```

举例：
```
EXPLAIN SELECT * FROM orders WHERE customer_id = 12345 ORDER BY create_time DESC\G
-- Extra = Using filesort，说明 create_time 没有索引
-- → 通知开发：给 create_time 建索引
CREATE INDEX idx_create_time ON orders (create_time);

-- 如果 WHERE 条件和 ORDER BY 是组合索引的最优解：
CREATE INDEX idx_customer_create ON orders (customer_id, create_time);
```
3. 信号三：Extra = Using temporary(进阶信号)
含义：MySQL 需要创建临时表来处理查询(常见于 GROUP BY 或 DISTINCT 没有索引的情况)。

为什么危险：临时表可能存放在内存或磁盘上，无论哪种，都会消耗额外资源，拖慢查询速度。

处理方式：同样通知开发，为 GROUP BY 或 DISTINCT 涉及的字段建索引。

4. 排查流程图(给 DBA 和开发参考)
```
EXPLAIN 结果
    │
    ├── type = ALL ? ──── YES ──→ 通知开发：给 WHERE 条件字段建索引
    │
    ├── Extra = Using filesort ? ──── YES ──→ 通知开发：给 ORDER BY 字段建索引
    │
    ├── Extra = Using temporary ? ──── YES ──→ 通知开发：给 GROUP BY / DISTINCT 字段建索引
    │
    └── 以上都没有 ────→ 索引设计合理，继续监控
```
type=ALL 是全表扫描，Extra=Using filesort 是额外文件排序，Extra=Using temporary 是临时表—这三个信号出现任何一个，都说明索引缺失或设计不当，必须立即通知开发建索引或优化 SQL。

等数据量大了再回头补索引，代价是停机维护；在 SQL 上线前用 EXPLAIN 审核，成本最低。

### 4.2 什么时候不应该建索引
| 场景       | 原因                  |
| -------- | ------------------- |
| 表数据量很小   | 全表扫描比走索引还快          |
| 频繁更新的列   | 每次更新都要维护索引，得不偿失     |
| 选择性低的列   | 如性别(只有男/女)，索引过滤效果极差 |
| 索引数量已经很多 | 单表建议不超过6个索引         |
### 4.3 组合索引与“最左前缀匹配原则”
这是索引优化中最重要、最容易出错的原则。
最左前缀原则：MySQL 在使用组合索引时，只能从索引定义的最左边字段开始连续匹配。
举例：创建组合索引 (a, b, c)

|查询条件|能否使用索引？|原因|
|---|---|---|
| WHERE a = 1 |✅ 能用|从最左列 a 开始|
| WHERE a = 1 AND b = 2 |✅ 能用|连续匹配了 a 和 b|
| WHERE a = 1 AND b = 2 AND c = 3 |✅ 能用|连续匹配了 a、b、c|
| WHERE a = 1 AND c = 3 |⚠️ 部分能用|只能用 a，c 用不到(跳过了 b)|
| WHERE b = 2 |❌ 不能用|没有从最左列 a 开始|
| WHERE b = 2 AND c = 3 |❌ 不能用|没有从最左列 a 开始|

设计组合索引时的建议：将最常用、选择性最高的列放在最左边。
### 4.4 索引失效的常见场景
以下情况会导致索引失效(即使有索引，MySQL也不会使用)：
#### 4.4.1 在索引列上使用函数
```
-- ❌ 索引失效(对 create_time 用了 YEAR 函数)
SELECT * FROM orders WHERE YEAR(create_time) = 2023;

-- ✅ 正确写法(直接使用范围比较)
SELECT * FROM orders WHERE create_time >= '2023-01-01' AND create_time < '2024-01-01';
```
#### 4.4.2 隐式类型转换
```
-- 假设 phone 字段是 VARCHAR 类型
-- ❌ 索引失效(传入的是数字，发生了隐式转换)
SELECT * FROM users WHERE phone = 13800138000;

-- ✅ 正确写法(传入字符串)
SELECT * FROM users WHERE phone = '13800138000';
```
#### 4.4.3 使用 `LIKE` 以通配符开头
```
-- ❌ 索引失效(% 在开头)
SELECT * FROM users WHERE username LIKE '%张三%';

-- ✅ 索引可用(% 在结尾)
SELECT * FROM users WHERE username LIKE '张三%';
```
#### 4.4.4 使用 `NOT`、`!=`、`<>` 操作符
```
-- ❌ 索引失效
SELECT * FROM users WHERE age != 18;
SELECT * FROM users WHERE age <> 18;
```
#### 4.4.5 `OR` 条件中有一侧没有索引
```
-- 假设 age 有索引，city 没有索引
-- ❌ 索引失效(OR 的右侧没有索引，导致整个查询不走索引)
SELECT * FROM users WHERE age = 18 OR city = '北京';
```

## 五、索引的优化技巧
### 5.1 覆盖索引(Covering Index)
定义：一个索引包含了查询所需的所有字段，MySQL 只需要读取索引本身，不需要回表去查数据行。

示例：
```
-- 创建组合索引
CREATE INDEX idx_username_email ON users (username, email);

-- 查询
SELECT username, email FROM users WHERE username = '张三';
```
这个查询的 SELECT 字段(username, email)和 WHERE 字段(username)全部在索引 idx_username_email 中。MySQL 直接读索引就拿到所有数据，不需要再回表读完整的数据行。
查看是否使用了覆盖索引：
```
EXPLAIN SELECT username, email FROM users WHERE username = '张三'\G

```
如果 Extra 列显示 Using index，说明使用了覆盖索引。
### 5.2 前缀索引
对于长字符串列(如 VARCHAR(255))，可以只对列的前 N 个字符建立索引，减少索引文件大小。
```
-- 只对 email 的前 10 个字符建索引
CREATE INDEX idx_email_prefix ON users (email(10));
```
适用场景：字符串列很长，且前几个字符的区分度已经足够。
### 5.3 使用 `EXPLAIN` 分析索引使用情况
EXPLAIN 是 MySQL 提供的查询执行计划分析工具，用于查看 SQL 语句是否使用了索引。
```
EXPLAIN SELECT * FROM users WHERE username = '张三'\G
```
输出关键字段说明：

|字段|含义|
|---|---|
| type |访问类型：const > eqref > ref > range > index > ALL(ALL 最差，表示全表扫描)|
| possiblekeys |可能使用的索引|
| key |实际使用的索引(NULL 表示没用到索引)|
| key_len |使用的索引长度(越长说明匹配的列越多)|
| rows |预估需要扫描的行数(越小越好)|
| Extra |额外信息：Using index(覆盖索引)、Using filesort(需要额外排序，应避免)、Using temporary(使用临时表，应避免)|

## 六、索引的日常维护
### 6.1 查看索引使用情况
```
-- 查看某张表的所有索引
SHOW INDEX FROM 表名;

-- 查看索引的统计信息(选择性)
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    COLUMN_NAME,
    CARDINALITY,
    (CARDINALITY / (SELECT COUNT(*) FROM 表名)) AS selectivity
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = '数据库名' AND TABLE_NAME = '表名';
```

选择性(Selectivity) 越高，索引效果越好。如果 CARDINALITY 远小于行数，说明该列选择性低，建索引效果不佳。
### 6.2 删除冗余索引
索引不是越多越好。冗余索引会占用磁盘空间，拖慢写入性能。
常见的冗余索引：
```
-- 冗余示例
CREATE INDEX idx_a ON table (a);
CREATE INDEX idx_a_b ON table (a, b);  -- idx_a 是冗余的，因为 idx_a_b 已经包含了 a
```
查找冗余索引的方法：
```
-- 查看所有索引，手动判断是否有冗余
SHOW INDEX FROM 表名;
```
### 6.3 重建索引
随着数据的频繁增删改，索引可能出现碎片，影响查询效率。可以通过重建索引来整理碎片。
```
-- 方法一：使用 OPTIMIZE TABLE(会锁表，请在业务低峰期执行)
OPTIMIZE TABLE 表名;

-- 方法二：先删后建(适用于大表，可结合 pt-online-schema-change 等工具)
ALTER TABLE 表名 DROP INDEX 索引名, ADD INDEX 索引名 (列名);
```
⚠️ 注意：OPTIMIZE TABLE 会锁表，生产环境请在业务低峰期执行，或使用 pt-online-schema-change 等在线工具。
### 6.4 配置最佳实践
虽然索引主要靠 SQL 管理，但以下 MySQL 配置参数与索引性能相关：
```
[mysqld]
# ===== 与索引性能相关的配置 =====

# InnoDB 缓冲池大小(影响索引缓存在内存中的命中率)
# 建议设置为物理内存的 50%~80%
innodb_buffer_pool_size = 24G

# 排序缓冲区(影响 ORDER BY 使用索引的效率)
sort_buffer_size = 2M

# 读取缓冲区(影响全表扫描时的读取效率)
read_buffer_size = 1M

# 随机读取缓冲区(影响按索引顺序读取时的效率)
read_rnd_buffer_size = 4M

# 联合查询缓冲区(影响多表 JOIN 的效率)
join_buffer_size = 2M
```
**总结：** 索引是 MySQL 查询加速的“目录”，选对字段建索引，查询速度能提升成百上千倍。
但索引不是越多越好—它占用空间、拖慢写入。建索引前先用 EXPLAIN 分析查询，建索引时遵循“最左前缀原则”，定期用 SHOW INDEX 检查冗余，才能让索引真正成为性能利器，而不是包袱。
