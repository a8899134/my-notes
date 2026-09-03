## 一、前置条件
无论采用哪种安装方式，生产环境都需要进行以下系统优化。
### 1.1 操作系统级优化
1. 内存 overcommit 设置
Redis 在执行 RDB 或 AOF 重写时，会通过 fork() 创建子进程，需要临时申请大量虚拟地址空间。
临时生效：
```bash
sudo sysctl vm.overcommit_memory=1
```
永久生效：
```bash
echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```
2. 禁用透明大页(THP)
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
```bash
sudo systemctl enable --now rc-local
```

3. 防火墙配置
```bash
# 仅允许 192.168.100.0/24 网段访问 Redis 6379 端口
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.100.0/24" port protocol="tcp" port="6379" accept'

# 如果要部署哨兵模式，放行 26379 端口
sudo firewall-cmd --permanent --add-port=26379/tcp

# 如果要部署集群模式，放行集群总线端口(Redis 端口 + 10000)
sudo firewall-cmd --permanent --add-port=16379/tcp

# 重新加载规则使生效
sudo firewall-cmd --reload

# 查看当前生效的富规则
sudo firewall-cmd --list-rich-rules
#
# 查看已放行的端口列表
sudo firewall-cmd --list-ports
```
4. SELinux 配置
设置为 permissive 模式
```bash
sudo setenforce 0
sudo sed -i 's/SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config
```

### 1.2 安装方式选择
在生产环境中部署 Redis，选择正确的安装方式至关重要。不同的安装方式在版本可控性、部署效率、维护便利性等方面各有优劣。根据业务需求、网络环境、运维规范等因素选择合适的安装方式，是保障 Redis 稳定运行的第一步。
### 1.3 三种安装方式对比
| 对比维度  | dnf/yum 安装  | RPM 包安装           | 源码编译安装          |
| ----- | ----------- | ----------------- | --------------- |
| 安装难度  | 最简单         | 中等                | 较复杂             |
| 版本可控性 | 低(依赖仓库版本)   | 中等(取决于下载的 RPM 版本) | 高(可精确指定版本)      |
| 依赖处理  | 自动处理        | 需手动处理             | 需手动安装编译依赖       |
| 部署速度  | 最快          | 较快                | 较慢(需编译)         |
| 定制化能力 | 低           | 低                 | 高(可指定编译参数和安装路径) |
| 维护便利性 | 高(dnf 统一管理) | 高(rpm 统一管理)       | 较低(需手动升级)       |
| 适用场景  | 测试环境、快速部署   | 离线环境、合规要求严格       | 生产环境推荐          |

### 1.4 生产环境选择建议
在 Rocky Linux 8 生产环境中部署 Redis 7.2.x：

| 场景           | 推荐方式         | 理由                       |
| ------------ | ------------ | ------------------------ |
| 可联网、追求版本精确可控 | 源码编译安装       | 可精确安装 7.2.x 任意版本，编译参数可定制 |
| 可联网、追求部署效率   | 官方 YUM 仓库安装  | 可获取较新版本，dnf 统一管理         |
| 无法联网、内网合规环境  | RPM 包离线安装    | 符合安全合规要求，无需外网            |
| 快速测试验证       | 系统自带的 dnf 安装 | 一条命令完成，适合非生产环境           |
-- -
## 二、dnf/yum 安装
### 2.1 基本概念
dnf(Dandified YUM)是 Rocky Linux 8 的默认包管理工具，是 yum 的下一代版本。通过 dnf 安装 Redis，系统会自动从配置的软件仓库中下载 Redis 及其所有依赖包，并完成安装和基本配置。

这种方式操作最简单，适合快速部署测试环境。但 Rocky Linux 8 默认仓库中的 Redis 版本通常较旧(停留在 6.x 版本)，无法满足生产环境对 7.2.x 版本的需求。
### 2.2 安装步骤
#### 2.2.1 启用 EPEL 仓库
Redis 在 Rocky Linux 8 默认仓库中可能不存在，需要先启用 EPEL(Extra Packages for Enterprise Linux)仓库。
```bash
sudo dnf install epel-release -y
```
#### 2.2.2 安装 Redis
```bash
# 显示所有可用的版本
sudo dnf list redis --showduplicates
# 安装redis
sudo dnf install redis -y
```
版本确认：
```bash
redis-server --version
```
#### 2.2.3 启动并设置开机自启
```bash
sudo systemctl enable --now redis
```
#### 2.2.4 检查服务状态
```bash
sudo systemctl status redis
```
#### 2.2.5 验证安装
```bash
redis-cli ping
```
预期返回：PONG
### 2.3 优缺点总结
| 优点                | 缺点                       |
| ----------------- | ------------------------ |
| 安装命令简单，一条完成       | 版本通常较旧，无法精确控制            |
| 自动处理依赖关系          | 编译参数不可定制                 |
| 卸载和升级方便(dnf 统一管理) | 无法指定安装路径                 |
| 自动配置 systemd 服务   | EPEL 仓库的 Redis 版本可能滞后于官方 |
-- -
## 三、RPM 包安装
### 3.1 基本概念
RPM(Red Hat Package Manager)是 Red Hat 系 Linux 发行版的软件包格式。通过 RPM 包安装 Redis，可以获取比系统默认仓库更新的版本，同时保留 RPM 包管理带来的便利性。

Redis 官方提供了专门的 YUM 仓库(packages.redis.io)，通过配置该仓库，可以使用 dnf/yum 安装官方构建的 Redis RPM 包，版本比系统默认仓库更新。

### 3.2  Redis 官方仓库安装
#### 3.2.1 配置 Redis 官方仓库
手动创建 Redis 官方仓库文件 `/etc/yum.repos.d/redis.repo`：
```bash
sudo tee /etc/yum.repos.d/redis.repo > /dev/null << 'EOF'
[Redis]
name=Redis Repository for $basearch
baseurl=https://packages.redis.io/rpm/rhel8/$basearch
enabled=1
gpgcheck=1
gpgkey=https://packages.redis.io/rpm/redis.gpg
EOF
```
#### 3.2.2 导入 Redis GPG 密钥
```bash
sudo curl -o /tmp/redis.gpg https://packages.redis.io/gpg
sudo rpm --import /tmp/redis.gpg
```
命令说明：
- rpm --import：将 GPG 密钥导入 RPM 的密钥库
#### 3.2.3 查看可用版本(可选)
```bash
sudo dnf list redis --showduplicates
```
说明：此命令可查看仓库中所有可用的 Redis 版本，便于选择具体版本安装。
#### 3.2.4 安装 Redis
安装最新版本：
```bash
sudo dnf install redis -y
```
安装指定版本(如 7.2.5)：
```bash
sudo dnf install redis-7.2.5 -y
```
#### 3.2.5 启动并设置开机自启
```bash
sudo systemctl enable --now redis
```
#### 3.2.6 验证安装
```bash
redis-cli --version
redis-cli ping
```
### 3.3 离线环境 RPM 安装
在无法连接外网的生产环境(如金融、政务内网)中，需要提前下载好 RPM 包及其所有依赖，然后拷贝到目标服务器进行离线安装。
#### 3.3.1 在联网机器上下载 RPM 包(准备工作)
使用 yumdownloader 工具下载 Redis 及其依赖的 RPM 包：
```bash
# 安装 yum-utils(包含 yumdownloader)
sudo dnf install yum-utils -y

# 创建存放 RPM 包的目录
mkdir -p /tmp/redis-rpms
cd /tmp/redis-rpms

# 下载 Redis 及其所有依赖
sudo yumdownloader --resolve --destdir=/tmp/redis-rpms redis
```
命令说明：
- resolve：同时下载所有依赖包
- destdir：指定下载目录
#### 3.3.2 查看依赖关系(可选)
```bash
dnf deplist redis
```
说明：此命令可查看 Redis 所需的所有依赖，便于确认下载是否完整。
#### 3.3.3 将 RPM 包传输到目标服务器
使用 U 盘、scp、rsync 等方式将 /tmp/redis-rpms 目录下的所有 RPM 文件拷贝到目标服务器的某个目录(如 /tmp/redis-rpms)。
#### 3.3.4 在目标服务器上安装 RPM 包
```bash
cd /tmp/redis-rpms
sudo rpm -ivh *.rpm
```
命令说明：
- `rpm -ivh`：安装 RPM 包(`-i` 安装、`-v` 显示详细信息、`-h` 显示进度条)
- `*.rpm`：安装当前目录下所有 RPM 包
**注意**：如果安装过程中提示依赖缺失，说明下载的依赖包不完整，需要返回联网机器重新下载。
#### 3.3.5 启动并设置开机自启
```bash
sudo systemctl enable --now redis
```
#### 3.3.6 验证安装
```bash
# 期望输出：Redis server v=7.2.x 跟PONG
redis-cli --version
redis-cli ping
```
### 3.4 使用 Remi 仓库安装
Remi 仓库是著名的第三方软件源，为 RHEL 系列提供最新版本的软件包。如果想安装 Redis 7.x 版本(官方推荐的最新稳定系列)，推荐使用此方式。
#### 3.4.1 启用 EPEL 和 Remi 仓库
```bash
# 安装 EPEL 仓库
sudo dnf install  epel-release -y

# 安装 Remi 仓库(适用于 Rocky Linux 8)
# Remi 会对 RHEL 各个小版本(如 RHEL 8.10, 8.8 等)持续验证，但在 Rocky Linux 8 上基本完全兼容
sudo dnf install  https://rpms.remirepo.net/enterprise/remi-release-8.rpm -y
```
命令解释：
- Remi 仓库的 RPM 包 remi-release-8.rpm 对应 RHEL / Rocky Linux 8 系列 。
- 安装该 RPM 后，系统会自动获得 Remi 的仓库配置。
#### 3.4.2 启用 Redis 7 模块并安装
```bash
# 1. 重置当前启用的 Redis 模块
sudo dnf module reset redis -y

# 2. 重新启用 Remi 的 Redis 7.2 模块
sudo dnf module enable redis:remi-7.2 -y

# 4. 确认切换成功
sudo dnf module list redis
# 5. 安装 Redis
sudo dnf install  redis -y
```
#### 3.4.3 启动并设置开机自启
```bash
sudo systemctl enable --now redis
```
#### 3.4.4 验证安装
```bash
# 期望输出：Redis server v=7.2.x 跟PONG
redis-cli --version
redis-cli ping
```
### 3.5 优缺点总结
| 优点               | 缺点           |
| ---------------- | ------------ |
| 版本比系统默认仓库更新      | 需要额外配置官方仓库   |
| 保留 RPM 包管理便利性    | 版本仍受仓库更新频率限制 |
| 支持离线安装(提前下载 RPM) | 离线安装需手动处理依赖  |
| 官方构建，经过测试        | 编译参数不可定制     |
-- -
## 四、源码编译安装
### 4.1 基本概念
如果需要在生产环境部署最新版本、启用特定编译选项(如 TLS 加密)，或者需要在无法联网的环境中安装，可以选择从源码编译安装。

源码编译安装是指从 Redis 官方网站下载源代码，在目标服务器上使用 C 编译器(gcc)将源码编译成可执行的二进制文件，再安装到指定目录。

这种方式虽然步骤较多，但具有以下生产环境不可替代的优势：
1. 版本精确可控，可精确安装 7.2.x 任意小版本
2. 编译参数可定制，可按需开启 TLS 加密、指定内存分配器等关键特性
3. 安装路径灵活，可自由指定安装目录，便于多实例管理
4. 环境纯净，不污染系统包管理器的数据库
### 4.2 环境准备
#### 4.2.1 安装编译依赖
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
#### 4.2.2 更新系统(可选)
```bash
sudo dnf update -y
```
### 4.3 下载与解压源码
#### 4.3.1 下载 Redis 源码包
```bash
# 进入目录
cd /opt
# 目前最新稳定版本可从 redis.io 获取
sudo wget https://download.redis.io/releases/redis-7.2.5.tar.gz
```
#### 4.3.2 解压源码包
```bash
# 解压源码包
sudo tar -xzvf redis-7.2.5.tar.gz
# 进入源码目录
cd redis-7.2.5
```
###  4.4 编译
#### 4.4.1 执行编译
生产环境强烈推荐使用以下编译参数：
```bash
# 1. 解压后先改属主(避免 sudo 解压导致 root 属主)$USER可以替换自己用户名
sudo chown -R $USER:$USER /opt/redis-7.2.5
# 2. 切换到普通用户编译
cd /opt/redis-7.2.5
make BUILD_TLS=yes BUILD_WITH_JEMALLOC=yes -j$(nproc)
```
编译参数说明：

| 参数                      | 作用                | 生产环境建议                 |
| ----------------------- | ----------------- | ---------------------- |
| BUILD_TLS=yes           | 启用 TLS/SSL 加密连接支持 | 生产环境强烈推荐，否则后续无法使用加密连接  |
| BUILD_WITH_JEMALLOC=yes | 使用 jemalloc 内存分配器 | 强烈推荐，可避免内存碎片和 AOF 重写卡顿 |
| -j$(nproc)              | 使用所有 CPU 核心并行编译   | 推荐，加快编译速度              |
为什么必须加这两个参数：
- 不加 BUILD_TLS=yes，后续启用 TLS 端口时会报错 Unknown option
- 不加 BUILD_WITH_JEMALLOC=yes，可能遇到内存分配性能问题，导致 AOF 重写时卡顿
#### 4.4.2 运行测试(推荐)
```bash
make test
```
说明：运行 Redis 自带的测试用例，验证编译结果是否正确。全部通过会显示 All tests passed。
### 4.5 安装
#### 4.5.1 安装到指定目录(推荐)
```bash
sudo make install PREFIX=/usr/local/redis
```
说明：使用 PREFIX 参数指定安装目录，所有可执行文件会安装到 /usr/local/redis/bin 下。
#### 4.5.2 配置 PATH 环境变量
```bash
echo 'export PATH=/usr/local/redis/bin:$PATH' | sudo tee /etc/profile.d/redis.sh
source /etc/profile.d/redis.sh
```
说明：将 Redis 的 bin 目录添加到系统 PATH，便于直接执行 redis-server、redis-cli 等命令。
### 4.6 创建 Redis 用户与目录
#### 4.6.1 创建专用用户
安全原则：生产环境禁止以 root 用户运行 Redis。
```bash
sudo useradd -r -s /sbin/nologin redis
```
命令说明：
- `-r`：创建系统用户(UID < 1000，不会创建家目录)
- `-s /sbin/nologin`：禁止登录
- 默认会创建同名组 `redis`(GID 自动分配)
#### 4.6.2 创建必要目录
```bash
# 存放 Redis 配置文件
sudo mkdir -p /etc/redis
# 存放持久化数据文件(RDB、AOF)
sudo mkdir -p /var/lib/redis
# 存放 Redis 日志文件
sudo mkdir -p /var/log/redis
```
#### 4.6.3 设置目录权限
```bash
sudo chown -R redis:redis /var/lib/redis
sudo chown -R redis:redis /var/log/redis
sudo chmod 755 /var/lib/redis
sudo chmod 755 /var/log/redis
```
### 4.7 配置 Redis
#### 4.7.1 复制配置文件
```bash
sudo cp /opt/redis-7.2.5/redis.conf /etc/redis/redis.conf
```
#### 4.7.2 修改配置文件
```bash
sudo vi /etc/redis/redis.conf
```
生产环境关键配置：
```text
# 绑定本机的 IP 地址；生产环境需绑定内网 IP 或云上私有地址，无法绑定 0.0.0.0(不安全)
bind 127.0.0.1 你的内网IP

# 服务端口(默认 6379)
port 6379

# 必须配置,将 supervised 设为 systemd(让服务更适合 systemd 管理)
supervised systemd

# 后台守护进程模式(DNF 安装的 service 配置已包含运行管控，建议与 systemd 方式配合)
daemonize no

# 保护模式
protected-mode yes

# 设置密码(必须)
requirepass 你的强密码

# 日志级别(可选：debug, verbose, notice, warning)
loglevel notice

# 日志文件
logfile /var/log/redis/redis.log

# 数据持久化目录
dir /var/lib/redis

# 内存限制
maxmemory 4gb
maxmemory-policy allkeys-lru
```
重要说明：supervised systemd 和 daemonize no 是硬性搭配。daemonize 必须为 no，否则 systemd 无法正确追踪 Redis 进程。
### 4.8 创建 systemd 服务
#### 4.8.1 创建服务文件
```bash
sudo vi /etc/systemd/system/redis.service
```
写入以下内容：
```text
[Unit]
Description=Redis 7.2.x In-Memory Data Store
After=network.target

[Service]
Type=simple
User=redis
Group=redis
ExecStart=/usr/local/redis/bin/redis-server /etc/redis/redis.conf
ExecStop=/usr/local/redis/bin/redis-cli -a 你的密码 shutdown
Restart=always
LimitNOFILE=10032

[Install]
WantedBy=multi-user.target
```
配置项说明：

| 配置项                      | 说明                             |
| ------------------------ | ------------------------------ |
| Type=simple              | 当 daemonize no 时，必须使用 simple   |
| User=redis / Group=redis | 以 redis 用户身份运行                 |
| ExecStart                | 启动命令：指定 redis-server 路径和配置文件路径 |
| ExecStop                 | 停止命令：使用 redis-cli 执行 shutdown  |
| Restart=always           | 进程异常退出时自动重启                    |
| LimitNOFILE=10032        | 最大打开文件数限制                      |
#### 4.8.2 启动服务
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
### 4.9 验证安装
```bash
redis-cli -a 你的密码 ping
```
预期返回：PONG
### 4.10 优缺点总结
|优点|缺点|
|---|---|
|版本精确可控|安装步骤较多|
|编译参数可定制|需手动处理编译依赖|
|安装路径灵活|升级需手动操作|
|不依赖系统包管理器|编译过程耗时|
-- -
## 五、配置文件模板
无论使用哪种安装方式，都需要对 Redis 配置文件进行生产环境的优化设置。
配置文件的位置取决于安装方式：
- DNF / RPM 安装/Remi 安装：/etc/redis.conf
- 源码编译安装：/etc/redis/redis.conf
```text
# ============================
# Redis 7.2.x 生产环境配置文件
# 适用系统：Rocky Linux 8
# 安装方式：源码编译安装(PREFIX=/usr/local/redis)
# ============================


# ============================ 网络配置 ============================

# 监听地址：生产环境必须绑定具体内网IP，禁止绑定 0.0.0.0
# 如果仅本机访问，保留 127.0.0.1 即可；如需跨服务器访问，添加内网IP
bind 127.0.0.1 192.168.1.100

# 监听端口(建议修改为非常用端口，增加安全性)
port 6379

# 保护模式：开启后，未设置密码时仅允许本地回环地址访问
protected-mode yes

# TCP连接队列大小(高并发环境建议调大，受系统 net.core.somaxconn 限制)
tcp-backlog 2048

# 客户端空闲超时(秒，0表示不超时，生产环境建议设置合理值避免连接堆积)
timeout 300

# TCP保活检测间隔(秒，检测死连接并保持中间设备连接活跃)
tcp-keepalive 300


# ============================ 通用配置 ============================

# 是否以守护进程运行(配合systemd时必须为 no)
daemonize no

# systemd监督模式(生产环境建议设为 systemd 或 auto)
supervised systemd

# PID文件路径
pidfile /run/redis/redis.pid

# 日志级别(生产环境使用 notice，调试时可用 verbose)
loglevel notice

# 日志文件路径
logfile /var/log/redis/redis.log

# 数据库数量(默认16个，编号0-15)
databases 16

# 启动时是否显示ASCII Logo(生产环境建议关闭以减少日志噪音)
always-show-logo no


# ============================ 安全配置 ============================

# 访问密码(生产环境必须设置，建议16位以上大小写字母+数字+特殊符号)
requirepass Redis@root123

# 主从复制认证密码(如果主节点设置了密码，从节点需配置此项)
masterauth Redis@copy123

# 禁用危险命令(防止误操作和数据泄露)
rename-command FLUSHALL ""
rename-command FLUSHDB ""
# 涉及到查询AOF是否开启
rename-command CONFIG "admin_config_2026"
rename-command KEYS "admin_keys_2026"

# ACL日志最大长度
acllog-max-len 128


# ============================ 内存管理 ============================

# 最大内存限制(建议设为物理内存的 60%-75%，预留系统内存)
# 例如：物理内存16GB，建议设为 10gb-12gb
maxmemory 10gb

# 内存淘汰策略(缓存场景推荐 allkeys-lru，需持久化场景推荐 volatile-lru)
maxmemory-policy allkeys-lru

# LRU/LFU采样数量(值越大越精确，CPU消耗越高，默认5)
maxmemory-samples 10


# ============================ 持久化配置 ============================

# ---------- RDB 快照 ----------
# RDB触发条件(根据业务调整，以下为生产常用配置)
# 1小时内至少1次修改
save 3600 1  
# 5分钟内至少100次修改   
save 300 100 
# 1分钟内至少10000次修改    
save 60 10000    

# 快照失败时是否停止写入(建议开启，避免数据不一致)
stop-writes-on-bgsave-error yes

# 是否压缩RDB文件(LZF压缩，节省磁盘但消耗CPU)
rdbcompression yes

# 是否启用RDB文件校验和(CRC64校验，增加约10%开销)
rdbchecksum yes

# RDB文件名
dbfilename dump.rdb

# 数据目录
dir /var/lib/redis

# ---------- AOF 日志 ----------
# 是否开启AOF(生产环境强烈建议开启)
appendonly yes

# AOF文件名
appendfilename "appendonly.aof"

# AOF文件存放子目录名
appenddirname "appendonlydir"

# fsync同步策略(推荐 everysec，兼顾性能与数据安全)
appendfsync everysec

# AOF重写时是否禁止fsync(yes降低阻塞，但增加数据丢失风险)
no-appendfsync-on-rewrite no

# AOF重写触发百分比(当前文件比上次重写后增长100%时触发)
auto-aof-rewrite-percentage 100

# AOF重写触发最小文件大小(低于此值不触发重写)
auto-aof-rewrite-min-size 64mb

# 是否加载截断的AOF文件(yes加载并警告，no拒绝启动)
aof-load-truncated yes

# 是否启用混合持久化(AOF头部包含RDB快照，加快恢复速度)
aof-use-rdb-preamble yes


# ============================ 主从复制 ============================

# 从节点与主节点断开后，是否继续响应查询(可能返回过期数据)
replica-serve-stale-data yes

# 从节点是否只读(生产环境建议保持只读)
replica-read-only yes

# 是否启用无盘复制(yes=直接通过socket传输，no=先写磁盘)
repl-diskless-sync yes

# 无盘复制延迟时间(秒，等待更多从节点到达再开始传输)
repl-diskless-sync-delay 5

# 是否禁用TCP_NODELAY(yes节省带宽但增加延迟)
repl-disable-tcp-nodelay no

# 从节点优先级(值越小越优先被哨兵选为主节点，0表示不能成为主节点)
replica-priority 100


# ============================ 客户端与性能 ============================

# 最大客户端连接数(受系统 ulimit -n 限制，需同步调整)
maxclients 10000

# 后台任务执行频率(1-500，默认10，值越大响应越快但消耗CPU)
hz 10

# 是否启用动态hz(根据客户端数量自动调整hz)
dynamic-hz yes

# I/O线程数(建议4核以上机器启用，设置为 CPU 核心数的一半，不超过8)
io-threads 4

# 是否启用I/O线程读取和协议解析(建议开启)
io-threads-do-reads yes


# ============================ 惰性删除 ============================

# 内存淘汰时是否使用非阻塞删除(UNLINK替代DEL)
lazyfree-lazy-eviction yes

# 键过期时是否使用非阻塞删除
lazyfree-lazy-expire yes

# 命令副作用时是否使用非阻塞删除
lazyfree-lazy-server-del yes

# 从节点清库时是否使用非阻塞删除
replica-lazy-flush yes

# DEL命令是否默认行为改为UNLINK(非阻塞删除)
lazyfree-lazy-user-del no


# ============================ 慢查询与监控 ============================

# 慢查询阈值(微秒，超过此值记录到慢日志)
slowlog-log-slower-than 10000

# 慢查询日志最大保留条数
slowlog-max-len 128

# 延迟监控阈值(毫秒，0表示关闭监控)
latency-monitor-threshold 0


# ============================ 高级数据结构优化 ============================

# Hash类型：使用listpack的最大字段数
hash-max-listpack-entries 512
hash-max-listpack-value 64

# List类型：quicklist每个节点最大大小(-2=8KB)
list-max-listpack-size -2

# List类型：压缩深度(0=不压缩)
list-compress-depth 0

# Set类型：整数集合最大元素数
set-max-intset-entries 512

# Set类型：非整数集合使用listpack的最大元素数
set-max-listpack-entries 128
set-max-listpack-value 64

# ZSet类型：使用listpack的最大元素数
zset-max-listpack-entries 128
zset-max-listpack-value 64

# HyperLogLog稀疏表示最大字节数
hll-sparse-max-bytes 3000

# Stream节点配置
stream-node-max-bytes 4096
stream-node-max-entries 100

# 是否启用主动rehash
activerehashing yes


# ============================ 客户端输出缓冲限制 ============================

# 普通客户端(无限制)
client-output-buffer-limit normal 0 0 0

# 从节点客户端
client-output-buffer-limit replica 256mb 64mb 60

# 发布订阅客户端
client-output-buffer-limit pubsub 32mb 8mb 60


# ============================ AOF/RDB 增量fsync ============================

# AOF重写时增量fsync(每4MB数据执行一次fsync)
aof-rewrite-incremental-fsync yes

# RDB保存时增量fsync(每4MB数据执行一次fsync)
rdb-save-incremental-fsync yes


# ============================ 透明大页控制 ============================

# 禁用透明大页(避免延迟问题)
disable-thp yes


# ============================ Jemalloc ============================

# 启用Jemalloc后台清理线程
jemalloc-bg-thread yes
```
危险命令说明：
- `FLUSHALL`：清空所有数据库中的数据，不可恢复
- `FLUSHDB`：清空当前数据库中的数据
- `CONFIG`：可以动态修改 Redis 配置，包括修改密码
- `KEYS`：在生产环境执行会阻塞 Redis，长时间扫描所有 key 导致服务不可用
-- -
## 六、启动停止与日常管理
### 6.1 使用 systemd 管理服务
systemd 是现代 Linux 发行版的标准系统和服务管理器。
```bash
# 启动 Redis
sudo systemctl start redis

# 停止 Redis
sudo systemctl stop redis

# 重启 Redis
sudo systemctl restart redis

# 查看服务状态
sudo systemctl status redis

# 设置开机自启
sudo systemctl enable redis

# 禁用开机自启
sudo systemctl disable redis

```
reload 命令会向 Redis 发送 CONFIG REWRITE，使其在不重启的情况下重新加载配置文件中的部分参数。
### 6.2 使用 redis-cli 手动管理
`redis-cli` 是 Redis 自带的命令行客户端工具。
```bash
# 连接到redis，方式一：使用 -a 参数(命令行中会暴露密码，通过 ps 命令可看到)
redis-cli -a your_password ping


# 连接到redis，方式二：使用环境变量(推荐，避免密码暴露)
export REDISCLI_AUTH=your_password
redis-cli ping

# 连接到远程 Redis
redis-cli -h 192.168.1.100 -p 6379 -a your_password

# 测试 Redis 是否运行
redis-cli -a your_password ping
# 期望返回：PONG

# 查看 Redis 版本信息
redis-cli -a your_password INFO server | grep redis_version

# 查看 Redis 统计信息
redis-cli -a your_password INFO stats

# 查看内存使用情况
redis-cli -a your_password INFO memory

# 查看连接数
redis-cli -a your_password INFO clients

# 列出所有配置项
redis-cli -a your_password CONFIG GET '*'

# 动态修改配置(临时生效，重启后失效)
redis-cli -a your_password CONFIG SET maxmemory 4gb

# 持久化配置更改到文件
redis-cli -a your_password CONFIG REWRITE

# 查看当前数据库的 key 数量
redis-cli -a your_password DBSIZE

# 监控正在执行的命令(调试用)
redis-cli -a your_password MONITOR

# 查看慢查询日志(前 10 条)
redis-cli -a your_password SLOWLOG GET 10

# 清空慢查询日志
redis-cli -a your_password SLOWLOG RESET

# 正常关闭 Redis
redis-cli -a your_password shutdown
```
INFO 命令的输出包含大量 Redis 的运行状态信息，INFO xxx(如 INFO memory)可以只显示特定维度的信息。
**警告：** 在生产环境中，请谨慎使用 MONITOR 命令，因为它会输出所有操作，大量使用可能导致性能下降。
-- -
## 七、验证安装与测试
### 7.1 验证安装
完成安装和启动后，执行以下命令验证 Redis 是否正常工作。
```bash
# 连接 Redis
redis-cli -a your_password

# 测试设置和获取键值
127.0.0.1:6379> SET hello world
OK
127.0.0.1:6379> GET hello
"world"
127.0.0.1:6379> DEL hello
(integer) 1

# 退出客户端
127.0.0.1:6379> exit
```
### 7.2 性能基准测试
Redis 自带了性能测试工具 redis-benchmark，可以评估当前服务器的 Redis 性能。
```bash
# 基本性能测试(50 个并发，10000 个请求)
redis-benchmark -a your_password -c 50 -n 10000 -q
```
参数说明：
- -c 50：50 个并发客户端连接
- -n 10000：总共执行 10000 个请求
- -q：仅显示 QPS 摘要，不逐一打印每个请求的详细结果
预期输出示例：
```bash
[root@RockyLinux redis]# redis-benchmark  -c 50 -n 10000 -q
PING_INLINE: 138888.89 requests per second, p50=0.135 msec         
PING_MBULK: 178571.42 requests per second, p50=0.143 msec
SET: 158730.16 requests per second, p50=0.135 msec
GET: 188679.25 requests per second, p50=0.135 msec
INCR: 188679.25 requests per second, p50=0.135 msec                  
LPUSH: 192307.69 requests per second, p50=0.135 msec
RPUSH: 192307.69 requests per second, p50=0.135 msec
LPOP: 200000.00 requests per second, p50=0.135 msec
RPOP: 185185.19 requests per second, p50=0.135 msec                   
SADD: 192307.69 requests per second, p50=0.135 msec
HSET: 178571.42 requests per second, p50=0.135 msec
SPOP: 178571.42 requests per second, p50=0.143 msec
ZADD: 185185.19 requests per second, p50=0.135 msec
ZPOPMIN: 175438.59 requests per second, p50=0.143 msec                  
LPUSH (needed to benchmark LRANGE): 178571.42 requests per second, p50=0.135 msec
LRANGE_100 (first 100 elements): 111111.11 requests per second, p50=0.239 msec
LRANGE_300 (first 300 elements): 48076.92 requests per second, p50=0.519 msec                   
LRANGE_500 (first 500 elements): 34602.07 requests per second, p50=0.727 msec                   
LRANGE_600 (first 600 elements): 30211.48 requests per second, p50=0.839 msec                   
MSET (10 keys): 196078.44 requests per second, p50=0.151 msec
XADD: 196078.44 requests per second, p50=0.127 msec
```
核心关注指标

| 序号  | 关注命令         | 你的 QPS | 参考值(健康范围) | 说明                |
| --- | ------------ | ------ | --------- | ----------------- |
| 1   | SET          | 15.9 万 | 12 万-18 万 | 写入性能，最基础的写操作      |
| 2   | GET          | 18.9 万 | 14 万-20 万 | 读取性能，最基础的读操作      |
| 3   | LRANGE100    | 11.1 万 | ≥ 8 万     | 列表范围查询，模拟复杂命令     |
| 4   | PINGINLINE   | 13.9 万 | 12 万-18 万 | 网络延迟 + Redis 响应速度 |
| 5   | SADD / LPUSH | 19.2 万 | 15 万-20 万 | 数据结构的写入性能         |
健康判断逻辑
如果以上 5 项都同时满足以下条件，基本可以判定 Redis 处于健康状态：
- SET / GET QPS ≥ 10万：读写性能达标，无硬件/网络瓶颈
- LRANGE_100 QPS ≥ 8万：复杂命令性能达标，无明显慢查询风险
- QPS 与 p50 延迟配合看：QPS 高但延迟飙升(> 1ms)说明存在抖动
- 各命令之间 QPS 差异不大：简单命令(SET/GET)与复杂命令(LRANGE)差距在 2 倍以内算正常，差距过大说明可能存在慢命令或数据结构设计问题
如果一个虚拟机或物理机的性能显著低于预期(比如单机 6379 端口的 Redis 仅提供 5 万左右的 QPS)，则可能是虚拟机 CPU 受限或内存带宽不足；生产环境建议针对业务模型做更有针对性的基准测试。
