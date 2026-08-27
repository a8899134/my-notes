## 一、存储引擎概念
### 1.1 一个场景帮你理解
想象你开了一家餐厅：
- 菜谱(SQL 语句)：你告诉厨师要做什么菜
- 厨师(MySQL Server 层)：听懂你的要求，制定烹饪方案
- 锅碗瓢盆(存储引擎)：真正负责食材的存放、取用和烹饪方式

MySQL 的存储引擎(Storage Engine)，就是数据库里真正负责“存数据”和“取数据”的那个组件。

MySQL 有一个独特的设计—插件式存储引擎架构。也就是说，你可以根据不同的业务需求，“插拔”不同的存储引擎来负责数据的存储和读取。不同的引擎在事务支持、锁粒度、存储方式等维度存在显著差异。

### 1.2 查看当前数据库支持的存储引擎
命令：
```
SHOW ENGINES;
```
这条命令会列出当前 MySQL 服务器支持的所有存储引擎及其状态。

输出示例(关键部分)：
```
mysql> SHOW ENGINES\G
*************************** 1. row ***************************
      Engine: InnoDB
      Support: DEFAULT
      Comment: Supports transactions, row-level locking, and foreign keys
      Transactions: YES
           XA: YES
   Savepoints: YES
*************************** 2. row ***************************
      Engine: MyISAM
      Support: YES
      Comment: MyISAM storage engine
      Transactions: NO
           XA: NO
   Savepoints: NO
```
输出列的含义：
1. Engine，存储引擎的名称
2. Support，支持级别：DEFAULT(默认引擎)、YES(支持)、NO(不支持)、DISABLED(已禁用)
3. Comment，引擎的简要说明
4. Transactions，是否
5. XA，是否支持分布式事务
6. Savepoints，是否支持事务保存点
## 二、主流存储引擎介绍
### 2.1 InnoDB
InnoDB 从 MySQL 5.5 开始成为默认存储引擎,生产环境首选。

核心特征：

|特征|说明|
|---|---|
|事务支持|完整支持 ACID 事务|
|行级锁|支持行级锁，并发性能高|
|MVCC|支持多版本并发控制，实现一致性非锁定读|
|外键约束|支持外键，保证数据完整性|
|崩溃恢复|通过 Redo Log 和 Undo Log 实现崩溃恢复|
|聚簇索引|数据按主键顺序存储|

适用场景：
- 电商订单系统(需要事务和行锁)
- 金融交易系统(需要 ACID 保证)
- 高并发读写业务
- 任何对数据一致性和完整性要求高的业务

一句话总结：绝大多数业务场景，选 InnoDB 就对了。
### 2.2 MyISAM
MyISAM 是 MySQL 早期版本的默认存储，引擎读多写少的“老将”。

核心特征：

| 特征       | 说明               |
| -------- | ---------------- |
| 事务支持     | ❌ 不支持事务          |
| 表级锁      | 读写操作锁定整张表        |
| 缓存机制     | 只缓存索引，不缓存真实数据    |
| 全文索引     | 支持 FULLTEXT 全文索引 |
| 数据压缩     | 支持表压缩，节省存储空间     |
| COUNT(*) | 计数操作极快，无需扫描全表    |

适用场景：
- 日志存储系统(读多写少)
- 报表分析系统(不需要事务)
- 全文搜索场景

⚠️ 注意：MyISAM 不支持事务，写入时锁定整张表，高并发写入场景下性能会急剧下降。新项目请优先选择 InnoDB。

### 2.3 Memory
Memory 引擎将数据存储在内存中，速度最快的“临时工”。

核心特征：

|特征|说明|
|---|---|
|存储位置|全部在内存中|
|速度|极快(纯内存操作)|
|持久性|❌ 服务器重启数据全部丢失|
|事务支持|❌ 不支持|
|锁机制|表级锁|

适用场景：
- 临时表(如会话数据)
- 缓存表(数据可以丢失)
- 极速查询的字典表

⚠️ 注意：Memory 引擎的数据在 MySQL 重启后会全部丢失，不能用于存储重要业务数据。

### 2.4 其他引擎简介
| 引擎        | 简要说明                       |
| --------- | -------------------------- |
| CSV       | 以 CSV 格式存储数据，可直接用 Excel 打开 |
| ARCHIVE   | 归档引擎，支持高压缩比，适合历史数据存档       |
| BLACKHOLE | “黑洞”引擎，写入的数据直接消失，用于测试或日志复制 |
| NDB       | MySQL Cluster 专用引擎，支持分布式存储 |
| EXAMPLE   | 仅用于开发者学习编写存储引擎             |

## 三、存储引擎的配置方法
### 3.1 查看当前默认存储引擎
```
-- 查看默认存储引擎
SHOW VARIABLES LIKE 'default_storage_engine';

-- 查看所有与存储引擎相关的变量
SHOW VARIABLES LIKE '%storage_engine%';
```
### 3.2 设置默认存储引擎(全局)
1. 方法一：修改配置文件(永久生效)

在 MySQL 配置文件(/etc/my.cnf 或 /etc/mysql/my.cnf)中添加：
```
[mysqld]
default-storage-engine = InnoDB
```
修改后需要重启 MySQL 服务才能生效。

2. 方法二：动态修改(当前会话或全局)
```
-- 设置当前会话的默认存储引擎(只影响当前连接)
SET SESSION default_storage_engine = InnoDB;

-- 设置全局默认存储引擎(影响所有新连接)
SET GLOBAL default_storage_engine = InnoDB;
```

### 3.3 创建表时指定存储引擎
在建表语句末尾使用 ENGINE 关键字指定：
```
-- 创建 InnoDB 表
CREATE TABLE orders (
    id INT PRIMARY KEY,
    order_no VARCHAR(50),
    amount DECIMAL(10,2)
) ENGINE = InnoDB;

-- 创建 MyISAM 表(不推荐，仅作示例)
CREATE TABLE logs (
    id INT PRIMARY KEY,
    log_content TEXT,
    created_at DATETIME
) ENGINE = MyISAM;

-- 创建 Memory 表(临时使用)
CREATE TABLE session_cache (
    session_id VARCHAR(64) PRIMARY KEY,
    user_data TEXT
) ENGINE = MEMORY;
```
💡 如果创建表时没有指定 ENGINE，MySQL 会使用当前的默认存储引擎。

⚠️ 重要警告：
0 修改大表的存储引擎会锁表，期间该表无法读写

- 修改引擎会重建表，需要足够的磁盘空间(约等于原表大小的两倍)
- 建议在业务低峰期操作
- 从MyISAM 转为 InnoDB 后，需要调整内存配置

### 3.4 查看表的当前存储引擎
```
-- 方法一：SHOW TABLE STATUS
SHOW TABLE STATUS LIKE '表名'\G

-- 方法二：查询 INFORMATION_SCHEMA
SELECT TABLE_NAME, ENGINE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = '数据库名' AND TABLE_NAME = '表名';

-- 方法三：查看数据库中所有表的引擎
SELECT TABLE_NAME, ENGINE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = '数据库名';
```

## 四、InnoDB 核心配置参数
InnoDB 是最常用的存储引擎，下面的参数是每一个 DBA 和开发者都应该了解的核心配置。
### 4.1 缓冲池(Buffer Pool)
1.  innodb_buffer_pool_size*
这是 InnoDB最重要的内存配置参数，用于缓存表数据、索引和自适应哈希索引。

作用：数据读写优先在 Buffer Pool 中进行，减少磁盘 I/O。Buffer Pool 越大，数据在内存中的命中率越高，查询越快。

建议值：

|服务器类型|建议比例|
|---|---|
|专用数据库服务器|物理内存的 50% ~ 80%|
|云数据库实例|每 vCPU 核 2~4 GB|
|混合服务器(数据库+其他应用)|物理内存的 50% ~ 60%|

配置示例(32GB 内存的专用数据库服务器)：
```
[mysqld]
innodb_buffer_pool_size = 24G
```
运行时修改(MySQL 5.7+ 支持动态调整)：
```
SET GLOBAL innodb_buffer_pool_size = 25769803776;  -- 24GB(单位：字节)
```
监控 Buffer Pool 命中率:
```
SHOW ENGINE INNODB STATUS\G
-- 查看 "Buffer pool hit rate"，应保持在 99% 以上
```
如果命中率低于 99%，说明 Buffer Pool 太小，需要增大。

2. innodb_buffer_pool_instances

将 Buffer Pool 拆分为多个实例，减少多线程并发时的锁竞争。

建议值：
- 每个实例至少 1GB
- 建议设置为 CPU 核心数，但不超过 16

配置示例(8 核 CPU，24 GB Buffer Pool)：
```
[mysqld]
innodb_buffer_pool_instances = 8
```
### 4.2 日志系统配置
1. innodb_log_file_size

Redo Log(重做日志)单个文件的大小。

作用：Redo Log 用于崩溃恢复，保证已提交事务的数据不丢失。

建议值：
- 256MB ~ 2GB
- 日志总大小建议为 Buffer Pool 的 25% ~ 50%

配置示例：
```
[mysqld]
innodb_log_file_size = 1G
```
⚠️ Redo Log 太小会导致频繁刷盘，影响性能；太大则崩溃恢复时间变长。

2. innodb_log_files_in_group

Redo Log 文件的数量。

默认值：2

配置示例：
```
[mysqld]
innodb_log_files_in_group = 2
```
3. innodb_log_buffer_size

Redo Log 的内存缓冲区大小。

作用：事务执行过程中，修改操作先写入 Log Buffer(内存)，提交时再刷入磁盘。

建议值：
- 16MB ~ 64MB
- 如果有大批量事务，可适当增大

配置示例：
```
[mysqld]
innodb_log_buffer_size = 32M
```
4. innodb_flush_log_at_trx_commit

控制 Redo Log 的刷盘策略，直接影响事务的持久性和性能。

|值|行为|安全性|性能|
|---|---|---|---|
|1(默认)|每次事务提交都刷盘|最安全|最慢|
|2|写入 OS 缓存，每秒刷盘|较安全(OS 崩溃可能丢数据)|较快|
|0|每秒刷一次|不安全(MySQL 崩溃可能丢数据)|最快|

生产环境建议：
```
[mysqld]
innodb_flush_log_at_trx_commit = 1
```
金融、支付类系统必须用 1。如果追求极致性能且能接受丢失 1 秒数据，可考虑 2。
### 4.3 文件空间管理
1. innodb_file_per_table

控制 InnoDB 表是存储在独立表空间还是系统表空间。

|值|行为|优缺点|
|---|---|---|
|ON(默认)|每个表一个独立的 .ibd 文件|易于管理，删除表时释放磁盘空间|
|OFF|所有表存储在共享的 ibdata1 中|管理复杂，删除表不会释放空间|

强烈建议保持默认 ON：
```
[mysqld]
innodb_file_per_table = ON
```
查看当前设置：
```
SHOW VARIABLES LIKE 'innodb_file_per_table';
```
运行时修改：
```
SET GLOBAL innodb_file_per_table = ON;
```
⚠️ 修改此参数只影响之后创建的表，已有表的存储方式不会改变。

2. innodb_data_file_path

定义 InnoDB 系统表空间的数据文件。

配置示例：
```
[mysqld]
innodb_data_file_path = ibdata1:12M:autoextend
```
含义：初始大小 12MB，自动扩展。

### 4.4 并发与锁相关
1. innodb_lock_wait_timeout

事务等待行锁的超时时间(秒)。

默认值：50 秒

作用：防止一个事务长期等待锁，导致其他事务也被阻塞。

建议值：
```
[mysqld]
innodb_lock_wait_timeout = 10
```
查看当前值：
```
SHOW VARIABLES LIKE 'innodb_lock_wait_timeout';
```
2. innodb_deadlock_detect

是否启用死锁自动检测。

默认值：ON

作用： 检测到死锁时，自动回滚其中一个事务。

配置示例：
```
[mysqld]
innodb_deadlock_detect = ON
```

在高并发场景下，如果死锁频繁发生，关闭死锁检测(OFF)并依赖 innodb_lock_wait_timeout 可能提升性能，但需要谨慎评估。

### 4.5 双写缓冲
1. innodb_doublewrite

是否启用双写缓冲(Double Write Buffer)。

作用：防止数据页部分写入导致的数据损坏。

默认值：ON

建议
- 生产环境保持 ON(数据安全优先)
- 如果硬件非常可靠(如配备 UPS 的企业级 SSD)，可考虑关闭以提升性能

配置示例：
```
[mysqld]
innodb_doublewrite = ON
```

## 五、MyISAM 核心配置参数
虽然新项目建议使用 InnoDB，但如果维护老项目，以下 MyISAM 参数需要了解。
### 5.1 键缓存(Key Cache)
1. key_buffer_size

MyISAM 的索引缓存大小。

作用：MyISAM 只缓存索引，不缓存数据。这个参数控制索引缓存的大小。

建议值：
- 如果是专用 MyISAM 数据库：物理内存的 20% ~ 30%
- 如果混合使用 InnoDB：不要分配过大，留给 InnoDB Buffer Pool

配置示例：
```
[mysqld]
key_buffer_size = 512M
```

### 5.2 MyISAM 恢复选项
1. myisam_recover_options

控制 MyISAM 表的自动恢复行为。

配置示例：
```
[mysqld]
myisam_recover_options = FORCE
```

从 MyISAM 迁移到 InnoDB 时，记得降低 key_buffer_size，增大 innodb_buffer_pool_size。

## 六、配置最佳实践总结
### 6.1 新项目配置模板
```
[mysqld]
# ===== 存储引擎 =====
default-storage-engine = InnoDB

# ===== InnoDB 缓冲池(最重要) =====
# 专用数据库服务器：物理内存的 50%~80%
innodb_buffer_pool_size = 24G

# 缓冲池实例数(建议 = CPU 核心数，不超过 16)
innodb_buffer_pool_instances = 8

# ===== InnoDB 日志 =====
innodb_log_file_size = 1G
innodb_log_files_in_group = 2
innodb_log_buffer_size = 32M
innodb_flush_log_at_trx_commit = 1

# ===== InnoDB 文件空间 =====
innodb_file_per_table = ON

# ===== InnoDB 锁 =====
innodb_lock_wait_timeout = 10
innodb_deadlock_detect = ON

# ===== InnoDB 双写缓冲 =====
innodb_doublewrite = ON
```

### 6.2 存储引擎选择决策表
| 业务场景   | 推荐引擎    | 理由            |
| ------ | ------- | ------------- |
| 电商订单系统 | InnoDB  | 需要事务、行锁、外键    |
| 金融交易系统 | InnoDB  | 需要 ACID 保证    |
| 用户账户系统 | InnoDB  | 高并发读写         |
| 日志存储   | MyISAM  | 读多写少，不需要事务    |
| 历史数据归档 | ARCHIVE | 高压缩比，节省空间     |
| 临时缓存表  | MEMORY  | 极速读写，数据可丢失    |
| 不确定选什么 | InnoDB  | 默认选择，适用绝大多数场景 |

**总结:** InnoDB 是 MySQL 的默认引擎，支持事务、行锁和崩溃恢复，适用于绝大多数业务场景。MyISAM 不支持事务，只有读多写少的场景才考虑使用。Buffer Pool(innodb_buffer_pool_size)是 InnoDB 最重要的配置参数，建议设置为物理内存的 50%~80%。