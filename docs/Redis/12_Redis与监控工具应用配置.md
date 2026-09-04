## 一、监控概述
### 1.1 监控 Redis 作用
Redis 是内存数据库，一旦出现故障或性能问题，直接影响应用系统的响应速度和可用性。生产环境中，监控 Redis 的核心目的包括：

|监控目的|说明|
|---|---|
|故障发现|及时发现 Redis 服务宕机、主从切换失败等问题|
|性能预警|内存使用率过高、慢查询增多、连接数爆满等提前告警|
|容量规划|通过历史趋势判断是否需要扩容或升级|
|问题定位|出现异常时通过监控数据快速定位根因|
|SLA 保障|确保 Redis 服务的可用性和性能达到承诺标准|
### 1.2 监控的五个层次
Redis 监控可以分为以下五个层次，由浅入深：
```text
第一层：内置命令监控(redis-cli + INFO)
    ↓
第二层：可视化客户端(Redis Insight)
    ↓
第三层：企业级监控平台(Zabbix)
    ↓
第四层：云原生监控(Prometheus + Grafana)
    ↓
第五层：云原生智能诊断(云厂商自带监控)
```

| 层次     | 工具                     | 适用场景            | 生产建议 |
| ------ | ---------------------- | --------------- | ---- |
| 内置命令   | redis-cli INFO、SLOWLOG | 临时排查、快速诊断       | 必备技能 |
| 可视化客户端 | Redis Insight          | 开发测试、日常运维可视化    | 推荐使用 |
| 企业级监控  | Zabbix                 | 传统企业统一监控平台，批量部署 | 生产常用 |
| 云原生监控  | Prometheus + Grafana   | 云原生环境长期监控与告警    | 生产标配 |
| 云原生方案  | 云厂商监控服务                | 云上 Redis 实例     | 按需使用 |

## 二、Redis-cli INFO
### 2.1 INFO 命令详解
INFO 是 Redis 最核心的监控命令，可以获取 Redis 服务器的各种运行状态信息。

基本用法：
```bash
redis-cli -a 你的密码 INFO
```
按模块查看：

|命令|说明|
|---|---|
| `INFO server` |Redis 服务器版本、运行时间等信息|
| `INFO clients` |客户端连接数等信息|
| `INFO memory` |内存使用情况|
| `INFO persistence` |持久化状态|
| `INFO stats` |统计信息(命中率、命令执行次数等)|
| `INFO replication` |主从复制状态|
| `INFO cpu` |CPU 使用情况|
| `INFO commandstats` |各命令执行统计|
| `INFO keyspace` |各数据库 Key 数量|
### 2.2 关键监控指标与解读
内存指标(INFO memory)：

|指标|说明|告警建议|
|---|---|---|
| `used_memory_human` |当前使用的内存总量(人类可读格式)|超过 maxmemory 的 80% 需关注|
| `used_memory_rss` |操作系统看到的内存占用|RSS 远大于 used_memory 说明内存碎片严重|
| `mem_fragmentation_ratio` |内存碎片率(RSS / used_memory)|> 1.5 需关注，> 2.0 需处理|
| `used_memory_peak_human` |历史内存使用峰值|用于容量规划|

命中率指标(INFO stats)：

|指标|说明|告警建议|
|---|---|---|
| `keyspace_hits` |缓存命中次数|结合 misses 计算命中率|
| `keyspace_misses` |缓存未命中次数|命中率 < 90% 需排查|

命中率计算公式：
```text
命中率 = keyspace_hits / (keyspace_hits + keyspace_misses) × 100%
```
连接数指标(INFO clients)：

|指标|说明|告警建议|
|---|---|---|
| `connected_clients` |当前连接的客户端数|接近 maxclients 的 70% 需关注|
| `blocked_clients` |被阻塞的客户端数|持续大于 0 需排查|

主从复制指标(INFO replication)：

|指标|说明|告警建议|
|---|---|---|
| `role` |当前节点角色(master/slave)|与预期不符需关注|
| `master_link_status` |主从连接状态(up/down)|不为 up 需告警|
| `connected_slaves` |已连接的从节点数|少于预期需告警|
| `master_repl_offset` |主节点复制偏移量|用于计算复制延迟|

Key 数量指标(INFO keyspace)：
```bash
redis-cli -a 密码 INFO keyspace
# 输出示例：
# db0:keys=15234,expires=0,avg_ttl=0
```
### 2.3 慢查询日志(SLOWLOG)
慢查询日志记录执行时间超过阈值的命令，是排查性能问题的关键工具。

相关配置参数：

|配置项|默认值|说明|
|---|---|---|
| `slowlog-log-slower-than` |10000(微秒)|慢查询阈值，超过此时间的命令会被记录|
| `slowlog-max-len` |128|慢查询日志最大条数|

生产环境建议：将 slowlog-max-len 设为 1000 以上，便于保留更多慢查询记录。

查看慢查询日志：
```bash
# 查看最近 10 条慢查询
redis-cli -a 密码 SLOWLOG GET 10

# 查看慢查询数量
redis-cli -a 密码 SLOWLOG LEN

# 清空慢查询日志
redis-cli -a 密码 SLOWLOG RESET
```
动态调整慢查询阈值：
```bash
# 将慢查询阈值调整为 50 毫秒(50000 微秒)
redis-cli -a 密码 CONFIG SET slowlog-log-slower-than 50000
```
### 2.4 实时监控(MONITOR)
MONITOR 命令可以实时输出 Redis 服务器接收到的所有命令。
```bash
redis-cli -a 密码 MONITOR
```
⚠️ 生产环境警告：MONITOR 会输出所有操作，在高并发环境下可能导致 Redis 性能严重下降。生产环境严禁长期运行 MONITOR，仅可用于短时调试。

## 三、Redis Insight 监控
### 3.1 Redis Insight 简介
Redis Insight 是 Redis 官方推出的免费可视化 GUI 管理工具，支持以下功能：

| 功能    | 说明                                     |
| ----- | -------------------------------------- |
| 数据可视化 | 可视化操作 Redis 数据(String、Hash、List、Set 等) |
| 实时监控  | 实时监控 Redis 服务器性能(内存、CPU、命令统计)          |
| 集群支持  | 支持 Redis 集群、哨兵模式                       |
| 慢查询分析 | 内置慢查询日志查看器                             |
| 内存分析  | 分析数据类型分布和内存占用                          |
| 命令行工具 | 集成 CLI 和 Workbench，支持自动补全              |
### 3.2 安装 Redis Insight
1. 方式一：Linux 二进制安装
```bash
# 下载 AppImage 文件
wget https://download.redisinsight.redis.com/latest/RedisInsight-linux-x64.AppImage

# 添加执行权限
chmod +x RedisInsight-linux-x64.AppImage

# 运行
./RedisInsight-linux-x64.AppImage
```
2. 方式二：Docker 部署
```
docker run -d -p 8001:8001 --name redisinsight redislabs/redisinsight
```
安装完成后，通过浏览器访问 `http://localhost:8001` 即可进入管理界面。
### 3.3 连接 Redis 实例
1. 打开 Redis Insight，点击 Add Database
2. 填写连接信息：
- Host：Redis 服务器 IP(如 192.168.1.100)
- Port：Redis 端口(默认 6379)
- Name：自定义名称(如 生产环境-主节点)
- Password：Redis 密码(如有)
3. 点击 Test Connection 测试连通性
4. 测试通过后点击 Add Database 保存
### 3.4 核心监控功能使用
1. 实时性能看板
连接成功后，Redis Insight 默认展示实时性能看板，包括：
- 内存使用趋势
- 每秒命令数(OPS)
- 连接数变化
- 网络流量
2. Profiler(命令分析器)
实时查看当前正在执行的命令，识别高频操作和慢命令。
3. 慢查询日志查看
在 Slow Log 页面查看所有慢查询记录，支持按时间排序和过滤。
4. 内存分析
分析数据库中各数据类型的内存占用分布，识别占用内存最大的 Key。
5. 集群拓扑查看
对于集群模式，Redis Insight 自动绘制节点拓扑图，直观显示主从关系和槽位分布。

## 四、Zabbix 监控
### 4.1 Zabbix 简介
Zabbix 是一款成熟的开源企业级监控平台，广泛应用于传统企业 IT 基础设施监控。在 Zabbix 6.0 及以上版本中，官方内置了 Redis 监控模板，无需编写脚本即可快速接入 Redis 监控。

Zabbix 监控 Redis 的核心机制是通过 Zabbix Agent 2 的 Redis 插件采集数据。Agent 2 是 Zabbix Agent 的升级版，部分使用 Go 语言开发，支持插件化扩展，降低了与 Server 之间的 TCP 连接数，具有更大的检查并发性。Agent 2 的 Redis 插件通过 RESP 协议(TCP 或 Unix Socket)连接 Redis 实例，执行 INFO、PING、SLOWLOG 等命令获取监控指标。
### 4.2 Zabbix 监控架构图
```text
┌─────────────────────────────────────────────────────────────────┐
│                      Zabbix Server                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         Web 界面(配置、图表、告警)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         数据库(MySQL/PostgreSQL)                       │   │
│  │      存储监控数据、历史趋势、告警记录                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 接收 Agent 上报数据
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Redis 服务器                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   Zabbix Agent 2(含 Redis 插件)                       │   │
│  │   - 执行 redis-cli 命令采集指标                         │   │
│  │   - 主动/被动模式上报数据                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Redis 实例(:6379)                         │   │
│  │   INFO / PING / SLOWLOG 等命令                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```
### 4.3 配置步骤
#### 4.4.1 前提条件
- Zabbix Server 6.0 或以上版本(已部署并运行)
- Redis 已安装并运行
- Zabbix Agent 2 已安装在 Redis 所在主机上
- Zabbix Server 与 Agent 网络互通
#### 4.4.2 安装 Zabbix Agent 2
在 Redis 所在主机上安装 Zabbix Agent 2(以 Rocky Linux 8 为例)：
```bash
# 安装 Zabbix 官方仓库
sudo rpm -Uvh https://repo.zabbix.com/zabbix/6.0/rhel/8/x86_64/zabbix-release-6.0-4.el8.noarch.rpm

# 安装 Zabbix Agent 2
sudo dnf install -y zabbix-agent2

# 启动并设置开机自启
sudo systemctl enable --now zabbix-agent2
```
Zabbix Agent 2 的 Redis 插件是内置的，安装后即具备监控 Redis 的能力，无需额外安装。
#### 4.4.3 配置 Zabbix Agent 2
编辑 Agent 2 配置文件 /etc/zabbix/zabbix_agent2.conf：
```bash
sudo vi /etc/zabbix/zabbix_agent2.conf
```
基础配置(必须修改)：
```conf
# Zabbix Server 的 IP 地址
Server=192.168.1.200

# 主机名(需与 Zabbix Web 界面添加的主机名一致)
Hostname=redis-master
```
Redis 连接配置(推荐使用命名会话方式)：
```conf
# 配置 Redis 连接信息(Session 名称可自定义)
Plugins.Redis.Sessions.Redis1.Uri=tcp://192.168.1.100:6379
Plugins.Redis.Sessions.Redis1.Password=YourStrongPassword2026!
```
配置说明：

|配置项|说明|
|---|---|
| Plugins.Redis.Sessions..Uri |Redis 实例的连接地址，格式为 tcp://IP:PORT|
| Plugins.Redis.Sessions..Password |Redis 实例的密码|
| Plugins.Redis.KeepAlive |空闲连接保持时间，默认 300 秒|
| Plugins.Redis.Timeout |请求超时时间，默认与全局 Timeout 一致|
| Server |Zabbix Server 的 IP 地址|

配置多实例：如需监控多个 Redis 实例，可配置多个 Session，如 Redis1、Redis2。

**密码传递安全说明：** 

Zabbix Agent 2 的 Redis 插件不支持在 URI 中嵌入密码(如 `tcp://user: password@127.0.0.1` 这种格式是错误的)。

正确方式是在配置文件中使用 `Plugins.Redis.Sessions.<SessionName>.Password` 单独配置密码，或在监控项键值中作为独立参数传递。

重启 Agent 2：
```bash
sudo systemctl restart zabbix-agent2
```
#### 4.4.4 在 Zabbix Web 界面添加主机并绑定模板
步骤一：创建主机
1. 登录 Zabbix Web 界面
2. 进入 Configuration(配置)→ Hosts(主机)
3. 点击 Create host(创建主机)
4. 填写主机信息：
    - Host name：自定义主机名称(需与 Agent 配置的 Hostname 一致)
    - Groups：选择合适的主机组(如 `Zabbix servers`)
    - Interfaces：添加 Agent 接口，IP 填写 Redis 主机的 IP，端口默认 `10050`

步骤二：绑定 Redis 监控模板
1.  在 Templates 页签，点击 Select 选择模板
2. 搜索并添加 Redis by Zabbix agent 2
3. 点击 Add 保存
说明：Zabbix 6.0 及以上版本自带该官方模板。

步骤三：配置宏(Macros)
在主机配置页面的 Macros 页签，添加以下宏：

|宏名称|值|说明|
|---|---|---|
| `{$REDIS.CONN.URI}` | `Redis1` |与 Agent 配置中的 Session 名称一致|

**注意**：如果 Redis 有密码认证，Zabbix 7.x 版本的模板可能没有直观的密码宏变量，需在 Agent 配置文件中通过 `Plugins.Redis.Sessions.Redis1.Password` 指定密码。
#### 4.4.5 验证监控数据
在 Agent 端测试连接：
```bash
# 测试 Redis 连接是否正常
zabbix_get -s 127.0.0.1 -k redis.ping[tcp://127.0.0.1:6379]
```
返回 1 表示连接正常，返回 0 表示连接失败。
在 Zabbix Web 界面验证：
1. 进入 Monitoring(监控)→ Latest data(最新数据)
2. 选择刚添加的主机
3. 查看是否有 Redis 监控项数据产生
### 4.5 核心监控项说明
Zabbix Redis 模板内置了以下关键监控项：

| 监控项 Key                                 | 说明                   | 告警建议                   |
| --------------------------------------- | -------------------- | ---------------------- |
| `redis.ping`                            | Redis 服务可用性(PING 命令) | 返回 0 立即告警              |
| `redis.info[connected_clients]`         | 当前客户端连接数             | 超过 maxclients 的 70% 关注 |
| `redis.info[used_memory]`               | 内存使用量(字节)            | 超过 maxmemory 的 80% 告警  |
| `redis.info[mem_fragmentation_ratio]`   | 内存碎片率                | > 1.5 关注，> 2.0 告警      |
| `redis.info[instantaneous_ops_per_sec]` | 每秒命令数(QPS)           | 用于容量规划和性能趋势            |
| `redis.info[evicted_keys]`              | 因内存淘汰的 Key 数量        | 持续增长说明内存不足             |
| `redis.info[role]`                      | 节点角色(master / slave) | 与预期不符需关注               |
| `redis.info[rdb_last_bgsave_status]`    | 最后一次 RDB 保存状态        | 非 `ok` 需告警             |
| `redis.info[master_link_status]`        | 主从复制连接状态(从节点)        | 不为 `up` 需告警            |
| `redis.slowlog.count`                   | 慢查询日志数量              | 5 分钟内超过 10 条告警         |

监控项命令格式说明：

Zabbix Agent 2 的 Redis 插件支持以下格式的监控项键值：
```text
redis.info[ConnString, Section, Key]
redis.ping[ConnString, Password]
redis.slowlog.count[ConnString, Password]
redis.config[ConnString, Parameter]
```
其中 ConnString 可以是：
- URI 格式：tcp://127.0.0.1:6379
- Session 名称：Redis 1(需在 Agent 配置文件中定义)
### 4.6 内置触发器说明
Zabbix Redis 模板内置了多个告警触发器：

|触发器名称|条件|严重级别|
|---|---|---|
|Redis 服务不可用| `redis.ping` 返回 0|严重(HIGH)|
|连接数过多| `connected_clients > {$REDIS.CLIENTS.MAX}` |高(HIGH)|
|内存使用过高| `used_memory > {$REDIS.MEM.MAX}` |平均(AVERAGE)|
|内存碎片率过高| `mem_fragmentation_ratio > 1.5` |警告(WARNING)|
### 4.7 Zabbix 告警配置
配置告警媒介(Media Types) ：
1. 进入 Administration(管理)→ Media types(媒介类型)
2. 选择或创建告警方式(邮件、企业微信、钉钉等)

配置告警动作(Actions) ：
1. 进入 Configuration(配置)→ Actions(动作)→ Trigger actions(触发器动作)
2. 点击 Create action(创建动作)
3. 设置触发条件和告警接收人

## 五、Prometheus + Grafana
### 5.1 架构概述
Prometheus + Grafana 是生产环境中最主流的云原生监控方案。
```text
Redis 实例 → redis_exporter(采集指标)→ Prometheus(存储+查询)→ Grafana(可视化展示)
                                                              ↓
                                                           AlertManager(告警)
```

|组件|作用|
|---|---|
|redis_exporter|从 Redis 采集监控指标，暴露给 Prometheus|
|Prometheus|存储时序数据，提供查询接口|
|Grafana|可视化展示监控数据|
|AlertManager|根据规则发送告警通知|
### 5.2 部署 redis_exporter
第一步：下载 redis_exporter
```bash
# 下载最新版本(以 v1.80.1 为例)
wget https://github.com/oliver006/redis_exporter/releases/download/v1.80.1/redis_exporter-v1.80.1.linux-amd64.tar.gz

# 解压
tar -xzvf redis_exporter-v1.80.1.linux-amd64.tar.gz

# 移动到系统目录
sudo mv redis_exporter /usr/local/bin/
```
第二步：启动 redis_exporter
```bash
# 有密码场景(生产环境)
redis_exporter -redis.addr 127.0.0.1:6379 -redis.password 你的密码 &

# 指定监听端口(默认 9121)
redis_exporter -redis.addr 127.0.0.1:6379 -redis.password 你的密码 -web.listen-address :9121 &
```
第三步：创建 systemd 服务(生产环境推荐)
```bash
sudo vi /etc/systemd/system/redis_exporter.service
```
写入以下内容：
```text
[Unit]
Description=Redis Exporter
After=network.target

[Service]
Type=simple
User=redis
ExecStart=/usr/local/bin/redis_exporter -redis.addr 127.0.0.1:6379 -redis.password 你的密码
Restart=always

[Install]
WantedBy=multi-user.target
```
启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl start redis_exporter
sudo systemctl enable redis_exporter
```
### 5.3 配置 Prometheus
第一步：创建 Prometheus 配置文件
```bash
sudo vi /etc/prometheus/prometheus.yml
```
写入以下内容：
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: redis
    static_configs:
      - targets: ['127.0.0.1:9121']
        labels:
          instance: redis-master
```
第二步：启动 Prometheus
```bash
# 使用 Docker 启动
docker run -d -p 9090:9090 \
  -v /etc/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus:latest
```
第三步：验证采集是否正常
访问 ` http://服务器IP:9090/targets`，查看 redis 目标状态是否为 UP。
### 5.4 配置 Grafana
第一步：启动 Grafana
```bash
docker run -d -p 3000:3000 \
  -e GF_SECURITY_ADMIN_PASSWORD=admin \
  grafana/grafana:latest
```
第二步：添加 Prometheus 数据源
1. 访问 `http://服务器IP:3000`，登录(默认 admin/admin)
2. 点击 Configuration → Data Sources → Add data source
3. 选择 Prometheus
4. 在 URL 栏输入 `http://Prometheus服务器IP:9090`
5. 点击 Save & Test

第三步：导入 Redis 监控大盘
1. 点击 + → Import
2. 输入大盘 ID：763(Redis 官方大盘)
3. 点击 Load，选择 Prometheus 数据源
4. 点击 Import
### 5.5 核心监控面板说明
导入大盘后，可查看以下核心监控面板：

|面板|指标|说明|
|---|---|---|
|内存使用率| `redis_memory_used_bytes / redis_memory_max_bytes * 100` |绿色 < 70%，黄色 < 85%，红色 > 85%|
|每秒命令数| `rate(redis_commands_processed_total[1m])` |吞吐量趋势|
|缓存命中率| `hits / (hits + misses)` |> 90% 为优秀|
|连接数| `redis_connected_clients` |接近 maxclients 需告警|
|复制延迟| `master_repl_offset - slave_repl_offset` |> 1 MB 或 > 10 秒需关注|
|命令延迟|各命令平均执行时间|按命令类型展示延迟分布|
### 5.6 配置告警规则
创建告警规则文件：
```bash
sudo vi /etc/prometheus/alerts.yml
```
输入以下内容
```yaml
groups:
  - name: redis-alerts
    rules:
      # 内存使用率超过 85%
      - alert: RedisHighMemoryUsage
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.85
        for: 2m
        annotations:
          summary: "Redis 内存使用率超过 85%"

      # 缓存命中率低于 70%
      - alert: RedisLowHitRate
        expr: |
          rate(redis_keyspace_hits_total[10m]) /
          (rate(redis_keyspace_hits_total[10m]) +
           rate(redis_keyspace_misses_total[10m])) < 0.7
        for: 10m
        annotations:
          summary: "Redis 缓存命中率低于 70%"

      # 从节点离线
      - alert: RedisReplicationDown
        expr: redis_connected_slaves < 1
        for: 1m
        annotations:
          summary: "Redis 没有连接的从节点"

      # 慢查询增多
      - alert: RedisSlowQueries
        expr: rate(redis_slowlog_log_slower_than_total[5m]) > 10
        for: 2m
        annotations:
          summary: "Redis 慢查询增多(5分钟内超过10条)"
```
在 prometheus.yml 中引用告警规则文件：
```yaml
rule_files:
  - "alerts.yml"
```

## 六、关键监控指标与告警阈值

### 6.1 核心指标速查表
| 指标类别    | 指标名称                      | 正常范围               | 告警阈值              | 处理建议                |
| ------- | ------------------------- | ------------------ | ----------------- | ------------------- |
| 内存使用率   | `used_memory / maxmemory` | < 70%              | > 80% 预警，> 85% 告警 | 扩容或优化缓存策略           |
| 内存碎片率   | `mem_fragmentation_ratio` | 1.0 - 1.5          | > 1.5 关注，> 2.0 告警 | 重启或开启 active-defrag |
| 缓存命中率   | `hits / (hits + misses)`  | > 90%              | < 90% 关注，< 70% 告警 | 检查过期策略和缓存 Key 设计    |
| 连接数     | `connected_clients`       | < maxclients 的 70% | > 70% 关注，> 90% 告警 | 排查连接泄漏，调整连接池        |
| 主从延迟    | `repl_offset 差值`          | < 1MB              | > 1MB 或 > 10s 告警  | 检查网络和主节点负载          |
| 慢查询     | 慢查询数量                     | 0                  | 5分钟 > 10 条告警      | 优化慢命令或数据结构          |
| Key 淘汰  | `evicted_keys` 速率         | 0                  | 持续 > 0 告警         | 内存不足，需扩容            |
| CPU 使用率 | CPU 使用率                   | < 70%              | > 70% 关注          | 检查是否有复杂命令           |
### 6.2 告警分级建议
| 级别     | 条件                    | 响应时间   | 通知方式              |
| ------ | --------------------- | ------ | ----------------- |
| P0(紧急) | Redis 服务不可用、主从全部离线    | 立即     | 电话 + 短信 + 钉钉/企业微信 |
| P1(严重) | 内存使用率 > 85%、从节点全部离线   | 15 分钟内 | 短信 + 钉钉/企业微信      |
| P2(警告) | 内存使用率 > 70%、命中率 < 70% | 1 小时内  | 钉钉/企业微信           |
| P3(提醒) | 慢查询增多、连接数偏高           | 按需     | 邮件                |

## 七、生产环境监控方案建议
### 7.1 监控工具组合推荐
| 场景                | 推荐工具组合                                               | 理由                       |
| ----------------- | ---------------------------------------------------- | ------------------------ |
| 传统企业统一监控          | Zabbix(官方模板)                                         | 开箱即用，统一纳管，适合已有 Zabbix 平台 |
| 云原生/Kubernetes 环境 | Prometheus + redis_exporter + Grafana + AlertManager | 完整的云原生监控+告警+可视化体系        |
| 日常运维可视化           | Redis Insight(Desktop 或 Docker)                      | 数据浏览、热键分析、集群管理           |
| 临时故障排查            | redis-cli INFO + SLOWLOG                             | 快速定位问题，零依赖               |
| 小型团队/单机           | redis-stat(终端或轻量 Web)                                | 轻量级，部署简单                 |
### 7.2 部署架构建议
方案一：Zabbix 架构(传统企业)
```text
┌─────────────────────────────────────────────────────────────────┐
│                      Zabbix Server                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Web UI + 数据库 + 告警引擎                            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Redis 服务器集群                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Redis 主节点 │  │ Redis 从节点 │  │ Redis 从节点            │ │
│  │  :6379      │  │  :6379      │  │  :6379                  │ │
│  │      │      │  │      │      │  │      │                  │ │
│  │ Zabbix     │  │ Zabbix     │  │ Zabbix                   │ │
│  │ Agent 2    │  │ Agent 2    │  │ Agent 2                  │ │
│  │  :10050    │  │  :10050    │  │  :10050                  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```
方案二：Prometheus 架构(云原生)
```text
┌─────────────────────────────────────────────────────────────────┐
│                        监控服务器                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Prometheus  │  │   Grafana   │  │   AlertManager          │ │
│  │  :9090      │  │   :3000     │  │   :9093                 │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                      │
│                          ▼                                      │
│              ┌─────────────────────┐                           │
│              │   通知渠道           │                           │
│              │ 钉钉/企微/邮件/电话  │                           │
│              └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ 采集指标(pull)
┌─────────────────────────────────────────────────────────────────┐
│                        Redis 服务器集群                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Redis 主节点 │  │ Redis 从节点 │  │ Redis 从节点            │ │
│  │  :6379      │  │  :6379      │  │  :6379                  │ │
│  │      │      │  │      │      │  │      │                  │ │
│  │ redis_      │  │ redis_      │  │ redis_                  │ │
│  │ exporter    │  │ exporter    │  │ exporter                │ │
│  │  :9121      │  │  :9121      │  │  :9121                  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```
### 7.3 日常监控指标参考

| 频率  | 检查内容          | 工具                        |
| --- | ------------- | ------------------------- |
| 每天  | 内存使用率、命中率、连接数 | Zabbix/Grafana 看板 / INFO  |
| 每天  | 慢查询日志         | SLOWLOG GET / Zabbix 触发器  |
| 每周  | 主从复制状态        | INFO replication / Zabbix |
| 每周  | Key 数量变化趋势    | INFO keyspace             |
| 每月  | 容量趋势评估        | Zabbix/Grafana 历史数据       |
| 按需  | 故障排查          | MONITOR(短时)+ INFO         |
