## 一、性能排查概述
### 1.1 性能排查作用
Redis 是内存数据库，正常情况下响应时间应在微秒级别(< 1 ms)。当出现以下现象时，说明 Redis 可能遇到了性能问题：

| 现象              | 可能的影响                  |
| --------------- | ---------------------- |
| 应用响应变慢          | 用户体验下降，超时增多            |
| Redis CPU 使用率飙升 | 单线程模型下，CPU 满载会导致所有请求排队 |
| 连接数爆满           | 新连接无法建立，服务不可用          |
| 内存使用率持续增长       | 可能导致 OOM 或大量淘汰         |
| 主从复制延迟增大        | 从节点数据落后，故障切换可能丢数据      |

排查的核心思路：找到性能瓶颈的根源，而不是盲目重启或扩容。
### 1.2 性能排查的四步法
```text
第一步：现象确认 → 第二步：数据采集 → 第三步：分析定位 → 第四步：优化解决
    ↓                  ↓                ↓                ↓
发生了什么？       收集监控数据     找出根本原因     实施优化方案
```
### 1.3 排查前的准备工作
| 事项       | 说明                              |
| -------- | ------------------------------- |
| 确认问题时间范围 | 明确性能问题发生的时间点                    |
| 查看监控大盘   | 从 Grafana/Zabbix 查看整体趋势         |
| 确认是否有变更  | 最近是否有发布、配置变更、数据迁移               |
| 准备排查工具   | redis-cli、redis-benchmark、慢查询日志 |
## 二、常用监控与诊断命令
### 2.1 INFO 命令 — 综合信息查看
`INFO` 是排查性能问题的第一站，可以获取 Redis 服务器的各种运行状态信息。
基本用法：
```bash
redis-cli -a 你的密码 INFO
```
按模块排查：

|命令|用途|排查场景|
|---|---|---|
| `INFO stats` |查看命令统计、命中率|缓存命中率低、QPS 异常|
| `INFO memory` |查看内存使用情况|内存不足、碎片率高|
| `INFO clients` |查看客户端连接|连接数异常、连接泄漏|
| `INFO commandstats` |查看各命令执行统计|找出耗时最多的命令|
| `INFO cpu` |查看 CPU 使用情况|CPU 使用率异常|
| `INFO replication` |查看主从复制状态|复制延迟、同步失败|
| `INFO persistence` |查看持久化状态|RDB/AOF 耗时过长|
| `INFO keyspace` |查看各库 Key 数量|Key 数量异常增长|
### 2.2 INFO stats — 统计信息排查
```bash
redis-cli -a 密码 INFO stats
```
关键字段解读：

|字段|说明|异常判断|
|---|---|---|
| `total_commands_processed` |总命令执行次数|用于计算 QPS|
| `instantaneous_ops_per_sec` |当前每秒命令数(QPS)|与历史基线对比，异常波动需关注|
| `total_net_input_bytes` |总网络输入字节数|网络流量异常|
| `total_net_output_bytes` |总网络输出字节数|网络流量异常|
| `rejected_connections` |被拒绝的连接数|> 0 说明连接数已达上限|
| `expired_keys` |过期的 Key 数量|大量过期可能引起延迟|
| `evicted_keys` |因内存淘汰的 Key 数量|> 0 说明内存不足|
| `keyspace_hits` |缓存命中次数|计算命中率|
| `keyspace_misses` |缓存未命中次数|命中率低需排查|

QPS 计算：
```bash
# 两次采样计算 QPS
redis-cli -a 密码 INFO stats | grep instantaneous_ops_per_sec
```
命中率计算：
```text
命中率 = keyspace_hits / (keyspace_hits + keyspace_misses) × 100%
```
### 2.3 INFO commandstats — 命令耗时分析
```bash
redis-cli -a 密码 INFO commandstats
```
输出示例：
```text
cmdstat_get:calls=1000000,usec=5000000,usec_per_call=5.00
cmdstat_set:calls=500000,usec=4000000,usec_per_call=8.00
cmdstat_keys:calls=100,usec=5000000,usec_per_call=50000.00
```
字段解读：

|字段|说明|
|---|---|
| `calls` |命令被调用的次数|
| `usec` |该命令总耗时(微秒)|
| `usec_per_call` |单次平均耗时(微秒)|

排查重点：
- usec_per_call 过高的命令(如 > 1000 微秒)
- calls 次数异常多的命令
- 特别关注 KEYS、SMEMBERS、HGETALL 等 O(N) 命令
### 2.4 SLOWLOG — 慢查询日志
慢查询日志是排查性能问题最直接的入口。

查看慢查询配置：
```bash
redis-cli -a 密码 CONFIG GET slowlog-log-slower-than
redis-cli -a 密码 CONFIG GET slowlog-max-len
```
查看慢查询日志：
```bash
# 查看最近 10 条
redis-cli -a 密码 SLOWLOG GET 10

# 查看慢查询数量
redis-cli -a 密码 SLOWLOG LEN

# 清空慢查询日志
redis-cli -a 密码 SLOWLOG RESET
```
输出示例解读：
```text
1) 1) (integer) 123456          # 日志 ID
   2) (integer) 1623456789      # 执行时间戳
   3) (integer) 25000           # 执行耗时(微秒)= 25ms
   4) 1) "KEYS"                 # 执行的命令
      2) "user:*"
   5) 127.0.0.1:45678           # 客户端 IP 和端口
```
### 2.5 CLIENT LIST — 客户端连接分析
```bash
redis-cli -a 密码 CLIENT LIST
```
排查场景：

|场景|关注字段|
|---|---|
|连接数过多|统计输出行数，检查是否超过 maxclients|
|连接泄漏|检查 `age` 和 `idle` 时间，长时间空闲的连接|
|阻塞命令|检查 `cmd` 字段，是否存在 `BLPOP`、`BRPOP` 等阻塞命令|

命令说明：CLIENT LIST 会输出所有客户端连接的详细信息，每行代表一个连接。生产环境如果连接数较多(如数千个)，直接执行此命令会输出大量内容，可能对 Redis 造成轻微性能影响。建议在排查时使用 grep 或 wc -l 进行过滤统计。
### 2.6 MONITOR — 实时命令监控
```bash
redis-cli -a 密码 MONITOR
```
用途：实时查看 Redis 正在执行的所有命令。

**⚠️ 警告**：
- MONITOR 会输出所有命令，高并发环境下会产生大量输出
- MONITOR 本身会消耗 Redis 性能，生产环境严禁长时间运行
- 仅用于短时调试(建议 < 30 秒)
使用示例：
```bash
# 只查看 10 条后自动退出
timeout 5 redis-cli -a 密码 MONITOR
```

## 三、内存性能排查
### 3.1 内存使用率过高
排查命令：
```bash
redis-cli -a 密码 INFO memory
```
关键指标：

|指标|正常值|异常值|说明|
|---|---|---|---|
| `used_memory` |< maxmemory 的 70%|> 80%|当前内存使用量|
| `used_memory_rss` |接近 used_memory|远大于 used_memory|操作系统实际分配内存|
| `mem_fragmentation_ratio` |1.0 - 1.5|> 1.5 关注，> 2.0 告警|内存碎片率|
| `maxmemory` |已设置|未设置或过低|内存上限|

内存使用率过高的原因：

|原因|排查方法|解决方案|
|---|---|---|
|缓存数据量过大| `INFO keyspace` 查看 Key 数量|增加 maxmemory，优化过期策略|
|内存碎片严重| `mem_fragmentation_ratio > 1.5` |重启 Redis，或开启 active-defrag|
|Key 未设置过期时间| `INFO keyspace` 查看 `expires` 数量|为 Key 设置合理 TTL|
|大 Key 占用内存| `redis-cli --bigkeys` |拆分大 Key|
|客户端输出缓冲区过大| `CLIENT LIST` 查看|检查慢客户端，调整 buffer 限制|
### 3.2 内存碎片率过高
现象：mem_fragmentation_ratio > 1.5

解释：

- mem_fragmentation_ratio = used_memory_rss / used_memory
- 正常值：1.0 - 1.5
- 1.5 说明内存碎片较多，内存利用率下降
- 2.0 说明碎片严重，需要处理

解决方案：
```bash
# 方法一：重启 Redis(最简单，但有停机时间)
sudo systemctl restart redis

# 方法二：开启主动碎片整理(Redis 4.0+)
redis-cli -a 密码 CONFIG SET activedefrag yes

# 查看碎片整理状态
redis-cli -a 密码 INFO memory | grep active_defrag
```
### 3.3 查找大 Key
大 Key 是 Redis 性能问题的常见根源。

使用内置命令扫描：
```bash
# 扫描所有 Key，找出最大的 Key(生产环境慎用)
redis-cli -a 密码 --bigkeys

# 只查看特定类型的大 Key
redis-cli -a 密码 --bigkeys --type string
```
命令说明：
- --bigkeys 会遍历所有 Key，对每个 Key 调用 STRLEN、LLEN、SCARD、HLEN 等命令
- 该命令在扫描过程中会占用 Redis 资源，生产环境建议在低峰期执行
- 使用 -i 0.1 参数可以每 100ms 处理一次，降低对线上影响

使用 SCAN 命令分批扫描：
```bash
# 使用 SCAN 命令分批扫描，查找大 Key
redis-cli -a 密码 --scan --pattern "user:*" | while read key; do
    echo -n "$key: "
    redis-cli -a 密码 DEBUG OBJECT "$key" | grep serializedlength
done
```
大 Key 的处理方法：

|处理方式|适用场景|说明|
|---|---|---|
|拆分|Hash/Set/ZSet 过大|按业务维度拆分为多个小 Key|
|压缩|String 值过大|使用压缩算法(如 gzip)后再存储|
|删除|已不再使用的数据|使用 UNLINK 异步删除，避免阻塞|

## 四、CPU 性能排查
### 4.1 CPU 使用率异常
排查命令：
```bash
# 查看 Redis CPU 使用率
top -p $(pgrep redis-server)

# 查看 INFO cpu
redis-cli -a 密码 INFO cpu
```
关键指标：

|指标|说明|异常判断|
|---|---|---|
| `used_cpu_sys` |系统态 CPU 使用|持续高值需关注|
| `used_cpu_user` |用户态 CPU 使用|命令执行的主要消耗|
| `used_cpu_sys_children` |子进程系统态 CPU|RDB/AOF 重写消耗|
| `used_cpu_user_children` |子进程用户态 CPU|RDB/AOF 重写消耗|

CPU 使用率过高的原因：

|原因|排查方法|解决方案|
|---|---|---|
|复杂命令过多| `INFO commandstats` 查看|优化命令，使用 O(1) 替代 O(N)|
|大 Key 操作| `--bigkeys` 查找|拆分大 Key|
|频繁过期 Key| `INFO stats` 查看 `expired_keys` |分散过期时间|
|RDB/AOF 重写| `INFO persistence` 查看|调整重写策略，低峰期执行|
|系统资源争抢|查看 CPU 整体负载|隔离 Redis 进程|
### 4.2 查看 CPU 使用率
```bash
# 方法一：使用 top 命令
top -p $(pgrep redis-server)

# 方法二：使用 redis-cli
redis-cli -a 密码 INFO cpu
```
排查 CPU 使用率高的命令：
```bash
redis-cli -a 密码 INFO commandstats
```

## 五、持久化性能排查
### 5.1 RDB 保存耗时过长
排查命令：
```bash
redis-cli -a 密码 INFO persistence
```
关键指标：

|指标|说明|异常判断|
|---|---|---|
| `rdb_last_bgsave_time_sec` |最后一次 RDB 耗时(秒)|> 10 秒需关注|
| `rdb_last_bgsave_status` |最后一次 RDB 状态|非 `ok` 需告警|
| `rdb_current_bgsave_time_sec` |当前正在进行的 RDB 耗时|持续增长需关注|

RDB 耗时过长的原因：

| 原因        | 解决方案                |
| --------- | ------------------- |
| 数据集过大     | 增加 save 间隔，降低保存频率   |
| 磁盘 I/O 慢  | 使用 SSD，分离 RDB 到独立磁盘 |
| fork 耗时过长 | 预留内存，避免内存不足触发 swap  |

### 5.2 AOF 重写耗时过长
排查命令：
```bash
redis-cli -a 密码 INFO persistence
```
关键指标：

|指标|说明|
|---|---|
|`aof_rewrite_in_progress`|AOF 重写是否进行中|
|`aof_rewrite_scheduled`|AOF 重写是否被调度|
|`aof_last_rewrite_time_sec`|最后一次 AOF 重写耗时|
|`aof_last_rewrite_status`|最后一次 AOF 重写状态|

AOF 重写耗时过长的解决方案：

|方案|说明|
|---|---|
|调整重写触发条件|增大 `auto-aof-rewrite-percentage` 和 `auto-aof-rewrite-min-size` |
|低峰期执行|在业务低峰期手动触发 `BGREWRITEAOF` |
|优化磁盘 I/O|使用 SSD，分离 AOF 到独立磁盘|

## 六、主从复制性能排查
### 6.1 主从延迟过大
排查命令：
```bash
redis-cli -a 密码 INFO replication
```
关键指标(从节点查看)：

|指标|说明|异常判断|
|---|---|---|
| `master_link_status` |主从连接状态|非 `up` 需告警|
| `master_last_io_seconds_ago` |最后一次通信间隔(秒)|> 5 秒需关注|
| `slave_repl_offset` |从节点复制偏移量|与主节点 offset 对比|
| `master_sync_in_progress` |是否正在全量同步|持续为 1 说明同步缓慢|

主从延迟的原因：

|原因|排查方法|解决方案|
|---|---|---|
|网络延迟| `ping` 命令检测|检查网络带宽和延迟|
|主节点写负载过高| `INFO stats` 查看 QPS|分流写入，或使用集群|
|从节点性能不足|查看从节点 CPU/内存|升级从节点配置|
|大 Key 同步| `--bigkeys` 查找|拆分大 Key|
|复制积压缓冲区不足| `CONFIG GET repl-backlog-size` |增大缓冲区大小|
### 6.2 全量同步频繁
排查方法：
```bash
# 查看从节点日志
sudo tail -100 /var/log/redis/redis.log | grep -i "full sync"
```
解决方案：

|方案|说明|
|---|---|
|增大 repl-backlog-size|建议 64 MB-256 MB，根据写流量调整|
|优化网络稳定性|避免网络抖动导致频繁断连|
|监控复制延迟|及时发现和处理延迟问题|

## 七、网络与连接性能排查
### 7.1 连接数异常
排查命令：
```bash
# 查看当前连接数
redis-cli -a 密码 INFO clients

# 查看连接详情
redis-cli -a 密码 CLIENT LIST

# 统计各客户端连接数
redis-cli -a 密码 CLIENT LIST | awk '{print $2}' | sort | uniq -c | sort -rn
```
连接数过高的原因：

|原因|解决方案|
|---|---|
|应用连接池配置过大|调整连接池大小(建议 10-50)|
|连接泄漏(未释放)|检查应用代码，确保连接及时关闭|
|大量客户端同时连接|使用 Redis 集群分散连接|
### 7.2 连接被拒绝
现象：rejected_connections > 0
排查命令：
```bash
redis-cli -a 密码 INFO stats | grep rejected_connections
```
解决方案：
```bash
# 查看当前 maxclients
redis-cli -a 密码 CONFIG GET maxclients

# 增大 maxclients(需同步调整系统 ulimit)
redis-cli -a 密码 CONFIG SET maxclients 20000
```
系统 ulimit 调整：
```bash
# 查看当前限制
ulimit -n

# 临时调整
ulimit -n 65535

# 永久调整(/etc/security/limits.conf)
echo "redis soft nofile 65535" >> /etc/security/limits.conf
echo "redis hard nofile 65535" >> /etc/security/limits.conf
```

## 八、常见性能问题场景
### 8.1 场景一：请求延迟突然增大
排查步骤：
```text
1. 确认是否网络问题 → ping、网络监控
2. 查看慢查询日志 → SLOWLOG GET
3. 查看是否有大 Key 操作 → --bigkeys
4. 查看是否有 RDB/AOF 重写 → INFO persistence
5. 查看是否有大量 Key 过期 → INFO stats
6. 查看系统资源 → top、iostat、vmstat
```
示例排查命令：
```bash
# 查看当前延迟
redis-cli -a 密码 --latency

# 查看最近 10 条慢查询
redis-cli -a 密码 SLOWLOG GET 10

# 查看是否正在 RDB/AOF 重写
redis-cli -a 密码 INFO persistence | grep -E "rdb_bgsave_in_progress|aof_rewrite_in_progress"
```
### 8.2 场景二：缓存命中率突然下降
排查步骤：
```text
1. 计算当前命中率 → INFO stats
2. 检查是否有大量 Key 过期 → INFO stats | grep expired_keys
3. 检查是否有大量 Key 被淘汰 → INFO stats | grep evicted_keys
4. 检查应用代码是否有缓存 Key 命名变化
5. 检查是否有缓存雪崩(大量 Key 同时过期)
```
### 8.3 场景三：Redis 响应超时
排查步骤：
```text
1. 检查 Redis 服务状态 → systemctl status redis
2. 检查 CPU 使用率 → top
3. 查看慢查询日志 → SLOWLOG GET
4. 检查是否有阻塞命令 → CLIENT LIST
5. 检查系统负载 → uptime、dmesg
```
### 8.4 场景四：内存使用持续增长
排查步骤：
```text
1. 查看 Key 数量增长 → INFO keyspace
2. 查看是否有大 Key → --bigkeys
3. 查看是否有 Key 未设置过期时间
4. 查看内存碎片率 → INFO memory
5. 查看是否有客户端输出缓冲区过大 → CLIENT LIST
```

## 九、性能优化建议
### 9.1 慢查询优化
|建议|说明|
|---|---|
|避免 KEYS 命令|使用 SCAN 替代|
|避免全量操作|HGETALL、SMEMBERS 改用 HSCAN、SSCAN|
|使用批量命令|MGET、MSET、Pipeline|
|使用游标命令|HSCAN、SSCAN、ZSCAN|
|使用哈希标签|集群模式下确保多 Key 操作在同一个槽|
### 9.2 内存优化
| 建议        | 说明                        |
| --------- | ------------------------- |
| 设置合理的 TTL | 避免无效 Key 长期占用内存           |
| 使用压缩数据结构  | Hash/ZSet/Set 小数据量时使用压缩编码 |
| 拆分大 Key   | 单个 Key 不超过 1MB            |
| 开启主动碎片整理  | `activedefrag yes`        |
### 9.3 持久化优化
| 建议           | 说明                                  |
| ------------ | ----------------------------------- |
| 调整 save 策略   | 根据数据重要性调整 RDB 频率                    |
| 低峰期执行 BGSAVE | 避免影响业务高峰                            |
| 使用增量 fsync   | `aof-rewrite-incremental-fsync yes` |
| 预留 30% 内存    | 避免 fork 时内存不足                       |
### 9.4 配置优化检查清单
| 配置项                       | 建议值           | 说明        |
| ------------------------- | ------------- | --------- |
| `maxmemory`               | 物理内存的 60%-75% | 防止 OOM    |
| `maxmemory-policy`        | `allkeys-lru` | 缓存场景推荐    |
| `slowlog-log-slower-than` | 10000(微秒)     | 10ms 阈值   |
| `slowlog-max-len`         | 1000          | 保留更多慢查询   |
| `repl-backlog-size`       | 64mb-256mb    | 根据写流量调整   |
| `maxclients`              | 10000-20000   | 根据应用需求调整  |
| `timeout`                 | 300           | 防止空闲连接堆积  |
| `tcp-keepalive`           | 300           | 检测死连接     |
| `hz`                      | 10            | 后台任务频率    |
| `activerehashing`         | `yes`         | 主动 rehash |
### 9.5 redis.conf 核心优化配置参考
```conf
# ============================ 内存配置 ============================

# 内存上限(建议设为物理内存的 60%-75%)
maxmemory 8gb

# 内存淘汰策略(缓存场景推荐 allkeys-lru)
maxmemory-policy allkeys-lru

# LRU/LFU 采样数(默认 5，值越大越准确，CPU 消耗也越高)
maxmemory-samples 10

# ============================ 慢查询配置 ============================

# 慢查询阈值(微秒，建议 10ms = 10000 微秒)
slowlog-log-slower-than 10000

# 慢查询最大条数(建议 1000，便于保存更多慢查询记录)
slowlog-max-len 1000

# ============================ 复制配置 ============================

# 复制积压缓冲区大小(建议 64MB-256MB，根据写流量调整)
repl-backlog-size 128mb

# 从节点是否只读(生产环境必须开启)
replica-read-only yes

# ============================ 持久化配置 ============================

# AOF 同步策略(建议 everysec)
appendfsync everysec

# AOF 重写触发百分比
auto-aof-rewrite-percentage 100

# AOF 重写触发最小文件大小
auto-aof-rewrite-min-size 64mb

# 是否启用混合持久化
aof-use-rdb-preamble yes

# AOF 重写时是否增量 fsync
aof-rewrite-incremental-fsync yes

# RDB 保存时是否增量 fsync
rdb-save-incremental-fsync yes

# ============================ 连接配置 ============================

# 最大客户端连接数(需同步调整系统 ulimit -n)
maxclients 10000

# 客户端空闲超时(秒，0 表示不超时)
timeout 300

# TCP 保活检测间隔
tcp-keepalive 300

# ============================ 惰性删除 ============================

# 淘汰时使用非阻塞删除
lazyfree-lazy-eviction yes

# 过期时使用非阻塞删除
lazyfree-lazy-expire yes

# 命令副作用时使用非阻塞删除
lazyfree-lazy-server-del yes

# ============================ I/O 线程 ============================

# I/O 线程数(建议设置为 CPU 核心数的一半，不超过 8)
io-threads 4

# 是否启用 I/O 线程读取
io-threads-do-reads yes
```


## 十、总结
### 10.1 核心要点
1. 性能排查遵循四步法：现象确认 → 数据采集 → 分析定位 → 优化解决
2. INFO 命令是排查的第一站：stats、memory、commandstats 是核心模块
3. 慢查询日志是最直接的入口：定期检查 SLOWLOG
4. 大 Key 是性能问题的常见根源：定期使用 --bigkeys 扫描
5. 主从延迟是复制架构的核心监控指标：持续关注 lag 和偏移量
6. CPU 异常通常伴随复杂命令或大 Key：重点关注 commandstats
7. 内存问题重点关注使用率和碎片率：used_memory 和 mem_fragmentation_ratio
8. 优化从配置入手：合理设置 maxmemory、slowlog、repl-backlog
### 10.2 性能问题排查流程图
```text
性能问题出现
    ↓
查看监控大盘(Grafana/Zabbix)
    ↓
确认问题范围：全局/特定操作/特定时间
    ↓
┌─────────────────────────────────────────────────────┐
│ 排查方向                                            │
│  ├── 慢查询 → SLOWLOG GET → 优化命令               │
│  ├── CPU高 → INFO commandstats → 优化高频命令      │
│  ├── 内存高 → INFO memory → 大Key/碎片/淘汰        │
│  ├── 连接高 → CLIENT LIST → 连接池/泄漏检查        │
│  ├── 复制延迟 → INFO replication → 网络/缓冲区     │
│  └── 持久化慢 → INFO persistence → 磁盘/fork       │
└─────────────────────────────────────────────────────┘
    ↓
定位根本原因
    ↓
实施优化方案
    ↓
验证效果
```