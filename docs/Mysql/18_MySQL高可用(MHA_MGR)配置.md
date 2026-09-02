## 一、高可用概述
### 1.1 高可用概念
高可用(High Availability，HA)是指系统在面对故障时，能够自动恢复服务，将停机时间降到最低的能力。

通俗理解：就像一座城市有两条供水管道，一条爆了另一条立刻顶上，市民感觉不到停水。MySQL 高可用就是在主库宕机时，从库能自动接管服务，应用无感知或仅感知几秒中断。
### 1.2 高可用作用
| 风险场景        | 无高可用的后果       | 有高可用的效果     |
| ----------- | ------------- | ----------- |
| 主库服务器宕机     | 业务完全停摆，等待人工恢复 | 自动切换，30秒内恢复 |
| 主库硬盘损坏      | 数据丢失，恢复困难     | 从库立即接管，数据不丢 |
| 机房断电/网络中断   | 长时间不可用        | 自动切换到备用节点   |
| 计划内维护(升级硬件) | 需要停机维护        | 在线切换，业务无感知  |
### 1.3 高可用方案对比
| 方案             | 全称                       | 类型                         | 核心特点             |
| -------------- | ------------------------ | -------------------------- | ---------------- |
| MHA            | Master High Availability | 外部管理工具                     | 基于主从复制，自动故障切换    |
| MGR            | MySQL Group Replication  | 官方内置插件                     | 基于 Paxos 协议，强一致性 |
| InnoDB Cluster | MySQL 官方集群方案             | MGR + MySQL Shell + Router | 官方集成方案           |

重点讲解 MHA 和 MGR 两种主流方案。

## 二、MHA 高可用方案
### 2.1 MHA 架构与原理
#### 2.1.1 MHA 概念
MHA(Master High Availability)是一款开源的 MySQL 高可用性解决方案，由日本 DeNA 公司开发。它的核心功能是在主节点故障时自动进行故障转移，保证数据高可用性和系统连续性。
MHA 的两个核心组件：

|组件|部署位置|作用|
|---|---|---|
|MHA Manager|独立服务器或某台从库|监控主库状态，触发故障切换|
|MHA Node|每台 MySQL 服务器|执行具体的日志保存、差异恢复等操作|
#### 2.1.2 MHA 工作原理
MHA 的工作流程如下：
```text
1. MHA Manager 持续监控主库健康状态(心跳检测)
     ↓
2. 检测到主库故障(连续多次探测失败)
     ↓
3. 从宕机主库保存 binlog events(如果服务器可访问)
     ↓
4. 识别含有最新数据的从库
     ↓
5. 应用差异的 relay log 到其他从库
     ↓
6. 将最新数据的从库提升为新的主库
     ↓
7. 将其余从库重新指向新的主库
     ↓
8. 故障转移完成(0-30 秒内)
```
关键特性：

|特性|说明|
|---|---|
|快速故障转移|0-30 秒内完成切换|
|数据一致性|最大程度保证数据不丢失|
|对应用透明|切换过程无需修改应用配置|
|无需修改 MySQL|基于标准主从复制，无需额外配置|
### 2.2 环境准备
#### 2.2.1 架构规划
MHA 要求至少 一主两从(3 台 MySQL 服务器)。

| 主机名         | IP 地址        | 角色                | 说明                   |
| ----------- | ------------ | ----------------- | -------------------- |
| db-master   | 192.168.1.10 | Master + MHA Node | 主库                   |
| db-slave 1  | 192.168.1.11 | Slave + MHA Node  | 从库(候选主库)             |
| db-slave 2  | 192.168.1.12 | Slave + MHA Node  | 从库                   |
| mha-manager | 192.168.1.20 | MHA Manager       | 管理节点(可独立部署，也可部署在从库上) |

💡 MHA Manager 可以单独部署在一台独立机器上，也可以部署在某台从库上。生产环境建议独立部署，避免 Manager 与数据库在同一台机器上同时故障。
#### 2.2.2 环境要求
```bash
# 1. 关闭防火墙(或开放 3306 和 SSH 端口)
sudo systemctl stop firewalld
sudo systemctl disable firewalld

# 2. 关闭 SELinux
sudo setenforce 0
sudo sed -i 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config

# 3. 确保所有节点时间同步
sudo yum install -y ntpdate
sudo ntpdate ntp.aliyun.com

# 4. 确保所有节点主机名解析正确
cat /etc/hosts
# 添加以下内容
192.168.1.10  db-master
192.168.1.11  db-slave1
192.168.1.12  db-slave2
192.168.1.20  mha-manager
```
### 2.3 配置 MySQL 主从复制
MHA 基于标准 MySQL 主从复制，需要先配置好一主两从。
#### 2.3.1 主库配置
在 db-master 的 /etc/my.cnf 中添加：
```ini
[mysqld]
server-id = 1
log_bin = /var/log/mysql/mysql-bin
binlog_format = ROW
binlog_expire_logs_seconds = 604800
# 半同步复制(推荐，减少数据丢失风险)
plugin_load_add = semisync_master.so
rpl_semi_sync_master_enabled = 1
rpl_semi_sync_master_timeout = 1000
```
重启主库：
```bash
sudo systemctl restart mysqld
```
#### 2.3.2 从库配置
在 db-slave1 和 db-slave2 的 /etc/my.cnf 中添加：
```ini
[mysqld]
server-id = 2        # slave1 为 2，slave2 为 3
relay_log = /var/log/mysql/mysql-relay-bin
read_only = ON
log_bin = /var/log/mysql/mysql-bin
log_slave_updates = ON
# 半同步复制(从库侧)
plugin_load_add = semisync_slave.so
rpl_semi_sync_slave_enabled = 1
```
重启从库：
```bash
sudo systemctl restart mysqld
```
#### 2.3.3 创建复制用户(在主库执行)
```sql
-- 创建复制用户
CREATE USER 'repl'@'%' IDENTIFIED BY 'Repl@Pass123!';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
FLUSH PRIVILEGES;
```
#### 2.3.4 配置从库复制
在主库查看 binlog 位置：
```sql
FLUSH TABLES WITH READ LOCK;
SHOW MASTER STATUS;
-- 记录 File 和 Position，如 mysql-bin.000001 和 154
UNLOCK TABLES;
```
在从库配置复制：
```sql
-- 在 db-slave1 和 db-slave2 分别执行
CHANGE MASTER TO
  MASTER_HOST = '192.168.1.10',
  MASTER_PORT = 3306,
  MASTER_USER = 'repl',
  MASTER_PASSWORD = 'Repl@Pass123!',
  MASTER_LOG_FILE = 'mysql-bin.000001',
  MASTER_LOG_POS = 154;

START SLAVE;

-- 验证复制状态
SHOW SLAVE STATUS\G
-- 确保 Slave_IO_Running: Yes 和 Slave_SQL_Running: Yes
```
### 2.4 安装 MHA 组件
#### 2.4.1 安装依赖包(所有节点)
```bash
# 安装 Perl 依赖
sudo yum install -y perl-DBD-MySQL perl-Config-Tiny perl-Log-Dispatch \
  perl-Parallel-ForkManager perl-Time-HiRes perl-ExtUtils-CBuilder \
  perl-ExtUtils-MakeMaker

# 安装 EPEL 仓库(如需)
sudo yum install -y epel-release
```
#### 2.4.2 安装 MHA Node(所有 MySQL 节点)
```bash
# 下载 MHA Node
cd /usr/local/src
wget https://github.com/yoshinorim/mha4mysql-node/releases/download/v0.58/mha4mysql-node-0.58.tar.gz

# 解压并安装
tar -xzf mha4mysql-node-0.58.tar.gz
cd mha4mysql-node-0.58
perl Makefile.PL
make && sudo make install

# 验证安装
which apply_diff_relay_logs
```
#### 2.4.3 安装 MHA Manager(Manager 节点)
```bash
# 下载 MHA Manager
cd /usr/local/src
wget https://github.com/yoshinorim/mha4mysql-manager/releases/download/v0.58/mha4mysql-manager-0.58.tar.gz

# 解压并安装
tar -xzf mha4mysql-manager-0.58.tar.gz
cd mha4mysql-manager-0.58
perl Makefile.PL
make && sudo make install

# 验证安装
which masterha_manager
```
### 2.5 配置 SSH 免密登录
MHA 通过 SSH 在各节点之间通信，需要配置 SSH 免密登录。
#### 2.5.1 生成 SSH 密钥(所有节点)
```bash
ssh-keygen -t rsa -N "" -f ~/.ssh/id_rsa
```
#### 2.5.2 分发公钥(Manager 节点执行)
```bash
# 将 Manager 的公钥分发到所有 MySQL 节点
ssh-copy-id root@db-master
ssh-copy-id root@db-slave1
ssh-copy-id root@db-slave2

# 同时将各 MySQL 节点的公钥分发到 Manager
# 在 db-master 执行
ssh-copy-id root@mha-manager
# 在 db-slave1 执行
ssh-copy-id root@mha-manager
# 在 db-slave2 执行
ssh-copy-id root@mha-manager
```
#### 2.5.3 验证 SSH 连接
```bash
# 在 Manager 节点测试到所有 MySQL 节点的连接
ssh root@db-master "date"
ssh root@db-slave1 "date"
ssh root@db-slave2 "date"

# 在各 MySQL 节点测试到 Manager 的连接
ssh root@mha-manager "date"
```
### 2.6 配置 MHA Manager
#### 2.6.1 创建 MHA 配置文件
在 Manager 节点上创建配置文件：
```bash
mkdir -p /etc/mha
vi /etc/mha/app1.cnf
```
写入以下内容：
```ini
[server default]
# Manager 工作目录
manager_workdir=/var/log/mha/app1
manager_log=/var/log/mha/app1/manager.log

# MySQL 连接信息
user=root
password=Root@Pass123
port=3306
repl_user=repl
repl_password=Repl@Pass123

# SSH 连接信息
ssh_user=root

# 主库宕机后尝试从旧主库保存 binlog
master_binlog_dir=/var/lib/mysql

# 故障转移后自动启动复制
auto_failover=1

# 故障转移后自动切换 VIP(需要配合脚本)
# master_ip_failover_script=/usr/local/bin/master_ip_failover

# 在线切换脚本
# master_ip_online_change_script=/usr/local/bin/master_ip_online_change

# 关闭时强制切换
shutdown_script=""

# 日志级别
log_level=info

[server1]
hostname=192.168.1.10
port=3306
master_binlog_dir=/var/lib/mysql
candidate_master=0

[server2]
hostname=192.168.1.11
port=3306
master_binlog_dir=/var/lib/mysql
candidate_master=1          # 优先成为新主库

[server3]
hostname=192.168.1.12
port=3306
master_binlog_dir=/var/lib/mysql
candidate_master=0
```
参数说明：

|参数|说明|
|---|---|
| user/password |MySQL root 用户(MHA 需要较高权限进行切换)|
| repluser/replpassword |复制用户|
| sshuser |SSH 登录用户|
| candidatemaster=1 |该节点优先成为新主库(硬件更好的从库可设置)|
| masterbinlogdir |主库 binlog 存放目录|
| auto_failover |是否启用自动故障转移|
#### 2.6.2 创建 MHA 日志目录
```bash
mkdir -p /var/log/mha/app1
```
#### 2.6.3 检查 SSH 配置
```bash
masterha_check_ssh --conf=/etc/mha/app1.cnf
```
输出示例：
```text
All SSH connection tests passed successfully.
```
#### 2.6.4 检查复制配置
```bash
masterha_check_repl --conf=/etc/mha/app1.cnf
```
输出示例：
```text
MySQL Replication Health is OK.
```
### 2.7 启动 MHA 并验证
#### 2.7.1 启动 MHA Manager
```bash
nohup masterha_manager --conf=/etc/mha/app1.cnf \
  --remove_dead_master_conf \
  --ignore_last_failover \
  --wait_on_monitor_error=10 \
  > /var/log/mha/app1/manager.log 2>&1 &
```
参数说明：

|参数|说明|
|---|---|
| --conf |指定配置文件|
| --removedeadmasterconf |故障转移后自动移除死主库配置|
| --ignorelastfailover |忽略上次故障转移记录(首次启动需要)|
| --waitonmonitorerror |监控错误后等待时间(秒)|
#### 2.7.2 检查 MHA 运行状态
```bash
masterha_check_status --conf=/etc/mha/app1.cnf
```
输出示例：
```text
app1 (pid:12345) is running(0:PING_OK), master:192.168.1.10
```
#### 2.7.3 查看 MHA 日志
```bash
tail -f /var/log/mha/app1/manager.log
```
### 2.8 故障切换测试
#### 2.8.1 模拟主库宕机
在 db-master 上停止 MySQL：
```bash
# 在 db-master 执行
sudo systemctl stop mysqld
```
#### 2.8.2 观察自动切换
在 Manager 节点查看日志：
```bash
tail -f /var/log/mha/app1/manager.log
```
预期日志输出：
```text
[info] Master 192.168.1.10 is down!
[info] Starting master failover...
[info] Selecting a new master...
[info] New master is 192.168.1.11 (candidate_master:1)
[info] Applying relay log differences...
[info] Switching to new master...
[info] All slaves switched to new master.
[info] Master failover completed successfully.
```
#### 2.8.3 验证新主库
```sql
-- 在 db-slave1 执行(此时已是新主库)
SHOW MASTER STATUS;

-- 在 db-slave2 执行
SHOW SLAVE STATUS\G
-- 应显示连接到 192.168.1.11
```
#### 2.8.4 恢复原主库
原主库恢复后，需要手动将其配置为从库：
```sql
-- 在原主库执行
CHANGE MASTER TO
  MASTER_HOST = '192.168.1.11',
  MASTER_PORT = 3306,
  MASTER_USER = 'repl',
  MASTER_PASSWORD = 'Repl@Pass123!',
  MASTER_LOG_FILE = 'mysql-bin.000001',
  MASTER_LOG_POS = 1234;

START SLAVE;
SHOW SLAVE STATUS\G
```
### 2.9 脑裂处理与回切方案
#### 2.9.1 脑裂概念
脑裂(Split-Brain) 是高可用系统中一类需要特别关注的故障场景：当主库与从库之间的网络出现闪断时，MHA Manager 可能误判主库已宕机，触发自动故障切换，将从库提升为新的主库。当原主库网络恢复后，它仍然以“主库”身份继续运行，而此时集群中已存在一个新的主库，形成了两个主库同时存在的异常状态。

在这种情况下，两个主库都在接收写入请求，数据开始分叉，彼此无法同步—这就是脑裂。

脑裂的根本危害：

- 数据分叉，两个主库各自写入不同数据，无法合并
- 数据丢失，原主库在恢复前的数据可能被覆盖或丢失
- 应用混乱，应用可能同时向两个主库写入，数据彻底错乱
- 恢复困难，修复成本极高，可能需要人工比对数据

脑裂发生的典型场景：
```text
┌─────────────────────────────────────────────────────────────────┐
│ 1. 正常状态：MHA Manager 监控主库 A，备库 B 同步 A 的数据          │
├─────────────────────────────────────────────────────────────────┤
│ 2. 网络闪断：主库 A 与 Manager 网络断开，Manager 判定 A 宕机       │
│    Manager 将备库 B 提升为新主库，B 开始接收写入                   │
├─────────────────────────────────────────────────────────────────┤
│ 3. 网络恢复：A 恢复网络，但认为自己仍是主库，继续接收写入            │
│    此时 A 和 B 都是主库，数据开始分叉 → 脑裂发生                    │
└─────────────────────────────────────────────────────────────────┘
```
#### 2.9.2 脑裂的防护措施
1. 措施一：配置 VIP 漂移(推荐)

MHA 配合 VIP(虚拟 IP)脚本，确保同一时刻只有一个主库持有 VIP：
```bash
# 在 MHA 配置文件中启用 VIP 脚本
master_ip_failover_script=/usr/local/bin/master_ip_failover
```
2. 措施二：配置仲裁节点

部署独立的仲裁节点或使用 MGR 的内置多数派机制，避免网络闪断导致的误切换。

3. 措施三：监控并自动隔离

配置监控告警，检测到脑裂时自动隔离异常节点：
```bash
# 检测到多个主库时触发告警
SELECT COUNT(*) FROM information_schema.processlist WHERE command = 'Binlog Dump';
```
4. 措施四：业务层防双写

应用层配置只向 VIP 写入，不直接连接主库 IP，确保同一时刻只有一个写入目标。
#### 2.9.3 脑裂发生后的回切方案
当脑裂不幸发生后，回切方案应遵循以下流程：
```text
第一步：立即停止双写
    ↓
确认哪个主库的数据最新(对比 GTID 或 binlog 位置)
    ↓
将所有应用切换到数据最新的主库(唯一主库)
    ↓
将另一个主库设为只读，停止写入
    ↓
原主库以从库身份加入新集群，数据补齐
    ↓
验证数据一致性
    ↓
在维护窗口期，将唯一主库切回原主库(如需要)
```
具体操作步骤：
1. 第一步：立即停止双写，确认最新主库
```bash
# 在 Manager 节点查看状态，确认哪个主库数据最新
mysql -h 192.168.1.10 -u root -p -e "SHOW MASTER STATUS;"
mysql -h 192.168.1.11 -u root -p -e "SHOW MASTER STATUS;"
# 比较 Executed_Gtid_Set 或 Position，选择数据最新的作为保留主库
```
2. 第二步：切换所有应用指向保留主库
修改应用数据库连接配置，指向保留主库的 VIP 或 IP。
3. 第三步：将另一个主库设为只读
```sql
-- 在需要降级的节点执行
SET GLOBAL read_only = ON;
SET GLOBAL super_read_only = ON;
```
4. 第四步：将原主库以从库身份加入新集群
```sql
-- 在需要降级的节点执行
CHANGE MASTER TO
  MASTER_HOST = '192.168.1.11',   -- 保留主库 IP
  MASTER_PORT = 3306,
  MASTER_USER = 'repl',
  MASTER_PASSWORD = 'Repl@Pass123!',
  MASTER_AUTO_POSITION = 1;       -- 使用 GTID 自动定位同步点

START SLAVE;
SHOW SLAVE STATUS\G
```
5. 第五步：数据补齐验证
```sql
-- 确认从库同步追上主库
SHOW SLAVE STATUS\G
-- 确保 Seconds_Behind_Master 变为 0
```
6. 第六步：在线回切(将主库切回原主库)

⚠️ 回切前注意：执行回切前，务必确认原主库数据已与当前主库完全一致，否则数据回切后会丢失差异数据。
```bash
# 使用 MHA 在线切换功能，将主库从 192.168.1.11 切回 192.168.1.10
masterha_master_switch --conf=/etc/mha/app1.cnf \
  --master_state=alive \
  --new_master_host=192.168.1.10 \
  --orig_master_is_new_slave
```
#### 2.9.4 脑裂预防最佳实践

|措施|说明|
|---|---|
|开启 VIP 漂移|确保同一时刻只有一个主库持有 VIP|
|设置网络超时|MHA 配置 --waitonmonitor_error 增加网络抖动容忍度|
|配置多个仲裁节点|避免单点误判|
|禁用 Manager 自动切换(极高风险场景)|某些场景下可设置为手动切换，人工确认后再执行|
|监控告警配置|监控是否有多个主库同时存在，发现即告警|
|定期演练|定期进行脑裂演练，验证回切方案的有效性|
#### 2.9.5 脑裂排查命令速查
```sql
-- 查找所有可写的节点(可能的主库)
SELECT @@hostname, @@server_id, @@read_only, @@super_read_only;

-- 查找所有 binlog dump 线程(主库身份标识)
SHOW PROCESSLIST;
-- 查找 Command 为 Binlog Dump 的线程，这些是从库连接的主库

-- 通过 SHOW SLAVE HOSTS 查看哪些从库连接到本节点(主库身份标识)
SHOW SLAVE HOSTS;
-- 如果有多个节点都能看到从库连接，说明可能存在多个主库

-- 验证 GTID 执行状态
SHOW VARIABLES LIKE 'gtid_executed';
```
### 2.10 MHA 的优缺点

| 优点              | 缺点                             |
| --------------- | ------------------------------ |
| 故障切换速度快(0-30 秒) | 依赖 SSH 免密登录和外部脚本               |
| 部署相对简单，基于标准主从复制 | 需要额外部署 Manager 节点              |
| 成本低，无需额外硬件      | 数据一致性为最终一致性，可能丢数据              |
| 支持一主多从架构        | 脑裂防护需要额外配置(VIP 脚本)             |
| 对应用透明           | 不适用于 MySQL 8.0 的新特性(GTID 支持有限) |

## 三、MGR 高可用方案
### 3.1 MGR 架构与原理
#### 3.1.1 MGR 概念
MGR(MySQL Group Replication，MySQL 组复制)是 MySQL 5.7.17 版本之后引入的官方高可用解决方案。它基于原生复制技术和 Paxos 协议实现，提供高一致性、高容错性和自动故障转移能力。

通俗理解：MGR 就像一个“董事会”—每个节点都是董事，重大决策(事务提交)需要超过半数董事同意才能通过。某个董事缺席(节点宕机)，不影响董事会继续运作。
#### 3.1.2 MGR 核心特点

| 特点         | 说明                       |
| ---------- | ------------------------ |
| 强一致性       | 事务提交需多数派确认，保证数据不丢失       |
| 自动故障转移     | 节点故障自动驱逐，剩余节点自动协商新主      |
| 内置防脑裂      | 基于多数派 Quorum 机制，从设计上杜绝脑裂 |
| 单主/多主模式    | 支持单主写入和多主同时写入            |
| MySQL 官方支持 | 内置插件，无需第三方工具             |
#### 3.1.3 MGR 的两种模式

| 模式   | 特点                | 适用场景              |
| ---- | ----------------- | ----------------- |
| 单主模式 | 只有一个节点处理写入，其他节点只读 | 大部分业务场景，与现有主从架构兼容 |
| 多主模式 | 所有节点均可写入，需要冲突检测   | 需要多点写入的特殊场景       |

生产环境推荐单主模式，更稳定、冲突更少。
### 3.2 环境准备
#### 3.2.1 架构规划
MGR 要求至少 3 个节点(奇数节点，保证多数派)

|主机名|IP 地址|角色|说明|
|---|---|---|---|
|mgr-node 1|192.168.1.31|Primary 节点|主节点(单主模式下可写)|
|mgr-node 2|192.168.1.32|Secondary 节点|从节点(只读)|
|mgr-node 3|192.168.1.33|Secondary 节点|从节点(只读)|
#### 3.2.2 环境要求
```bash
# 1. 所有节点关闭防火墙(或开放 3306 和 33061 端口)
sudo systemctl stop firewalld
sudo systemctl disable firewalld

# 2. 关闭 SELinux
sudo setenforce 0

# 3. 配置 hosts 解析(所有节点)
cat >> /etc/hosts << EOF
192.168.1.31  mgr-node1
192.168.1.32  mgr-node2
192.168.1.33  mgr-node3
EOF
```
### 3.3 配置 MySQL 实例
在 所有三个节点 上执行相同的配置。
#### 3.3.1 修改配置文件
在 /etc/my.cnf 中添加：
```ini
[mysqld]
# ============================================
# 基础配置(每个节点 server-id 不同)
# ============================================
server-id = 1               # node1=1, node2=2, node3=3
log_bin = /var/log/mysql/mysql-bin
binlog_format = ROW
binlog_expire_logs_seconds = 604800
# ============================================
# 上报给其他 MGR 节点的通信地址(建议使用 IP)
# 作用：覆盖操作系统 hostname，避免因 DNS 解析失败导致节点无法互相连接
# 节点分别配置为本机 IP
# ============================================
report_host = 192.168.1.31/32/33

# ============================================
# GTID 配置(MGR 必须开启)
# ============================================
gtid_mode = ON
enforce_gtid_consistency = ON
log_slave_updates = ON

# ============================================
# 存储引擎限制(必须使用 InnoDB)
# ============================================
disabled_storage_engines="MyISAM,BLACKHOLE,FEDERATED,ARCHIVE,MEMORY"

# ============================================
# 组复制插件(首次启动后再添加到配置文件)
# ============================================
# plugin_load_add = 'group_replication.so'   # 先不添加，首次启动后配置

# ============================================
# 组复制参数(首次启动后再添加)
# ============================================
group_replication_group_name = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
group_replication_single_primary_mode = ON
group_replication_start_on_boot = OFF
group_replication_local_address = "mgr-node1:33061"   # 各节点不同
group_replication_group_seeds = "mgr-node1:33061,mgr-node2:33061,mgr-node3:33061"
group_replication_bootstrap_group = OFF
group_replication_recovery_get_public_key = 1

# ============================================
# 多线程复制(提升性能)
# ============================================
replica_parallel_workers = 4
replica_preserve_commit_order = ON
replica_parallel_type = LOGICAL_CLOCK
```
重启 MySQL：
```bash
sudo systemctl restart mysqld
```
### 3.4 安装组复制插件
#### 3.4.1 在 MySQL 中安装插件(所有节点)
```
-- 安装组复制插件
INSTALL PLUGIN group_replication SONAME 'group_replication.so';

-- 验证插件已安装
SHOW PLUGINS;
-- 应能看到 group_replication 插件
```
⚠️ 如果想在配置文件中自动加载插件，可以将 plugin_load_add = 'group_replication.so' 添加到 /etc/my.cnf 中并重启。
#### 3.4.2 创建复制用户(所有节点)
```sql
-- 创建用于恢复的复制用户
CREATE USER 'repl'@'%' IDENTIFIED BY 'Repl@Pass123!';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
FLUSH PRIVILEGES;

-- 配置恢复通道
CHANGE MASTER TO MASTER_USER='repl', MASTER_PASSWORD='Repl@Pass123!' 
FOR CHANNEL 'group_replication_recovery';
```
### 3.5 启动组复制(单主模式)
⚠️ 启动顺序很重要：先启动第一个节点(作为引导节点)，再依次启动其他节点。
#### 3.5.1 启动第一个节点(mgr-node 1)
```sql
-- 设置引导模式(仅第一个节点需要)
SET GLOBAL group_replication_bootstrap_group = ON;

-- 启动组复制
START GROUP_REPLICATION;

-- 关闭引导模式
SET GLOBAL group_replication_bootstrap_group = OFF;

-- 查看组状态
SELECT * FROM performance_schema.replication_group_members;
```
预期输出：
```text
+---------------------------+----------------------+-------------+-------------+--------------+
| CHANNEL_NAME              | MEMBER_ID            | MEMBER_HOST | MEMBER_PORT | MEMBER_STATE |
+---------------------------+----------------------+-------------+-------------+--------------+
| group_replication_applier | xxxxxxxx-xxxx-xxxx   | mgr-node1   | 3306        | ONLINE       |
+---------------------------+----------------------+-------------+-------------+--------------+
```
#### 3.5.2 启动第二个节点(mgr-node 2)
```sql
-- 在 mgr-node2 执行
START GROUP_REPLICATION;

-- 查看组状态
SELECT * FROM performance_schema.replication_group_members;
```
预期输出：现在应显示两个节点，状态均为 ONLINE。
#### 3.5.3 启动第三个节点(mgr-node 3)
```sql
-- 在 mgr-node3 执行
START GROUP_REPLICATION;

-- 查看组状态
SELECT * FROM performance_schema.replication_group_members;
```
预期输出：三个节点全部 ONLINE。
### 3.6 验证 MGR 状态
#### 3.6.1 查看组成员
```sql
SELECT * FROM performance_schema.replication_group_members;
```

|字段|说明|正常值|
|---|---|---|
| MEMBERSTATE |节点状态|ONLINE|
| MEMBERROLE |角色|PRIMARY(单主)/ SECONDARY|
| MEMBER_HOST |主机名|各节点主机名|
#### 3.6.2 查看主节点
```sql
SELECT * FROM performance_schema.replication_group_members 
WHERE MEMBER_ROLE = 'PRIMARY';
```
#### 3.6.3 验证数据同步
在主节点执行写入：
```sql
-- 在主节点(PRIMARY)执行
CREATE DATABASE test_mgr;
USE test_mgr;
CREATE TABLE t1 (id INT PRIMARY KEY, name VARCHAR(20));
INSERT INTO t1 VALUES (1, 'test');
```
在从节点查询：
```sql
-- 在从节点(SECONDARY)执行
USE test_mgr;
SELECT * FROM t1;
-- 应返回 (1, 'test')
```
3.7 MGR 的优缺点

|优点|缺点|
|---|---|
|官方原生支持，无需第三方工具|至少需要 3 个节点|
|强一致性，数据不丢失|对网络延迟敏感，需要低延迟网络|
|自动故障转移，内置防脑裂|配置和管理相对复杂|
|支持 MySQL Router 原生读写分离|多主模式冲突检测有性能开销|
|适用于云原生和容器化部署|对表有要求(必须有主键)|
### 3.8 MGR 常用管理命令

|操作|命令|
|---|---|
|查看组成员| `SELECT * FROM performance_schema.replication_group_members;` |
|查看组状态| `SELECT * FROM performance_schema.replication_group_member_stats;` |
|启动组复制| `START GROUP_REPLICATION;` |
|停止组复制| `STOP GROUP_REPLICATION;` |
|查看当前主节点| `SELECT * FROM performance_schema.replication_group_members WHERE MEMBER_ROLE='PRIMARY';` |

## 四、MHA vs MGR 对比选型
### 4.1 核心差异对比

| 对比维度   | MHA              | MGR              |
| ------ | ---------------- | ---------------- |
| 架构本质   | 外部管理工具(Perl 脚本)  | 内置引擎级插件          |
| 复制模式   | 异步/半同步复制(主从架构)   | Paxos 强同步复制(组复制) |
| 故障检测   | Manager 主动轮询     | 节点间心跳 + 分布式共识    |
| 故障切换主体 | MHA Manager 脚本触发 | 组内节点自协商 + 内置选举   |
| 数据一致性  | 最终一致性(可能丢数据)     | 强一致性(多数派提交)      |
| 脑裂防护   | 需额外配置(VIP 脚本)    | 内置多数派 Quorum 机制  |
| 最小节点数  | 2 个(一主一从)        | 3 个              |
| 对网络要求  | 一般               | 低延迟              |
### 4.2 选型建议

|场景|推荐方案|原因|
|---|---|---|
|传统业务，可容忍分钟级数据丢失|MHA|轻量级、部署简单，适合非核心业务|
|金融级业务，要求强一致性|MGR|数据零丢失、切换全自动|
|云环境或容器化部署|MGR|无依赖 SSH/VIP，原生适应动态 IP|
|开发/测试环境|MHA|资源消耗低，快速搭建|
|新项目(MySQL 8.0)|MGR|官方推荐，技术成熟|
### 4.3 迁移建议
```text
┌─────────────────────────────────────────────────────────┐
│  MHA(过渡性方案)                                         │
│  适合传统异步复制架构升级，低成本提升可用性                 │
│  但存在数据一致性风险与运维复杂度                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  MGR(未来方向)                                           │
│  MySQL 官方推荐的高可用架构                               │
│  提供分布式强一致性与全自动故障转移                        │
│  新项目优先选择 MGR(MySQL 8.0 内置)                       │
└─────────────────────────────────────────────────────────┘
```

## 五、附录
### 5.1 MHA 常用命令速查
|操作|命令|
|---|---|
|检查 SSH 配置|`masterha_check_ssh --conf=/etc/mha/app1.cnf`|
|检查复制配置|`masterha_check_repl --conf=/etc/mha/app1.cnf`|
|启动 MHA|`masterha_manager --conf=/etc/mha/app1.cnf`|
|查看运行状态|`masterha_check_status --conf=/etc/mha/app1.cnf`|
|停止 MHA|`masterha_stop --conf=/etc/mha/app1.cnf`|
|手动在线切换|`masterha_master_switch --conf=/etc/mha/app1.cnf --master_state=alive`|
### 5.2 MGR 常用命令速查
|操作|命令|
|---|---|
|查看组成员|`SELECT * FROM performance_schema.replication_group_members;`|
|查看组统计|`SELECT * FROM performance_schema.replication_group_member_stats;`|
|启动组复制|`START GROUP_REPLICATION;`|
|停止组复制|`STOP GROUP_REPLICATION;`|
|查看 GTID 执行状态|`SHOW VARIABLES LIKE 'gtid_executed';`|
### 5.3 快速选型决策树
```text
业务是否要求数据零丢失？
    │
    ├── 是 → 使用 MGR(MySQL 8.0 + 3 节点)
    │
    └── 否 → 是否可以接受 30 秒内恢复？
              │
              ├── 是 → 使用 MHA(主从 + Manager)
              │
              └── 否 → 考虑更高规格的硬件或专业商业方案
```
### 5.4 高可用核心原则总结
```text
┌─────────────────────────────────────────────────────────────────┐
│  高可用架构的三条底线：                                           │
│  1. 自动故障切换 ≠ 高枕无忧，定期演练是必须的                      │
│  2. 防止脑裂比切换速度更重要—数据乱了的代价远高于暂时不可用         │
│  3. 永远不要两个主同时写 → 数据会乱，且很难恢复                     │
└─────────────────────────────────────────────────────────────────┘
```
