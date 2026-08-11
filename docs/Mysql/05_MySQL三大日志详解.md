## 一、三大日志的作用
### 1.1 一个场景引出问题
假设你执行了一条更新语句：
```
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
```
这条语句执行过程中，可能发生各种意外：
- 执行到一半数据库崩溃了
- 事务需要回滚
- 主从复制需要同步数据
- 数据被误删需要恢复
MySQL 用三种不同的日志来应对这些不同的问题：

|日志|全称|核心职责|归属层|
|---|---|---|---|
|redo log|重做日志|崩溃恢复，保证事务持久性|InnoDB 存储引擎层|
|undo log|回滚日志|事务回滚 + MVCC，保证事务原子性和隔离性|InnoDB 存储引擎层|
|binlog|二进制日志|主从复制 + 数据恢复|MySQL Server 层|
### 1.2 本文路线图
```
MySQL 三大日志
    │
    ├── 一、概述 → 三种日志各管什么事
    │
    ├── 二、redo log → 崩溃恢复 + 写满冻结风险
    │
    ├── 三、undo log → 事务回滚 + 空间膨胀风险
    │
    ├── 四、binlog → 主从复制 + 磁盘管理
    │
    ├── 五、三者协作 → 两阶段提交
    │
    └── 六、附录 → 命令速查 + 故障应对
```

## 二、redo log(重做日志)
### 2.1 核心作用

redo log 是 InnoDB 存储引擎独有的日志，它的核心作用是保证事务的持久性(Durability)。

事务提交后，数据可能还在内存里没来得及写进磁盘。此时数据库突然宕机，重启后 MySQL 依靠 redo log 把已提交但未落盘的事务重做一遍，确保数据不丢。
### 2.2 Redo log 文件路径
```
SHOW VARIABLES LIKE 'innodb_log_group_home_dir';
```
- 如果返回 ./，表示 Redo Log 文件就在数据目录下。
- 文件名通常是 ib_logfile0、ib_logfile1……(MySQL 8.0.30 之前)。
- MySQL 8.0.30 及之后，Redo Log 存储在 datadir/#innodb_redo/ 下，由 #ib_redoN 命名的一系列文件组成。

**查看数据目录位置**
```
SHOW VARIABLES LIKE 'datadir';
```
**典型路径示例**：
- Linux：/var/lib/mysql/
- Redo Log 文件名：ib_logfile0、ib_logfile1

💡 Redo Log 文件是二进制格式，直接用 cat 或文本编辑器打开看到的是乱码。

**相关配置参数**
- innodb_log_group_home_dir，Redo Log 文件所在目录
- innodb_log_files_in_group，Redo Log 文件个数，默认 2 个
- innodb_log_file_size，单个 Redo Log 文件大小，默认 48 MB
### 2.3 redo log 的WAL 机制
数据库的读写速度瓶颈在磁盘 I/O。如果每次修改都立刻写磁盘，性能会极差。
InnoDB 的解决方案是 WAL(Write-Ahead Logging，预写日志) ：

先写日志，后写数据。修改数据时，先把改动记录到 redo log(顺序写，很快)，等合适的时候再把数据页刷到磁盘(随机写，较慢)。
- redo log 是顺序追加写入，比随机写磁盘快得多
- 即使数据页还没刷盘，只要 redo log 已经持久化，数据就不会丢
### 2.4 redo log 的核心特征
| 特征        | 说明                                 |
| --------- | ---------------------------------- |
| 物理日志      | 记录的是“在某个数据页的哪个位置做了什么修改”            |
| 循环写       | redo log 文件是固定大小的，写满后覆盖最旧的部分(循环使用) |
| InnoDB 专属 | 只有 InnoDB 引擎有，MyISAM 没有            |
### 2.5 写入流程
1. 事务执行过程中，修改操作先写入 redo log buffer(内存)
2. 事务提交时，redo log buffer 的内容刷盘到 redo log 文件(磁盘)
3. 后台线程择机将脏页(Buffer Pool 中被修改过的数据页)刷到数据文件
4. 如果数据库崩溃重启，扫描 redo log，把已提交但未刷盘的事务重做一遍
### 2.6 Redo Log 写满会导致数据库“冻结”
**现象：** 当 redo log 文件写满时，InnoDB 会进入强制刷脏页模式，所有写操作(UPDATE、INSERT、DELETE)都会被阻塞，数据库看起来像“卡死”了。

**原因**：redo log 是循环写入的。当 write pos(写指针)追上 checkpoint(检查点，即已刷盘的最早位置)时，说明所有可用空间都被未刷盘的脏页日志占满了。此时必须等待后台线程将脏页刷入磁盘、推进 checkpoint，才能释放空间继续写入
—这个过程叫 flush 风暴。

**后果**：
- 所有写操作被阻塞，应用超时
- 读操作不受影响(但大量连接堆积会拖垮整体响应)
- 严重时可能导致数据库连接池耗尽、服务不可用

**解决与预防**：

| 措施               | 说明                                                                            |
| ---------------- | ----------------------------------------------------------------------------- |
| 合理设置 redo log 大小 | 日志越大，能容纳的脏页日志越多，越不易写满。建议 4 GB ~ 16 GB(MySQL 8.0.30+ 使用 innodbredologcapacity) |
| 监控使用率            | 监控 Innodbredologcheckpointlsn 与 Innodbredologcurrent_lsn 的差值，接近容量阈值时预警        |
| 优化大事务            | 大事务会产生大量 redo 日志，拆分批量操作为多个小事务                                                 |
| 调整刷盘频率           | 增加刷脏页的并发度，但需平衡 I/O 负载                                                         |
```
-- MySQL 8.0.30+ 查看 redo log 容量
SHOW VARIABLES LIKE 'innodb_redo_log_capacity';

-- 查看 redo log 使用状态(MySQL 8.0.30+)
SHOW ENGINE INNODB STATUS\G
-- 重点关注 Log 部分：Log sequence number、Last checkpoint at

-- 查看刷脏页相关配置
SHOW VARIABLES LIKE 'innodb_io_capacity%';
SHOW VARIABLES LIKE 'innodb_max_dirty_pages_pct';

```

## 三、undo log(回滚日志)
### 3.1 核心作用
undo log 也是 InnoDB 存储引擎独有的，它的核心作用有两个：
1. 事务回滚：事务执行失败时，把数据恢复到修改前的状态
2. MVCC(多版本并发控制)：为读操作提供数据的历史版本
### 3.2 undo log 文件路径
Undo Log 的位置在不同 MySQL 版本中差异较大。
1. MySQL 8.0(推荐方式)
MySQL 8.0 默认使用独立的 Undo 表空间，而不是跟共享表空间 ibdata1 混在一起。
```
-- 查看 Undo 表空间文件列表
SELECT TABLESPACE_NAME, FILE_NAME 
FROM INFORMATION_SCHEMA.FILES 
WHERE FILE_TYPE = 'UNDO LOG';
```
或者直接查看 Undo 目录：
```
SHOW VARIABLES LIKE 'innodb_undo_directory';
```
如果返回空值，表示 Undo 文件就在数据目录下。
文件命名通常为：undo_001、undo_002……

2. MySQL 5.7 及之前

MySQL 5.7 默认将 Undo Log 存储在共享表空间 ibdata1 中，而不是独立的文件。这意味着你无法在文件系统里直接看到独立的 undo_xxx 文件，它们都被打包在 ibdata1 里了。
```
-- 查看数据目录(Undo Log 在 ibdata1 里)
SHOW VARIABLES LIKE 'datadir';
```
**典型路径示例**：
- Linux：/var/lib/mysql/ibdata1(共享表空间，包含 Undo Log)
- MySQL 8.0 独立 Undo：/var/lib/mysql/undo_001

💡 MySQL 8.0 默认生成两个 10MB 的 Undo 表空间文件，支持动态扩容和收缩。
### 3.3 记录内容
undo log 记录的是数据被修改前的旧值。

|操作类型|undo log 记录的内容|
|---|---|
| INSERT |记录主键值，回滚时执行 DELETE |
| DELETE |记录完整行数据，回滚时执行 INSERT |
| UPDATE |记录修改前的旧值，回滚时改回去|
### 3.4 MVCC 实现
InnoDB 中，每条记录都有两个隐藏字段：
1. trx_id，最后一次修改该记录的事务 ID
2. roll_pointer，指向该记录上一个版本的 undo log

同一条记录的多次修改，通过 roll_pointer 串成一个版本链。

当一个长事务需要读取某个时间点的数据快照时，InnoDB 沿着这个版本链找到对应的历史版本—这是 MVCC 的实现基础。

### 3.5 长事务导致 Undo 空间膨胀
**现象：** 磁盘使用率持续上升，undo log 占用了大量空间，极端情况下可撑爆磁盘。

**原因**：
- undo log 在事务提交后不会立即删除
- 如果存在长事务(一直未提交)，该事务启动时看到的所有历史版本都必须保留—因为长事务随时可能读取这些版本
- 长事务持续的时间越长，它“需要”的历史版本就越多，undo log 越积越多
- 即使事务提交后，Purge 线程清理也需要时间，如果清理速度跟不上生成速度，空间持续膨胀

**后果**：
- 磁盘空间耗尽，数据库无法写入
- 实例只读，业务停摆

**解决与预防**：

| 措施          | 说明                                               |
| ----------- | ------------------------------------------------ |
| 监控长事务       | 定期检查 INFORMATIONSCHEMA.INNODBTRX，发现长时间未提交的事务及时处理 |
| 设置超时        | 配置 innodbrollbackon_timeout 或应用层设置事务超时           |
| 拆分大事务       | 大批量操作拆分为多个小事务，减少单个事务的 undo 量                     |
| 监控 Undo 表空间 | MySQL 8.0 支持独立的 undo 表空间，可单独监控和回收                |
| 优化应用代码      | 确保事务及时提交(尤其注意 try-catch 中遗漏 commit 的场景)          |
```
-- 查看当前正在运行的事务(重点关注 TIME 列)
SELECT trx_id, trx_state, trx_started, trx_mysql_thread_id, 
       TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS seconds_running,
       trx_rows_locked, trx_rows_modified
FROM INFORMATION_SCHEMA.INNODB_TRX
ORDER BY seconds_running DESC;

-- 查看 undo 表空间大小(MySQL 8.0)
SELECT * FROM INFORMATION_SCHEMA.INNODB_TABLESPACES
WHERE NAME LIKE '%undo%';

-- 配置 undo 表空间自动回收
SHOW VARIABLES LIKE 'innodb_undo_log_truncate';
SHOW VARIABLES LIKE 'innodb_max_undo_log_size';  -- 超过此值触发 truncate
```

## 四、binlog(二进制日志)
### 4.1 核心作用
binlog 是 MySQL Server 层的日志，所有存储引擎都能用。它的核心作用有两个：
1. 主从复制：主库把 binlog 发给从库，从库重放这些操作，实现数据同步
2. 数据恢复：通过 binlog 做增量恢复(point-in-time recovery)
### 4.2 bin log 文件路径
Binlog 默认也在 MySQL 的数据目录下。
```
-- 查看 binlog 的完整路径(含文件名前缀)
SHOW VARIABLES LIKE 'log_bin_basename';
```
这条命令会返回 binlog 文件的完整基名，比如 /var/lib/mysql/mysql-bin，实际的 binlog 文件就是 mysql-bin.000001、mysql-bin.000002……。
```
-- 查看所有 binlog 配置文件
SHOW VARIABLES LIKE '%log_bin%';
```

```
-- 查看当前正在使用的 binlog 文件
SHOW MASTER STATUS;
```
这会显示当前 binlog 文件名和写入位置。
```
-- 查看所有 binlog 文件列表
SHOW BINARY LOGS;
```
这会列出所有 binlog 文件及其大小。

**典型路径示例**：
- Linux：/var/lib/mysql/mysql-bin.000001
- 文件命名：主机名-bin.序列号(如 ubuntu-bin.000001)

**相关配置参数**
- log_bin_basename，binlog 文件的完整基名(路径 + 前缀)
- log_bin_index，binlog 索引文件路径，记录所有 binlog 文件列表
### 4.3 记录内容
binlog 记录的是所有对数据库有更改的操作(INSERT、UPDATE、DELETE、DDL 等)，不记录 SELECT 和 SHOW 这类只读操作。

它是逻辑日志—记录的是“做了什么操作”，而不是数据页的物理变化。

|日志|记录方式|示例|
|---|---|---|
|redo log|物理：数据页偏移量 + 修改值| page 5 offset 1024: 17 → 18 |
|binlog|逻辑：操作语句或行变化| UPDATE users SET age=18 WHERE id=1 |
### 4.4 binlog 的三种格式
| 格式        | 说明                   | 适用场景                             |
| --------- | -------------------- | -------------------------------- |
| STATEMENT | 记录执行的 SQL 语句原文       | 日志量小，但非确定性语句(如 `NOW()`)可能造成主从不一致 |
| ROW(默认)   | 记录每一行数据的变化           | 最安全，主从一致性好，日志量较大                 |
| MIXED     | 自动切换 STATEMENT 和 ROW | 兼顾两者，但逻辑复杂                       |

生产环境推荐 ROW 格式。
### 4.5 磁盘空间耗尽
**现象**：binlog 文件持续累积，磁盘使用率达到 100%，数据库无法写入。

**原因**：
- binlog 是追加写入的，不会像 redo log 那样循环覆盖
- 如果 expire_logs_days / binlog_expire_logs_seconds 未配置或配置过大
- 主从复制异常时，从库未同步的 binlog 不会被清理

**解决与预防**：

|措施|说明|
|---|---|
|设置合理过期时间|MySQL 8.0 使用 binlogexpirelogsseconds，建议 604800(7 天)|
|配置最大文件大小| maxbinlog_size 设置单个文件上限(默认 1 GB)|
|监控磁盘使用率|设置阈值告警(如 80% 告警，90% 紧急)|
|监控从库复制状态|复制延迟过大或停止会导致 binlog 积压，无法被清理|
|定期手动清理| PURGE BINARY LOGS BEFORE NOW() - INTERVAL 7 DAY; |
```
-- 查看 binlog 保留策略
SHOW VARIABLES LIKE 'binlog_expire_logs_seconds';  -- MySQL 8.0
SHOW VARIABLES LIKE 'expire_logs_days';            -- MySQL 5.7

-- 查看所有 binlog 文件列表及大小
SHOW BINARY LOGS;

-- 手动清理 7 天前的 binlog
PURGE BINARY LOGS BEFORE NOW() - INTERVAL 7 DAY;

-- 清理到指定文件之前(不包含该文件)
PURGE BINARY LOGS TO 'mysql-bin.000123';

-- 刷新 binlog(切出一个新文件)
FLUSH LOGS;
```
### 4.6 写入机制
binlog 的写入分为两步：
1. 事务执行过程中，binlog 记录先写入 binlog cache(内存，每个事务独立)
2. 事务提交时，binlog cache 的内容一次性追加写入 binlog 文件
```
-- 查看 binlog cache 大小
SHOW VARIABLES LIKE 'binlog_cache_size';

-- 查看 binlog 是否开启
SHOW VARIABLES LIKE 'log_bin%';

-- 查看当前正在写入的 binlog 位置(主从复制中常用)
SHOW MASTER STATUS;
```

## 五、三者协作：两阶段提交
### 5.1 为什么需要两阶段提交
redo log 和 binlog 是两个独立的日志系统：
- redo log 属于 InnoDB 存储引擎
- binlog 属于 MySQL Server 层
如果在事务提交过程中，redo log 写成功了但 binlog 写失败了(或者反过来)，就会出现主从数据不一致的问题—从库可能缺少某些数据，或者多出某些数据。
两阶段提交(2PC，Two-Phase Commit) 就是用来保证这两个日志逻辑上一致的机制。
### 5.2 两阶段提交的流程
以一条 UPDATE 语句为例：
```
阶段一(Prepare 准备阶段)：
  ├── 1. 执行 UPDATE，修改 Buffer Pool 中的数据页(标记为脏页)
  ├── 2. 写入 undo log(记录修改前的旧值)
  ├── 3. 写入 redo log(记录修改操作)，状态标记为 prepare
  └── 4. redo log 刷盘

阶段二(Commit 提交阶段)：
  ├── 5. 写入 binlog，并刷盘
  ├── 6. 将 redo log 的状态从 prepare 改为 commit
  └── 7. 事务提交完成，返回客户端成功
```
### 5.3 崩溃恢复时的处理逻辑
如果在两阶段提交的不同时刻发生崩溃，MySQL 的恢复逻辑如下：

|崩溃时刻|redo log 状态|binlog 状态|恢复策略|
|---|---|---|---|
|步骤 4 之前|无记录|无记录|事务回滚(事务未完成)|
|步骤 4 之后、步骤 5 之前|prepare，已刷盘|未写入|事务回滚(binlog 无记录，主从不一致风险)|
|步骤 5 之后、步骤 6 之前|prepare，已刷盘|已写入|事务提交(binlog 已存在，重做 redo log)|
|步骤 6 之后|commit|已写入|事务提交(正常完成)|

核心原则：只要 binlog 写了，redo log 就一定提交；只要 redo log 没提交(或 prepare 但无对应 binlog)，事务就一定回滚。

这套机制保证了主从数据最终一致。

## 六、实例解析
### 6.1 实例
1. 时间 10:00:00，张三去查询银行余额，发现有 100 元
2. 时间 10:02:00，张三准备取 20 元，然后已经输入 20 元了，但是还没点确认提取，这时候因为有事情暂停了 2 分钟。
3. 时间 10:03:00,  李四来查询张三的银行卡余额，这时候余额
4. 时间 10:05:00,  这时候张三处理完事情了，现在直接点提取,然后页面在旋转
5. 时间 10:06:00,  这时候经过一分钟，页面弹出提示说提取成功 20 元，现在卡内变成 80 元。
### 6.2 时间线拆解
1. 10:00:00 — 张三查询余额(纯读取)

**操作**：`SELECT balance FROM accounts WHERE id = 1;`

实际发生了什么：

- Buffer Pool：查询该行数据，命中则直接返回 100，未命中则从硬盘加载到 Buffer Pool 再返回。
- 硬盘上的日志文件：没有任何写入(SELECT 不产生 redo/undo/binlog)。

|位置|状态|
|---|---|
|Buffer Pool(数据库服务器内存)|有张三的数据页，balance = 100|
|Redo Log Buffer(数据库服务器内存)|无变化|
|Undo Log(硬盘)|无变化|
|Binlog(硬盘)|无变化|
|硬盘数据文件(.ibd)|balance = 100|
2. 10:02:00 ~ 10:05:00 — 输入金额(纯前端操作)

**操作**：张三在页面上输入“20”，因事暂停。

实际发生了什么：

- 键盘敲击只触发了浏览器 JavaScript 的输入事件，比如检查是不是数字、有没有超过余额(如果前端做了校验)。
- 网络请求没发出去，MySQL 服务器什么都没收到。
- Buffer Pool、Redo Log Buffer、Undo、Binlog 全无变化。

3. 10:03:00 — 李四查询余额

**操作**：李四执行 `SELECT balance FROM accounts WHERE id = 1;`

实际发生了什么：

- MySQL 的 Server 层把请求转交给 InnoDB 存储引擎。InnoDB 拿到请求后，第一站永远是 Buffer Pool(数据库服务器内存)。
-  因为 10:00 时张三查过，这行数据早已加载进 Buffer Pool，所以瞬间命中。
- InnoDB 检查该行数据的 trx_id(事务 ID)，发现没有任何活跃事务在修改它，也没有锁。

4. 10:05:00 — 点击“确认提取”(关键分水岭)

**操作**：张三点击按钮，后端服务组装出 SQL 发给 MySQL：`UPDATE accounts SET balance = balance - 20 WHERE id = 1;`

这一刻，才是 MySQL 所有日志开始工作的起点！

**第 1 毫秒：数据修改(内存操作)**

| 动作                  | 位置         | 说明                                                                                    |
| ------------------- | ---------- | ------------------------------------------------------------------------------------- |
| ① 写 Undo Log        | 硬盘         | 将旧值 100 写入 Undo 表空间，用于回滚和 MVCC。必须立即落盘，不能丢。                                            |
| ② 修改 Buffer Pool    | 内存(数据库服务器) | 在 Buffer Pool 中把 balance 从 100 改为 80。                                                 |
| ③ 写 Redo Log Buffer | 内存(数据库服务器) | 在 Redo Log Buffer 中记下草稿：“在 5 号数据页偏移量 1024 处，把 100 改成 80”。此时没有 prepare/commit 标记，只是草稿。 |

此时的状态：

| 位置                        | 内容                |
| ------------------------- | ----------------- |
| Buffer Pool(内存)           | balance = 80(已修改) |
| Redo Log Buffer(内存)       | 有“改 80”的草稿        |
| Undo Log(硬盘)              | 有旧值 100           |
| 硬盘数据文件(.ibd)              | 还是 100(没动过)       |
| Binlog(硬盘)                | 还没写               |
| Redo Log 硬盘文件(ib_logfile) | 还没写(草稿还在内存)       |

**第 2 毫秒：点击提交(两阶段提交开始)**

**操作**：应用程序调用 `COMMIT`，触发两阶段提交。


| 步骤  | 动作                  | 位置                | 说明                                                                         |
| --- | ------------------- | ----------------- | -------------------------------------------------------------------------- |
| ④   | Redo Log 写入 prepare | 硬盘(iblogfile)     | 将内存中的 Redo Log Buffer 强制刷入硬盘文件，状态标记为 prepare。                              |
| ⑤   | Server 层生成 Binlog   | 内存(Binlog Cache)  | 生成逻辑日志记录(UPDATE accounts SET balance=80 WHERE id=1)，先写入线程私有的 Binlog Cache。 |
| ⑥   | Binlog 强制落盘         | 硬盘(mysql-bin.xxx) | 将 Binlog Cache 刷入硬盘。这一步完成后，Binlog 里永久有了这条记录。                               |
| ⑦   | Redo Log 改为 commit  | 硬盘(iblogfile)     | Binlog 落盘成功后，将 Redo Log 的状态从 prepare 改为 commit。                            |
5. 10:05:00 ~ 10:06:00 — 页面旋转(后台异步工作)

**操作**：MySQL 已向客户端返回“提交成功”，页面正在旋转等待响应返回。

**此时**：

- MySQL 已经返回成功给应用服务器，应用服务器开始渲染“提取成功”页面。
- 但硬盘上的数据文件(.ibd)依然是 100 元。
- 后台的 Page Cleaner 线程会在系统空闲时，异步将 Buffer Pool 中的脏页(80)刷入硬盘数据文件。
也就是说，在 10:06:00 页面显示“提取成功”的那一刻，硬盘上的数据文件可能还是 100 元。但这没关系—如果此时数据库崩溃，重启后 MySQL 会通过 Redo Log(commit 状态)把 80 重做一遍，数据不会丢。

6. 10:06:00 — 页面提示成功(客户端反馈)

**操作**：页面显示“提取成功 20 元，余额 80 元”。

数据库侧：
- 提交已完成，Redo Log 和 Binlog 都已落盘。
- 数据页(80)可能仍待在 Buffer Pool 里，等待后台刷盘。
- Undo Log 中的旧值 100 还在，要等所有可能读取它的事务结束后，Purge 线程才会清理。
### 6.3 各时间点的内存 vs 硬盘状态
| 时间点                | Buffer Pool(内存) | Redo Log Buffer(内存) | Redo Log 文件(硬盘) | Undo Log(硬盘)             | Binlog(硬盘) | 数据文件(硬盘) |
| ------------------ | --------------- | ------------------- | --------------- | ------------------------ | ---------- | -------- |
| 10:00 查询           | 100(加载)         | 无变化                 | 无变化             | 无变化                      | 无变化        | 100      |
| 10:02 输入金额         | 无变化             | 无变化                 | 无变化             | 无变化                      | 无变化        | 100      |
| 10:03 李四查询         | 100             | 无变化                 | 无变化             | 无变化                      | 无变化        | 100      |
| 10:05 修改数据(提交前)    | 80(内存修改)        | 有草稿(内存)             | 无               | 100(已落盘)                 | 无          | 100      |
| 10:05 提交(prepare)  | 80              | 已清空                 | prepare         | 100                      | 无          | 100      |
| 10:05 提交(binlog落盘) | 80              | 已清空                 | prepare         | 100                      | 有 UPDATE   | 100      |
| 10:05 提交(改为commit) | 80              | 已清空                 | commit          | 100                      | 有 UPDATE   | 100      |
| 10:06 返回成功         | 80(等待刷盘)        | 已清空                 | commit          | 100(等待 Purge 线程判断是否可以清理) | 有 UPDATE   | 可能还是 100 |

### 6.4 时间线串起全部日志
```
10:00:00  张三查询 → Buffer Pool 加载 100，无日志写入
10:02:00  输入 20 → 纯前端操作，MySQL 毫不知情
10:03:00  李四查询 → 读到 100(张三事务未开始)
10:05:00  点击确认 → 日志全部激活
    ├── 写 Undo Log(硬盘)：旧值 100 永久保存
    ├── 修改 Buffer Pool(内存)：100 → 80
    ├── 写 Redo Log Buffer(内存)：草稿“改 80”
    ├── 点击提交
    │   ├── Redo Log(硬盘)：prepare 标记落盘
    │   ├── Binlog(硬盘)：UPDATE 记录落盘
    │   └── Redo Log(硬盘)：prepare → commit
    └── 数据页(80)留在内存，等待后台异步刷盘
10:06:00  返回成功 → 硬盘数据文件可能仍是 100
```

## 七、总结
### 7.1 三种日志对比
| 对比维度    | redo log     | undo log       | binlog         |
| ------- | ------------ | -------------- | -------------- |
| 所属层     | InnoDB 存储引擎层 | InnoDB 存储引擎层   | MySQL Server 层 |
| 日志类型    | 物理日志(数据页修改)  | 逻辑日志(修改前旧值)    | 逻辑日志(操作语句/行变化) |
| 核心作用    | 崩溃恢复 / 持久性   | 事务回滚 + MVCC    | 主从复制 + 数据恢复    |
| 写入方式    | 事务执行过程中持续写   | 事务执行过程中持续写     | 事务提交时一次性写      |
| 文件管理    | 固定大小，循环写     | 动态增长，Purge 清理  | 追加写，按过期时间清理    |
| ACID 对应 | 持久性(D)       | 原子性(A)+ 隔离性(I) | 无(复制和恢复)       |
### 7.2 关键风险与应对速查
| 风险          | 原因           | 应对                                          |
| ----------- | ------------ | ------------------------------------------- |
| Redo log 写满 | 日志过小或刷脏页太慢   | 调大容量；监控使用率；拆分大事务                            |
| Undo 空间膨胀   | 长事务持续未提交     | 监控 `INNODB_TRX`；设置事务超时；优化代码确保及时提交           |
| Binlog 撑爆磁盘 | 过期时间未设置或复制异常 | 设置 `binlog_expire_logs_seconds`；监控从库状态；定期清理 |
### 7.3 常用命令速查
| 操作                      | 命令                                                                              |
| ----------------------- | ------------------------------------------------------------------------------- |
| 查看 redo log 容量(8.0.30+) | `SHOW VARIABLES LIKE 'innodb_redo_log_capacity';`                               |
| 查看刷盘策略                  | `SHOW VARIABLES LIKE 'innodb_flush_log_at_trx_commit';`                         |
| 查看当前运行的事务               | `SELECT * FROM INFORMATION_SCHEMA.INNODB_TRX\G`                                 |
| 查看 undo 表空间大小           | `SELECT * FROM INFORMATION_SCHEMA.INNODB_TABLESPACES WHERE NAME LIKE '%undo%';` |
| 查看 binlog 是否开启          | `SHOW VARIABLES LIKE 'log_bin%';`                                               |
| 查看所有 binlog 文件          | `SHOW BINARY LOGS;`                                                             |
| 查看当前 binlog 位置          | `SHOW MASTER STATUS;`                                                           |
| 清理 7 天前 binlog          | `PURGE BINARY LOGS BEFORE NOW() - INTERVAL 7 DAY;`                              |
| 查看 InnoDB 整体状态          | `SHOW ENGINE INNODB STATUS\G`                                                   |
### 7.4 配置最佳实践
```
[mysqld]
# ===== redo log =====
# MySQL 8.0.30+
innodb_redo_log_capacity = 8G

# 每次提交都刷盘(最安全)
innodb_flush_log_at_trx_commit = 1

# ===== undo log =====
# 启用 undo 表空间自动回收
innodb_undo_log_truncate = ON
innodb_max_undo_log_size = 2G

# ===== binlog =====
# MySQL 8.0 推荐
#log_bin_basename = /var/log/mysql/mysql-bin
# 或保持旧版本写法(兼容)
log_bin = /var/log/mysql/mysql-bin.log
binlog_format = ROW
binlog_expire_logs_seconds = 604800   # 7 天
max_binlog_size = 1G
binlog_cache_size = 32K
sync_binlog = 1                        # 每次提交都刷盘
```
