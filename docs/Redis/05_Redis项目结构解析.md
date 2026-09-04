## 一、目录结构概述
Redis 源码编译安装完成后，会在 Linux 文件系统中创建以下几类核心目录：

| 目录类型                   | 作用               | 升级时  | 备份必要性   |
| ---------------------- | ---------------- | ---- | ------- |
| 安装目录(/usr/local/redis) | 存放可执行文件          | 需要替换 | 几乎不需要备份 |
| 配置目录(/etc/redis)       | 存放配置文件           | 保留不动 | 建议备份    |
| 数据目录(/var/lib/redis)   | 存放持久化数据(RDB/AOF) | 保留不动 | 必须定期备份  |
| 日志目录(/var/log/redis)   | 存放运行日志           | 保留不动 | 按需保留    |

核心原则：升级 Redis 时，只替换安装目录中的可执行文件，不动配置目录和数据目录。

查看安装目录位置：
```bash
which redis-server
# 输出：/usr/local/redis/bin/redis-server
```
查看数据目录位置：
```bash
redis-cli -a 你的密码 CONFIG GET dir
# 输出：/var/lib/redis
```

## 二、安装目录
安装目录推荐默认是/usr/local/redis，源码编译安可自己设置目录。
### 2.1 安装目录位置
| 安装方式         | 默认安装目录                               |
| ------------ | ------------------------------------ |
| 源码编译安装(生产推荐) | `/usr/local/redis`                   |
| DNF / YUM 安装 | 文件分散在 `/usr/bin`、`/usr/lib64` 等系统目录中 |
| RPM 包安装      | 文件分散在系统目录中                           |
### 2.2 安装目录下的核心子目录
以源码编译安装为例，安装目录(`/usr/local/redis`)下的目录结构：
```text
/usr/local/redis/
└── bin/                               # 可执行文件目录
    ├── redis-server                   # Redis 服务器主程序
    ├── redis-cli                      # Redis 命令行客户端
    ├── redis-benchmark                # 性能基准测试工具
    ├── redis-check-aof                # AOF 日志文件修复工具
    ├── redis-check-rdb                # RDB 快照文件检查工具
    └── redis-sentinel                 # 哨兵模式启动程序(软链到 redis-server)
```
1.  bin-可执行文件目录
bin 目录下，存放 Redis 的所有可执行命令。

| 文件              | 作用                         |
| --------------- | -------------------------- |
| redis-server    | Redis 服务器主程序               |
| redis-cli       | Redis 命令行客户端               |
| redis-benchmark | 性能基准测试工具                   |
| redis-check-aof | AOF 日志文件修复工具               |
| redis-check-rdb | RDB 快照文件检查工具               |
| redis-sentinel  | 哨兵模式启动程序(软链到 redis-server) |

查看 bin 目录内容：
```bash
ls -l /usr/local/redis/bin/
```

## 三、源码目录
源码编译安装时，下载解压的源码目录(如 /opt/redis-7.2.5/)在安装完成后可以保留或删除。如果需要对 Redis 进行二次开发或深入阅读源码，建议保留。
### 3.1 源码目录的整体结构
```text
redis-7.2.5/
├── src/                   # 核心源码(最重要)
├── deps/                  # 第三方依赖库
├── tests/                 # 测试用例
├── utils/                 # 辅助工具
├── redis.conf             # 默认配置文件模板
├── sentinel.conf          # 哨兵配置模板
├── Makefile               # 顶层编译脚本
├── 00-RELEASENOTES        # 版本发布说明
├── BUGS                   # Bug 报告指南
├── CODE_OF_CONDUCT.md     # 行为准则
├── CONTRIBUTING.md        # 贡献指南
├── COPYING                # 许可证(GPL/BSD)
├── INSTALL                # 安装说明(指向README)
├── MANIFESTO              # 项目宣言/设计哲学
├── README.md              # 项目主文档
├── SECURITY.md            # 安全漏洞报告流程
├── TLS.md                 # TLS/SSL 加密配置指南
├── runtest                # 单元测试执行脚本
├── runtest-cluster        # 集群测试执行脚本
├── runtest-sentinel       # 哨兵测试执行脚本
└── runtest-moduleapi      # 模块API测试执行脚本
```
### 3.2 src
src 目录包含了 Redis 所有功能模块的代码文件，是 Redis 源码中最重要的目录。
按功能分类的核心文件：

|功能类别|核心文件|说明|
|---|---|---|
|服务器核心| `server.c`、`ae*.c`、`networking.c` |主程序入口、事件驱动、网络通信|
|数据结构| `sds.c`、`dict.c`、`adlist.c`、`ziplist.c` |SDS 字符串、字典、链表、压缩列表|
|数据类型| `t_string.c`、`t_list.c`、`t_hash.c`、`t_set.c`、`t_zset.c` |五种核心数据类型的命令实现|
|持久化| `rdb.c`、`aof.c` |RDB 快照和 AOF 日志|
|高级功能| `cluster.c`、`sentinel.c`、`replication.c`、`scripting.c` |
### 3.3 deps
deps 目录包含了 Redis 依赖的第三方代码库，这些代码可以独立于 Redis src 目录下的功能源码进行编译。

|子目录|说明|
|---|---|
|hiredis/|Redis 的 C 语言版本客户端库|
|jemalloc/|内存分配器，替代 glibc 的 malloc，减少内存碎片|
|linenoise/|命令行编辑工具，替代 readline，用于 redis-cli|
|lua/|Lua 脚本引擎，用于支持 Redis 的 Lua 脚本功能|

## 四、配置文件
### 4.1 配置文件的位置
|优先级|路径|说明|
|---|---|---|
|1|`/etc/redis/redis.conf`|源码编译安装的配置文件|
|2|`/etc/redis.conf`|DNF / YUM / RPM 安装的配置文件|
|3|启动时 `--conf` 参数指定|自定义配置文件路径|

查看正在使用的配置文件：
```bash
ps aux | grep redis-server
# 输出中会显示配置文件路径，如：
# /usr/local/redis/bin/redis-server /etc/redis/redis.conf
```
### 4.2 配置文件的结构
Redis 配置文件采用 `key value` 的格式，每行一个配置项，以 `#` 开头的行为注释。
```text
# 网络配置
bind 127.0.0.1 192.168.1.100
port 6379
protected-mode yes

# 安全配置
requirepass your_strong_password

# 内存配置
maxmemory 4gb
maxmemory-policy allkeys-lru

# 持久化配置
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# 数据目录
dir /var/lib/redis
```
### 4.3 配置文件参数说明
这是 Redis 7.2.5 版本的默认配置文件，我删除掉注释过的，留下默认值
```text
# ============================ 网络配置 ============================

# 监听地址(默认监听所有可用网络接口，生产环境建议绑定具体内网IP)
bind 127.0.0.1 -::1

# 保护模式(开启后，若未设置密码，仅允许本地回环地址访问)
protected-mode yes

# 监听端口(默认6379，IANA分配)
port 6379

# TCP连接队列大小(高并发环境需调大，受系统net.core.somaxconn限制)
tcp-backlog 511

# Unix domain socket路径(注释掉表示不启用)
unixsocket /run/redis/redis.sock

# 客户端空闲超时时间(秒，0表示不超时)
timeout 0

# TCP保活检测间隔(秒，检测死连接并保持中间设备连接活跃)
tcp-keepalive 300


# ============================ 通用配置 ============================

# 是否以守护进程运行(配合systemd时须为no)
daemonize no

# 是否启用systemd监督(no表示不启用，生产环境建议设为systemd或auto)
supervised no

# PID文件路径(运行时会创建，记录进程ID)
pidfile /run/redis/redis.pid

# 日志级别(debug/verbose/notice/warning/nothing，生产环境使用notice)
loglevel notice

# 日志文件路径(空字符串表示输出到标准输出)
logfile /var/log/redis/redis.log

# 数据库数量(默认16个，编号0-15)
databases 16

# 启动时是否显示ASCII艺术Logo(no表示仅在交互式会话显示)
always-show-logo no

# 是否修改进程标题(ps/top中显示运行时信息)
set-proc-title yes

# 进程标题模板(定义ps/top中显示的格式)
proc-title-template "{title} {listen-addr} {server-mode}"

# 本地化字符串比较环境(空字符串表示从环境变量派生)
locale-collate ""


# ============================ RDB快照持久化 ============================

# RDB触发条件(默认：3600秒1次、300秒100次、60秒10000次，均为注释状态)
# save 3600 1 300 100 60 10000

# 快照失败时是否停止写入(保护模式，避免数据不一致)
stop-writes-on-bgsave-error yes

# 是否压缩RDB文件(LZF压缩，节省磁盘但消耗CPU)
rdbcompression yes

# 是否启用RDB文件校验和(CRC64校验，增加约10%开销)
rdbchecksum yes

# RDB文件名
dbfilename dump.rdb

# 是否删除复制使用的RDB文件(仅当AOF和RDB持久化均禁用时生效)
rdb-del-sync-files no

# 数据目录(RDB和AOF文件均存放于此)
dir /var/lib/redis


# ============================ 主从复制 ============================

# 从节点与主节点断开后，是否继续响应查询(可能返回过期数据)
replica-serve-stale-data yes

# 从节点是否只读(生产环境建议保持只读)
replica-read-only yes

# 是否启用无盘复制(yes=直接通过socket传输RDB，no=先写磁盘再传输)
repl-diskless-sync yes

# 无盘复制延迟时间(秒，等待更多从节点到达再开始传输)
repl-diskless-sync-delay 5

# 无盘复制最大等待副本数(0表示无限制，等待完整延迟时间)
repl-diskless-sync-max-replicas 0

# 从节点是否使用无盘加载(disabled=存磁盘再加载，swapdb=内存中直接解析，on-empty-db=仅空库时启用)
repl-diskless-load disabled

# 是否禁用TCP_NODELAY(yes节省带宽但增加延迟，no降低延迟但消耗带宽)
repl-disable-tcp-nodelay no

# 从节点优先级(值越小越优先被哨兵选为主节点，0表示不能成为主节点)
replica-priority 100

# 从节点是否向哨兵公布自己(no表示不被哨兵发现)
replica-announced yes


# ============================ 安全配置 ============================

# ACL日志最大长度(记录被ACL拒绝的命令和认证事件)
acllog-max-len 128

# 是否设置访问密码(注释掉表示无密码，生产环境必须设置)
# requirepass foobared


# ============================ 客户端与内存管理 ============================

# 最大客户端连接数(注释掉表示使用默认10000，受系统ulimit -n限制)
# maxclients 10000

# 最大内存限制(注释掉表示不限制，生产环境强烈建议设置)
# maxmemory <bytes>

# 内存淘汰策略(noeviction=不淘汰，写操作返回错误)
maxmemory-policy noeviction

# LRU/LFU采样数量(值越大越精确，CPU消耗越高)
maxmemory-samples 5

# 是否忽略从节点的maxmemory设置(yes表示从节点不主动淘汰，由主节点控制)
replica-ignore-maxmemory yes


# ============================ 惰性删除 ============================

# 内存淘汰时是否使用非阻塞删除(UNLINK替代DEL)
lazyfree-lazy-eviction no

# 键过期时是否使用非阻塞删除
lazyfree-lazy-expire no

# 命令副作用(如RENAME覆盖旧键)时是否使用非阻塞删除
lazyfree-lazy-server-del no

# 从节点清库时是否使用非阻塞删除
replica-lazy-flush no

# DEL命令是否默认行为改为UNLINK(非阻塞删除)
lazyfree-lazy-user-del no

# FLUSHALL/FLUSHDB是否默认异步删除
lazyfree-lazy-user-flush no


# ============================ 线程I/O ============================

# I/O线程数(注释掉表示禁用，建议4核以上机器启用)
# io-threads 4

# 是否启用I/O线程读取和协议解析(注释掉表示禁用)
# io-threads-do-reads no


# ============================ 内核OOM控制 ============================

# OOM评分调整策略(no=不调整，yes=relative，absolute=直接写入，relative=相对初始值调整)
oom-score-adj no

# OOM评分调整值(master/replica/child进程的优先级，值越高越容易被kill)
oom-score-adj-values 0 200 800


# ============================ 透明大页控制 ============================

# 是否禁用透明大页(yes表示Redis启动时主动禁用THP，避免延迟问题)
disable-thp yes


# ============================ AOF日志持久化 ============================

# 是否开启AOF(no表示关闭，生产环境建议yes)
appendonly no

# AOF文件名基础
appendfilename "appendonly.aof"

# AOF文件存放子目录名
appenddirname "appendonlydir"

# fsync同步策略(always=每次写/everysec=每秒/no=操作系统决定)
appendfsync everysec

# AOF重写时是否禁止fsync(yes降低阻塞，但增加数据丢失风险)
no-appendfsync-on-rewrite no

# AOF重写触发百分比(当前文件比上次重写后增长多少%触发)
auto-aof-rewrite-percentage 100

# AOF重写触发最小文件大小(低于此值不触发重写)
auto-aof-rewrite-min-size 64mb

# 是否加载截断的AOF文件(yes加载并警告，no拒绝启动)
aof-load-truncated yes

# 是否启用混合持久化(AOF头部包含RDB快照，加快恢复速度)
aof-use-rdb-preamble yes

# 是否在AOF中记录时间戳注解(用于PITR恢复，可能不兼容旧解析器)
aof-timestamp-enabled no


# ============================ 慢查询日志 ============================

# 慢查询阈值(微秒，超过此值记录到慢日志)
slowlog-log-slower-than 10000

# 慢查询日志最大保留条数(超出后移除最旧记录)
slowlog-max-len 128


# ============================ 延迟监控 ============================

# 延迟监控阈值(毫秒，0表示关闭监控)
latency-monitor-threshold 0


# ============================ 键空间事件通知 ============================

# 键空间通知类型(空字符串表示关闭)
notify-keyspace-events ""


# ============================ 高级数据结构优化 ============================

# Hash类型：使用listpack的最大字段数(7.0+，替代ziplist)
hash-max-listpack-entries 512

# Hash类型：使用listpack的单个字段最大字节数
hash-max-listpack-value 64

# List类型：quicklist每个节点最大大小(-2=8KB)
list-max-listpack-size -2

# List类型：压缩深度(0=不压缩，1=首尾各1个节点不压缩)
list-compress-depth 0

# Set类型：使用整数集合的最大元素数(纯整数集合)
set-max-intset-entries 512

# Set类型：非整数集合使用listpack的最大元素数
set-max-listpack-entries 128

# Set类型：非整数集合使用listpack的单个元素最大字节数
set-max-listpack-value 64

# ZSet类型：使用listpack的最大元素数
zset-max-listpack-entries 128

# ZSet类型：使用listpack的单个元素最大字节数
zset-max-listpack-value 64

# HyperLogLog：稀疏表示的最大字节数
hll-sparse-max-bytes 3000

# Stream类型：单个宏节点最大字节数
stream-node-max-bytes 4096

# Stream类型：单个宏节点最大条目数
stream-node-max-entries 100

# 是否启用主动rehash(后台渐进式rehash，释放内存)
activerehashing yes

# 普通客户端输出缓冲限制(hard/soft/soft seconds)
client-output-buffer-limit normal 0 0 0

# 从节点客户端输出缓冲限制
client-output-buffer-limit replica 256mb 64mb 60

# 发布订阅客户端输出缓冲限制
client-output-buffer-limit pubsub 32mb 8mb 60

# 后台任务执行频率(1-500，默认10，值越大响应越快但消耗CPU)
hz 10

# 是否启用动态hz(根据客户端数量自动调整hz)
dynamic-hz yes

# AOF重写时是否增量fsync(每4MB数据执行一次fsync)
aof-rewrite-incremental-fsync yes

# RDB保存时是否增量fsync(每4MB数据执行一次fsync)
rdb-save-incremental-fsync yes

# 是否启用Jemalloc后台清理线程
jemalloc-bg-thread yes
```
安全风险提醒
1. 无密码，requirepass 未设置，任何客户端无需认证即可连接，建议设置强密码
2. 无内存限制，`maxmemory` 未设置，可能耗尽系统内存，根据服务器内存设置上限
3. AOF 未开启，`appendonly no`，宕机可能丢失大量数据，生产环境开启混合持久化
4. supervised 为 no，未与 systemd 集成，设置为 `systemd` 或 `auto`
### 4.4 哨兵配置文件说明
`/etc/redis-sentinel.conf`
Sentinel 是 Redis 官方提供的高可用解决方案，主要功能是监控主从节点健康状态，并在主节点故障时自动执行故障转移，将某个从节点提升为新的主节点。

**核心作用**：
- 监控：定期检查主节点和从节点是否正常运行
- 通知：当节点状态发生变化时，通过 API 或脚本通知管理员
- 自动故障转移：当主节点不可用时，自动将从节点提升为主节点
- 配置中心：客户端连接 Sentinel 获取当前主节点地址，实现高可用
```text
# ============================ 说明 ============================
# 
#   配置文件中的未注释参数汇总
#
# ============================ 说明 ============================


# ============================ 网络配置 ============================

# 保护模式(Sentinel 默认关闭，需配合防火墙限制访问来源)
protected-mode no

# Sentinel 服务监听端口(默认 26379)
port 26379

# 密码,需要跟redis.conf
# mymaster,必须与 sentinel monitor 中的主节点名称完全一致
# 必须与 redis.conf 中的 requirepass 完全一致
sentinel auth-pass mymaster Redis@root123


# ============================ 通用配置 ============================

# 是否以守护进程运行(配合 systemd 时必须为 no)
daemonize no

# PID 文件路径
pidfile /run/redis/sentinel.pid

# 日志级别(生产环境使用 notice)
loglevel notice

# 日志文件路径
logfile /var/log/redis/sentinel.log

# 工作目录(Sentinel 会在该目录下创建临时文件，建议改为 /var/lib/redis/sentinel)
dir /tmp


# ============================ 核心监控配置 ============================

# 监控的主节点信息
# 格式：sentinel monitor <主节点名称> <IP> <端口> <quorum>
# 注意：127.0.0.1 仅限单机测试，生产环境必须改为实际内网 IP
sentinel monitor mymaster 127.0.0.1 6379 2

# 主观下线判定时间(毫秒)，30 秒无响应则判定为主观下线(SDOWN)
sentinel down-after-milliseconds mymaster 30000

# 故障转移后同时同步的从节点数量(1 表示逐个同步，避免网络压力过大)
sentinel parallel-syncs mymaster 1

# 故障转移超时时间(毫秒)，180000 = 3 分钟
sentinel failover-timeout mymaster 180000

# 禁止通过 SENTINEL SET 动态修改脚本路径(安全加固)
sentinel deny-scripts-reconfig yes

# 是否启用主机名解析(no 表示仅使用 IP 地址)
SENTINEL resolve-hostnames no

# 是否向客户端公布主机名(no 表示公布 IP 地址)
SENTINEL announce-hostnames no

# 主节点返回 -LOADING 时，等待多久再进行故障转移(0 表示不触发)
SENTINEL master-reboot-down-after-period mymaster 0


# ============================ ACL 安全 ============================

# ACL 日志最大保留条数
acllog-max-len 128
```
生产环境必须修改的配置

| 配置项                     | 当前值         | 建议值                       | 说明                    |
| ----------------------- | ----------- | ------------------------- | --------------------- |
| `sentinel monitor` 的 IP | `127.0.0.1` | 改为实际内网 IP                 | 否则其他哨兵无法访问主节点         |
| `sentinel auth-pass`    | 注释状态        | 取消注释并设置密码                 | 如果 Redis 设置了密码，此处必须配置 |
| `dir`                   | `/tmp`      | `/var/lib/redis/sentinel` | 避免 `/tmp` 重启被清理       |
| `quorum`                | `2`         | 根据哨兵总数设置                  | 建议 > 哨兵总数的一半          |


## 五、数据目录
数据目录推荐默认是:/var/lib/redis,源码编译安可自己设置目录。
### 5.1 查看数据目录位置
```bash
redis-cli -a 你的密码 CONFIG GET dir
```
或在 redis-cli 中执行：
```text
127.0.0.1:6379> CONFIG GET dir
1) "dir"
2) "/var/lib/redis"
```
### 5.2 默认数据目录位置
| 安装方式         | 默认数据目录                 |
| ------------ | ---------------------- |
| 源码编译安装       | `/var/lib/redis`(可自定义) |
| DNF / YUM 安装 | `/var/lib/redis`       |
### 5.3 数据目录的核心结构
```text
/var/lib/redis/
├── dump.rdb                    # RDB 快照文件(定期生成的全量备份)
├── appendonly.aof              # AOF 日志文件(记录所有写命令)
└── redis.pid                   # 进程 ID 文件(记录 Redis 进程 PID)
```
1. dump.rdb — RDB 快照文件
- 作用：存储 Redis 在某个时间点的全量数据快照
- 触发方式：自动触发(按 save 配置)或手动执行 BGSAVE
- 恢复方式：Redis 启动时自动加载

2. appendonly.aof — AOF 日志文件
- 作用：记录所有写操作命令，用于数据恢复
- 触发方式：需在配置文件中开启 appendonly yes
- 恢复方式：Redis 启动时逐条执行 AOF 中的命令

1. redis.pid — 进程 ID 文件
- 位置：`/run/redis/redis.pid`或 `/var/run/redis.pid`
- 作用：记录当前运行的 Redis 进程 PID
- 用途：用于 systemd 管理进程状态
### 5.4 查看数据目录的内容
```bash
cd /var/lib/redis
ls -l
```
### 5.5 生产环境注意事项
- RDB 和 AOF 文件必须定期备份，它们是数据恢复的核心资产
- 数据目录和日志目录建议放在不同磁盘，避免同一磁盘故障导致数据 + 日志同时丢失
- 监控磁盘使用率，防止持久化文件写满磁盘

## 六、日志目录
日志文件目录推荐默认是:/var/log/redis，源码编译安可自己设置目录。
### 6.1 查看日志配置
```bash
redis-cli -a 你的密码 CONFIG GET logfile
```
示例输出：
```text
1) "logfile"
2) "/var/log/redis/redis.log"
```
### 6.2 日志目录的核心结构
```text
/var/log/redis/
└── redis.log                    # Redis 运行日志
```
redis.log — 运行日志
- 作用：记录 Redis 的运行信息、错误信息、警告信息
- 日志级别：debug、verbose、notice、warning(生产环境建议 notice)
### 6.3 查看日志内容
```bash
# 查看最新 50 行日志
sudo tail -50 /var/log/redis/redis.log

# 实时跟踪日志输出
sudo tail -f /var/log/redis/redis.log
```

## 七、配置文件与启动脚本
### 7.1 systemd 服务文件
源码编译安装时，需要手动创建 systemd 服务文件，位置为 /etc/systemd/system/redis.service。
```text
/etc/systemd/system/
└── redis.service                 # Redis 的 systemd 服务管理文件
```
查看服务文件内容：
```bash
cat /etc/systemd/system/redis.service
```
### 7.2 配置目录总览
```text
/etc/
├── redis/
│   └── redis.conf                # Redis 主配置文件
├── systemd/
│   └── system/
│       └── redis.service         # systemd 服务管理文件
└── profile.d/
    └── redis.sh                  # Redis 环境变量(PATH 配置)
```

## 八、总结
### 8.1 核心目录速查表
| 目录                                  | 一句话说明                           | 备份必要性  |
| ----------------------------------- | ------------------------------- | ------ |
| `/usr/local/redis/bin/`             | 可执行文件(redis-server、redis-cli 等) | 几乎不需要  |
| `/etc/redis/redis.conf`             | Redis 主配置文件                     | 建议备份   |
| `/var/lib/redis/`                   | 持久化数据(RDB/AOF)                  | 必须定期备份 |
| `/var/log/redis/`                   | 运行日志                            | 按需保留   |
| `/etc/systemd/system/redis.service` | systemd 服务管理文件                  | 建议备份   |
| `/opt/redis-7.2.5/`                 | 源码目录(安装后可删除)                    | 不需要    |
### 8.2 核心原则
1. 安装目录 = 程序文件(升级时替换，平时不用管)
2. 数据目录 = 核心资产(RDB/AOF 文件—定期备份，重点保护)
3. 配置文件 = 运行规则(改完需重启或 CONFIG REWRITE 生效)
4. 日志文件 = 运行记录(排错和监控的第一手资料)
5. 升级原则 = 只替换安装目录中的可执行文件，不动数据目录和配置目录