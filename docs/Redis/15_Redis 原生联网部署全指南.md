目标读者：Linux 运维工程师、后端开发人员、架构师  
适用系统：Rocky Linux 8(兼容 CentOS 8 / RHEL 8 / AlmaLinux 8)  
覆盖架构：单机(基础)→ 主从(读写分离)→ 哨兵(高可用)→ 集群(大规模)  
版本说明：本指南基于 Redis 7.2.x(2026 年推荐的生产稳定版本)

## 一、环境准备与系统初始化
在部署任何架构之前，需要先完成 Rocky Linux 8 的系统初始化工作。以下是生产环境的必备步骤。
### 1.1 系统更新与基础软件安装
首先，更新系统软件包到最新版本，确保系统安全性并获取最新的软件包列表。
```
# 更新系统所有软件包
sudo dnf upgrade --refresh -y
```

- `--refresh` 参数强制刷新仓库元数据。
- `-y` 参数自动确认所有操作。生产环境建议在执行此命令前确认没有重要的服务正在运行。

安装必要的系统工具，这些工具在后续编译和调试中会用到：
```
sudo dnf install -y gcc make wget tar net-tools vim \
    systemd-devel openssl-devel
```
各软件包作用：
- `gcc`：C 语言编译器，编译 Redis 源码必需
- `make`：构建工具，用于编译 Redis
- `wget`：命令行下载工具
- `tar`：解压压缩包
- `net-tools`：提供 `netstat` 等网络诊断工具
- `vim`：文本编辑器，用于修改配置文件
- `systemd-devel`：systemd 开发库，用于编译 systemd 支持
- `openssl-devel`：OpenSSL 开发库，用于编译 TLS 支持

### 1.2 关闭透明大页(THP)

Redis 官方强烈建议关闭透明大页(Transparent Huge Pages，THP)，因为它会导致 Redis 延迟不稳定和内存使用效率下降。

THP 是 Linux 内核的一个特性，会将内存页从 4 KB 合并为 2 MB 以减少 TLB 缺失，但这种合并过程在 Redis 的 fork 操作中会引发显著的延迟尖峰。
```
# 临时关闭(重启后失效)
echo never > /sys/kernel/mm/transparent_hugepage/enabled

# 永久关闭(写入 rc.local，开机自动执行)
echo 'echo never > /sys/kernel/mm/transparent_hugepage/enabled' | sudo tee -a /etc/rc.d/rc.local
sudo chmod +x /etc/rc.d/rc.local
```
### 1.3 调整内核参数

优化系统内核参数以提升 Redis 性能：
```
# 临时生效
sysctl -w vm.overcommit_memory=1
```
`vm.overcommit_memory=1` 允许内核过量分配内存(允许分配超过物理内存 + swap 的内存)，这是 Redis fork 子进程进行持久化时的必需配置，否则在内存紧张时 fork 可能失败。
```
# 永久生效
echo 'vm.overcommit_memory = 1' >> /etc/sysctl.conf
echo 'net.core.somaxconn = 65535' >> /etc/sysctl.conf
sysctl -p
```
- `net.core.somaxconn = 65535`：增加 TCP 连接监听队列的最大长度，Redis 默认的 `tcp-backlog` 为 511，但系统默认值可能只有 128，增大此参数可以容纳更多并发连接。
### 1.4 配置防火墙

生产环境必须开启防火墙，仅放行必要的端口：
```
# 启动防火墙
sudo systemctl start firewalld
sudo systemctl enable firewalld

# 放行 Redis 端口(6379)
sudo firewall-cmd --permanent --add-port=6379/tcp

# 放行哨兵端口(26379)
sudo firewall-cmd --permanent --add-port=26379/tcp

# 放行集群总线端口(port+10000，如 16379)
sudo firewall-cmd --permanent --add-port=16379/tcp

# 重新加载规则使生效
sudo firewall-cmd --reload

# 查看已放行的端口列表
sudo firewall-cmd --list-ports
```

安全提示：如果 Redis 只允许特定客户端访问，建议配置更严格的来源 IP 限制。例如只允许 192.168.1.0/24 网段访问：

```
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port protocol="tcp" port="6379" accept'
sudo firewall-cmd --reload
```
### 1.5 配置 SELinux(可选)

SELinux 默认处于 enforcing 模式，可能会阻止 Redis 正常启动。有两种处理方式：

1. 设置为 permissive 模式(简单，允许访问但记录日志)
```
sudo setenforce 0
sudo sed -i 's/SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config
```
2. 配置 SELinux 策略(安全，推荐生产环境)
```
# 安装 SELinux 管理工具
sudo dnf install -y policycoreutils-python-utils

# 允许 Redis 绑定任意端口
sudo semanage port -a -t redis_port_t -p tcp 6379

# 允许 Redis 读取/写入数据目录
sudo semanage fcontext -a -t redis_var_lib_t "/var/lib/redis(/.*)?"
sudo restorecon -Rv /var/lib/redis
```
### 1.6 创建 Redis 专用用户与目录

为了安全，Redis 应该以专用的非 root 用户身份运行：
```
# 创建 redis 用户(系统用户，无登录 shell)
sudo useradd -r -s /sbin/nologin redis

# 创建数据目录并设置权限
sudo mkdir -p /var/lib/redis
sudo chown redis:redis /var/lib/redis
sudo chmod 750 /var/lib/redis

# 创建日志目录
sudo mkdir -p /var/log/redis
sudo chown redis:redis /var/log/redis
sudo chmod 750 /var/log/redis
```
目录说明：

- `/var/lib/redis`：存放 RDB 和 AOF 持久化文件
- `/var/log/redis`：存放 Redis 日志文件
- `/etc/redis`：存放配置文件(后续创建)

## 二、单机模式部署

单机模式是最基础的部署方式，适用于开发测试环境、小规模生产环境(数据量 < 50 GB)或缓存场景。所有数据存储在一个 Redis 实例中，不做复制和分片。
### 2.1 安装方式选择

Redis 在 Rocky Linux 8 上有三种安装方式，根据需求选择合适的方案：

| 安装方式 | 版本 | 优点 | 缺点 | 适用场景 |
|---|---|---|---|---|
| DNF 安装(AppStream) | 5.0 / 6.0 | 安装简单，自动集成 systemd | 版本较旧，缺少新特性 | 不需要最新功能的普通场景 |
| Remi 仓库安装 | 7.2+ | 版本新，通过 RPM 管理 | 需要添加第三方仓库 | 需要较新版本但不想编译 |
| 源码编译安装 | 最新稳定版 | 版本最新，可自定义编译选项 | 安装较复杂，需手动管理 | 生产环境推荐 |

本指南推荐 **源码编译安装 Redis 7.2.x**，因为可以获取最新的稳定版本、性能优化和安全补丁。截至 2026 年，Redis 7.2.x 是官方推荐的生产稳定版本。
### 2.2 源码编译安装 Redis 7.2

#### 2.2.1 下载 Redis 源码
```
# 进入临时目录
cd /tmp

# 下载 Redis 7.2 源码(请在官网确认最新版本号)
wget https://download.redis.io/releases/redis-7.2.7.tar.gz

# 解压源码包
tar xzf redis-7.2.7.tar.gz
cd redis-7.2.7
```
#### 2.2.2 编译安装
```
# 编译(如果系统内存小于 1GB，可加上 USE_SYSTEMD=no 避免 systemd 相关错误)
make -j$(nproc) USE_SYSTEMD=yes

# 安装到 /usr/local/bin
sudo make install
```
- `-j$(nproc)`：使用所有 CPU 核心并行编译，加快编译速度
- `USE_SYSTEMD=yes`：启用 systemd 支持，方便服务管理

安装完成后，Redis 相关的可执行文件会出现在 `/usr/local/bin` 目录下：
- `redis-server`：Redis 服务器
- `redis-cli`：Redis 命令行客户端
- `redis-sentinel`：哨兵服务
- `redis-benchmark`：性能测试工具
- `redis-check-aof`：AOF 文件修复工具
- `redis-check-rdb`：RDB 文件检查工具
验证安装是否成功：
```
redis-server --version
# 预期输出示例：Redis server v=7.2.7 sha=00000000:0 malloc=jemalloc-5.3.0 bits=64
```
#### 2.2.3 准备配置文件和目录
```
# 创建配置目录
sudo mkdir -p /etc/redis

# 复制默认配置文件到 /etc/redis
sudo cp /tmp/redis-7.2.7/redis.conf /etc/redis/redis.conf

# 复制 systemd 服务文件
sudo cp /tmp/redis-7.2.7/utils/redis_init_script /etc/init.d/redis
sudo cp /tmp/redis-7.2.7/utils/systemd-redis_server.service /etc/systemd/system/redis-server.service

# 清理临时文件
rm -rf /tmp/redis-7.2.7
```
### 2.3 单机配置详解(redis.conf)
打开配置文件进行修改：
```
sudo vim /etc/redis/redis.conf
```
以下是生产级配置的关键参数详解：
#### 2.3.1 网络配置
```
# 绑定 IP 地址(生产环境应绑定内网 IP，而非 0.0.0.0)
bind 0.0.0.0

# 监听端口(默认 6379)
port 6379

# TCP 连接队列长度(默认 511，建议与系统 somaxconn 匹配)
tcp-backlog 511

# 客户端空闲超时时间(秒，0 表示永不超时)
timeout 0

# TCP keepalive 心跳间隔(秒)
tcp-keepalive 300

# 保护模式(生产环境建议开启，但设置密码后会自动保护)
protected-mode yes
```
#### 2.3.2 运行模式配置
```
# 后台运行模式(yes 表示以守护进程方式运行)
daemonize yes

# PID 文件位置
pidfile /var/run/redis_6379.pid

# 日志级别(可选：debug, verbose, notice, warning)
loglevel notice

# 日志文件位置
logfile /var/log/redis/redis.log
```
#### 2.3.3 安全配置
```
# 设置访问密码(生产环境强烈建议设置)
requirepass your_strong_password_here

# 重命名/禁用危险命令(提高安全性)
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG "mysecret_config_rename"
rename-command KEYS ""
```
危险命令说明：
- `FLUSHALL` / `FLUSHDB`：清空全部/当前数据库数据，误操作后果严重
- `CONFIG`：可动态修改 Redis 配置，包括修改密码
- `KEYS`：在生产环境执行会阻塞 Redis，长时间扫描所有 key
#### 2.3.4 持久化配置
```
# ========== RDB 快照配置 ==========
# 触发条件：seconds changes(seconds 秒内至少有 changes 个 key 被修改)
save 900 1      # 15 分钟内至少有 1 个 key 被修改
save 300 10     # 5 分钟内至少有 10 个 key 被修改
save 60 10000   # 1 分钟内至少有 10000 个 key 被修改

# RDB 文件名
dbfilename dump.rdb

# 持久化文件存储目录(确保目录存在且 redis 用户有写入权限)
dir /var/lib/redis

# RDB 文件压缩(LZF 压缩，节省磁盘空间)
rdbcompression yes

# 启用 CRC64 校验(检测文件损坏)
rdbchecksum yes

# ========== AOF 追加文件配置 ==========
# 开启 AOF 持久化
appendonly yes

# AOF 文件名
appendfilename "appendonly.aof"

# 同步策略(推荐 everysec，在性能和安全之间取得平衡)
# - always：每个命令都同步到磁盘，最安全但性能差
# - everysec：每秒同步一次，最多丢失 1 秒数据—推荐
# - no：由操作系统决定，性能最好但最不安全
appendfsync everysec

# AOF 文件重写触发条件
auto-aof-rewrite-percentage 100    # 文件增长 100%(翻倍)时触发重写
auto-aof-rewrite-min-size 64mb     # 重写的最小文件大小
```
#### 2.3.5 内存管理配置
```
# 最大内存限制(根据服务器内存配置，预留 20% 给系统和其它进程)
# 假设服务器 16GB 内存，Redis 最多使用 12GB
maxmemory 12gb

# 内存淘汰策略(达到 maxmemory 后的处理方式)
# - volatile-lru：只对设置了过期时间的 key 进行 LRU 淘汰
# - allkeys-lru：对所有 key 进行 LRU 淘汰(推荐，适合缓存场景)
# - volatile-ttl：淘汰即将过期的 key
# - noeviction：不淘汰，写入操作返回错误(推荐，适合存储重要数据)
maxmemory-policy allkeys-lru
```
#### 2.3.6 慢查询日志
```
# 慢查询阈值(微秒，超过此值的命令会被记录)
slowlog-log-slower-than 10000

# 最多保留的慢查询日志条数
slowlog-max-len 128
```
#### 2.3.7 客户端连接限制
```
# 最大客户端连接数
maxclients 10000
```
### 2.4 创建 systemd 服务文件
如果源码包中的 systemd 服务文件不够完善，可以手动创建：
```
sudo tee /etc/systemd/system/redis-server.service > /dev/null << 'EOF'
[Unit]
Description=Redis In-Memory Data Store
After=network.target

[Service]
User=redis
Group=redis
Type=forking
ExecStart=/usr/local/bin/redis-server /etc/redis/redis.conf
ExecStop=/usr/local/bin/redis-cli -a your_strong_password_here shutdown
Restart=always
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
```
### 2.5 启动并验证 Redis
```
# 重新加载 systemd 配置
sudo systemctl daemon-reload

# 启动 Redis 服务
sudo systemctl start redis-server

# 设置开机自启
sudo systemctl enable redis-server

# 查看服务状态
sudo systemctl status redis-server

# 查看 Redis 是否正常运行
redis-cli -a your_strong_password_here ping
# 期望输出：PONG

# 查看 Redis 版本和基本信息
redis-cli -a your_strong_password_here INFO server
```
### 2.6 性能测试
```
# 使用 redis-benchmark 进行性能测试
redis-benchmark -h 127.0.0.1 -p 6379 -a your_strong_password_here -c 50 -n 10000 -q
```
参数说明：
- `-c 50`：50 个并发客户端
- `-n 10000`：总共执行 10000 个请求
- `-q`：仅显示 QPS(每秒请求数)，不显示详细结果

## 三、主从复制模式部署

主从复制模式在前一章单机模式的基础上，通过数据复制实现读写分离和数据冗余。Master 负责所有写操作，Slave 从 Master 复制数据并承担读负载。

### 3.1 架构规划

本章以三台服务器为例构建 **1 主 2 从** 架构：

| 节点角色 | IP 地址 | Redis 端口 | 说明 |
|----------|---------|------------|------|
| Master | 192.168.1.10 | 6379 | 处理所有写操作，可选读操作 |
| Slave 1 | 192.168.1.11 | 6379 | 从 Master 复制数据，承担读操作 |
| Slave 2 | 192.168.1.12 | 6379 | 从 Master 复制数据，承担读操作 |

**网络要求**：所有节点之间需要互相通信，确保防火墙开放 6379 端口。
### 3.2 Master 节点配置

Master 节点的配置与单机模式基本相同。打开 `/etc/redis/redis.conf` 并进行以下调整：
```
# 绑定内网 IP(允许 Slave 访问，不绑 127.0.0.1 可能带来安全风险；绑 0.0.0.0 时务必开启 requirepass)
bind 0.0.0.0

# 设置密码(Slave 连接时需要验证)
requirepass master_password

# 指定其他 Slave 连接主节点时使用的密码
masterauth master_password

# 为防止主从复制占用过多内存，可限制最大内存
maxmemory 12gb

# 持久化目录
dir /var/lib/redis
```
### 3.3 Slave 节点配置
每个 Slave 节点需要配置 `replicaof` 指令来指定 Master 的地址。打开 `/etc/redis/redis.conf`：
```
# 绑定内网 IP
bind 0.0.0.0

# 设置本机密码(可选，如果有额外的安全要求)
requirepass slave_password

# 【关键】配置主从复制：指定 Master 的 IP 和端口
replicaof 192.168.1.10 6379

# 配置连接 Master 的密码
masterauth master_password

# 服务名称配置
# ...

# 设置从节点为只读模式(默认就是只读，建议显式设置)
replica-read-only yes

# 当与 Master 断开连接时，是否继续响应读请求
# yes：继续用旧数据提供服务
# no：拒绝所有请求，等待重新连接
replica-serve-stale-data yes
```
**从节点配置说明**：

- `replicaof` 命令告诉 Redis 成为指定 Master 的从节点，启动后会立即开始全量同步
- `masterauth` 必须与 Master 的 `requirepass` 一致，否则认证失败
- `replica-read-only yes` 确保数据不会意外被写入从节点，保持数据一致性
- 如果 Master 宕机，需要手动将 Slave 提升为 Master(执行 `REPLICAOF NO ONE`)
### 3.4 启动所有节点并验证
```
# 在所有节点上重启 Redis 服务
sudo systemctl restart redis-server
```
在 **Master** 上执行：
```
redis-cli -a master_password INFO replication
```

```
# Replication
role:master
connected_slaves:2
slave0:ip=192.168.1.11,port=6379,state=online,offset=12345,lag=0
slave1:ip=192.168.1.12,port=6379,state=online,offset=12345,lag=0
master_repl_offset:12345
```
- `connected_slaves`：正常连接的从节点数量
- `state=online`：从节点连接状态正常
- `offset`：复制偏移量，Master 与 Slave 应保持一致或接近
- `lag=0`：从节点延迟为 0 秒(理论上应为 0，实际允许毫秒级差异)

在任意 **Slave** 上执行：
```
redis-cli -a slave_password INFO replication
```

```
# Replication
role:slave
master_host:192.168.1.10
master_port:6379
master_link_status:up
master_last_io_seconds_ago:0
slave_repl_offset:12345
```
- `master_link_status:up`：与 Master 的连接状态正常
- `master_last_io_seconds_ago`：上次与 Master 通信的间隔(秒)，不应超过重新连接超时阈值

### 3.5 测试主从复制
```
# 在 Master 上写入数据
redis-cli -a master_password
127.0.0.1:6379> SET testkey "Hello Redis Replication"
OK

# 在 Slave 上读取数据
redis-cli -a slave_password -h 192.168.1.11
127.0.0.1:6379> GET testkey
"Hello Redis Replication"

# 在 Slave 上尝试写入(会被拒绝)
127.0.0.1:6379> SET anotherkey "value"
(error) READONLY You can't write against a read only replica.
```
### 3.6 主从复制常用命令
| 命令 | 作用 | 示例 |
|------|------|------|
| `INFO replication` | 查看复制状态 | `INFO replication` |
| `REPLICAOF <host> <port>` | 将当前节点设为指定 Master 的从节点 | `REPLICAOF 192.168.1.10 6379` |
| `REPLICAOF NO ONE` | 解除复制，将当前节点提升为 Master | `REPLICAOF NO ONE` |
| `ROLE` | 查看当前节点的角色(master/slave) | `ROLE` |
| `WAIT <numreplicas> <timeout>` | 等待指定数量的从节点确认复制 | `WAIT 1 5000` |

## 四、哨兵模式部署

哨兵模式在前一章主从复制的基础上，增加了自动故障转移能力。当 Master 宕机时，哨兵集群会自动选举一个 Slave 成为新的 Master，实现高可用。

### 4.1 架构规划

本章以三台服务器为例构建 **1 主 2 从 3 哨兵** 架构：

| 节点角色 | IP 地址 | Redis 端口 | 哨兵端口 | 说明 |
|----------|---------|------------|----------|------|
| Master | 192.168.1.10 | 6379 | 26379 | 主节点，处理写操作 |
| Slave 1 | 192.168.1.11 | 6379 | 26379 | 从节点，读操作 + 哨兵 |
| Slave 2 | 192.168.1.12 | 6379 | 26379 | 从节点，读操作 + 哨兵 |

**注意**：生产环境中，哨兵通常与 Redis 部署在同一台服务器上以节省资源，但在极端场景下可能导致 Redis 和哨兵同时不可用。如果条件允许，建议将哨兵独立部署在不同服务器上。

### 4.2 配置 Redis 主从
首先按照第三章的步骤配置好 1 主 2 从架构。Master 和 Slave 的配置文件需要做以下调整：
```
# Master 和 Slave 都需要配置各自的密码、masterauth、以及局域网的 bind 地址
bind 0.0.0.0
requirepass your_master_password
masterauth your_master_password
```
### 4.3 配置哨兵(Sentinel)
在每个节点上创建哨兵配置文件 `/etc/redis/sentinel.conf`(注意区分哨兵端口 26379)：
```
# 哨兵端口
port 26379

# 哨兵是否以守护进程方式运行
daemonize yes

# PID 文件
pidfile /var/run/redis-sentinel.pid

# 日志文件
logfile /var/log/redis/sentinel.log

# 监控主节点：mymaster(自定义名称)、IP、端口、quorum(法定人数)
# quorum 表示需要多少个哨兵同意才能将 Master 标记为客观下线
sentinel monitor mymaster 192.168.1.10 6379 2

# Master 的密码(必须与 redis.conf 中的 requirepass 一致)
sentinel auth-pass mymaster your_master_password

# 主观下线时间(毫秒)，超过此时间未收到 PONG 就标记为疑似故障
sentinel down-after-milliseconds mymaster 30000

# 故障转移超时时间(毫秒)
sentinel failover-timeout mymaster 180000

# 同时允许多少个从节点同步新 Master(设为 1 可避免并发全量复制导致网络拥塞)
sentinel parallel-syncs mymaster 1

# 工作目录
dir /var/lib/redis
```
**配置参数说明**：

| 参数 | 说明 |
|------|------|
| `port` | 哨兵监听端口，默认 26379 |
| `daemonize yes` | 以守护进程方式运行 |
| `sentinel monitor` | 要监控的主节点名称、IP、端口和 quorum(法定人数) |
| `sentinel auth-pass` | 主节点的密码，必须与 Redis 的 requirepass 一致 |
| `sentinel down-after-milliseconds` | 主观下线判定时间(毫秒)，网络环境较差时可适当增大 |
| `sentinel failover-timeout` | 故障转移各步骤的超时总和 |
| `sentinel parallel-syncs` | 故障转移后同时进行同步的从节点数量 |

`quorum` 的设置原则：

- 哨兵数量必须为**奇数**(如 3, 5, 7)
- `quorum` 通常设为 `ceil(哨兵数量 / 2)`，如 3 个哨兵设为 2，5 个哨兵设为 3
- 这确保了达成客观下线需要**超过半数**哨兵的同意，避免单点误判
### 4.4 创建哨兵 systemd 服务
```
sudo tee /etc/systemd/system/redis-sentinel.service > /dev/null << 'EOF'
[Unit]
Description=Redis Sentinel
After=network.target

[Service]
User=redis
Group=redis
Type=forking
ExecStart=/usr/local/bin/redis-sentinel /etc/redis/sentinel.conf
ExecStop=/usr/local/bin/redis-cli -p 26379 shutdown
Restart=always
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
```
### 4.5 启动哨兵
```
# 启动哨兵服务
sudo systemctl start redis-sentinel

# 设置开机自启
sudo systemctl enable redis-sentinel

# 查看服务状态
sudo systemctl status redis-sentinel
```
### 4.6 验证哨兵状态
```
# 连接任一哨兵，查看主从状态
redis-cli -p 26379 INFO sentinel
```

```
# Sentinel
sentinel_masters:1
sentinel_tilt:0
sentinel_running_scripts:0
sentinel_scripts_queue_length:0
master0:name=mymaster,status=ok,address=192.168.1.10:6379,slaves=2,sentinels=3
```
- `status=ok`：主节点状态正常
- `slaves=2`：检测到 2 个从节点
- `sentinels=3`：检测到 3 个哨兵节点
```
# 查看主节点信息
redis-cli -p 26379 SENTINEL master mymaster

# 查看从节点列表
redis-cli -p 26379 SENTINEL slaves mymaster

# 查看哨兵列表
redis-cli -p 26379 SENTINEL sentinels mymaster

# 获取当前主节点的地址(客户端常用)
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
```
### 4.7 测试故障转移

首先确认当前 Master 的地址：
```
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
# 预期输出：
1) "192.168.1.10"
2) "6379"
```
模拟 Master 宕机，在 Master 节点上停止 Redis 服务：
```
# 在 Master 节点上执行
sudo systemctl stop redis-server
```
等待约 30-60 秒(取决于 `down-after-milliseconds` 设置)，然后检查哨兵状态：
```
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
```
现在主节点地址应该已变更为其中一个 Slave(如 192.168.1.11)。查看哨兵日志了解故障转移过程：
```
sudo tail -f /var/log/redis/sentinel.log
```
**故障转移关键日志**：
```
+sdown master mymaster 192.168.1.10 6379           # 哨兵主观认为 Master 下线
+odown master mymaster 192.168.1.10 6379 #quorum ... # 达成客观下线
+try-failover master mymaster ...                   # 开始尝试故障转移
+vote-for-leader ...                                # 选举领导者哨兵
+elected-leader master mymaster ...                 # 领导者选举完成
+failover-state-select-slave master mymaster ...    # 选择新 Master
+failover-state-send-slaveof-noone ...              # 将选中的 Slave 升级为 Master
+failover-state-reconf-slaves ...                   # 重新配置其他 Slave
+failover-end master mymaster ...                   # 故障转移完成
+switch-master mymaster 192.168.1.10 6379 192.168.1.11 6379  # 切换完成
```
恢复旧的 Master(现在它会自动成为新 Master 的 Slave)：
```
# 在原 Master 节点上
sudo systemctl start redis-server
```
### 4.8 哨兵常用命令
| 命令 | 作用 | 示例 |
|------|------|------|
| `INFO sentinel` | 查看哨兵整体状态 | `INFO sentinel` |
| `SENTINEL masters` | 列出所有被监控的主节点 | `SENTINEL masters` |
| `SENTINEL master <name>` | 查看指定主节点详情 | `SENTINEL master mymaster` |
| `SENTINEL slaves <name>` | 查看指定主节点的从节点 | `SENTINEL slaves mymaster` |
| `SENTINEL sentinels <name>` | 查看监控同一主节点的其他哨兵 | `SENTINEL sentinels mymaster` |
| `SENTINEL get-master-addr-by-name <name>` | 获取当前主节点地址 | `SENTINEL get-master-addr-by-name mymaster` |
| `SENTINEL failover <name>` | 手动触发故障转移 | `SENTINEL failover mymaster` |
| `SENTINEL ckquorum <name>` | 检查是否满足故障转移的 quorum 条件 | `SENTINEL ckquorum mymaster` |
### 4.9 哨兵部署最佳实践

1. 哨兵数量为奇数且 ≥ 3：避免选举时出现平局(split-brain 问题)-。
2. quorum 设为哨兵数量的一半加一(如 3 个哨兵设 2，5 个哨兵设 3)：保证故障判定需要超过半数同意，防止单点误判-。
3. 合理设置超时时间：`down-after-milliseconds` 不宜过小(易误判)，也不宜过大(故障检测慢)，30 秒是经验值。
4. 部署在不同物理机/可用区：避免单机房故障导致所有哨兵同时失效-。
5. 配置通知脚本：在 `sentinel.conf` 中配置 `sentinel notification-script`，故障转移时发送告警)。
6. 定期演练故障转移：使用 `SENTINEL failover` 命令手动触发故障转移，验证流程。
-- -
## 五、集群模式部署

集群模式是 Redis 原生的分布式解决方案，通过哈希槽自动分片，实现数据的水平扩展和高可用。

### 5.1 架构规划

Redis Cluster 至少需要**3 主3从**共6个节点(3个Master各带1个Slave)。本章以3台服务器各运 2个实例为例部署：

| 服务器 | 实例端口 | 角色 | slot 范围 |
|--------|----------|------|-----------|
| Server A (192.168.1.20) | 7000 | Master 1 | 0 - 5460 |
| Server A (192.168.1.20) | 7003 | Slave of Master 1 | - |
| Server B (192.168.1.21) | 7001 | Master 2 | 5461 - 10922 |
| Server B (192.168.1.21) | 7004 | Slave of Master 2 | - |
| Server C (192.168.1.22) | 7002 | Master 3 | 10923 - 16383 |
| Server C (192.168.1.22) | 7005 | Slave of Master 3 | - |

### 5.2 创建节点配置

在每个服务器上创建独立的配置文件目录和配置文件。
#### 5.2.1 Server A 配置(192.168.1.20)
```
sudo mkdir -p /etc/redis/cluster/{7000,7003}
```
创建 `/etc/redis/cluster/7000/redis.conf`：
```
# 基础配置
port 7000
daemonize yes
pidfile /var/run/redis_7000.pid
logfile /var/log/redis/7000.log
dir /var/lib/redis/7000

# 集群核心配置
cluster-enabled yes                    # 开启集群模式
cluster-config-file nodes-7000.conf    # 集群状态文件
cluster-node-timeout 15000             # 节点超时时间(毫秒)

# 网络配置
bind 0.0.0.0

# 安全配置(集群模式建议设置密码)
requirepass cluster_password
masterauth cluster_password

# 持久化(推荐开启 AOF)
appendonly yes
appendfsync everysec

# 内存管理
maxmemory 4gb
maxmemory-policy allkeys-lru

# 如需多网卡或 NAT 环境，手动指定通告地址
# cluster-announce-ip 192.168.1.20
# cluster-announce-port 7000
```
创建 `/etc/redis/cluster/7003/redis.conf`(Slave 配置，作用是在创建集群时该节点不会被立即分配槽位，而是作为 Master 1 的从节点)：
```
port 7003
daemonize yes
pidfile /var/run/redis_7003.pid
logfile /var/log/redis/7003.log
dir /var/lib/redis/7003

cluster-enabled yes
cluster-config-file nodes-7003.conf
cluster-node-timeout 15000

bind 0.0.0.0

requirepass cluster_password
masterauth cluster_password

appendonly yes
appendfsync everysec
```
#### 5.2.2 Server B 配置(192.168.1.21)

类似配置 7001 和 7004，修改对应的端口和目录。

#### 5.2.3 Server C 配置(192.168.1.22)

类似配置 7002 和 7005，修改对应的端口和目录。
### 5.3 创建数据目录和启动脚本
```
# 在每台服务器上创建数据目录
sudo mkdir -p /var/lib/redis/{7000,7003,7001,7004,7002,7005}
sudo chown -R redis:redis /var/lib/redis /etc/redis /var/log/redis

# 启动所有节点
for port in 7000 7001 7002 7003 7004 7005; do
    sudo redis-server /etc/redis/cluster/${port}/redis.conf
done
```
检查节点启动情况：
```
ps aux | grep redis-server | grep -v grep
```
### 5.4 创建集群并分配哈希槽
使用 `redis-cli --cluster create` 命令创建集群
```
redis-cli --cluster create \
  192.168.1.20:7000 192.168.1.21:7001 192.168.1.22:7002 \
  192.168.1.20:7003 192.168.1.21:7004 192.168.1.22:7005 \
  --cluster-replicas 1 \
  -a cluster_password
```
**命令说明**：

- `--cluster create`：创建集群
- 后面的 6 个 IP:端口：集群的所有节点
- `--cluster-replicas 1`：每个 Master 配备 1 个 Slave。Redis 会按顺序分配：前 3 个为 Master，后 3 个为 Slave(7003 作为 7000 的 Slave，7004 作为 7001 的 Slave，7005 作为 7002 的 Slave)
- `-a`：集群密码
执行该命令后，Redis 会展示槽位分配方案，输入 `yes` 确认。
### 5.5 验证集群状态
```
# 连接任意节点(必须使用 -c 参数开启集群模式)
redis-cli -c -p 7000 -a cluster_password

# 查看集群信息
127.0.0.1:7000> CLUSTER INFO
```

```
cluster_state:ok
cluster_slots_assigned:16384
cluster_slots_ok:16384
cluster_slots_pfail:0
cluster_slots_fail:0
cluster_known_nodes:6
cluster_size:3
```
所有槽位分配完毕，`cluster_state:ok` 表示集群正常运行。
```
# 查看集群节点信息
127.0.0.1:7000> CLUSTER NODES
```

```
d0a1b2c3... 192.168.1.20:7000@17000 master - 0 1612345678000 1 connected 0-5460
e1f2a3b4... 192.168.1.21:7001@17001 master - 0 1612345678001 2 connected 5461-10922
f2a3b4c5... 192.168.1.22:7002@17002 master - 0 1612345678002 3 connected 10923-16383
g3b4c5d6... 192.168.1.20:7003@17003 slave d0a1b2c3... 0 1612345678003 4 connected
h4c5d6e7... 192.168.1.21:7004@17004 slave e1f2a3b4... 0 1612345678004 5 connected
i5d6e7f8... 192.168.1.22:7005@17005 slave f2a3b4c5... 0 1612345678005 6 connected
```
### 5.6 测试集群
```
# 使用集群模式连接
redis-cli -c -p 7000 -a cluster_password

# 写入数据(会自动路由到对应节点)
127.0.0.1:7000> SET user:1001 "Alice"
-> Redirected to slot [xxxx] located at 192.168.1.21:7001
OK

127.0.0.1:7000> GET user:1001
"Alice"

# 查看 key 所属的槽位
127.0.0.1:7000> CLUSTER KEYSLOT user:1001
(integer) 12345
```
### 5.7 集群扩容(添加新节点)
假设需要新增一台服务器 192.168.1.23 来扩展集群容量，在新服务器上启动两个实例(7006 为 Master，7007 作为 7006 的 Slave)。
```
# 将新 Master 节点加入集群
redis-cli --cluster add-node 192.168.1.23:7006 192.168.1.20:7000 -a cluster_password

# 将新 Slave 节点加入集群，并指定其 Master
redis-cli --cluster add-node 192.168.1.23:7007 192.168.1.20:7000 \
  --cluster-slave --cluster-master-id <master-7006-node-id> \
  -a cluster_password

# 迁移槽位到新 Master(交互式)
redis-cli --cluster reshard 192.168.1.20:7000 -a cluster_password
```
迁移槽位时会询问：

- 要迁移多少个槽位
- 接收槽位的目标节点 ID
- 从哪些源节点迁移(可输入 `all` 表示从所有现有 Master 平均分)
### 5.8 集群常用命令

| 命令 | 作用 | 示例 |
|------|------|------|
| `CLUSTER INFO` | 查看集群状态 | `CLUSTER INFO` |
| `CLUSTER NODES` | 查看集群节点及槽位分布 | `CLUSTER NODES` |
| `CLUSTER MEET <ip> <port>` | 将节点加入集群 | `CLUSTER MEET 192.168.1.23 7006` |
| `CLUSTER FORGET <node-id>` | 从集群移除节点 | `CLUSTER FORGET d0a1b2c3...` |
| `CLUSTER REPLICATE <master-id>` | 将当前节点设为指定 Master 的 Slave | `CLUSTER REPLICATE d0a1b2...` |
| `CLUSTER KEYSLOT <key>` | 计算 key 所属槽位 | `CLUSTER KEYSLOT user:1001` |
| `CLUSTER ADDSLOTS <slot>` | 添加槽位到当前节点 | `CLUSTER ADDSLOTS 0 1 2 3` |
| `CLUSTER FAILOVER` | 手动触发从节点接管 | `CLUSTER FAILOVER` |
### 5.9 集群最佳实践
1. 至少 3 主 3 从：确保节点宕机时仍有多数派能进行故障转移，这是生产环境的配置下限-。
2. Master 和 Slave 分布在不同物理机：避免机器故障导致数据和副本同时丢失。
3. 合理规划槽位分配：使用 `--cluster rebalance` 定期检查并平衡槽位分布-。
4. 客户端使用集群模式：使用支持 Redis Cluster 的客户端库(如 JedisCluster、Lettuce、redis-py-cluster)。
5. Hash Tag 使用：如果业务需要多个 key 一起操作(如事务、`MGET`、`MSET`)，可使用 `{...}` 标签强制它们分配到同一槽位，避免跨槽操作报 `CROSSSLOT` 错误。
6. 监控集群状态：重点关注 `cluster_state`、`cluster_known_nodes`、槽位覆盖情况等指标。
7. 开启持久化：每个节点都应开启持久化(AOF 推荐使用 `everysec` 策略)，避免节点重启后数据丢失。尤其在集群模式下，节点恢复依赖持久化文件。
8. 网络要求：节点之间需要同时开放 Redis 端口(如 6379)和集群总线端口(port+10000，如 16379)，防火墙须放行这两个端口的 TCP 流量。

## 六、四种架构对比与选型建议
### 6.1 架构对比总览

| 维度 | 单机 | 主从复制 | 哨兵模式 | 集群模式 |
|------|------|----------|----------|----------|
| 数据容量 | ≤ 单机内存 | ≤ 单机内存 | ≤ 单机内存 | 水平扩展，可达数十 TB |
| 读性能 | 受限于单机 | 多个 Slave 分流 | 多个 Slave 分流 | 多 Master 分布，可线性扩展 |
| 写性能 | 受限于单机 | 受限于 Master | 受限于 Master | 多 Master 并行写入 |
| 高可用 | ❌ 无 | ❌ 需手动切换 | ✅ 自动故障转移 | ✅ 内置故障转移 |
| 运维复杂度 | 最低 | 较低 | 中等 | 较高 |
| 适用场景 | 开发测试、小规模缓存 | 读写分离、中等规模 | 生产高可用(中等规模) | 生产高可用(大规模) |
| 最小节点数 | 1 | 1 主 1 从 | 1 主 2 从 + 3 哨兵 | 3 主 3 从 |
| 数据分片 | 无 | 无 | 无 | 哈希槽(16384 个) |
| 多 key 操作 | 全部支持 | 全部支持 | 全部支持 | 仅支持同一 slot 内 |
### 6.2 选型决策树
```
数据量 > 100GB？
    ├─ 是 → 选择集群模式(3 主 3 从起)
    └─ 否 ↓

是否需要高可用(自动故障转移)？
    ├─ 否 → 数据量 < 50GB？选择单机模式
    └─ 是 ↓

是否需要高写入性能？
    ├─ 是 → 选择集群模式(多 Master 写入)
    └─ 否 ↓

是否已部署主从复制？
    ├─ 否 → 资源充足？选择哨兵模式(1 主 2 从 + 3 哨兵)
    └─ 是 → 在主从基础上添加哨兵
```
### 6.3 生产环境推荐配置速查

| 架构 | 适用数据量 | 推荐配置 | 预期 QPS(读/写) |
|------|-----------|----------|----------------|
| 单机 | < 20GB | 4C8G，Redis maxmemory=6GB | 5-10 万 |
| 主从 | < 50GB | 1 主 2 从，Master 8C16G，Slave 4C8G | 读 10-20 万，写 5-8 万 |
| 哨兵 | < 80GB | 1 主 2 从 + 3 哨兵，配置同主从 | 读 10-20 万，写 5-8 万 |
| 集群 | > 100GB | 3 主 3 从起，每 Master 8C16G | 随节点数线性增长 |

## 七、生产运维指南

### 7.1 监控要点

1. 内存使用率：`INFO memory used_memory_human`，超过 `maxmemory` 的 80% 需扩容。
2. 命中率：`INFO stats keyspace_hits / (keyspace_hits + keyspace_misses)`。
3. 复制延迟：`INFO replication master_repl_offset` 与 `slave_repl_offset` 差值。
4. 慢查询：`SLOWLOG GET 10` 查看耗时命令。
5. 连接数：`INFO clients connected_clients`，接近 `maxclients` 需扩容。
6. 持久化状态：`INFO persistence rdb_last_bgsave_status` 和 `aof_last_rewrite_status`。
### 7.2 备份策略
```
# RDB 备份脚本示例
# 脚本内容
BACKUP_DIR=/backup/redis
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PASSWORD=your_password

mkdir -p $BACKUP_DIR

# 触发 BGSAVE
redis-cli -a $PASSWORD BGSAVE

# 等待 BGSAVE 完成
sleep 10

# 复制 RDB 文件到备份目录
cp /var/lib/redis/dump.rdb $BACKUP_DIR/dump_$TIMESTAMP.rdb

# 保留最近 7 天备份，删除旧文件
find $BACKUP_DIR -name "dump_*.rdb" -mtime +7 -delete
```
配合 crontab 设置每天凌晨执行：`0 2 * * * /opt/scripts/redis_backup.sh`
### 7.3 性能调优清单
- 关闭 THP：`echo never > /sys/kernel/mm/transparent_hugepage/enabled`
- 设置 `vm.overcommit_memory = 1`
- 增加 `net.core.somaxconn`：`echo 65535 > /proc/sys/net/core/somaxconn`
- 设置 `repl-backlog-size` 足够大(如 100 MB)
- AOF 重写期间禁用 fsync：`no-appendfsync-on-rewrite yes`
- 选择合适的淘汰策略(`allkeys-lru` 或 `volatile-lru`)
- 限制客户端连接数 `maxclients`，避免资源耗尽

## 八、常见问题排查
### 8.1 启动失败：Can't chdir to ...

**原因**：数据目录不存在或权限不足。  

**解决**：创建目录并修改所有者 `chown redis:redis /var/lib/redis`。
### 8.2 主从连接失败：MASTERDOWN Link fails

**排查步骤**：

1. 检查 `firewall-cmd --list-ports` 确认端口已放行
2. 检查 `bind` 配置是否绑定了正确的 IP
3. 检查 `requirepass` 和 `masterauth` 是否一致
4. 使用 `telnet <master_ip> 6379` 测试网络连通性
### 8.3 哨兵无法完成故障转移

**排查步骤**：

1. 确认哨兵数量及 quorum 设置：`SENTINEL ckquorum mymaster`
2. 检查 `down-after-milliseconds` 是否设置得当
3. 查看哨兵日志 `tail -f /var/log/redis/sentinel.log`
4. 确认从节点的 `masterauth` 配置正确

### 8.4 集群状态不正常

**排查步骤**：

1. 检查集群状态：`CLUSTER INFO` 中的 `cluster_state`
2. 检查节点是否全部在线：`CLUSTER NODES`
3. 确认集群总线端口(port+10000)已放行
4. 需要修复时可尝试 `redis-cli --cluster fix` 命令