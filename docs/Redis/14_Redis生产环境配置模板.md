## 一、概述
### 1.1 文档说明
本文档提供一套完整的 Redis 生产环境配置模板，涵盖以下场景：

|场景|说明|
|---|---|
|单机独立部署|单个 Redis 实例，适用于数据量小、无需高可用的场景|
|主从复制部署|一主一从或多从，实现读写分离和数据冗余|
|哨兵高可用部署|主从 + 哨兵，实现自动故障转移|
|集群分布式部署|数据分片 + 高可用，适用于大数据量场景|

使用方法：根据实际部署场景，从本文档中提取对应的配置节，组合成完整的 redis.conf 配置文件。

### 1.2 配置优先级说明
```text
命令行启动参数 > redis.conf 配置文件 > 内置默认值
```
即：启动时通过 --参数 值 指定的配置优先级最高，其次是配置文件中的设置，最后是 Redis 内置的默认值。
## 二、Redis 配置文件模板(redis.conf)
### 2.1 基础网络配置
```conf
# ============================ 基础网络配置 ============================

# 监听地址
# 说明：指定 Redis 监听的网络接口 IP 地址
# 生产环境建议绑定内网 IP(如 192.168.1.100)，禁止绑定 0.0.0.0
# 如果仅本机访问，保留 127.0.0.1 即可；如需跨服务器访问，添加内网 IP
bind 127.0.0.1 192.168.1.100

# 监听端口
# 说明：Redis 服务端口，默认 6379
# 建议修改为非常用端口(如 6379→6379 保持不变，或改为 10001 等)
port 6379

# 保护模式
# 说明：开启后，未设置密码且未绑定具体 IP 时，仅允许本地回环地址访问
# 生产环境建议设置为 yes
protected-mode yes

# TCP 连接队列大小
# 说明：高并发环境需调大此值，受系统 net.core.somaxconn 限制
# 建议同时调整系统参数：sysctl -w net.core.somaxconn=2048
tcp-backlog 2048

# 客户端空闲超时
# 说明：超过此时间客户端无操作则断开连接，单位：秒
# 0 表示不超时，生产环境建议设置合理值避免连接堆积
timeout 300

# TCP 保活检测间隔
# 说明：检测死连接并保持中间设备连接活跃，单位：秒
# 建议保持默认 300
tcp-keepalive 300
```
### 2.2 通用配置
```conf
# ============================ 通用配置 ============================

# 是否以守护进程运行
# 说明：配合 systemd 时必须设为 no，由 systemd 管理进程
# 独立运行时可设为 yes
daemonize no

# systemd 监督模式
# 说明：启用 systemd 集成，让 Redis 与 systemd 通信
# 可选值：no / systemd / auto，生产环境推荐 systemd
supervised systemd

# PID 文件路径
# 说明：记录 Redis 进程 ID 的文件路径
pidfile /run/redis/redis.pid

# 日志级别
# 说明：日志输出详细程度
# debug(调试)→ verbose(详细)→ notice(常规)→ warning(警告)→ nothing(无)
# 生产环境使用 notice
loglevel notice

# 日志文件路径
# 说明：日志写入位置，空字符串表示输出到标准输出
# 生产环境建议指定具体路径，便于日志收集和排查
logfile /var/log/redis/redis.log

# 数据库数量
# 说明：Redis 默认有 16 个数据库(编号 0-15)
# 生产环境建议使用默认值，不同业务通过 Key 前缀区分
databases 16

# 启动时是否显示 ASCII Logo
# 说明：生产环境建议关闭以减少日志输出
always-show-logo no

# 是否修改进程标题
# 说明：在 ps/top 中显示运行时信息，便于识别
set-proc-title yes
```
### 2.3 安全配置
```conf
# ============================ 安全配置 ============================

# 访问密码(生产环境必须设置)
# 说明：客户端连接 Redis 时需要认证的密码
# 建议：16 位以上，包含大小写字母、数字和特殊字符
# 例如：YourStrongPassword2026!@#
requirepass YourStrongPassword2026!@#

# 主从复制认证密码
# 说明：从节点连接主节点时使用的密码，必须与主节点 requirepass 一致
# 如果主节点设置了密码，从节点必须配置此参数
masterauth YourStrongPassword2026!@#

# 禁用或重命名危险命令
# 说明：将危险命令重命名为空字符串表示完全禁用
# 重命名为其他名称表示仅允许知道新命令名的人使用
# 危险命令包括：FLUSHALL、FLUSHDB、CONFIG、KEYS 等
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG "admin_config_2026"
rename-command KEYS "admin_keys_2026"

# ACL 日志最大长度
# 说明：记录被 ACL 拒绝的命令和认证事件的最大条数
acllog-max-len 128

# 最大客户端连接数
# 说明：限制同时连接的客户端数量，默认 10000
# 需同步调整系统 ulimit -n 限制，否则实际生效值受系统限制
maxclients 10000
```
### 2.4 内存策略配置
```conf
# ============================ 内存策略 ============================

# 最大内存限制(生产环境必须设置)
# 说明：限制 Redis 使用的最大内存，单位可以是 kb、mb、gb
# 建议：设为物理内存的 60%-75%
# 例如：物理内存 16GB → maxmemory 10gb 或 12gb
maxmemory 10gb

# 内存淘汰策略
# 说明：当内存达到 maxmemory 上限时，按何种策略淘汰 Key
# 可选值：
#   noeviction       - 不淘汰，写操作返回错误(默认)
#   allkeys-lru      - 从所有 Key 中淘汰最近最少使用的(缓存场景推荐)
#   volatile-lru     - 从设置了过期时间的 Key 中淘汰最近最少使用的
#   allkeys-random   - 从所有 Key 中随机淘汰
#   volatile-random  - 从设置了过期时间的 Key 中随机淘汰
#   volatile-ttl     - 从设置了过期时间的 Key 中淘汰剩余时间最短的
#   allkeys-lfu      - 从所有 Key 中淘汰最不常用的(Redis 4.0+)
#   volatile-lfu     - 从设置了过期时间的 Key 中淘汰最不常用的
# 缓存场景推荐：allkeys-lru
maxmemory-policy allkeys-lru

# LRU/LFU 采样数量
# 说明：值越大，淘汰算法越精确，但 CPU 消耗也越高
# 默认 5，建议设置为 10
maxmemory-samples 10

# 主动过期清理
# 说明：Redis 后台主动扫描并清理过期 Key 的力度
# 范围 1-10，值越大力度越大，消耗 CPU 也越多
# 默认 1，生产环境建议保持默认或根据监控调整
active-expire-effort 1
```
### 2.5 RDB 快照持久化
```conf
# ============================ RDB 快照持久化 ============================

# RDB 触发条件
# 格式：save <秒数> <修改次数>
# 说明：在指定秒数内发生至少指定次数的数据修改，则自动触发 RDB 保存
# 以下为生产环境常用配置，可根据业务调整
# 1 小时内至少 1 个 Key 被修改
save 3600 1  
# 5 分钟内至少 100 个 Key 被修改   
save 300 100    
# 1 分钟内至少 10000 个 Key 被修改
save 60 10000   

# 快照失败时是否停止写入
# 说明：当 RDB 保存失败时，Redis 停止接受写操作，防止数据不一致
# 生产环境建议开启
stop-writes-on-bgsave-error yes

# 是否压缩 RDB 文件
# 说明：使用 LZF 压缩算法压缩 RDB 文件，节省磁盘空间
# 开启后增加 CPU 消耗，生产环境建议开启
rdbcompression yes

# 是否启用 RDB 文件校验和
# 说明：在 RDB 文件末尾添加 CRC64 校验和，确保文件完整性
# 开启后增加约 10% 的保存和加载开销
rdbchecksum yes

# RDB 文件名
dbfilename dump.rdb

# 数据目录
# 说明：RDB 和 AOF 文件均存放在此目录
# 生产环境建议使用独立磁盘或挂载点
dir /var/lib/redis

# RDB 保存时是否增量 fsync
# 说明：每 4MB 数据执行一次 fsync，避免一次性大量写入导致延迟
rdb-save-incremental-fsync yes
```
### 2.6 AOF 日志持久化
```conf
# ============================ AOF 日志持久化 ============================

# 是否开启 AOF
# 说明：AOF 记录所有写命令，数据安全性高于 RDB
# 生产环境强烈建议开启
appendonly yes

# AOF 文件名前缀
appendfilename "appendonly.aof"

# AOF 文件存放子目录名
# 说明：Redis 7.0+ 将 AOF 文件存放在子目录中
appenddirname "appendonlydir"

# fsync 同步策略
# 说明：控制数据从内存缓冲区写入磁盘的频率
# always   - 每次写操作立即落盘，最安全，性能最差
# everysec - 每秒落盘一次，兼顾性能与安全(推荐)
# no       - 由操作系统决定，性能最好，但可能丢失大量数据
appendfsync everysec

# AOF 重写时是否禁止 fsync
# 说明：设为 yes 可降低阻塞，但增加数据丢失风险
# 生产环境建议保持 no
no-appendfsync-on-rewrite no

# AOF 重写触发百分比
# 说明：当前 AOF 文件大小比上次重写后增长了多少百分比时触发重写
# 例如：100 表示增长一倍时触发
auto-aof-rewrite-percentage 100

# AOF 重写触发最小文件大小
# 说明：AOF 文件至少达到此大小才触发重写，避免频繁重写
auto-aof-rewrite-min-size 64mb

# 是否加载截断的 AOF 文件
# 说明：AOF 文件尾部损坏时，是否加载已有数据并警告
# yes 表示启动并警告，no 表示拒绝启动
aof-load-truncated yes

# 是否启用混合持久化
# 说明：AOF 重写时在文件头部嵌入 RDB 快照
# 开启后，AOF 文件包含 RDB 快照 + 增量命令，恢复速度更快
aof-use-rdb-preamble yes

# AOF 重写时是否增量 fsync
# 说明：每 4MB 数据执行一次 fsync，避免延迟飙升
aof-rewrite-incremental-fsync yes
```
### 2.7 主从复制配置
```conf
# ========================== 主从复制配置 ==========================
# 指定主节点(从库独有，必须配置)
# 格式：replicaof <主节点IP> <主节点端口>
# 主节点需要注释掉
replicaof 192.168.100.231 6379

# 主节点密码认证(从库独有，主库有密码时必须配置)
masterauth YourStrongPassword2026!@#


# 是否启用无盘复制
# 说明：yes 表示主节点直接通过 socket 发送 RDB 给从节点，不写入磁盘
# no 表示先写磁盘再发送
# 网络带宽充足时建议 yes
repl-diskless-sync yes

# 无盘复制延迟时间
# 说明：等待更多从节点到达再开始传输，单位：秒
repl-diskless-sync-delay 5

# 复制积压缓冲区大小
# 说明：用于存储最近执行的写命令，从节点重连时进行增量同步
# 建议根据写流量设置 64MB-256MB
repl-backlog-size 128mb

# 复制积压缓冲区释放时间
# 说明：从节点全部断开后，缓冲区保留多久，0 表示永不释放
repl-backlog-ttl 3600

# 是否禁用 TCP_NODELAY
# 说明：yes 节省带宽但增加延迟，no 降低延迟但消耗带宽
repl-disable-tcp-nodelay no

# 从节点与主节点断开后，是否继续响应查询
# yes：返回可能过期的数据，no：返回错误
replica-serve-stale-data yes

# 从节点是否只读(从库独有，生产环境必须开启)
replica-read-only yes

# 从节点优先级(从库独有，用于哨兵选举)
# 值越小越优先被选为新主节点，0 表示不能成为主节点
replica-priority 100
```
### 2.8 惰性删除配置
```conf
# ============================ 惰性删除 ============================

# 内存淘汰时是否使用非阻塞删除
# 说明：yes 表示使用 UNLINK(异步)替代 DEL(阻塞)
lazyfree-lazy-eviction yes

# 键过期时是否使用非阻塞删除
lazyfree-lazy-expire yes

# 命令副作用时是否使用非阻塞删除
lazyfree-lazy-server-del yes

# 从节点清库时是否使用非阻塞删除
replica-lazy-flush yes

# DEL 命令是否默认行为改为 UNLINK
lazyfree-lazy-user-del no
```
### 2.9 性能优化配置
```conf
# ============================ 性能优化 ============================

# I/O 线程数
# 说明：Redis 6.0+ 支持网络 I/O 多线程，提高吞吐量
# 建议设置为 CPU 核心数的一半，不超过 8
# 例如：4 核 CPU 建议设为 2，8 核 CPU 建议设为 4
# 设为 1 表示禁用 I/O 线程
io-threads 4

# 是否启用 I/O 线程读取和协议解析
# 说明：yes 表示启用，建议开启
io-threads-do-reads yes

# 后台任务执行频率
# 说明：Redis 执行后台任务的频率，范围 1-500
# 值越大，响应越快，但消耗 CPU 也越多
# 默认 10，生产环境建议保持默认
hz 10

# 是否启用动态 hz
# 说明：根据客户端数量自动调整 hz，空闲时降低 CPU 消耗
dynamic-hz yes

# 是否启用主动 rehash
# 说明：后台渐进式 rehash，释放内存
activerehashing yes

# 是否禁用透明大页
# 说明：THP 会导致 Redis 延迟不稳定
# 建议在系统级别禁用，Redis 7.2+ 可通过此配置主动禁用
disable-thp yes

# 是否启用 Jemalloc 后台清理线程
jemalloc-bg-thread yes

# 普通客户端输出缓冲限制
# 格式：hard limit / soft limit / soft seconds
client-output-buffer-limit normal 0 0 0

# 从节点客户端输出缓冲限制
client-output-buffer-limit replica 256mb 64mb 60

# 发布订阅客户端输出缓冲限制
client-output-buffer-limit pubsub 32mb 8mb 60
```
### 2.10 监控与日志配置
```conf
# ============================ 监控与日志 ============================

# 慢查询阈值(微秒)
# 说明：执行时间超过此值的命令会被记录到慢查询日志
# 默认 10000(10ms)，生产环境建议保持默认或根据业务调整
slowlog-log-slower-than 10000

# 慢查询日志最大条数
# 说明：慢查询日志最多保留多少条，超出后移除最旧记录
# 建议设为 1000 以上，便于排查
slowlog-max-len 1000

# 延迟监控阈值(毫秒)
# 说明：0 表示关闭延迟监控
latency-monitor-threshold 0

# 键空间事件通知
# 说明：空字符串表示关闭
# 如需启用，参考 K 键空间 E 键事件 g 通用 $ 字符串 l 列表 s 集合 h 哈希 z 有序集合
notify-keyspace-events ""
```

## 三、哨兵配置文件模板
### 3.1 哨兵配置
```conf
# ============================ 哨兵配置 ============================
# 文件路径：/etc/redis-sentinel.conf

# ============================ 基本配置 ============================

# 哨兵监听端口
port 26379

# 保护模式(哨兵模式下必须关闭)
protected-mode no

# 是否以守护进程运行(配合 systemd 时必须为 no)
daemonize no

# 日志文件
logfile /var/log/redis/sentinel.log

# PID 文件
pidfile /run/redis/sentinel.pid

# ============================ 核心监控配置 ============================

# 监控的主节点信息
# 格式：sentinel monitor <主节点名称> <IP> <端口> <quorum>
# 名称：自定义，所有哨兵节点必须一致
# IP：主节点的实际内网 IP
# 端口：主节点的服务端口
# quorum：判定客观下线所需的最少哨兵同意数
# 建议：3 个哨兵设 2，5 个哨兵设 3
sentinel monitor mymaster 192.168.1.100 6379 2

# 主节点密码认证(如果 Redis 设置了密码，必须配置)
sentinel auth-pass mymaster YourStrongPassword2026!@#

# 主观下线判定时间(毫秒)
# 说明：哨兵在指定时间内未收到主节点响应，则判定为主观下线
# 建议：内网环境 10000-30000 毫秒
sentinel down-after-milliseconds mymaster 15000

# 故障转移超时时间(毫秒)
# 默认 180000(3 分钟)，可根据业务容忍度调整
sentinel failover-timeout mymaster 180000

# 故障转移后同时进行同步的从节点数量
# 说明：避免多个从节点同时同步造成网络压力
sentinel parallel-syncs mymaster 1

# ============================ 安全配置 ============================

# 禁止通过 SENTINEL SET 动态修改脚本路径
sentinel deny-scripts-reconfig yes

# 是否启用主机名解析
SENTINEL resolve-hostnames no

# 是否向客户端公布主机名
SENTINEL announce-hostnames no

# 主节点返回 -LOADING 时，等待多久再进行故障转移(0 表示不触发)
SENTINEL master-reboot-down-after-period mymaster 0

# ============================ 告警脚本(可选) ============================

# 通知脚本：发生重要事件时调用
# sentinel notification-script mymaster /usr/local/bin/sentinel_notify.sh

# 客户端重配置脚本：故障转移完成后调用
# sentinel client-reconfig-script mymaster /usr/local/bin/sentinel_reconfig.sh

```

## 四、集群配置文件模板
### 4.1 集群节点配置
```
# ============================ 集群配置 ============================
# 说明：每个集群节点使用独立的配置文件
# 文件路径示例：/etc/redis/redis-7001.conf

# ============================ 基础配置 ============================

# 每个节点使用不同端口(示例：7001-7006)
port 7001

# 绑定地址(生产环境绑定内网 IP)
bind 192.168.1.10

# 是否以守护进程运行(配合 systemd 时必须为 no)
daemonize no

# 日志文件(每个节点使用不同日志文件)
logfile /var/log/redis/redis-7001.log

# 数据目录(每个节点使用独立目录)
dir /var/lib/redis/7001

# 密码(所有节点统一)
requirepass YourStrongPassword2026!@#
masterauth YourStrongPassword2026!@#

# ============================ 集群核心配置 ============================

# 启用集群模式
cluster-enabled yes

# 集群配置文件(自动生成，不要手动修改)
# 每个节点使用不同的文件名
cluster-config-file nodes-7001.conf

# 节点超时时间(毫秒)
# 说明：节点间通信超时，超过此时间未响应则判定为疑似下线
# 建议：5000-15000 毫秒
cluster-node-timeout 10000

# ============================ 持久化配置 ============================

# 开启 AOF(集群模式建议开启)
appendonly yes
appendfsync everysec

# RDB 触发条件
save 3600 1
save 300 100
save 60 10000
```

## 五、各场景配置组合指南
### 5.1 场景一：单机独立部署
适用场景：数据量 < 20GB，QPS < 1 万，不需要高可用。
配置组合：

|配置节|是否启用|说明|
|---|---|---|
|基础网络配置|✅ 启用|必选|
|通用配置|✅ 启用|必选|
|安全配置|✅ 启用|生产环境必须|
|内存策略配置|✅ 启用|必须设置 maxmemory|
|RDB 持久化|✅ 启用|建议开启|
|AOF 持久化|✅ 启用|建议开启|
|主从复制配置|❌ 注释或删除|单机不需要|
|惰性删除配置|✅ 启用|推荐|
|性能优化配置|✅ 启用|推荐|
|监控与日志配置|✅ 启用|推荐|
### 5.2 场景二：主从复制部署
适用场景：数据量 < 20GB，QPS 1-5 万，需要读写分离和数据冗余。
配置组合：

|配置节|主节点|从节点|说明|
|---|---|---|---|
|基础网络配置|✅ 启用|✅ 启用|必选|
|通用配置|✅ 启用|✅ 启用|必选|
|安全配置|✅ 启用|✅ 启用|密码统一|
|内存策略配置|✅ 启用|✅ 启用|必须设置|
|RDB 持久化|✅ 启用|✅ 启用|建议开启|
|AOF 持久化|✅ 启用|✅ 启用|建议开启|
|**主从复制配置**|✅ 保持默认|✅ **配置 replicaof**|从节点必须配置|
|惰性删除配置|✅ 启用|✅ 启用|推荐|
|性能优化配置|✅ 启用|✅ 启用|推荐|
|监控与日志配置|✅ 启用|✅ 启用|推荐|

主节点额外配置：
- bind 需包含内网 IP，让从节点能访问
- requirepass 必须设置

从节点额外配置：
- replicaof <主节点IP> <主节点端口> 必须配置
- masterauth 必须与主节点 requirepass 一致
### 5.3 场景三：哨兵高可用部署
**适用场景**：数据量 < 20 GB，QPS 1-5 万，需要自动故障转移。

**配置组合**：

| 配置节      | 主节点    | 从节点                | 哨兵节点                   |
| -------- | ------ | ------------------ | ---------------------- |
| 基础网络配置   | ✅ 启用   | ✅ 启用               | -                      |
| 通用配置     | ✅ 启用   | ✅ 启用               | -                      |
| 安全配置     | ✅ 启用   | ✅ 启用               | -                      |
| 内存策略配置   | ✅ 启用   | ✅ 启用               | -                      |
| RDB 持久化  | ✅ 启用   | ✅ 启用               | -                      |
| AOF 持久化  | ✅ 启用   | ✅ 启用               | -                      |
| 主从复制配置   | ✅ 保持默认 | ✅ **配置 replicaof** | -                      |
| **哨兵配置** | -      | -                  | ✅ **使用 sentinel.conf** |
| 惰性删除配置   | ✅ 启用   | ✅ 启用               | -                      |
| 性能优化配置   | ✅ 启用   | ✅ 启用               | -                      |
| 监控与日志配置  | ✅ 启用   | ✅ 启用               |                        |
部署要求：
- 至少 3 个哨兵节点(生产环境最低要求)
- Redis 节点：1 主 + N 从(N ≥ 1)
- 所有节点密码统一
### 5.4 场景四：集群分布式部署
适用场景：数据量 > 50GB，QPS > 5 万，需要水平扩展。
配置组合：

| 配置节      | 集群节点(每个节点)               | 说明            |
| -------- | ------------------------ | ------------- |
| 基础网络配置   | ✅ 启用                     | 每个节点独立端口      |
| 通用配置     | ✅ 启用                     | 每个节点独立日志和数据目录 |
| 安全配置     | ✅ 启用                     | 所有节点密码统一      |
| 内存策略配置   | ✅ 启用                     | 每个节点独立设置      |
| RDB 持久化  | ✅ 启用                     | 建议开启          |
| AOF 持久化  | ✅ 启用                     | 建议开启          |
| **集群配置** | ✅ **启用 cluster-enabled** | 关键配置          |
| 惰性删除配置   | ✅ 启用                     | 推荐            |
| 性能优化配置   | ✅ 启用                     | 推荐            |
| 监控与日志配置  | ✅ 启用                     | 推荐            |
部署要求：
- 至少 3 个主节点
- 建议 3 主 + 3 从(6 个节点)
- 每个节点使用不同端口(如 7001-7006)
- 每个节点有独立的数据目录

## 六、配置参数速查表
### 6.1 必配参数清单
|配置项|建议值|说明|是否必须|
|---|---|---|---|
|`bind`|内网 IP|监听地址|✅ 必须|
|`port`|6379 或自定义|服务端口|✅ 必须|
|`requirepass`|强密码|访问密码|✅ 必须(生产)|
|`maxmemory`|物理内存 60%-75%|内存上限|✅ 必须|
|`maxmemory-policy`|`allkeys-lru`|淘汰策略|✅ 必须|
|`dir`|`/var/lib/redis`|数据目录|✅ 必须|
|`logfile`|具体路径|日志文件|✅ 必须(生产)|
|`daemonize`|`no`|配合 systemd|✅ 必须|
|`supervised`|`systemd`|systemd 集成|✅ 必须(生产)|
|`appendonly`|`yes`|AOF 开启|✅ 推荐|
|`appendfsync`|`everysec`|AOF 同步策略|✅ 推荐|
### 6.2 主从复制参数清单
|配置项|主节点|从节点|说明|
|---|---|---|---|
|`requirepass`|✅ 必须|✅ 必须|密码统一|
|`masterauth`|-|✅ 必须|连接主节点密码|
|`replicaof`|-|✅ 必须|指定主节点|
|`replica-read-only`|-|✅ 推荐|从节点只读|
|`repl-backlog-size`|✅ 推荐|-|缓冲区大小|
|`replica-priority`|-|✅ 推荐|哨兵选举优先级|
### 6.3 哨兵参数清单
| 配置项                                | 建议值               | 说明         |
| ---------------------------------- | ----------------- | ---------- |
| `port`                             | 26379             | 哨兵端口       |
| `protected-mode`                   | `no`              | 必须关闭       |
| `sentinel monitor`                 | `名称 IP 端口 quorum` | 监控主节点      |
| `sentinel auth-pass`               | 密码                | Redis 认证密码 |
| `sentinel down-after-milliseconds` | 10000-30000       | 下线判定时间     |
| `sentinel failover-timeout`        | 180000            | 故障转移超时     |
| `sentinel parallel-syncs`          | 1                 | 并行同步数      |
### 6.4 集群参数清单
|配置项|建议值|说明|
|---|---|---|
|`cluster-enabled`|`yes`|启用集群|
|`cluster-config-file`|`nodes-*.conf`|集群配置文件|
|`cluster-node-timeout`|5000-15000|节点超时时间|
|`cluster-replica-validity-factor`|10|从节点有效性因子|
|`cluster-migration-barrier`|1|副本迁移屏障|

## 七、配置验证与启动
### 7.1 验证配置文件语法
```bash
# 验证 redis.conf 配置是否正确
redis-server /etc/redis/redis.conf --test

# 验证哨兵配置是否正确
redis-sentinel /etc/redis-sentinel.conf --test

```
### 7.2 启动 Redis 服务
```bash
# 使用 systemd 启动
sudo systemctl start redis
sudo systemctl enable redis

# 或直接启动
redis-server /etc/redis/redis.conf
```
### 7.3 启动哨兵服务
```bash
# 使用 systemd 启动
sudo systemctl start redis-sentinel
sudo systemctl enable redis-sentinel

# 或直接启动
redis-sentinel /etc/redis-sentinel.conf
```
### 7.4 启动集群节点
```bash
# 逐个启动集群节点
redis-server /etc/redis/redis-7001.conf
redis-server /etc/redis/redis-7002.conf
redis-server /etc/redis/redis-7003.conf
redis-server /etc/redis/redis-7004.conf
redis-server /etc/redis/redis-7005.conf
redis-server /etc/redis/redis-7006.conf

# 创建集群
redis-cli -a 密码 --cluster create \
    192.168.1.10:7001 \
    192.168.1.11:7002 \
    192.168.1.12:7003 \
    192.168.1.10:7004 \
    192.168.1.11:7005 \
    192.168.1.12:7006 \
    --cluster-replicas 1
```

## 八、配置部署检查清单
### 8.1 通用检查项
- □ 配置文件路径：/etc/redis/redis.conf
- □ 数据目录：/var/lib/redis/ 存在且属主为 redis:redis
- □ 日志目录：/var/log/redis/ 存在且属主为 redis:redis
- □ requirepass 已设置且为强密码
- □ maxmemory 已设置(物理内存 60%-75%)
- □ maxmemory-policy 已设置
- □ daemonize no(配合 systemd)
- □ supervised systemd(配合 systemd)
- □ systemd 服务文件已创建：/etc/systemd/system/redis.service
- □ rename-command 已禁用危险命令
- □ 防火墙已放行对应端口
### 8.2 主从复制检查项
- □ 主节点 bind 包含内网 IP
- □ 从节点 replicaof 指向正确的主节点
- □ 从节点 masterauth 密码与主节点 requirepass 一致
- □ 从节点 replica-read-only yes
- □ INFO replication 确认主从状态正常
### 8.3 哨兵检查项
- □ 哨兵配置文件：/etc/redis-sentinel.conf
- □ sentinel monitor 指向正确的主节点
- □ sentinel auth-pass 密码与 Redis 密码一致
- □ quorum 设置为哨兵总数的一半以上
- □ protected-mode no
- □ 至少 3 个哨兵节点
- □ 哨兵服务已启动并设置开机自启
### 8.4 集群检查项
- □ 每个节点 cluster-enabled yes
- □ 每个节点有独立的数据目录和配置文件
- □ 每个节点端口不同，总线端口已放行
- □ 所有节点密码统一
- □ CLUSTER INFO 显示 cluster_state:ok
- □ 所有 16384 个哈希槽已分配
- □ 集群数据读写测试通过

## 九、总结
### 9.1 核心要点
1. 安全配置是基础：密码、重命名危险命令、绑定内网 IP 是生产环境三大安全基石
2. 内存策略必须设置：maxmemory 和 maxmemory-policy 缺一不可
3. 持久化双重保障：RDB 用于快速恢复，AOF 用于数据安全，生产环境同时开启
4. 主从复制实现读写分离：从节点只读，分担主节点读压力
5. 哨兵模式实现高可用：自动故障转移，生产环境推荐 3 个哨兵
6. 集群模式实现水平扩展：数据分片 + 高可用，适合大数据量场景
7. 根据场景选择架构：单机 → 主从 → 哨兵 → 集群，按需演进
### 9.2 场景选择建议
|数据量|QPS|高可用要求|推荐架构|
|---|---|---|---|
|< 20GB|< 1 万|低|单机|
|< 20GB|1-5 万|中|主从复制|
|< 50GB|1-5 万|高|哨兵高可用|
|> 50GB|> 5 万|高|集群分布式|