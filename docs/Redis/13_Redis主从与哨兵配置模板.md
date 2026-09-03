**适用系统**：Rocky Linux 8(兼容 CentOS 8 / RHEL 8 / AlmaLinux 8)  
**覆盖架构**：单机(基础)→ 主从(读写分离)→ 哨兵(高可用)
**说明:**
基于 Redis 7.2.5 的主从复制 + 哨兵模式，部署在 三台物理/云服务器
- Redis Master  IP ： 192.168.100.231
- Redis Slave-1 IP ：192.168.100.232
- Redis Slave-2 IP ：192.168.100.233
- Sentinel-1：192.168.100.231:26379
- Sentinel-2：192.168.100.232:26379
- Sentinel-3：192.168.100.233:26379
1. 每台服务器同时运行一个 Redis 实例(构成一主两从)和一个 Sentinel 实例(构成三哨兵集群)
2. 客户端通过哨兵获取当前主节点地址，写请求直接发送至 Master(:6379)
3. 读请求可分散到任意 Slave(:6379)，从而实现读写分离与自动故障转移。
-- -
## 一、架构简介
### 1.1 架构特点
| 场景       | 技术选型                    | 说明                                   |
| -------- | ----------------------- | ------------------------------------ |
| Redis 安装 | 源码编译(Redis-7.2.5)       | ✅ 版本锁定，路径规范，适合生产环境统一运维               |
| 数据持久化    | RDB 快照 + AOF 日志(可配置)    | ✅ 双重保障，最大限度降低宕机数据丢失风险                |
| 主从同步     | 异步复制(默认)                | ✅ 实时同步，从节点提供只读能力，分担主库压力              |
| 主节点故障    | Sentinel 哨兵集群(3 个)      | ✅ 自动健康检查 + 领导者选举，故障切换时间约 10~30 秒(可调) |
| 读写分离     | 客户端直连 / 代理(如 Twemproxy) | ✅ 写走主、读走从，无需应用层额外路由，配置灵活             |
| 配置一致性    | 集中式配置文件 + 哨兵统一监控        | ✅ 每节点配置清晰，哨兵统一管理所有 Redis 实例，避免人为误操作  |
| 扩容/缩容    | 手动添加/删除从节点              | ✅ 从节点可动态加入或下线，不影响主业务(但需注意复制压力)       |
### 1.2 应用场景
1. 通用缓存层：适用于日均 100 万 ~ 2000 万 PV 的 Web/App 业务，缓存热点数据(如商品详情、用户资料)，减少数据库压力。
2. 会话共享(Session)：支持分布式应用(如 Spring Session)的用户登录态存储，保障 HA 下用户不反复登录。
3. 排行榜 / 计数器：社交、电商、游戏等场景的实时点赞、浏览、积分排行(ZSet / Hash)，读并发高。
4. 轻量级消息队列：利用 List / Stream 暂存异步任务(如邮件、短信、订单超时处理)，确保任务不丢失。
5. 分布式锁：基于 Redisson 等客户端，实现秒杀、防重复提交等业务锁，哨兵保证锁服务高可用。
### 1.3 架构图
```text
Redis 7.2.5 主从复制 + 哨兵模式(三台服务器部署)

 +-----------------------+     +-----------------------+   +-----------------------+
|  服务器1(192.168.100.231)|  | 服务器2(192.168.100.232)|  |服务器3(192.168.100.233)  |
|  +-------------------+  |  |  +-------------------+  |  |  +-------------------+  |
|  | Redis Master      |  |  |  | Redis Slave-1     |  |  |  | Redis Slave-2     |  |
|  | :6379             |  |  |  | :6379             |  |  |  | :6379             |  |
|  +---------+---------+  |  |  +---------+---------+  |  |  +---------+---------+  |
|  +---------+---------+  |  |  +---------+---------+  |  |  +---------+---------+  |
|  | Sentinel-1 :26379 |  |  |  | Sentinel-2 :26379 |  |  |  | Sentinel-3 :26379 |  |
|  +-------------------+  |  |  +-------------------+  |  |  +-------------------+  |
+----------+--------------+  +----------+--------------+  +----------+--------------+
           │                            │                           │
           │                            │                           │
           │          ②互相监控          │                           │
           │          (哨兵间)           │                           │
           │                            │                           │
           │        ①异步数据复制        │                           │
           │        (Master→Slave)      │                           │
           │                            │                           │
           └─────────────┬──────────────┴───────────────────────────┘
                         │
                  +------v-------+
                  | 应用客户端    |  ←③查询主节点地址(通过哨兵)
                  | (业务系统)    |  ←④读写数据直接连接Master:6379
                  +--------------+
                  (所有哨兵均监控全部Redis节点)

说明：
- 三台服务器均部署Redis实例(一主两从)和Sentinel实例(三哨兵)。
- 哨兵集群监控所有Redis节点，自动故障转移时提升新Master。
- 客户端通过哨兵获取当前Master地址，写请求只发往Master，读请求可分散至Slave。
```
-- -
## 二、系统级设置
### 2.1 内存 overcommit 设置
Redis 在执行 RDB 或 AOF 重写时，会通过 fork() 创建子进程，需要临时申请大量虚拟地址空间。
```bash
# 永久设置
echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```
### 2.2 禁用透明大页(THP)
透明大页会导致 Redis 延迟不稳定，生产环境建议禁用。
```bash
# 禁用透明大页(永久生效)
echo 'echo never > /sys/kernel/mm/transparent_hugepage/enabled' | sudo tee -a /etc/rc.d/rc.local
sudo chmod +x /etc/rc.d/rc.local
```
验证是否生效(重启后执行)：
```bash
cat /sys/kernel/mm/transparent_hugepage/enabled
```
预期输出应包含 ` [never]`。如果重启后未生效，可能是 rc-local 服务未启动，执行：
```
sudo systemctl enable --now rc-local
```
### 2.3 ulimit 设置
在 Rocky Linux 8 生产环境中，Redis 通常通过 systemd 服务管理。为确保修改永久生效，需要同时修改系统配置和服务配置。
1. 修改系统全局限制 (/etc/security/limits.conf)
```bash
sudo vim /etc/security/limits.conf
```
在文件末尾添加以下内容：
```text
* soft nofile 65535
* hard nofile 65535
```
这里 * 代表对所有用户生效，soft 为软限制，hard 为硬限制。
**说明：** 后续会再 `/etc/systemd/system/redis.service` 中添加：
```text
[Service]
LimitNOFILE=65535
```
### 2.4 net.core.somaxconn设置 
当并发连接数瞬间激增，完成握手的连接数超过队列长度时，新连接将被丢弃，客户端会收到连接拒绝或超时的错误。Redis 启动时也会输出警告日志。
编辑 /etc/sysctl.conf，添加或修改以下内容：
```text
# 默认值128，生产环境设置为65535
net.core.somaxconn = 65535
```
### 2.5 vm.swappiness 设置
控制内核使用 Swap 交换空间的倾向，取值范围 0-100。值越大，越倾向于将内存页交换到磁盘。
编辑 /etc/sysctl.conf，添加或修改以下内容：
```text
# 推荐值：设置为 1，表示仅在内存极度不足时才使用 Swap，最大程度避免 Redis 被交换
vm.swappiness = 1
```
### 2.6 net.ipv4.tcp_max_syn_backlog 设置
核中处于 SYN_RECV 状态(已完成第一步握手，等待第三步握手 ACK)的连接队列最大长度。
编辑 /etc/sysctl.conf，添加或修改以下内容：
```text
net.ipv4.tcp_max_syn_backlog = 65535
```
### 2.7 防火墙设置
```bash
# 仅允许 192.168.100.0/24 网段访问 Redis 6379 端口
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.100.0/24" port protocol="tcp" port="6379" accept'

# 仅允许 192.168.100.0/24 网段访问 Redis 26379 端口
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.100.0/24" port protocol="tcp" port="26379" accept'

# 重新加载规则使生效
sudo firewall-cmd --reload

# 查看当前生效的富规则
sudo firewall-cmd --list-rich-rules
#
# 查看已放行的端口列表
sudo firewall-cmd --list-ports
```
### 2.8 SELinux 设置
设置为 permissive 模式
```
sudo setenforce 0
sudo sed -i 's/SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config
```
### 2.9 系统重启
```bash
sudo reboot
```
验证配置：
```
sysctl vm.overcommit_memory net.core.somaxconn net.ipv4.tcp_max_syn_backlog vm.swappiness
cat /sys/kernel/mm/transparent_hugepage/enabled
```
-- -
## 三、Redis 安装
### 3.1 安装编译依赖
Redis 由 C 语言编写，编译时需要 GCC 编译器和 Make 构建工具。
```bash
sudo dnf install -y gcc make tcl systemd-devel openssl-devel
```
各依赖包说明：
1. gcc，GNU C 编译器，用于编译 Redis 源码
2. make，构建自动化工具，用于执行编译流程
3. tcl，工具命令语言，用于运行 Redis 的测试套件
4. systemd-devel，systemd 开发库，使 Redis 能与 systemd 集成
5. openssl-devel，OpenSSL 开发库，用于编译 TLS 加密支持
### 3.2 下载与解压源码
```bash
# 进入目录
cd /opt
# 目前最新稳定版本可从 redis.io 获取
sudo wget https://download.redis.io/releases/redis-7.2.5.tar.gz
# 解压源码包
sudo tar -xzvf redis-7.2.5.tar.gz
# 进入源码目录
cd redis-7.2.5
```
### 3.3 编译与安装
1. 编译源码
生产环境强烈推荐使用以下编译参数：
```bash
# 1. 解压后先改属主(避免 sudo 解压导致 root 属主)$USER可以替换自己用户名
sudo chown -R $(whoami):$(whoami) /opt/redis-7.2.5
# 2. 切换到普通用户编译
cd /opt/redis-7.2.5
make BUILD_TLS=yes BUILD_WITH_JEMALLOC=yes -j$(nproc)
```
2. 运行测试
```bash
make test
```
说明：运行 Redis 自带的测试用例，验证编译结果是否正确。全部通过会显示 All tests passed。
3. 安装到指定目录(推荐)
```bash
sudo make install PREFIX=/usr/local/redis
```
说明：使用 PREFIX 参数指定安装目录，所有可执行文件会安装到 /usr/local/redis/bin 下。
4. 配置 PATH 环境变量
```bash
echo 'export PATH=/usr/local/redis/bin:$PATH' | sudo tee /etc/profile.d/redis.sh
source /etc/profile.d/redis.sh
```
说明：将 Redis 的 bin 目录添加到系统 PATH，便于直接执行 redis-server、redis-cli 等命令。
### 3.4 创建 Redis 用户与目录
1. 创建专用用户
安全原则：生产环境禁止以 root 用户运行 Redis。
```bash
sudo useradd -r -s /sbin/nologin redis
```
2. 创建必要目录
```bash
# 存放 Redis 配置文件
sudo mkdir -p /etc/redis
# 存放持久化数据文件(RDB、AOF)
sudo mkdir -p /var/lib/redis
# 存放 Redis 日志文件
sudo mkdir -p /var/log/redis
```
3. 设置目录权限
```bash
sudo chown -R redis:redis /var/lib/redis
sudo chown -R redis:redis /var/log/redis
sudo chmod 755 /var/lib/redis
sudo chmod 755 /var/log/redis
```
### 3.5  Redis 配置文件

```bash
# 可以从解压包里面复制一份配置文件出来,或者自己有配置文件模板就不需要复制，直接编辑
#sudo cp /opt/redis-7.2.5/redis.conf /etc/redis/redis.conf
sudo vi /etc/redis/redis.conf
```
添加以下内容
```conf
# ============================ 基础网络配置 ============================

# 监听地址
# 说明：指定 Redis 监听的网络接口 IP 地址
# 生产环境建议绑定内网 IP(如 192.168.100.231)，禁止绑定 0.0.0.0
# 如果仅本机访问，保留 127.0.0.1 即可；如需跨服务器访问，添加内网 IP
bind 127.0.0.1 192.168.100.231

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

# ============================ 安全配置 ============================

# 访问密码(生产环境必须设置)
# 说明：客户端连接 Redis 时需要认证的密码
# 建议：16 位以上，包含大小写字母、数字和特殊字符
requirepass Redis@root123

# 主从复制认证密码
# 说明：从节点连接主节点时使用的密码，必须与主节点 requirepass 一致
# 如果主节点设置了密码，从节点必须配置此参数
masterauth Redis@root123

# 禁用或重命名危险命令
# 说明：将危险命令重命名为空字符串表示完全禁用
# 重命名为其他名称表示仅允许知道新命令名的人使用
# 危险命令包括：FLUSHALL、FLUSHDB、CONFIG、KEYS 等
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG ""
rename-command KEYS ""

# ACL 日志最大长度
# 说明：记录被 ACL 拒绝的命令和认证事件的最大条数
acllog-max-len 128

# 最大客户端连接数
# 说明：限制同时连接的客户端数量，默认 10000
# 需同步调整系统 ulimit -n 限制，否则实际生效值受系统限制
maxclients 10000

# ============================ 内存策略 ============================

# 最大内存限制(生产环境必须设置)
# 说明：限制 Redis 使用的最大内存，单位可以是 kb、mb、gb
# 建议：设为物理内存的 60%-75%
# 由于我用虚拟机模拟，虚拟机内存只有2G，我这边分配1GB

maxmemory 1gb

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
设置文件权限
```bash
sudo chown -R redis:redis /etc/redis
sudo chmod 755 /etc/redis
sudo chmod 640 /etc/redis/redis.conf
```
**说明:** 后续的 RDB、AOF、主从复制参数会在以下后续配置。
**注意:** bind 参数里面的 bind 127.0.0.1 192.168.100.231 中，192.168.100.231 替换成自己主机内网IP。
- Redis Master 主机：bind 127.0.0.1 192.168.100.231
- Redis Slave-1 主机：bind 127.0.0.1 192.168.100.232
- Redis Slave-2 主机：bind 127.0.0.1 192.168.100.233

### 3.6 创建 systemd 服务
创建服务文件
```bash
sudo vi /etc/systemd/system/redis.service
```
添加以下内容
```
[Unit]
Description=Redis 7.2.x In-Memory Data Store
After=network.target

[Service]
Type=notify
User=redis
Group=redis
ExecStart=/usr/local/redis/bin/redis-server /etc/redis/redis.conf
ExecStop=/usr/local/redis/bin/redis-cli -a Redis@root123 shutdown
Restart=always
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```
配置项说明：

| 配置项                      | 说明                             |
| ------------------------ | ------------------------------ |
| Type=notify              | supervised systemd             |
| User=redis / Group=redis | 以 redis 用户身份运行                 |
| ExecStart                | 启动命令：指定 redis-server 路径和配置文件路径 |
| ExecStop                 | 停止命令：使用 redis-cli 执行 shutdown  |
| Restart=always           | 进程异常退出时自动重启                    |
| LimitNOFILE=65535        | 最大打开文件数限制                      |
### 3.7 启动服务
```bash
# 重新加载 systemd 配置
sudo systemctl daemon-reload

# 设置开机自启
sudo systemctl enable redis

# 启动 Redis 服务
sudo systemctl start redis

# 查看服务状态
sudo systemctl status redis
```
### 3.8 验证安装
```bash
redis-cli -a Redis@root123 ping
```
预期返回：PONG
-- -
## 四、持久化配置
三台服务器都采用采用 RDB + AOF 混合持久化，定期备份 RDB 文件，实时记录 AOF 日志。每一台服务器都需要操作一遍。
### 4.1 创建 PID 文件目录
创建 PID 文件目录
```bash
sudo mkdir -p /run/redis
sudo chown redis:redis /run/redis
```
### 4.2 RDB 快照持久化
```bash
sudo vi /etc/redis/redis.conf
```
添加以下内容
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
### 4.3 AOF 日志持久化
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
### 4.4 重启服务
```bash
# 重启 Redis
sudo systemctl restart redis

# 查看服务状态
sudo systemctl status redis
```
-- -
## 五、主从复制配置
主从复制(Replication)是指将一个 Redis 节点作为主节点(Master)，一个或多个 Redis 节点作为从节点(Replica)，从节点通过复制主节点的数据，保持与主节点数据一致的过程。

主节点负责处理写请求，从节点负责处理读请求，实现读写分离。从节点会持续从主节点同步数据，保持数据的一致性。

哨兵负责运行时切换，但如果涉及到节点重启或重新加入，必须人工检查和修正 `redis.conf` 中的 `replicaof` 指向。
### 5.1 主从复制配置模板
```conf
# ========================== 主从复制配置 ==========================
# 指定主节点(从库独有，必须配置)
# 格式：replicaof <主节点IP> <主节点端口>
# 主节点需要注释掉
replicaof 192.168.100.231 6379

# 主节点密码认证(从库独有，主库有密码时必须配置)
masterauth Redis@root123

# 是否启用无盘复制
# 说明：yes 表示主节点直接通过 socket 发送 RDB 给从节点，不写入磁盘
# no 表示先写磁盘再发送
# 网络带宽充足时建议 yes
repl-diskless-sync yes

# 无盘复制延迟时间
# 说明：等待更多从节点到达再开始传输，单位：秒
repl-diskless-sync-delay 5

# 从节点数量下限(主节点专用)
# 说明：当可用从节点少于该值时，主节点拒绝写入
# 作用：防止脑裂时旧主节点继续接收写入，造成数据丢失
min-replicas-to-write 1
# 从节点最大延迟(主节点专用)
# 说明：从节点复制延迟超过该值(秒)时，视为不可用
# 与 min-replicas-to-write 配合使用
min-replicas-max-lag 10

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
**从库配置说明：**
- 从库的 redis.conf 中 replicaof 保持启用，指向主库 IP 192.168.100.231
- 其他参数与主库保持一致，无需额外配置
- 三台机器配置文件相同，唯一差异是 replicaof 是否被注释
### 5.2 服务重启
三台机器都执行同样的操作
```bash
sudo systemctl restart redis
```
### 5.3 查看主从复制状态
1. 在主节点上查看：
```bash
redis-cli -a Redis@root123 INFO replication
```
输出以下内容
```text
# Replication
role:master                     # 当前节点角色(主节点)
connected_slaves:2              # 已连接的从节点数量(2个)
slave0:ip=192.168.100.232,port=6379,state=online,offset=868,lag=1   # 从节点1信息
slave1:ip=192.168.100.233,port=6379,state=online,offset=868,lag=1   # 从节点2信息
master_failover_state:no-failover           # 当前无故障转移进行
master_replid:437065b241c15ed30050e8a0dd2d4703efc29f4e   # 主节点复制ID(唯一标识)
master_replid2:0000000000000000000000000000000000000000 # 故障转移前的旧复制ID(当前无)
master_repl_offset:868           # 主节点当前已写入的数据总量(字节)
second_repl_offset:-1            # 故障转移时，从节点同步的复制偏移量(当前无)
repl_backlog_active:1            # 复制积压缓冲区是否启用(1启用，0关闭)
repl_backlog_size:1048576        # 复制积压缓冲区大小(默认1MB)
repl_backlog_first_byte_offset:1 # 缓冲区中第一条数据对应的复制偏移量
repl_backlog_histlen:868         # 当前缓冲区中存储的有效数据长度(字节)
```

2. 在从节点上查看：
```bash
redis-cli -a Redis@root123 INFO replication
```
输出以下内容
```text
# Replication
role:slave                      # 当前节点角色(从节点)
master_host:192.168.100.231     # 主节点 IP
master_port:6379                # 主节点端口
master_link_status:up           # 主从连接状态(up=正常)
master_last_io_seconds_ago:8    # 距离上次与主节点通信的时间(8秒前)
master_sync_in_progress:0       # 是否正在进行全量同步(0=否)
slave_read_repl_offset:1204     # 从节点已读取的复制偏移量
slave_repl_offset:1204          # 从节点已应用的复制偏移量(与主节点一致)
slave_priority:100              # 故障转移时选举优先级(值越小越优先)
slave_read_only:1               # 从节点是否只读(1=是，拒绝写请求)
replica_announced:1             # 是否向 Sentinel 宣告自己
connected_slaves:0              # 该从节点下无子从节点(正常)
master_failover_state:no-failover  # 无故障转移进行
master_replid:437065b241c15ed30050e8a0dd2d4703efc29f4e  # 主节点复制ID(与主库一致)
master_replid2:000...          # 旧复制ID(无)
master_repl_offset:1204         # 主节点当前复制偏移量
second_repl_offset:-1           # 无故障转移
repl_backlog_active:1           # 复制积压缓冲区已启用
repl_backlog_size:134217728     # 缓冲区大小(128MB)
repl_backlog_first_byte_offset:15  # 缓冲区起始偏移量
repl_backlog_histlen:1190       # 缓冲区有效数据长度
```
关键验证点：
- master_link_status:up → 主从连接正常。
- slave_repl_offset:1204 与 master_repl_offset:1204 一致 → 数据同步无延迟。
- slave_read_only:1 → 从节点只读，拒绝写请求(生产安全)。
- master_last_io_seconds_ago:8 → 最近 8 秒内有通信(正常)。
### 5.4 测试主从同步效果
在主节点写入数据：
```bash
redis-cli -a Redis@root123 SET test_key "hello_master"
# 返回：OK
```
在从节点读取数据：
```bash
redis-cli -a Redis@root123 GET test_key
# 返回："hello_master"
```
在从节点尝试写入数据(应被拒绝)：
```bash
redis-cli -a Redis@root123 SET test_write "try_write"
# 返回：(error) READONLY You can't write against a read only replica.
```
### 5.5 查看主从复制延迟
在主库上执行
```bash
redis-cli -a Redis@root123 INFO replication | grep lag
```
输出以下内容
```text
[fmc@Redis-Master appendonlydir]$ redis-cli -a Redis@root123 INFO replication | grep lag
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
slave0:ip=192.168.100.232,port=6379,state=online,offset=1749,lag=0
slave1:ip=192.168.100.233,port=6379,state=online,offset=1735,lag=1
```
--- -
## 六、哨兵模式配置
哨兵(Sentinel)是 Redis 官方提供的高可用解决方案，用于监控 Redis 主从集群的健康状态，并在主节点发生故障时自动执行故障转移，将从节点提升为新的主节点。

哨兵负责运行时切换，但如果涉及到节点重启或重新加入，必须人工检查和修正 `redis.conf` 中的 `replicaof` 指向。
### 6.1 创建哨兵配置文件
三台服务器里，每个哨兵节点都需要一个配置文件。以 /etc/redis/redis-sentinel.conf 为例：
1. 创建配置文件
```bash
sudo cp /opt/redis-7.2.5/sentinel.conf /etc/redis/redis-sentinel.conf
```
2. 修改配置参数
```bash
sudo vi /etc/redis/redis-sentinel.conf
```
### 6.2 哨兵核心配置参数
```conf
# ============================ 哨兵配置 ============================
# 文件路径：/etc/redis/redis-sentinel.conf

# ============================ 基本配置 ============================

# 监听地址(绑定内网IP，确保其他哨兵和客户端能访问)
# 根据自己的情况修改自己的内网IP
bind 127.0.0.1 192.168.100.231

# 哨兵监听端口
port 26379

# 保护模式(哨兵模式下必须关闭)
protected-mode no

# 是否以守护进程运行(配合 systemd 时必须为 no)
daemonize no
supervised systemd

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
sentinel monitor mymaster 192.168.100.231 6379 2

# 主节点密码认证(如果 Redis 设置了密码，必须配置)
sentinel auth-pass mymaster Redis@root123

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
**说明:** 
1. bind 参数改成自己的 内网 IP，根据自己实际情况修改
### 6.3 设置文件权限
```bash
sudo chown redis:redis /etc/redis/redis-sentinel.conf
# 权限改为 640
sudo chmod 640 /etc/redis/redis-sentinel.conf
```
**说明:**  哨兵在运行过程中会自动修改配置文件(例如记录故障转移后的新主节点信息)，因此需要对该文件有写入权限。
### 6.4 创建 systemd 服务文件
所有哨兵节点都需要创建 systemd 服务。
```bash
sudo vi /etc/systemd/system/redis-sentinel.service
```
写入以下内容：
```
[Unit]
Description=Redis Sentinel 7.2.x
After=network.target

[Service]
Type=notify
User=redis
Group=redis
ExecStart=/usr/local/redis/bin/redis-sentinel /etc/redis/redis-sentinel.conf
ExecStop=/usr/local/redis/bin/redis-cli -p 26379 shutdown
Restart=always
LimitNOFILE=65535
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```
### 6.5 启动哨兵
```bash
# 1. 加载 systemd 配置
sudo systemctl daemon-reload
# 2. 启动哨兵服务
sudo systemctl start redis-sentinel
# 3. 设置开机自启
sudo systemctl enable redis-sentinel
# 4. 检查服务状态
sudo systemctl status redis-sentinel
```
### 6.6 查看哨兵状态
1. 获取哨兵集群主节点信息：
```bash
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
```
输出以下内容
```text
[fmc@Redis-Master bin]$ redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
1) "192.168.100.231"
2) "6379"
```
2. 查看哨兵监控的所有从节点：
```bash
redis-cli -p 26379 SENTINEL replicas mymaster
```
3. 查看哨兵监控的所有哨兵节点：
```bash
redis-cli -p 26379 SENTINEL sentinels mymaster
```
4. 查看哨兵集群整体状态：
```bash
redis-cli -p 26379 SENTINEL master mymaster
```
5. 查看哨兵日志
```bash
sudo tail -f /var/log/redis/sentinel.log
```
输出以下内容
```text
[fmc@Redis-Slave-1 redis]$ sudo tail -f /var/log/redis/sentinel.log
41296:X 12 Aug 2026 14:54:15.374 * Sentinel ID is c9c33eb58c89b1e15e355257c44975ce8d0de9dd
41296:X 12 Aug 2026 14:54:15.374 # +monitor master mymaster 192.168.100.231 6379 quorum 2
41296:X 12 Aug 2026 14:54:15.376 * +slave slave 192.168.100.232:6379 192.168.100.232 6379 @ mymaster 192.168.100.231 6379
41296:X 12 Aug 2026 14:54:15.377 * Sentinel new configuration saved on disk
41296:X 12 Aug 2026 14:54:15.377 * +slave slave 192.168.100.233:6379 192.168.100.233 6379 @ mymaster 192.168.100.231 6379
41296:X 12 Aug 2026 14:54:15.377 * Sentinel new configuration saved on disk
41296:X 12 Aug 2026 14:54:15.564 * +sentinel sentinel 5d567f2895dabfc72e2b0c55151e55b3685fa177 192.168.100.233 26379 @ mymaster 192.168.100.231 6379
41296:X 12 Aug 2026 14:54:15.566 * Sentinel new configuration saved on disk
41296:X 12 Aug 2026 14:54:15.908 * +sentinel sentinel bf3bac4f443c7a74d3aaf59964a62fa9dbe6003d 192.168.100.231 26379 @ mymaster 192.168.100.231 6379
41296:X 12 Aug 2026 14:54:15.910 * Sentinel new configuration saved on disk
```
6. 查看哨兵信息
```bash
redis-cli -p 26379 INFO sentinel
```
输出以下内容
```bash
[fmc@Redis-Slave-1 redis]$ redis-cli -p 26379 INFO sentinel
# Sentinel
sentinel_masters:1
sentinel_tilt:0
sentinel_tilt_since_seconds:-1
sentinel_running_scripts:0
sentinel_scripts_queue_length:0
sentinel_simulate_failure_flags:0
master0:name=mymaster,status=ok,address=192.168.100.231:6379,slaves=2,sentinels=3
```
**说明：** 故障转移前执行
### 6.7 模拟故障切换测试
1. 确认当前主节点
```bash
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
```
2. 模拟主节点故障(停止主节点 Redis 服务)
```bash
# 在主节点上执行
sudo systemctl stop redis
```
3. 观察哨兵日志(在主节点所在机器的哨兵日志中查看)
```bash
sudo tail -f /var/log/redis/sentinel.log
```
输出以下内容
```text
[fmc@Redis-Master bin]$ sudo systemctl stop redis
[sudo] password for fmc: 
[fmc@Redis-Master bin]$ sudo tail -f /var/log/redis/sentinel.log
52724:X 12 Aug 2026 14:58:22.527 # +new-epoch 1
52724:X 12 Aug 2026 14:58:22.528 * Sentinel new configuration saved on disk
52724:X 12 Aug 2026 14:58:22.528 # +vote-for-leader c9c33eb58c89b1e15e355257c44975ce8d0de9dd 1
52724:X 12 Aug 2026 14:58:23.525 # +odown master mymaster 192.168.100.231 6379 #quorum 3/2
52724:X 12 Aug 2026 14:58:23.525 * Next failover delay: I will not start a failover before Wed Aug 12 15:04:22 2026
52724:X 12 Aug 2026 14:58:23.767 # +config-update-from sentinel c9c33eb58c89b1e15e355257c44975ce8d0de9dd 192.168.100.232 26379 @ mymaster 192.168.100.231 6379
52724:X 12 Aug 2026 14:58:23.767 # +switch-master mymaster 192.168.100.231 6379 192.168.100.233 6379
52724:X 12 Aug 2026 14:58:23.767 * +slave slave 192.168.100.232:6379 192.168.100.232 6379 @ mymaster 192.168.100.233 6379
52724:X 12 Aug 2026 14:58:23.767 * +slave slave 192.168.100.231:6379 192.168.100.231 6379 @ mymaster 192.168.100.233 6379
52724:X 12 Aug 2026 14:58:23.769 * Sentinel new configuration saved on disk
```
说明：
1. `+odown master mymaster ... #quorum 3/2` ,主节点被判定为客观下线(ODOWN)，3 个哨兵中有 2 个确认
2. `+vote-for-leader`，哨兵集群选举出 Leader 执行故障转移
3. `+switch-master ... 192.168.100.231 6379 192.168.100.233 6379`,主节点已从 `192.168.100.231` 切换为 `192.168.100.233`
4. `+slave slave 192.168.100.231 `,原主节点 192.168.100.231 已降级为从节点
### 6.8 原节点加入哨兵模式
1. 获取当前主节点地址：
```bash
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
```
输出以下内容
```text
[fmc@Redis-Master bin]$ redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
1) "192.168.100.233"
2) "6379"
```
2. 修改 redis.conf
修改故障点的 redis.conf 文件replicaof 参数
```bash
sudo vim /etc/redis/redis.conf
```
修改以下内容
```conf
# ============================ 主从复制 ============================
# 指定主节点(仅在从节点配置)
# 格式：replicaof <主节点IP> <主节点端口>
# 说明：配置当前节点作为从节点，复制指定的主节点
# 如果不需要主从复制，注释或删除此行
replicaof 192.168.100.233 6379
```
**说明:** replicaof 参数 需要修改成新的主节点 IP
3. 重启服务
```bash
sudo systemctl restart redis
sudo systemctl status redis
```
4. 查看是否正常
```bash
redis-cli -a Redis@root123 INFO replication
```
输出以下内容
```text
[fmc@Redis-Master bin]$ redis-cli -a Redis@root123 INFO replication
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
# Replication
role:slave
master_host:192.168.100.233
master_port:6379
master_link_status:up
master_last_io_seconds_ago:0
master_sync_in_progress:0
slave_read_repl_offset:688463
slave_repl_offset:688463
slave_priority:100
slave_read_only:1
replica_announced:1
connected_slaves:1
slave0:ip=192.168.100.232,port=6379,state=online,offset=688463,lag=0
master_failover_state:no-failover
master_replid:1138209f899559f0e864946024c307206e2372b4
master_replid2:0000000000000000000000000000000000000000
master_repl_offset:688463
second_repl_offset:-1
repl_backlog_active:1
repl_backlog_size:134217728
repl_backlog_first_byte_offset:597518
repl_backlog_histlen:90946
[fmc@Redis-Master bin]$
```
-- -
## 七、数据备份恢复
### 7.1 定期备份 RDB 文件
创建备份脚本：
```bash
sudo vi /usr/local/bin/redis_backup.sh
```
脚本内容：
```
#!/bin/bash
# Redis RDB 备份脚本

# 用root执行此脚本
if [ "$EUID" -ne 0 ]; then
    echo "请使用 root 权限执行此脚本"
    exit 1
fi

# 配置项
REDIS_PASS="Redis@root123"
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
cp $RDB_FILE $BACKUP_DIR/dump.rdb.$DATE
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
```conf
0 2 * * * /usr/local/bin/redis_backup.sh >> /var/log/redis_backup.log 2>&1
```
### 7.2 AOF 备份
1. 第一步：确认 AOF 已开启
```bash
redis-cli -a Redis@root123 INFO persistence | grep appendonly
```
如果返回 `no`，需要先在配置文件中开启 AOF。
2. 第二步：触发 AOF 重写(可选，建议备份前执行)
```bash
redis-cli -a Redis@root123 BGREWRITEAOF
```
3. 第三步：备份整个 appendonlydir 目录
```bash
# 备份整个 AOF 目录
sudo cp -r /var/lib/redis/appendonlydir /backup/redis/appendonlydir.$(date +%Y%m%d_%H%M%S)
```
**⚠️ 重要：** Redis 7.x 的 AOF 由多个文件组成，备份时必须备份整个目录，不能只备份单个文件。
### 7.3 数据恢复
在 Redis 7.x 中，混合持久化是 AOF 重写时的默认行为(`aof-use-rdb-preamble yes`)，.base.rdb 文件本身是 RDB 格式的快照。恢复时只需还原整个 appendonlydir/ 目录，Redis 启动时会自动识别并加载。
恢复步骤：

```bash
# 停止服务
sudo systemctl stop redis

# 删除当前 AOF 目录
sudo rm -rf /var/lib/redis/appendonlydir

# 恢复备份的 AOF 目录
sudo cp -r /backup/redis/appendonlydir.20260807_020000 /var/lib/redis/appendonlydir

# 确保属主正确
sudo chown -R redis:redis /var/lib/redis/appendonlydir

# 启动 Redis(会优先加载 AOF)
sudo systemctl start redis

# 验证
redis-cli -a Redis@root123 DBSIZE
redis-cli -a Redis@root123 INFO persistence
```
恢复优先级：当 appendonly yes 时，Redis 启动时优先加载 AOF 目录中的文件，而非 RDB 文件。
