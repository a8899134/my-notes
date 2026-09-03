## 一、哨兵模式概述
### 1.1 哨兵模式概念
哨兵(Sentinel)是 Redis 官方提供的高可用解决方案，用于监控 Redis 主从集群的健康状态，并在主节点发生故障时自动执行故障转移，将从节点提升为新的主节点。

简单来说，哨兵就是 Redis 主从集群的“自动巡检员”和“故障处理员”：
- 巡检员：持续检查主节点和从节点是否正常运行
- 故障处理员：当主节点出现故障时，自动将从节点提升为主节点，并通知客户端使用新的主节点
生活比喻：哨兵就像一个大楼里的“监控室”。监控室有多个值班人员(多个哨兵节点)，他们持续监控大楼的各个出入口(主从节点)。如果一个入口出现故障(主节点宕机)，值班人员会自动启动应急方案，把备用入口切换为主入口，并通知所有人使用新的入口。
### 1.2 哨兵模式作用
| 问题    | 没有哨兵          | 有哨兵             |
| ----- | ------------- | --------------- |
| 主节点宕机 | 需要人工介入，服务中断   | 自动故障转移，服务快速恢复   |
| 从节点宕机 | 需要人工发现和处理     | 自动标记为下线，不影响整体服务 |
| 故障转移  | 需要手动修改配置，耗时易错 | 自动选举新主节点，过程透明   |
| 客户端感知 | 需要手动通知客户端新地址  | 哨兵通知客户端新主节点地址   |
**结论：** 哨兵模式解决了主从复制架构中“主节点故障后无法自动恢复”的问题，是实现高可用的关键组件。
### 1.3 哨兵的核心功能
| 能力                                | 说明                                    |
| --------------------------------- | ------------------------------------- |
| 监控(Monitoring)                | 哨兵不断检查主节点和从节点是否正常运行                   |
| 自动故障转移(Automatic Failover)    | 当主节点不可用时，选举一个从节点升级为新主节点，并让其他从节点复制新主节点 |
| 通知(Notification)              | 通过 API 或脚本通知系统管理员或应用程序                |
| 配置提供者(Configuration Provider) | 客户端连接到哨兵，询问当前的主节点地址，从而实现透明的故障转移       |
### 1.4 哨兵模式架构图
一个典型的哨兵架构包含：
- 多个 Redis 数据节点：1 个 Master + N 个 Slave。
- 至少 3 个 Sentinel 进程：为了达成共识(投票)，避免误判。
```text
					+---------------------+
                    |  应用服务器(客户端)  |
                    +----------+----------+
                               |
                               | 查询主节点地址
                               v
                     +---------+---------+
                     |   哨兵集群(3个)    |
                     +---------+---------+
                               |
                               | 监控
                               v
                     +---------+---------+
                     |   主节点 Master     |
                     |  192.168.1.100:6379|
                     +---------+---------+
                               |
               +---------------+---------------+
               |               |               |
               v               v               v
         +---------+     +---------+     +---------+
         | 从节点1  |    | 从节点2  |     | 从节点3  |
         | 192.168.|     | 192.168.|     | 192.168.|
         | 1.101   |     | 1.102   |     | 1.103   |
         +---------+     +---------+     +---------+
```
- 哨兵之间互相通信，共同监控 Redis 节点。
- 哨兵数量通常为奇数(3、5、7……)，以便在故障发生时选出“领导”。
-- -
## 二、哨兵的工作原理
### 2.1 哨兵工作流程
1. 每 1 秒向主从发送 PING
- 目的：检查所有 Redis 实例是否在线。
- 命令：`PING`。
- 响应：`PONG` 表示正常，否则标记为“主观下线”。

2. 每 2 秒向 `__sentinel__:hello` 频道发布信息
- 目的：与其他哨兵交换对 Redis 节点的监控信息，互相发现。
- 内容：包括哨兵自己的 IP、端口、对 Master 的配置版本等。
- 作用：形成哨兵之间的共识。

3. 每 10 秒向所有从节点发送 `INFO` 命令
- 目的：获取从节点的详细状态(角色、复制偏移量、连接状态等)，以便在故障转移时选择合适的 Slave 作为新 Master。
### 2.2 主观下线与客观下线
哨兵对节点的故障判定分为两个阶段：

| 状态    | 全称                      | 说明                                                   |
| ----- | ----------------------- | ---------------------------------------------------- |
| SDOWN | Subjectively Down(主观下线) | 单个哨兵在 down-after-milliseconds 时间内未收到主节点的有效响应，判定为主观下线 |
| ODOWN | Objectively Down(客观下线)  | 多个哨兵(达到 quorum 数量)都认为主节点主观下线，判定为客观下线，触发故障转移          |
工作流程：
```text
单个哨兵检测到主节点无响应 → 标记 SDOWN → 询问其他哨兵是否也认为主节点故障
→ 达到 quorum 数量的哨兵确认 → 标记 ODOWN → 触发故障转移
```
参数说明：

| 配置项                       | 默认值         | 说明               |
| ------------------------- | ----------- | ---------------- |
| `down-after-milliseconds` | 30000(30 秒) | 哨兵判断节点下线的时间阈值    |
| `quorum`                  | 2           | 判定客观下线所需的最少哨兵同意数 |
quorum 设置建议：

| 哨兵总数 | quorum 建议值 | 说明          |
| ---- | ---------- | ----------- |
| 1    | 1          | 测试环境，不推荐生产  |
| 2    | 1-2        | 最小生产配置，建议 2 |
| 3    | 2          | 推荐配置，容错率高   |
| 5    | 3          | 高可靠配置       |
### 2.3 故障转移流程
```text
1. 哨兵检测到主节点客观下线(ODOWN)
   ↓
2. 哨兵集群选举一个 Leader 哨兵执行故障转移
   ↓
3. Leader 哨兵从所有从节点中选举一个新的主节点
   ↓
4. 其他从节点开始复制新的主节点
   ↓
5. 哨兵更新配置，标记旧主节点为从节点
   ↓
6. 旧主节点恢复后，自动成为新主节点的从节点
   ↓
7. 哨兵通知客户端新的主节点地址
```
### 2.4 哨兵 Leader 选举
当主节点被判定为客观下线后，哨兵集群需要通过选举产生一个 Leader 哨兵来执行故障转移。选举基于 Raft 协议实现。
选举过程：
1. 每个哨兵向其他哨兵发送请求，希望成为 Leader
2. 其他哨兵根据先到先得的原则投票
3. 获得超过半数哨兵投票的哨兵成为 Leader
4. 如果平局，重新发起选举
选举条件：

| 条件               | 说明               |
| ---------------- | ---------------- |
| 哨兵集群中至少有一个哨兵发起选举 | 触发条件：主节点 ODOWN   |
| 获得超过半数的投票        | 例如 3 个哨兵需要至少 2 票 |
| 一轮选举超时后重新发起      | 防止选举僵局           |
### 2.5 新主节点选举规则
Leader 哨兵从所有从节点中选举新主节点时，按以下规则依次筛选：
```text
从节点列表
   ↓
1. 剔除与主节点断开时间过长的从节点
   ↓
2. 按复制偏移量排序(数据越新越优先)
   ↓
3. 按 runid 排序(相同偏移量时，runid 最小的优先)
   ↓
4. 选中最优从节点提升为新主节点
```
选举规则说明：

| 筛选条件     | 说明                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------- |
| 断开时间过长   | 从节点与主节点断开时间超过 `down-after-milliseconds` × `replica-validity-factor` + `repl-ping-replica-period`，会被剔除 |
| 复制偏移量最大  | 从节点已同步的数据最多，数据最新                                                                                      |
| runid 最小 | 多个从节点偏移量相同时，runid 最小的优先                                                                               |
### 2.6 故障转移超时控制
|超时时间|默认值|说明|
|---|---|---|
|`failover-timeout`|180000(3分钟)|故障转移总超时时间|
-- -
## 三、环境规划
### 3.1 生产环境节点规划
| 角色         | IP 地址         | 端口    | 说明        |
| ---------- | ------------- | ----- | --------- |
| Redis 主节点  | 192.168.1.100 | 6379  | 处理写请求     |
| Redis 从节点1 | 192.168.1.101 | 6379  | 复制主节点，只读  |
| Redis 从节点2 | 192.168.1.102 | 6379  | 复制主节点，只读  |
| 哨兵节点1      | 192.168.1.100 | 26379 | 与主节点同机部署  |
| 哨兵节点2      | 192.168.1.101 | 26379 | 与从节点1同机部署 |
| 哨兵节点3      | 192.168.1.102 | 26379 | 与从节点2同机部署 |
**说明：** 生产环境哨兵节点建议与 Redis 节点同机部署，节省服务器资源。也可以独立部署，但会增加硬件成本。
### 3.2 端口规划
| 端口    | 用途         | 说明            |
| ----- | ---------- | ------------- |
| 6379  | Redis 服务端口 | 主节点和从节点均使用此端口 |
| 26379 | 哨兵服务端口     | 所有哨兵节点使用此端口   |
**安全建议：** 生产环境建议将 Redis 端口和哨兵端口修改为非常用端口，提高安全性。
### 3.3 前置条件
- 已完成 Redis 主从复制配置(参考《Redis 主从复制配置指南》)
- 所有节点网络互通
- 防火墙已放行对应端口
- 所有 Redis 节点密码已统一配置
-- -
## 四、哨兵配置步骤
### 4.1 创建哨兵配置文件
每个哨兵节点都需要一个配置文件。以 /etc/redis-sentinel.conf 为例：
1. 第一步：创建配置文件
```bash
sudo cp /opt/redis-7.2.5/sentinel.conf /etc/redis-sentinel.conf
```
2. 第二步：修改配置参数
```bash
sudo vi /etc/redis-sentinel.conf
```
### 4.2 哨兵核心配置参数
```conf
# ============================ 基本配置 ============================
# 监听地址（绑定内网IP，确保其他哨兵和客户端能访问）
bind 127.0.0.1 192.168.1.100

# 哨兵监听端口(默认 26379)
port 26379

# 保护模式(哨兵模式下默认关闭)
protected-mode no

# 后台运行(配合 systemd 时必须为 no)
daemonize no

# 日志文件
logfile /var/log/redis/sentinel.log

# PID 文件
pidfile /run/redis/sentinel.pid

# ============================ 核心监控配置 ============================

# 监控的主节点信息
# 格式：sentinel monitor <主节点名称> <IP> <端口> <quorum>
# 名称自定义，IP 使用内网 IP，quorum 为判定故障所需的最少哨兵数
sentinel monitor mymaster 192.168.1.100 6379 2

# 主节点密码认证(如果 Redis 设置了密码，必须配置)
sentinel auth-pass mymaster YourStrongPassword2026!

# 主观下线判定时间(毫秒)
# 哨兵在 30 秒内未收到主节点响应，则判定为主观下线
sentinel down-after-milliseconds mymaster 30000

# 故障转移超时时间(毫秒)
sentinel failover-timeout mymaster 180000

# 故障转移后同时进行同步的从节点数量
sentinel parallel-syncs mymaster 1

# ============================ 告警脚本(可选)============================

# 通知脚本：发生重要事件时调用
# sentinel notification-script mymaster /usr/local/bin/sentinel_notify.sh

# 客户端重配置脚本：故障转移完成后调用
# sentinel client-reconfig-script mymaster /usr/local/bin/sentinel_reconfig.sh

# ============================ 安全配置 ============================

# 禁止通过 SENTINEL SET 动态修改脚本路径(安全加固)
sentinel deny-scripts-reconfig yes
```
**说明:** 生产环境建议对哨兵配置文件设置权限为 640，仅允许 root 和 redis 用户读取，避免密码泄露。
### 4.3 配置参数详细说明
| 配置项                                | 说明         | 生产环境建议                           |
| ---------------------------------- | ---------- | -------------------------------- |
| `port 26379`                       | 哨兵监听端口     | 保持默认或修改为非常用端口                    |
| `protected-mode no`                | 关闭保护模式     | 哨兵模式下必须为 `no`                    |
| `daemonize no`                     | 不以守护进程运行   | 配合 systemd 必须为 `no`              |
| `logfile`                          | 日志文件路径     | 指向 `/var/log/redis/sentinel.log` |
| `sentinel monitor`                 | 指定监控的主节点   | IP 改为实际内网 IP，quorum 设为哨兵总数的一半以上  |
| `sentinel auth-pass`               | Redis 密码认证 | 如果 Redis 设置了密码，必须配置              |
| `sentinel down-after-milliseconds` | 主观下线判定时间   | 网络稳定的内网环境可设为 10000-30000 毫秒      |
| `sentinel failover-timeout`        | 故障转移超时     | 默认 180000(3分钟)通常够用               |
| `sentinel parallel-syncs`          | 并行同步的从节点数  | 设为 1，避免多个从节点同时同步造成网络压力           |
| `sentinel deny-scripts-reconfig`   | 禁止动态修改脚本   | 生产环境建议开启                         |
### 4.4 配置文件中的注释特性
**重要说明：** sentinel.conf 文件中以 # 开头的行均为注释，表示该配置项未生效。例如 # sentinel auth-pass mymaster MySUPER--secret-0123passw0rd 被注释了，说明未配置认证密码。如果 Redis 主节点设置了密码，必须在哨兵配置文件中取消注释并配置正确的密码，否则哨兵将无法连接 Redis 节点进行监控，故障转移功能会失效。
### 4.5 复制配置文件到其他节点
在节点2和节点3上执行相同的操作，注意修改以下配置：

| 配置项                     | 节点 2(192.168.1.101) | 节点 3(192.168.1.102) |
| ----------------------- | ------------------- | ------------------- |
| `sentinel monitor` 的 IP | 保持不变(指向主节点)         | 保持不变(指向主节点)         |
| 其他配置                    | 完全相同                | 完全相同                |
所有哨兵节点的配置文件内容应基本一致(只有 pidfile 等与本地进程相关的配置不同)。
### 4.6 创建 systemd 服务文件
所有哨兵节点都需要创建 systemd 服务。
```bash
sudo vi /etc/systemd/system/redis-sentinel.service
```
写入以下内容：
```text
[Unit]
Description=Redis Sentinel 7.2.x
After=network.target

[Service]
Type=simple
User=redis
Group=redis
ExecStart=/usr/local/redis/bin/redis-sentinel /etc/redis-sentinel.conf
ExecStop=/usr/local/redis/bin/redis-cli -p 26379 shutdown
Restart=always
LimitNOFILE=10032

[Install]
WantedBy=multi-user.target
```
配置项说明：

|配置项|说明|
|---|---|
| `Type=simple` |服务类型为简单模式|
| `User=redis` |以 `redis` 用户身份运行|
| `ExecStart` |启动命令：指定 `redis-sentinel` 可执行文件路径和配置文件路径|
| `ExecStop` |停止命令：使用 `redis-cli -p 26379 shutdown` |
| `Restart=always` |进程异常退出时自动重启|
### 4.7 启动哨兵服务
1. 加载 systemd 配置
```bash
sudo systemctl daemon-reload
```
2. 启动哨兵服务
```bash
sudo systemctl start redis-sentinel
```
3. 设置开机自启
```bash
sudo systemctl enable redis-sentinel
```
4. 检查服务状态
```bash
sudo systemctl status redis-sentinel
```
-- -
## 五、验证哨兵配置
### 5.1 查看哨兵状态
获取哨兵集群主节点信息：
```bash
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
```
返回示例：
```text
1) "192.168.1.100"
2) "6379"
```
查看哨兵监控的所有从节点：
```bash
redis-cli -p 26379 SENTINEL replicas mymaster
```
查看哨兵监控的所有哨兵节点：
```bash
redis-cli -p 26379 SENTINEL sentinels mymaster
```
查看哨兵集群整体状态：
```bash
redis-cli -p 26379 SENTINEL master mymaster
```
### 5.2 查看哨兵日志
```bash
sudo tail -f /var/log/redis/sentinel.log
```
正常日志示例：
```text
# 哨兵启动
+monitor master mymaster 192.168.1.100 6379 quorum 2

# 从节点被发现
+slave slave 192.168.1.101:6379 192.168.1.101 6379 @ mymaster 192.168.1.100 6379
+slave slave 192.168.1.102:6379 192.168.1.102 6379 @ mymaster 192.168.1.100 6379

# 其他哨兵发现
+sentinel sentinel 6d4c8a... 192.168.1.102 26379 @ mymaster 192.168.1.100 6379
```
### 5.3 查看哨兵信息
```bash
redis-cli -p 26379 INFO sentinel
```
输出示例：
```text
# Sentinel
sentinel_masters:1
sentinel_tilt:0
sentinel_running_scripts:0
sentinel_scripts_queue_length:0
sentinel_simulate_failure_flags:0
master0:name=mymaster,status=ok,address=192.168.1.100:6379,slaves=2,sentinels=3
```
关键字段说明：

|字段|说明|正常值|
|---|---|---|
| `sentinel_masters` |监控的主节点数量|至少为 1|
| `master0:status` |主节点状态| `ok` |
| `master0:address` |主节点地址|当前主节点的 IP:端口|
| `master0:slaves` |从节点数量|配置的从节点数量|
| `master0:sentinels` |哨兵节点数量|配置的哨兵数量|
-- -
## 六、客户端连接哨兵
### 6.1 连接原理
应用程序不应该直接写死 Master 的 IP 和端口，因为故障转移后 Master 会变化。正确做法是：
1. 客户端连接任意一个或多个 Sentinel 节点。
2. 询问当前 Master 地址：`SENTINEL get-master-addr-by-name mymaster`。
3. 如果 Master 发生变更，哨兵会通知客户端(通过 Pub/Sub 或客户端主动重试)。
4. 大多数 Redis 客户端库(Jedis、Lettuce、redis-py 等)已内置对哨兵的支持，只需提供哨兵地址和 master 名称即可。
### 6.2 客户端配置示例
1. Java Jedis
```java
Set<String> sentinels = new HashSet<>();
sentinels.add("192.168.1.100:26379");
sentinels.add("192.168.1.101:26379");
sentinels.add("192.168.1.102:26379");

JedisSentinelPool pool = new JedisSentinelPool("mymaster", sentinels, "your_master_password");
try (Jedis jedis = pool.getResource()) {
    jedis.set("key", "value");
}
```
2. Python redis-py
```python
from redis.sentinel import Sentinel

sentinel = Sentinel([('192.168.1.100', 26379),
                     ('192.168.1.101', 26379),
                     ('192.168.1.102', 26379)],
                    socket_timeout=0.1)

# 获取主节点连接
master = sentinel.master_for('mymaster', password='your_master_password')
master.set('key', 'value')

# 获取从节点连接(读操作)
slave = sentinel.slave_for('mymaster', password='your_master_password')
value = slave.get('key')
```
-- -
## 七、模拟故障切换测试
### 7.1 测试步骤
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
预期日志输出：
```text
# 主观下线(单个哨兵发现故障)
+sdown master mymaster 192.168.1.100 6379

# 客观下线(多个哨兵确认)
+odown master mymaster 192.168.1.100 6379 #quorum 2/2

# 开始故障转移
+try-failover master mymaster 192.168.1.100 6379

# 选举 Leader 哨兵
+vote-for-leader 6d4c8a... 1
+elected-leader master mymaster 192.168.1.100 6379

# 选举新主节点
+switch-master mymaster 192.168.1.100 6379 192.168.1.101 6379
```
4. 验证新主节点
```bash
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
```
预期返回新的主节点 IP(如 192.168.1.101:6379)。
5. 恢复旧主节点
```bash
# 在旧主节点(192.168.1.100)上执行
sudo systemctl start redis
```
6. 验证旧主节点已成为从节点
```bash
redis-cli -a 你的密码 INFO replication
```
预期输出 `role:slave`。
### 7.2 测试结果验证清单
| 检查项     | 正常结果            |
| ------- | --------------- |
| 主节点服务停止 | 哨兵检测到故障         |
| 故障转移完成  | 新主节点产生(原从节点1或2) |
| 新主节点可写  | 可以执行 SET 操作     |
| 原主节点恢复后 | 自动成为新主节点的从节点    |
| 客户端连接   | 可以获取到新主节点地址     |
-- -
## 八、哨兵模式的日常运维
### 8.1 查看哨兵状态
```bash
# 查看哨兵监控的主节点
redis-cli -p 26379 SENTINEL master mymaster

# 查看所有从节点
redis-cli -p 26379 SENTINEL replicas mymaster

# 查看所有哨兵节点
redis-cli -p 26379 SENTINEL sentinels mymaster
```
### 8.2 手动故障转移
在某些情况下(如主节点需要维护)，可以手动触发故障转移：
```bash
redis-cli -p 26379 SENTINEL failover mymaster
```
命令说明：强制执行故障转移，不等待主节点故障，将某个从节点提升为主节点。
### 8.3 重置哨兵状态
如果哨兵状态混乱，可以重置：
```bash
redis-cli -p 26379 SENTINEL reset mymaster
```
### 8.4 动态修改配置
某些哨兵配置可以通过 `SENTINEL SET` 动态修改，无需重启：
```bash
# 修改 quorum 值
redis-cli -p 26379 SENTINEL SET mymaster quorum 3

# 修改 down-after-milliseconds
redis-cli -p 26379 SENTINEL SET mymaster down-after-milliseconds 15000

# 修改 failover-timeout
redis-cli -p 26379 SENTINEL SET mymaster failover-timeout 120000

# 修改 parallel-syncs
redis-cli -p 26379 SENTINEL SET mymaster parallel-syncs 2
```
### 8.5 哨兵节点维护
添加哨兵节点：在新节点配置哨兵，指向同一主节点，哨兵集群自动发现。
移除哨兵节点：
- 停止该节点的哨兵服务：sudo systemctl stop redis-sentinel
- 在其他哨兵节点执行 SENTINEL RESET 刷新哨兵列表
- 或等待节点自动从哨兵集群中移除(默认 30 秒后)
### 8.6 客户端连接哨兵
生产环境中，客户端不直接连接 Redis 主节点，而是连接哨兵集群获取当前主节点地址。以下是常见客户端配置方式：
连接流程：
```text
客户端 → 连接哨兵集群 → 获取当前主节点地址 → 连接主节点 → 执行读写操作
```
主节点发生变化时：哨兵通知客户端新的主节点地址，客户端重新连接。
-- -
## 九、生产环境最佳实践
### 9.1 哨兵数量建议
| 哨兵数量  | 可用性      | 说明                   |
| ----- | -------- | -------------------- |
| 1     | ❌ 不可用    | 单点故障，不推荐             |
| 2     | ❌ 不可靠    | 无法形成多数，故障转移可能失败      |
| **3** | ✅ **推荐** | 最低生产要求，可容忍 1 个哨兵故障   |
| 5     | ✅ 高可靠    | 可容忍 2 个哨兵故障          |
| 7     | ✅ 极高可靠   | 可容忍 3 个哨兵故障，但增加运维复杂度 |
### 9.2 配置建议
| 配置项                       | 建议值         | 说明                  |
| ------------------------- | ----------- | ------------------- |
| `quorum`                  | 哨兵总数的半数以上   | 3 个哨兵设 2，5 个哨兵设 3   |
| `down-after-milliseconds` | 10000-30000 | 根据网络质量调整，内网快可设小     |
| `failover-timeout`        | 180000(3分钟) | 可根据业务容忍度调整          |
| `parallel-syncs`          | 1-3         | 从节点多时可适当调大，但要考虑网络压力 |
### 9.3 安全建议
| 建议      | 说明                              |
| ------- | ------------------------------- |
| 防火墙限制   | 仅允许内网 IP 访问 26379 端口            |
| 统一密码    | Redis 所有节点密码一致，哨兵配置 `auth-pass` |
| 绑定内网 IP | 哨兵 `bind` 配置为内网 IP              |
| 定期演练    | 定期进行故障切换演练，验证哨兵配置               |
| 监控告警    | 监控哨兵状态和故障转移事件                   |
### 9.4 监控建议
| 监控项    | 告警条件           | 说明        |
| ------ | -------------- | --------- |
| 哨兵进程状态 | 进程未运行          | 哨兵节点宕机    |
| 主节点状态  | `status != ok` | 主节点故障或切换中 |
| 从节点数量  | 少于预期           | 有从节点离线    |
| 哨兵数量   | 少于预期           | 有哨兵节点离线   |
| 故障转移事件 | 任何故障转移         | 需人工关注切换原因 |
-- -
## 十、总结
**核心要点：**

1. 哨兵模式是 Redis 主从复制的高可用扩展，实现自动故障转移
2. 至少需要 3 个哨兵节点，保证选举可用性(生产环境最低要求)
3. quorum 设置为哨兵总数的半数以上(如 3 个哨兵设 2)
4. 关键配置：sentinel monitor、sentinel auth-pass、down-after-milliseconds
5. 密码必须统一：Redis 主从节点密码一致，哨兵配置 auth-pass
6. 定期演练故障切换：验证哨兵配置的有效性，确保故障时能自动恢复

Redis Sentinel 是为主从复制架构注入“自动驾驶”能力的关键组件。它通过多个哨兵进程协同监控、自动故障转移，将人工干预降到最低，使得 Redis 能够达到 99.99% 以上的可用性。

理解哨兵的工作原理(SDOWN、ODOWN、选举、故障转移流程)有助于你正确配置和调优。搭配主从复制和持久化，你可以构建一个既高性能又高可用的 Redis 生产环境。