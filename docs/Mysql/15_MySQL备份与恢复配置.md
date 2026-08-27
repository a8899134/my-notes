## 一、备份概述
### 1.1 备份作用
数据是企业业务的核心资产，MySQL 备份与恢复体系是数据安全的最后一道防线。面对以下风险，没有备份就意味着数据永久丢失：

| 风险类型  | 典型场景                        |
| ----- | --------------------------- |
| 人为误操作 | 执行 DELETE 不带 WHERE、误 DROP 表 |
| 硬件故障  | 磁盘损坏、服务器宕机                  |
| 软件缺陷  | Bug 导致数据损坏、升级失败             |
| 安全攻击  | 勒索病毒、SQL 注入删库               |
| 机房灾难  | 火灾、断电、网络中断                  |

## 二、备份类型
MySQL 备份可以从两个维度进行分类：一类是备份范围，有全量备份跟增量备份。另外一类是按实现方式，又区别为逻辑备份跟物理备份。
### 2.1 全量备份 vs 增量备份

| 备份类型 | 定义                | 特点                     |
| ---- | ----------------- | ---------------------- |
| 全量备份 | 在某个时间点生成完整的数据快照   | 恢复链路最短，但备份体积大、耗时久      |
| 增量备份 | 仅备份上次备份后发生变化的数据   | 备份体积小、速度快，但恢复需依赖完整备份链路 |
| 差异备份 | 仅备份上次全量备份后发生变化的数据 | 恢复仅需全量+最新差异备份，链路风险低    |

增量备份的核心依赖 InnoDB 的 LSN(日志序列号，Log Sequence Number)，这是一个单调递增的 64 位整数，标记每个数据页的最后修改时间。增量备份时，仅备份 LSN 大于上次备份结束 LSN 的数据页即可。
### 2.2 逻辑备份 vs 物理备份

| 对比维度   | 逻辑备份                        | 物理备份                           |
| ------ | --------------------------- | ------------------------------ |
| 备份内容   | SQL 语句(CREATE、INSERT 等)     | 物理文件(.ibd、ibdata1 等)           |
| 典型工具   | mysqldump、mydumper          | Percona XtraBackup、mysqlbackup |
| 备份速度   | 慢(逐行读取转换)                   | 快(直接复制文件)                      |
| 恢复速度   | 慢(逐条执行 SQL，30-60 分钟)        | 快(直接拷贝文件，15 分钟内)               |
| 可移植性   | 高(跨版本、跨平台)                  | 低(版本和平台需一致)                    |
| 文件大小   | 较小(10 G 以内)                 | 较大(大于 10 G 标配)                 |
| 是否影响业务 | 使用 --single-transaction 可热备 | 支持热备(InnoDB)                   |

选择建议：
- 数据量小(几 GB 以内)、需要跨版本迁移 → 逻辑备份
- 数据量大(几十 GB 以上)、需要快速恢复 → 物理备份
- 生产环境推荐：逻辑备份 + 物理备份 组合使用

## 三、逻辑备份：mysqldump
mysqldump 是 MySQL 官方提供的逻辑备份工具，它将数据库的结构定义和数据内容导出为 SQL 语句。
### 3.1 备份命令
3.1.1 备份单个数据库
```
mysqldump -u 用户名 -p 数据库名 > 备份文件.sql
```
示例：
```
mysqldump -u root -p mydb > /backup/mydb_2026-07-21.sql
```
命令解释：
- u：指定数据库用户名
- p：提示输入密码(密码直接跟在 -p 后面不加空格也能用，但不安全)
- 数据库名：要备份的数据库名称
- 备份文件建议包含日期，便于管理

#### 3.1.2 备份多个数据库
```
mysqldump -u 用户名 -p --databases 库1 库2 > 备份文件.sql
```
示例：
```
mysqldump -u root -p --databases mydb1 mydb2 > /backup/mydbs.sql
```
#### 3.1.3 备份所有数据库
```
mysqldump -u 用户名 -p --all-databases > 备份文件.sql
```
示例：
```
mysqldump -u root -p --all-databases > /backup/all_$(date +%F).sql
```
`$(date +%F)` 会自动替换为当前日期(如 2026-07-21)。
#### 3.1.4 备份指定表
```
mysqldump -u 用户名 -p 数据库名 表名 > 备份文件.sql
```
示例：
```
mysqldump -u root -p mydb users > /backup/mydb_users.sql
```
### 3.2 恢复命令
#### 3.2.1 恢复单个数据库
```
mysql -u 用户名 -p 数据库名 < 备份文件.sql
```
示例：
```
mysql -u root -p mydb < /backup/mydb_2026-07-21.sql
```
#### 3.2.2 恢复所有数据库
```
mysql -u 用户名 -p < 备份文件.sql
```
示例：
```
mysql -u root -p < /backup/all_2026-07-21.sql
```
#### 3.2.3 目标数据库不存在时先创建再恢复
```
mysql -u 用户名 -p -e "CREATE DATABASE 新库名;"
mysql -u 用户名 -p 新库名 < 备份文件.sql
```
示例：
```
mysql -u root -p -e "CREATE DATABASE newdb;"
mysql -u root -p newdb < /backup/mydb.sql
```
⚠️ 注意：如果备份单个数据库时没有使用 --databases 参数，备份文件中不包含 CREATE DATABASE 语句，恢复前需要先手动创建目标数据库。
### 3.3 常用参数说明
| 参数                     | 作用                      | 示例                     |
| ---------------------- | ----------------------- | ---------------------- |
| `--databases`          | 备份指定的一个或多个数据库           | `--databases db1 db2`  |
| `--all-databases`      | 备份所有数据库                 | `--all-databases`      |
| `--single-transaction` | 使用事务保证一致性，适用于 InnoDB 热备 | `--single-transaction` |
| `--routines` / `-R`    | 备份存储过程和函数               | `--routines`           |
| `--triggers`           | 备份触发器(默认开启)             | `--triggers`           |
| `--events`             | 备份事件调度器                 | `--events`             |
| `--master-data`        | 记录备份时的 Binlog 位置，用于搭建从库 | `--master-data=2`      |
| `--compress`           | 备份时压缩                   | `--compress`           |
| `--where`              | 按条件备份部分数据               | `--where="id>100"`     |
| `--no-data`            | 只备份表结构，不备份数据            | `--no-data`            |
| `--no-create-info`     | 只备份数据，不备份表结构            | `--no-create-info`     |
### 3.4 生产环境推荐命令
自己可以选择符合自身情况进行参数修改，这只是参考。
```
mysqldump -u root -p --single-transaction --routines --triggers --events \
  --master-data=2 --all-databases | gzip > /backup/all_$(date +%F).sql.gz
```

## 四、物理备份：Percona XtraBackup
Percona XtraBackup 是 MySQL 社区最主流的开源物理热备份工具，支持 InnoDB 的热备份(无需停机)。

⚠️ 版本兼容性：XtraBackup 2.4 适用于 MySQL 5.6/5.7，XtraBackup 8.0 适用于 MySQL 8.0，不同版本不能混用。

```
# 第1步：安装 Percona 官方仓库配置包
sudo dnf install -y https://repo.percona.com/yum/percona-release-latest.noarch.rpm

# 第2步：启用 Percona XtraBackup 8.0 仓库
sudo percona-release enable pxb-80

# 第3步：清理缓存并重建元数据
sudo dnf clean all
sudo dnf makecache

# 第4步：根据 MySQL 版本安装
# MySQL 8.0 用这个：
sudo dnf install -y percona-xtrabackup-80
# 或 MySQL 5.7 用这个：
# sudo dnf install -y percona-xtrabackup-24

# 第5步：验证
xtrabackup --version
```
采用外部导入 rpm 的方式，因为下载速度太慢了
```bash
# 安装依赖
sudo dnf install -y libaio numactl-libs ncurses-compat-libs
# 安装工具
sudo dnf install percona-xtrabackup-80-8.0.35-31.1.el8.x86_64.rpm -y
# 验证
xtrabackup --version

```
### 4.1 全量备份与恢复
#### 4.1.1 全量备份
```
xtrabackup --backup --target-dir=/backup/full_$(date +%F) \
  --user=root --password=密码
```
命令解释：
- --backup：执行备份操作
- --target-dir：指定备份文件存放目录
- --user / --password：数据库认证信息
#### 4.1.2 准备备份(Prepare)
备份完成后，需要执行 Prepare 操作，应用 Redo Log 使数据文件保持一致状态：
```
xtrabackup --prepare --target-dir=/backup/full_2026-07-21
```
为什么需要 Prepare：备份过程中数据库仍在写入，备份文件可能包含未提交的事务。Prepare 阶段会回滚未提交事务、应用已提交事务，使备份文件处于一致状态。
#### 4.1.3 恢复数据
```
# 停止 MySQL 服务
sudo systemctl stop mysqld

# 清空数据目录(危险操作，确认备份可用后再执行)
sudo rm -rf /var/lib/mysql/*

# 拷贝备份文件到数据目录
xtrabackup --copy-back --target-dir=/backup/full_2026-07-21

# 设置目录权限
sudo chown -R mysql:mysql /var/lib/mysql

# 启动 MySQL
sudo systemctl start mysqld
```
### 4.2 增量备份与恢复
#### 4.2.1 增量备份原理
增量备份基于 InnoDB 的 LSN(日志序列号)。每次备份都会记录备份结束时的 LSN，下次增量备份只备份 LSN 大于上次备份结束 LSN 的数据页。这样可以大幅减少备份数据量和备份时间。
#### 4.2.2 执行增量备份
```
# 第一次：全量备份(作为基础)
xtrabackup --backup --target-dir=/backup/base --user=root --password=密码

# 第二次：增量备份(基于全量)
xtrabackup --backup --target-dir=/backup/inc1 \
  --incremental-basedir=/backup/base \
  --user=root --password=密码

# 第三次：增量备份(基于上一次增量)
xtrabackup --backup --target-dir=/backup/inc2 \
  --incremental-basedir=/backup/inc1 \
  --user=root --password=密码
```
参数说明：
- --incremental-basedir：指定基于哪次备份做增量
#### 4.2.3 恢复增量备份
增量恢复需要按顺序应用所有增量备份：
```
# 1. Prepare 全量备份
xtrabackup --prepare --apply-log-only --target-dir=/backup/base

# 2. 依次合并增量备份
xtrabackup --prepare --apply-log-only --target-dir=/backup/base \
  --incremental-dir=/backup/inc1

xtrabackup --prepare --apply-log-only --target-dir=/backup/base \
  --incremental-dir=/backup/inc2

# 3. 最后执行一次完整 Prepare
xtrabackup --prepare --target-dir=/backup/base

# 4. 拷贝恢复
xtrabackup --copy-back --target-dir=/backup/base
```
参数说明：
- --apply-log-only：仅应用日志，不回滚未提交事务(合并增量时必须使用)

## 五、增量恢复：基于 Binlog 的时间点恢复
### 5.1 什么是时间点恢复
全量备份只能恢复到备份时刻的数据。要恢复备份之后到某个时间点的数据，需要使用 Binlog 进行增量回放。
核心思路：先恢复全量备份，再通过 Binlog 重放全量备份之后的所有变更。
### 5.2 前置条件
- 必须开启 Binlog：log_bin = ON
- 备份文件记录了 Binlog 的文件名和位置(使用 --master-data 参数)
### 5.3 查看 Binlog 信息
```
-- 查看所有 Binlog 文件
SHOW BINARY LOGS;

-- 查看当前正在写入的 Binlog 位置
SHOW MASTER STATUS;
```
### 5.4 使用 mysqlbinlog 进行时间点恢复
#### 5.4.1 按时间恢复
```
mysqlbinlog --start-datetime="2026-07-21 10:00:00" \
  --stop-datetime="2026-07-21 14:00:00" \
  /var/lib/mysql/mysql-bin.000001 | mysql -u root -p
```
参数说明：
- --start-datetime：开始时间
- --stop-datetime：结束时间
#### 5.4.2 按位置恢复(更精确)
```
mysqlbinlog --start-position=12345 --stop-position=67890 \
  /var/lib/mysql/mysql-bin.000001 | mysql -u root -p
```
参数说明：
- --start-position：开始位置
- --stop-position：结束位置
### 5.5 误删数据的紧急恢复流程
```
1. 发现误操作(如 DELETE 不带 WHERE)
     ↓
2. 立即停止写入，保护现场
     ↓
3. 用 mysqlbinlog 查找误操作的 Binlog 位置
     ↓
4. 恢复到误操作前的全量备份 + Binlog 回放
     ↓
5. 验证数据完整性
     ↓
6. 恢复业务写入
```

## 六、备份策略设计
### 6.1 全量 + 增量组合策略
生产环境推荐组合使用全量备份与增量备份：

|备份类型|频率|保留周期|说明|
|---|---|---|---|
|全量备份|每周 1 次|4 周|作为恢复的基础锚点|
|增量备份|每日 1 次|7 天|基于前一天的备份|
|Binlog 备份|实时/每小时|7 天|实现时间点恢复|
### 6.2 3-2-1 备份法则
建议采用 3-2-1 备份法则：

|规则|说明|
|---|---|
|3|保留 3 份数据副本|
|2|存储在 2 种不同介质(如本地磁盘 + 云存储)|
|1|其中 1 份异地存储(防止机房级灾难)|
### 6.3 备份恢复测试

⚠️ 备份不等于安全，能恢复的备份才是有效的备份。
定期在测试环境验证备份文件的可恢复性：
```
# 在测试环境恢复备份
mysql -u root -p test_restore < /backup/backup.sql

# 验证数据完整性
mysql -u root -p -e "SELECT COUNT(*) FROM test_restore.users;"
```

## 七、备份自动化
### 7.1 使用 Crontab 定时备份
创建备份脚本 /usr/local/bin/mysql_backup.sh：
```
#!/bin/bash
# MySQL 自动备份脚本

BACKUP_DIR=/backup
DATE=$(date +%Y%m%d_%H%M%S)
DB_USER=root
DB_PASS=密码

# 创建备份目录
mkdir -p $BACKUP_DIR

# 执行备份
mysqldump -u $DB_USER -p$DB_PASS --single-transaction \
  --routines --triggers --events \
  --all-databases | gzip > $BACKUP_DIR/all_$DATE.sql.gz

# 删除 30 天前的备份
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```
设置定时任务：
```
# 编辑 crontab
crontab -e

# 每天凌晨 2 点执行备份
0 2 * * * /usr/local/bin/mysql_backup.sh
```
### 7.2 备份监控要点
| 监控项      | 说明                |
| -------- | ----------------- |
| 备份是否成功执行 | 检查脚本退出码和日志        |
| 备份文件大小   | 异常变小可能表示备份失败      |
| 磁盘空间     | 备份目录剩余空间不足会导致备份失败 |
| 备份耗时     | 耗时过长可能影响业务        |
### 7.3 备份策略模板
```
备份策略：
├── 全量备份：每周日凌晨 2:00(mysqldump + XtraBackup)
├── 增量备份：每日凌晨 2:00(XtraBackup)
├── Binlog 备份：实时(mysqlbinlog --stop-never)
├── 保留周期：全量 4 周，增量 7 天，Binlog 7 天
├── 存储位置：本地 + 异地(云存储)
└── 恢复测试：每月 1 次
```
**总结：** 核心原则是“定期备份、定期验证、异地存储”。备份不是目的，能恢复的备份才是有效的备份。