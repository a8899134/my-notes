## 一、主从复制概述
### 1.1 主从复制概念
主从复制(Replication)是指将一个 Redis 节点作为主节点(Master)，一个或多个 Redis 节点作为从节点(Replica)，从节点通过复制主节点的数据，保持与主节点数据一致的过程。

主节点负责处理写请求，从节点负责处理读请求，实现读写分离。从节点会持续从主节点同步数据，保持数据的一致性。

生活比喻：主节点是“原稿”，从节点是“复印件”。原稿有任何修改，复印件都会同步更新。你可以同时看多份复印件，但修改只能在原稿上进行。

### 1.2 主从复制的作用
1. 高可用基石：当 Master 宕机，可以手动或自动将从节点提升为新的 Master。
2. 读写分离：Master 负责写，多个 Slave 负责读，分散读压力，提升吞吐量。
3. 数据冗余：数据在多个节点有副本，避免单点数据丢失(仍需持久化配合)。
4. 离线备份：可以在某个 Slave 上执行 `BGSAVE` 而不影响 Master 的服务。
### 1.3 主从复制的架构图
```text
                     +-----------------+
                     |    主节点 Master  |
                     |  192.168.1.100   |
                     |  端口: 6379      |
                     +--------+--------+
                              |
               +--------------+--------------+
               |              |              |
               v              v              v
         +-----------+  +-----------+  +-----------+
         | 从节点1   |  | 从节点2   |  | 从节点3   |
         | 192.168.1.|  | 192.168.1.|  | 192.168.1.|
         | 101:6379  |  | 102:6379  |  | 103:6379  |
         +-----------+  +-----------+  +-----------+
```
### 1.4 拓扑结构
主从复制有三种拓扑结构分别是一主一从、一主多从、链式复制。

| 拓扑结构 | 说明                | 适用场景             |
| ---- | ----------------- | ---------------- |
| 一主一从 | 一个主节点带一个从节点       | 数据冗余、读写分离入门      |
| 一主多从 | 一个主节点带多个从节点       | 高并发读场景、多机房容灾     |
| 链式复制 | 主节点 → 从节点1 → 从节点2 | 减轻主节点同步压力，但延迟会累加 |
-- -
## 二、主从复制的工作原理
## 2.1 主从复制的基本流程
```
从节点启动 → 连接主节点 → 发送 PSYNC → 全量/增量同步 → 持续复制
    ↑           ↓            ↓           ↓              ↓
  配置replicaof  检查网络  请求同步数据  加载RDB/AOF   接收写命令
```
### 2.2 全量同步
**使用场景：** 首次连接或复制中断后
1. 从节点向主节点发送 PSYNC 命令请求同步
2. 主节点执行 BGSAVE 生成 RDB 文件
3. 主节点将 RDB 文件发送给从节点
4. 从节点清空当前数据，加载 RDB 文件
5. 主节点将生成 RDB 期间的新写命令存入积压缓冲区
6. 从节点加载完成后，主节点将缓冲区中的命令发送给从节点
7. 从节点执行这些命令，完成同步

**说明：** 全量复制非常消耗资源，尤其是大数据量时，Master 需要 fork 子进程生成 RDB，并占用大量网络带宽。应避免频繁发生全量复制。
### 2.3 增量同步
**使用场景：** 一般是机器重启或故障解决后，开机后重启连接。
1. 从节点断开后重连，发送 PSYNC 命令
2. 主节点检查复制积压缓冲区中是否还有从节点缺失的数据
3. 如果有，直接发送缺失的数据给从节点(增量同步)
4. 如果没有，触发全量同步
### 2.4 复制积压缓冲区
复制积压缓冲区(repl-backlog)是主节点维护的一个固定大小的环形缓冲区，用于存储最近执行的写命令。当从节点重连时，主节点会检查缓冲区中是否还有从节点缺失的命令。
重要配置：
```conf
# 复制积压缓冲区大小(建议 64MB-256MB，根据写流量调整)
repl-backlog-size 64mb

# 缓冲区释放时间(0 表示不释放)
repl-backlog-ttl 3600
```
### 2.5 关键数据结构
| 名称                     | 存放位置                | 作用                                   |
| ---------------------- | ------------------- | ------------------------------------ |
| replbacklog       | Master              | 环形缓冲区，存储最近发送的写命令，用于增量复制              |
| replication buffer | Master(每个 Slave 一个) | 全量复制期间，暂存新增的写命令，待 RDB 传输完成后发送给 Slave |
| offset             | Master 和每个 Slave    | 记录复制数据的进度，用于断点续传                     |
| runid             | 每个 Redis 实例         | 唯一标识实例，Slave 用它判断是否还是原来的 Master      |
-- -
## 三、环境规划
### 3.1 环境规划示例
| 角色   | 主机名           | IP 地址           | 端口   | 说明  |
| ---- | ------------- | --------------- | ---- | --- |
| 主节点  | redis-Master  | 192.168.100.231 | 6379 | 可读写 |
| 从节点1 | redis-Slave 1 | 192.168.100.232 | 6379 | 只读  |
| 从节点2 | redis-Slave 2 | 192.168.100.233 | 6379 | 只读  |
### 3.2 前置条件
- 所有节点已完成 Redis 7.2.x 源码编译安装
- 所有节点 Redis 服务正常运行
- 所有节点网络互通，防火墙已放行 6379 端口
- 所有节点的 redis.conf 已配置 requirepass(密码一致)
-- -
## 四、主从复制配置步骤
### 4.1 主节点配置
主节点不需要添加任何复制相关配置，只需要确保 Redis 服务正常运行。但以下配置建议在主节点确认或设置：
```conf
# /etc/redis/redis.conf(主节点)

# 绑定内网 IP(让从节点能够访问)
bind 127.0.0.1 192.168.100.231

# 端口
port 6379

# 密码(必须设置，所有节点密码一致)
requirepass YourStrongPassword2026!

# 复制积压缓冲区大小(建议根据写流量设置，越大，从节点能容忍的断线时间越长)
repl-backlog-size 64mb

# 从节点只读(主节点默认可写，无需额外配置)
```
### 4.2 从节点配置
从节点需要在配置文件中添加 replicaof 指令，指定要复制的主节点信息。
```conf
# /etc/redis/redis.conf(从节点)

# 绑定内网 IP
bind 127.0.0.1 192.168.1.232

# 端口
port 6379

# 密码(与主节点一致)
requirepass YourStrongPassword2026!

# 指定主节点(关键配置)
replicaof 192.168.100.231 6379

# 主节点密码认证(主节点有密码时必须配置)
masterauth YourStrongPassword2026!

# 从节点只读模式(生产环境建议开启)
replica-read-only yes

# 从节点是否响应过期数据(建议开启)
replica-serve-stale-data yes

```
配置说明：
1. replicaof，主节点 IP 主节点端口，指定要复制的主节点，从节点必须配置
2. masterauth，主节点密码，用于连接主节点进行认证，主节点有密码时必须配置
3. replica-read-only，从节点只读(yes)，生产环境强烈建议开启
4. replica-serve-stale-data,开启 yes，同步中断时是否继续响应读请求
### 4.3 配置生效
主节点：配置文件修改后，重启 Redis：
```bash
sudo systemctl restart redis
```
从节点：配置文件修改后，重启 Redis：
```bash
sudo systemctl restart redis
```
**注意：** 启动顺序无强制要求，但先启动主节点再启动从节点可以避免从节点反复重试连接。
-- -
## 五、主从复制的验证与监控
### 5.1 查看主从复制状态
在主节点上查看：
```bash
redis-cli -a 你的密码 INFO replication
```
主节点输出示例：
```text
# Replication
role:master
connected_slaves:2
slave0:ip=192.168.1.101,port=6379,state=online,offset=123456,lag=0
slave1:ip=192.168.1.102,port=6379,state=online,offset=123456,lag=0
master_repl_offset:123456
repl_backlog_active:1
repl_backlog_size:67108864
repl_backlog_first_byte_offset:1
repl_backlog_histlen:123456
```
关键字段说明：
- role:master	当前节点角色为主节点
-  connected_slaves:2	已连接的从节点数量
-  slave0:ip=...	从节点 IP、端口、状态、同步偏移量和延迟
-  state:online	从节点在线状态
- offset	从节点已同步的偏移量
- lag	从节点延迟(秒)，0 表示无延迟
- master_repl_offset	主节点当前复制偏移量
- repl_backlog_active	复制积压缓冲区是否激活
- repl_backlog_size	缓冲区大小

在从节点上查看：
```bash
redis-cli -a 你的密码 INFO replication
```
从节点输出示例：
```text
# Replication
role:slave
master_host:192.168.100.231
master_port:6379
master_link_status:up
master_last_io_seconds_ago:1
master_sync_in_progress:0
slave_read_repl_offset:123456
slave_repl_offset:123456
```
关键字段说明：

| 字段                           | 值                 | 说明                |
| ---------------------------- | ----------------- | ----------------- |
| `role:slave`                 | -                 | 当前节点角色为从节点        |
| `master_host`                | `192.168.100.231` | 主节点 IP            |
| `master_port`                | `6379`            | 主节点端口             |
| `master_link_status`         | `up` / `down`     | 与主节点的连接状态         |
| `master_last_io_seconds_ago` | `1`               | 最后一次与主节点通信的间隔(秒)  |
| `master_sync_in_progress`    | `0` / `1`         | 是否正在全量同步(0=否，1=是) |
| `slave_repl_offset`          | `123456`          | 从节点当前复制偏移量        |
### 5.2 测试主从同步效果
在主节点写入数据：
```bash
redis-cli -a 你的密码 SET test_key "hello_master"
# 返回：OK
```
在从节点读取数据：
```bash
redis-cli -a 你的密码 GET test_key
# 返回："hello_master"
```
在从节点尝试写入数据(应被拒绝)：
```bash
redis-cli -a 你的密码 SET test_write "try_write"
# 返回：(error) READONLY You can't write against a read only replica.
```
### 5.3 查看主从复制延迟
```bash
redis-cli -a 你的密码 INFO replication | grep lag
```
lag 值说明：

|lag 值|状态|建议|
|---|---|---|
|0-1|✅ 正常|无延迟|
|2-5|⚠️ 轻微延迟|观察，检查网络|
|> 5|❌ 延迟较高|检查网络和主节点负载|
-- -
## 六、主从复制的日常运维
### 6.1 添加新的从节点
1. 在新节点上安装 Redis(源码编译安装)
2. 修改 `redis.conf`，配置 `replicaof` 指向主节点
3. 配置密码 `requirepass` 和 `masterauth`
4. 启动 Redis 服务
5. 在主节点执行 `INFO replication` 确认新从节点已连接
### 6.2 从节点提升为主节点
**场景**：主节点故障或需要维护时，将某个从节点提升为新的主节点。
步骤：
1. 在从节点上执行：
```bash
redis-cli -a 你的密码 REPLICAOF NO ONE
```
命令说明：
- `REPLICAOF NO ONE`：停止复制，将从节点提升为独立的主节点
2. 验证角色变更：
```bash
redis-cli -a 你的密码 INFO replication
# 输出应显示 role:master
```
3. 将其他从节点的 replicaof 重新指向新主节点：
在其它从节点的 `redis.conf` 中修改 `replicaof` 为新主节点的 IP 和端口，然后重启。
### 6.3 主从复制中断后的恢复
1. 方法一：自动恢复(配置了自动重连)
Redis 从节点在连接断开后会自动尝试重连，无需手动干预。
2. 方法二：手动重新配置
如果自动重连失败，可以在从节点上重新执行：
```
redis-cli -a 你的密码 REPLICAOF 192.168.100.231 6379
```
### 6.4 主从复制延迟的监控与处理
监控命令：
```bash
# 查看从节点延迟
redis-cli -a 你的密码 INFO replication | grep lag

# 查看从节点偏移量是否跟得上主节点
redis-cli -a 你的密码 INFO replication | grep offset
```
延迟原因与解决方案：
- 网络带宽不足，升级网络带宽或使用千兆/万兆网络
- 主节点写负载过高，增加从节点数量分担读压力，或使用集群扩展
- 从节点性能不足，升级从节点 CPU/内存/磁盘 I/O
- 大 Key 操作，拆分大 Key 或优化数据结构
- repl-backlog 太小，增大 repl-backlog-size
-- -
## 七、生产环境最佳实践
### 7.1 主节点配置建议
|配置项|建议值|说明|
|---|---|---|
|`bind`|内网 IP|禁止绑定 `0.0.0.0`|
|`requirepass`|强密码(16位以上)|所有节点密码一致|
|`repl-backlog-size`|64mb-256mb|根据写流量调整，越大容错能力越强|
|`repl-backlog-ttl`|3600|1 小时无从节点连接后释放缓冲区|
|`tcp-keepalive`|300|检测死连接|
|`timeout`|300|客户端空闲超时|
### 7.2 从节点配置建议
|配置项|建议值|说明|
|---|---|---|
|`replicaof`|主节点 IP 端口|必须配置|
|`masterauth`|主节点密码|主节点有密码时必须配置|
|`replica-read-only`|`yes`|强烈建议开启|
|`replica-serve-stale-data`|`yes`|同步中断时继续响应读请求|
|`repl-diskless-sync`|`yes`|无盘复制，减少磁盘 I/O|
|`repl-diskless-load`|`swapdb`|无盘加载，减少内存占用|
### 7.3 安全建议
|建议|说明|
|---|---|
|防火墙限制|仅允许内网 IP 访问 6379 端口|
|统一密码|所有节点 `requirepass` 和 `masterauth` 使用相同密码|
|绑定内网 IP|禁止 `bind 0.0.0.0`|
|从节点只读|`replica-read-only yes`|
|禁用危险命令|重命名或禁用 `FLUSHALL`、`FLUSHDB`、`CONFIG`|
|定期备份|在从节点执行 `BGSAVE` 备份，不影响主节点|
### 7.4 监控建议
| 监控项    | 告警条件                         | 说明         |
| ------ | ---------------------------- | ---------- |
| 主从连接状态 | `master_link_status: down`   | 从节点与主节点断开  |
| 复制延迟   | `lag > 5`                    | 从节点数据延迟过高  |
| 从节点离线  | 从节点从 `connected_slaves` 中消失  | 从节点宕机或网络中断 |
| 全量同步频繁 | `master_sync_in_progress` 持续 | 复制积压缓冲区过小  |
-- -
## 八、总结
### 8.1 核心要点
1. **主从复制**是 Redis 高可用架构的基石，实现读写分离和数据冗余
2. **主节点负责写**，**从节点负责读**，从节点只读模式(`replica-read-only yes`)是生产环境标准
3. **关键配置**：从节点配置 `replicaof` 和 `masterauth`
4. **密码统一**：所有节点的 `requirepass` 和 `masterauth` 必须一致
5. **复制积压缓冲区**(`repl-backlog-size`)要足够大，避免频繁全量同步
6. **监控告警**：重点关注 `master_link_status` 和 `lag`