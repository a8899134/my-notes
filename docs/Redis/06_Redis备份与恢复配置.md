## 一、备份概述
### 1.1 备份的作用
Redis 虽然提供了持久化机制(RDB 和 AOF)，可以在服务器重启后恢复数据，但这些机制主要应对的是意外宕机场景。在以下情况中，持久化文件本身可能无法挽回数据：

|场景|说明|持久化能否应对|
|---|---|---|
|服务器宕机重启|进程崩溃后自动恢复|✅ 能|
|硬盘物理损坏|持久化文件所在磁盘损坏|❌ 不能|
|误操作(FLUSHALL)|人为或程序执行了清空命令|❌ 不能|
|数据损坏|RDB/AOF 文件因各种原因损坏|❌ 不能|
|勒索病毒|文件被加密或删除|❌ 不能|
|机房灾难|火灾、水灾等|❌ 不能|

**结论**：持久化是 Redis 的“内部自愈”机制，而备份是“外部保险”。生产环境必须两者兼备，缺一不可。
### 1.2 备份的文件
Redis 备份的核心对象是持久化文件，而不是 Redis 进程本身：

| 文件类型   | 路径                               | 说明                 |
| ------ | -------------------------------- | ------------------ |
| RDB 文件 | `/var/lib/redis/dump.rdb`        | 全量数据快照，恢复最快        |
| AOF 文件 | `/var/lib/redis/appendonlydir/ ` | 包含多个 AOF 相关文件，数据最全 |
| 配置文件   | `/etc/redis/redis.conf`          | Redis 运行配置，便于重建    |
| 哨兵配置   | `/etc/redis-sentinel.conf`       | 高可用配置，便于重建         |

**生产环境建议**：至少备份 RDB 文件、AOF 目录和配置文件。

### 1.3 备份策略的三种模式
| 策略         | 说明                                                                                      | 适用场景            |
| ---------- | --------------------------------------------------------------------------------------- | --------------- |
| 仅 RDB      | 定期备份 RDB 快照                                                                             | 小型业务、对数据完整性要求不高 |
| RDB + AOF  | 定期备份 RDB，配合 AOF 增量日志                                                                    | 大多数业务场景         |
| 混合持久化 + 备份 | AOF 目录中包含 RDB 快照(`.base.rdb`)和增量日志(`.incr.aof`)，备份整个 `appendonlydir/` 目录即可兼顾恢复速度和数据完整性。 | 追求数据完整性和恢复速度    |

**生产环境推荐**：采用 RDB + AOF 混合持久化，定期备份 RDB 文件，实时记录 AOF 日志。

## 二、RDB 备份
### 2.1 基本概念
RDB 文件是 Redis 在某个时间点的全量数据快照，是一个经过压缩的二进制文件。RDB 备份就是将这个文件复制一份保存到安全位置。

RDB 文件路径由 dir 和 dbfilename 两个配置项共同决定：
```conf
dir /var/lib/redis
dbfilename dump.rdb
```
完整路径为：`/var/lib/redis/dump.rdb`
### 2.2 手动触发 RDB 快照
在生产环境中，手动执行备份通常使用 BGSAVE 命令(异步执行，不阻塞服务)：
```bash
redis-cli -a 你的密码 BGSAVE
```
**命令说明**：
- BGSAVE：后台异步生成 RDB 快照文件
- Redis 主进程 fork 一个子进程，子进程负责生成快照
- 父进程继续处理客户端请求，不受影响
- 生成完成后，文件保存到 dir 指定的目录
查看备份状态：
```bash
redis-cli -a 你的密码 LASTSAVE
```
返回一个 Unix 时间戳，表示最后一次成功生成 RDB 快照的时间。
### 2.3 备份步骤
1. 第一步：手动触发 RDB 快照生成
```bash
redis-cli -a 你的密码 BGSAVE
```
2. 第二步：确认快照生成完成
```bash
redis-cli -a 你的密码 LASTSAVE
# 返回时间戳，确认是否在最近几分钟内
```
3. 第三步：复制 RDB 文件到备份目录
```bash
# 创建备份目录(如不存在)
sudo mkdir -p /backup/redis

# 复制 RDB 文件到备份目录，并加上日期后缀
sudo cp /var/lib/redis/dump.rdb /backup/redis/dump.rdb.$(date +%Y%m%d_%H%M%S)
```
4. 第四步：验证备份文件
```bash
# 检查文件是否存在且大小正常
ls -lh /backup/redis/
```
### 2.4 自动触发备份
生产环境应配置定时任务，定期自动备份 RDB 文件。
创建备份脚本：
```bash
sudo vi /usr/local/bin/redis_backup.sh
```
脚本内容：
```bash
#!/bin/bash
# Redis RDB 备份脚本

# 用root执行此脚本
if [ "$EUID" -ne 0 ]; then
    echo "请使用 root 权限执行此脚本"
    exit 1
fi

# 配置项
REDIS_PASS="你的密码"
BACKUP_DIR="/backup/redis"
RDB_FILE="/var/lib/redis/dump.rdb"
RETENTION_DAYS=7

# 创建备份目录
mkdir -p $BACKUP_DIR

# 生成 RDB 快照
redis-cli -a $REDIS_PASS BGSAVE

# 等待快照完成(最多等待 60 秒)
for i in {1..60}; do
    if [ -f $RDB_FILE ]; then
        break
    fi
    sleep 1
done

# 备份 RDB 文件
DATE=$(date +%Y%m%d_%H%M%S)
sudo cp $RDB_FILE $BACKUP_DIR/dump.rdb.$DATE

# 删除 7 天前的备份文件
find $BACKUP_DIR -name "dump.rdb.*" -mtime +$RETENTION_DAYS -delete

echo "$(date): Redis backup completed: dump.rdb.$DATE"
```
赋予执行权限：
```bash
sudo chmod +x /usr/local/bin/redis_backup.sh
```
添加定时任务：
```bash
sudo crontab -e
```
添加以下行(每天凌晨 2 点执行)：
```bash
0 2 * * * /usr/local/bin/redis_backup.sh >> /var/log/redis_backup.log 2>&1
```

## 三、AOF 备份
### 3.1 基本概念
在 Redis 7.0+ 版本中，AOF 存储方式从传统的单文件模式升级为多文件模式。一个 AOF 由以下三种文件组成：

|文件类型|文件名示例|作用|
|---|---|---|
|基础文件| `appendonly.aof.3.base.rdb` |RDB 格式的快照，包含截至当前时刻的全量数据|
|增量文件| `appendonly.aof.3.incr.aof` |文本格式的命令日志，记录基础文件之后的所有写命令|
|清单文件| `appendonly.aof.manifest` |记录当前 AOF 由哪些文件组成及加载顺序|
### 3.2 AOF 文件路径
在 Redis 7.2.x 中，AOF 文件路径由 ** `dir` + `appenddirname` + `appendfilename` ** 三个配置项共同决定：
```conf
# 数据目录
dir /var/lib/redis
# AOF文件存放子目录名
appenddirname "appendonlydir"
# AOF文件名
appendfilename "appendonly.aof"
```
完整路径为：
```
/var/lib/redis/appendonlydir/
├── appendonly.aof.3.base.rdb
├── appendonly.aof.3.incr.aof
└── appendonly.aof.manifest
```
配置项说明：

|配置项|作用|Redis 6.x|Redis 7.x|
|---|---|---|---|
| `dir` |数据根目录|✅ 有|✅ 有|
| `appendfilename` |AOF 文件名(或文件名前缀)|✅ 有|✅ 有|
| `appenddirname` |AOF 文件存放的子目录|❌ 无|✅ 有(7.0+ 新增)|
### 3.3 手动触发 AOF 重写
AOF 文件会随着时间增长而变大，定期执行 AOF 重写可以压缩文件大小，提高备份效率。
```bash
redis-cli -a 你的密码 BGREWRITEAOF
```
命令说明：
- BGREWRITEAOF：后台异步重写 AOF 文件
- Redis 会生成一组新的 AOF 文件(序列号递增)，只包含恢复当前数据集所需的最少信息
- 重写完成后，新文件替换旧文件组，旧文件被自动清理
### 3.4 AOF 备份步骤
1. 第一步：确认 AOF 已开启
```bash
# 请将 rename-command CONFIG参数 替换为你实际设置的 rename-command CONFIG 命令名
redis-cli -a 你的密码 rename-command CONFIG参数 CONFIG GET appendonly
```
如果返回 `no`，需要先在配置文件中开启 AOF。

**说明：**  ename-command CONFIG 参数 在 redis.conf 文件里。

2. 第二步：触发 AOF 重写(可选，建议备份前执行)
```bash
redis-cli -a 你的密码 BGREWRITEAOF
```
3. 第三步：备份整个 appendonlydir 目录
```bash
# 备份整个 AOF 目录
sudo cp -r /var/lib/redis/appendonlydir /backup/redis/appendonlydir.$(date +%Y%m%d_%H%M%S)
```
**⚠️ 重要：** Redis 7.x 的 AOF 由多个文件组成，备份时必须备份整个目录，不能只备份单个文件。
### 3.5 AOF 重写触发条件
Redis 7.2.x 中，AOF 重写由以下两个配置自动触发：
```
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```
触发逻辑：
- 当前 AOF 文件大小比上次重写后增长了 100%(即翻了一倍)
- 且当前 AOF 文件大小至少为 64 MB
两个条件同时满足时，自动触发 BGREWRITEAOF。

## 四、定期备份策略
### 4.1 备份频率建议
|数据重要性|RDB 备份频率|AOF 备份频率|说明|
|---|---|---|---|
|低(缓存)|每天 1 次|不备份|数据可从数据库重建|
|中(一般业务)|每天 1 次|每小时 1 次|可容忍少量数据丢失|
|高(核心业务)|每 6 小时 1 次|每 15 分钟 1 次|要求数据完整性高|
### 4.2 备份保留策略
|备份类型|保留天数|说明|
|---|---|---|
|日备份|7 天|最近一周的每日备份|
|周备份|4 周|最近一个月的每周备份|
|月备份|12 个月|最近一年的每月备份(归档)|
### 4.3 备份到远程存储
1. 使用 rsync 同步到远程服务器：
```bash
# 同步备份目录到远程服务器
rsync -avz /backup/redis/ root@192.168.1.200:/backup/redis/
```
**命令说明**：
- a：归档模式，保留文件属性
- v：显示详细过程
- z：传输时压缩数据

## 五、数据恢复
### 5.1 恢复前的准备工作
1. 停止 Redis 服务
```bash
sudo systemctl stop redis
```
2. 备份当前数据(防止覆盖后无法回退)
```bash
sudo cp -r /var/lib/redis /var/lib/redis.backup
```
3. 清空数据目录(可选)
```bash
# 清空数据目录(可选，建议直接备份整个目录后删除)
sudo rm -rf /var/lib/redis/*
```
### 5.2 从 RDB 文件恢复
RDB 恢复是最简单、最快的方式，适用于全量恢复场景。
恢复步骤：
- 将备份的 RDB 文件复制到数据目录
- 确保文件名与配置中的 dbfilename 一致
- 重启 Redis
```bash
# 将备份的 RDB 文件复制到数据目录
sudo cp /backup/redis/dump.rdb.20260807_020000 /var/lib/redis/dump.rdb

# 确保文件属主正确
sudo chown redis:redis /var/lib/redis/dump.rdb

# 启动 Redis
sudo systemctl start redis
```
验证恢复结果：
```bash
redis-cli -a 你的密码 DBSIZE
redis-cli -a 你的密码 INFO stats | grep keyspace
```
### 5.3 从 AOF 目录恢复
在 Redis 7.x 中，混合持久化是 AOF 重写时的默认行为(`aof-use-rdb-preamble yes`)，.base.rdb 文件本身是 RDB 格式的快照。

恢复时只需还原整个 appendonlydir/ 目录，Redis 启动时会自动识别并加载。

恢复步骤：
```bash
# 删除当前 AOF 目录
sudo rm -rf /var/lib/redis/appendonlydir

# 恢复备份的 AOF 目录
sudo cp -r /backup/redis/appendonlydir.20260807_020000 /var/lib/redis/appendonlydir

# 确保属主正确
sudo chown -R redis:redis /var/lib/redis/appendonlydir

# 启动 Redis(会优先加载 AOF)
sudo systemctl start redis
```
恢复优先级：当 appendonly yes 时，Redis 启动时优先加载 AOF 目录中的文件，而非 RDB 文件。
### 5.4 AOF 文件损坏修复
如果 AOF 文件损坏，Redis 可能无法启动。可以使用 redis-check-aof 工具修复：
```bash
# 进入 AOF 目录
cd /var/lib/redis/appendonlydir

# 查看当前增量文件名称(根据实际输出的文件名调整)
ls -la appendonly.aof.*.incr.aof

# 检查增量 AOF 文件(将 3 替换为实际序列号)
redis-check-aof appendonly.aof.3.incr.aof

# 修复(--fix 会删除损坏部分)
redis-check-aof --fix appendonly.aof.3.incr.aof
```
修复流程：
- 先备份损坏的 AOF 文件：cp appendonly.aof.3.incr.aof appendonly.aof.3.incr.aof.corrupt
- 执行修复：redis-check-aof --fix appendonly.aof.3.incr.aof
- 重新启动 Redis：sudo systemctl start redis
### 5.5 RDB 文件校验
RDB 文件可以通过配置开启校验，确保文件完整性。
```conf
rdbchecksum yes
```
开启后，Redis 加载 RDB 文件时会自动校验文件完整性，如果文件损坏，Redis 会拒绝加载。
### 5.6 恢复后的验证
恢复完成后，必须验证数据完整性和服务可用性：
```
# 1. 检查服务状态
sudo systemctl status redis

# 2. 检查数据量是否正常
redis-cli -a 你的密码 DBSIZE

# 3. 检查主从复制状态(如果有)
redis-cli -a 你的密码 INFO replication

# 4. 抽样检查关键数据(将 your_key 替换为实际存在的 Key)
redis-cli -a 你的密码 GET your_key

# 5. 检查持久化状态
redis-cli -a 你的密码 INFO persistence
```
-- -
## 六、备份恢复演练
### 6.1 为什么要演练
备份文件只有在恢复时能正常工作才有价值。很多生产事故中，备份文件存在但无法使用(损坏、版本不兼容、数据不一致等)，导致恢复失败。

演练频率建议：每季度至少进行一次完整的备份恢复演练。
### 6.2 演练步骤
1. 第一步：在测试环境进行恢复
	- 部署一台与生产环境配置相同的测试机器
	-  从备份中恢复数据
	-  验证数据完整性

2. 第二步：记录恢复时间
记录从开始恢复到服务正常提供的时间，作为恢复时间目标(RTO)的参考。
3. 第三步：检查数据一致性
确认恢复后的数据量与备份前一致，关键业务数据完整。
### 6.3 演练检查清单

|检查项|状态|说明|
|---|---|---|
|RDB 文件可正常加载|☐|是否成功恢复|
|AOF 文件可正常加载|☐|是否成功恢复|
|恢复后数据量正确|☐|DBSIZE 对比|
|关键业务数据完整|☐|抽样验证|
|主从复制正常|☐|如有配置|
|服务可正常对外提供|☐|客户端连接测试|
|恢复时间在可接受范围|☐|记录耗时|
|配置文件已同步备份|☐|配置文件是否存在|

## 七、总结
### 7.1 核心要点
1. 持久化 ≠ 备份：持久化是内部自愈，备份是外部保险，两者必须同时具备
2. RDB 备份：全量快照，恢复最快，适合每天定时备份
3. AOF 备份：增量日志，数据最全，适合高频备份
4. 定期演练：只有验证过的备份才是有效的备份
5. 异地存储：备份文件不要和原始文件在同一台服务器
### 7.2 备份恢复流程图
```text
数据生成 → 持久化(RDB/AOF)→ 定期备份 → 异地存储 → 定期演练 → 灾难恢复
    ↑           ↓              ↓           ↓            ↓           ↓
  业务写入    自动保存       人工/定时    远程同步     验证恢复    成功还原
```