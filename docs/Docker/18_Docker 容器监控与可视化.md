## 一、监控容器作用
### 1.1 容器环境的监控挑战
在传统物理机或虚拟机环境中，监控相对简单：一台机器上跑一个服务，只需要监控这台机器的 CPU、内存、磁盘和网络即可。
但在容器环境中，情况变得复杂：

|挑战|说明|
|---|---|
|容器数量多|一台宿主机可能运行几十个容器，需要监控每个容器的资源使用|
|容器生命周期短|容器随时可能被创建、销毁、重启，监控系统需要动态感知|
|服务依赖复杂|一个应用可能由多个容器组成(Web、App、DB、Cache)，需要统一监控|
|故障定位困难|容器重启后 ID 变化，传统监控工具难以关联历史数据|
### 1.2 监控解决什么问题
容器监控可以帮助运维和开发人员回答以下问题：

| 问题        | 监控能提供的答案                 |
| --------- | ------------------------ |
| 容器还活着吗？   | 健康检查状态、进程是否存在            |
| 容器跑得怎么样？  | CPU、内存、网络 I/O、磁盘 I/O 使用率 |
| 服务是否正常响应？ | 请求量、响应时间、错误率             |
| 什么时候需要扩容？ | 资源使用趋势、历史峰值              |
| 故障根因是什么？  | 日志聚合、事件关联分析              |
### 1.3 监控的三个层次
容器监控通常分为三个层次：

|层次|监控对象|常用工具|
|---|---|---|
|基础设施层|宿主机 CPU、内存、磁盘、网络|Node Exporter、Telegraf|
|容器层|每个容器的资源使用、健康状态|cAdvisor、docker stats|
|应用层|应用性能、请求量、错误率|Prometheus 客户端、APM 工具|
通俗理解：
- 基础设施层监控 = 检查大楼的电力、水管、电梯是否正常。
- 容器层监控 = 检查每个房间的空调、照明是否正常工作。
- 应用层监控 = 检查每个房间里的人是否在做应该做的事情。
-- -
## 二、Docker 自带监控命令
### 2.1 docker stats
`docker stats` 是 Docker 自带的实时资源监控命令，可以查看运行中容器的资源使用情况。
```bash
# 查看所有容器的实时资源使用
docker stats

# 查看特定容器的资源使用
docker stats web db redis

# 只显示一次(不持续刷新)
docker stats --no-stream

# 以 JSON 格式输出(便于脚本处理)
docker stats --no-stream --format "{{json .}}"
```
命令解释：
- 默认持续刷新(类似 `top` 命令)，按 `Ctrl+C` 退出。
- `--no-stream`：只输出当前状态，不持续刷新。
- `--format`：自定义输出格式，`{{json .}}` 输出 JSON 便于解析。
输出字段说明：

|字段|说明|
|---|---|
|CONTAINER ID|容器 ID(缩写)|
|NAME|容器名称|
|CPU %|CPU 使用百分比(相对于宿主机总 CPU)|
|MEM USAGE / LIMIT|内存使用量 / 内存上限|
|MEM %|内存使用百分比|
|NET I/O|网络接收/发送数据量|
|BLOCK I/O|磁盘读写数据量|
|PIDS|容器内的进程数|
### 2.2 docker system df
```bash
# 查看 Docker 整体磁盘使用情况
docker system df

# 显示更详细的信息
docker system df -v
```
命令解释：
- 显示镜像、容器、数据卷、构建缓存分别占用的磁盘空间。
- `-v` 显示每个镜像/容器/数据卷的具体大小。
输出示例：
```text
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          5         3         1.2GB     500MB (41%)
Containers      10        5         50MB      30MB (60%)
Local Volumes   3         2         100MB     0B (0%)
Build Cache     2         0         20MB      20MB (100%)
```
### 2.3 docker top
```bash
# 查看容器内运行的进程
docker top web

# 查看容器内进程的详细信息(类似 ps aux)
docker top web aux
```
命令解释：
- 显示容器内当前正在运行的进程列表。
- 等同于在容器内执行 `ps` 命令。
- `aux` 参数传递给 `ps`，显示更详细的进程信息。
### 2.4 docker events
```bash
# 实时查看 Docker 事件
docker events

# 过滤只查看容器事件
docker events --filter type=container

# 查看特定时间范围内的事件
docker events --since "2026-08-19T00:00:00" --until "2026-08-19T23:59:59"
```
命令解释：
- 输出 Docker 守护进程产生的实时事件流。
- 事件类型包括：容器创建、启动、停止、销毁、健康检查状态变化等。
- 适合用于自动化告警或日志收集。
-- -
## 三、cAdvisor：容器监控数据采集
### 3.1 cAdvisor 概念
cAdvisor(Container Advisor)是 Google 开源的一个容器监控工具，它可以自动发现宿主机上所有容器，采集每个容器的 CPU、内存、网络、磁盘等资源使用数据，并提供 Web 界面展示。
cAdvisor 的特点：

| 特点    | 说明                               |
| ----- | -------------------------------- |
| 自动发现  | 自动检测宿主机上的所有容器，无需手动配置             |
| 丰富指标  | 采集 CPU、内存、网络、磁盘、文件系统等多项指标        |
| 多输出格式 | 支持 Web UI、Prometheus 格式、REST API |
| 轻量级   | 以容器方式运行，资源占用小                    |
### 3.2 部署 cAdvisor
1. 拉取镜像
```bash
docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/ghcr.io/google/cadvisor:v0.60.5
```
2. 新打标签
```
# 给原始镜像打上 cadvisor:v0.60.5 标签
docker tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/ghcr.io/google/cadvisor:v0.60.5 cadvisor:v0.60.5
```
3. 运行容器
```bash
docker run -d \
  --name=cadvisor \
  --restart=unless-stopped \
  -p 8081:8080 \
  -v /:/rootfs:ro \
  -v /var/run:/var/run:ro \
  -v /sys:/sys:ro \
  -v /var/lib/docker/:/var/lib/docker:ro \
  -v /dev/disk/:/dev/disk:ro \
  cadvisor:v0.60.5
```
命令解释：
- `-v /:/rootfs:ro`：挂载宿主机根文件系统，用于读取容器文件系统统计信息。
- `-v /var/run:/var/run:ro`：挂载 Docker 运行时目录，用于获取容器列表。
- `-v /sys:/sys:ro`：挂载 sysfs，用于读取 CPU 和内存统计数据。
- `-v /var/lib/docker/:/var/lib/docker:ro`：挂载 Docker 数据目录，用于读取镜像和容器存储信息。
- `-p 8081:8080`：暴露 Web 界面端口。
验证：访问 `http://宿主机IP:8081` 即可看到 cAdvisor 的 Web 界面。
### 3.3 cAdvisor 的 Prometheus 指标接口
cAdvisor 默认在 `/metrics` 路径提供 Prometheus 格式的指标数据。
```bash
# 查看 cAdvisor 暴露的 Prometheus 指标
curl http://localhost:8080/metrics
```
输出示例(部分)：
```text
# HELP container_cpu_usage_seconds_total Cumulative cpu time consumed in seconds
# TYPE container_cpu_usage_seconds_total counter
container_cpu_usage_seconds_total{container_label_com_docker_compose_service="web"} 123.45
```
-- -
## 四、Prometheus + Grafana 监控体系
### 4.1 监控体系架构
Prometheus + Grafana 是目前最流行的容器监控组合方案。
 ```text
 容器指标 → cAdvisor → Prometheus → Grafana(展示)
                      ↓
                  告警规则 → Alertmanager → 钉钉/邮件
 ```
 各组件职责：

|组件|职责|
|---|---|
|cAdvisor|采集容器资源使用数据|
|Prometheus|拉取并存储指标数据，执行告警规则|
|Grafana|可视化展示指标数据|
|Alertmanager|处理告警通知(后续配置)|
### 4.2 部署 Prometheus
```yaml
# prometheus.yml - Prometheus 配置文件
global:
  scrape_interval: 15s      # 默认采集间隔
  evaluation_interval: 15s  # 告警规则评估间隔

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']   # 采集 cAdvisor 的指标
```
运行 Prometheus 容器
```bash
# 运行 Prometheus 容器
docker run -d \
  --name prometheus \
  --restart=unless-stopped \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus:latest
```
命令解释：
- `-p 9090:9090`：暴露 Prometheus Web 界面端口。
- `-v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml`：挂载配置文件。
验证：访问 `http://宿主机IP:9090`，在 Status → Targets 中确认 cAdvisor 状态为 UP。
### 4.3 部署 Grafana
```bash
# 运行 Grafana 容器
docker run -d \
  --name grafana \
  --restart=unless-stopped \
  -p 3000:3000 \
  -e GF_SECURITY_ADMIN_PASSWORD=admin \
  grafana/grafana:latest
```
命令解释：
- `-p 3000:3000`：暴露 Grafana Web 界面端口。
- `-e GF_SECURITY_ADMIN_PASSWORD=admin`：设置管理员密码(默认 admin/admin)。
配置步骤：
1. 访问 `http://宿主机IP:3000`，用户名 `admin`，密码 `admin`。
2. 添加数据源：
	- 类型选择 Prometheus。
	- URL 填写 `http://宿主机IP:9090`。
	- 保存并测试。
3. 导入仪表盘：
	- 点击 + → Import。
	- 输入仪表盘 ID(如 `193` 用于 Docker 容器监控)。
	- 选择数据源并导入。
### 4.4 使用 Docker Compose 部署
更方便的方式是使用 Docker Compose 一起部署所有监控组件。
```yaml
version: '3.8'

services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro

  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  prometheus_data:
  grafana_data:
```
-- -
## 五、Node Exporter：宿主机监控
### 5.1 Node Exporter 概念
Node Exporter 是 Prometheus 官方提供的宿主机监控工具，可以采集宿主机(物理机或虚拟机)的硬件和操作系统指标。
Node Exporter 采集的指标类型：

|指标类别|具体内容|
|---|---|
|CPU|使用率、负载、各核心状态|
|内存|总内存、可用内存、Swap 使用|
|磁盘|磁盘使用率、读写速率、IOPS|
|网络|网络流量、连接数、丢包率|
|系统|系统负载、进程数、运行时间|
### 5.2 部署 Node Exporter
```bash
# 运行 Node Exporter 容器
docker run -d \
  --name node-exporter \
  --restart=unless-stopped \
  -p 9100:9100 \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  -v /:/rootfs:ro \
  prom/node-exporter:latest \
  --path.procfs=/host/proc \
  --path.sysfs=/host/sys \
  --path.rootfs=/rootfs
```
命令解释：
- `-p 9100:9100`：暴露采集端口。
- `--path.procfs=/host/proc`：指定 proc 文件系统的挂载路径。
- `--path.sysfs=/host/sys`：指定 sysfs 文件系统的挂载路径。
### 5.3 在 Prometheus 中配置 Node Exporter
在 prometheus.yml 中添加以下配置：
```yaml
scrape_configs:
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```
重启 Prometheus 后，在 Targets 中确认 Node Exporter 状态为 UP。
-- -
## 六、Grafana 常用监控面板
### 6.1 常用仪表盘 ID
| 仪表盘名称             | ID    | 适用场景          |
| ----------------- | ----- | ------------- |
| Docker 容器监控       | 193   | 查看所有容器的资源使用情况 |
| Node Exporter 完整版 | 1860  | 宿主机系统监控       |
| Kubernetes 集群监控   | 315   | K3s/K8s 集群监控  |
| 应用监控(Spring Boot) | 4701  | Java 应用监控     |
| Nginx 监控          | 12708 | Nginx 服务监控    |
| MySQL 监控          | 7362  | MySQL 数据库监控   |
| Redis 监控          | 11835 | Redis 缓存监控    |
### 6.2 关键监控指标
| 监控维度    | 关键指标                               | 告警阈值建议          |     |
| ------- | ---------------------------------- | --------------- | --- |
| 容器 CPU  | container_cpu_usage_seconds_total  | 持续 > 80% 告警     |     |
| 容器内存    | container_memory_working_set_bytes | 持续 > 90% 告警     |     |
| 容器重启    | container_last_seen                | 重启次数 > 3 次/小时告警 |     |
| 宿主机 CPU | node_cpu_seconds_total             | 持续 > 80% 告警     |     |
| 宿主机内存   | node_memory_MemAvailable_bytes     | 可用 < 10% 告警     |     |
| 宿主机磁盘   | node_filesystem_avail_bytes        | 可用 < 10% 告警     |     |
| 网络流量    | node_network_receive_bytes_total   | 异常峰值告警          |     |
-- -
## 七、Alertmanager：告警配置
### 7.1 告警规则示例
在 Prometheus 中配置告警规则，当指标超过阈值时触发告警。
```yaml
# alerts.yml - 告警规则文件
groups:
  - name: container_alerts
    rules:
      - alert: ContainerHighMemoryUsage
        expr: (container_memory_working_set_bytes / container_spec_memory_limit_bytes) > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "容器内存使用率过高"
          description: "容器 {{ $labels.container_name }} 内存使用率超过 90%，当前值 {{ $value | printf \"%.1f\" }}%"

      - alert: ContainerHighCpuUsage
        expr: rate(container_cpu_usage_seconds_total[5m]) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "容器 CPU 使用率过高"
          description: "容器 {{ $labels.container_name }} CPU 使用率超过 80%"

      - alert: ContainerRestarting
        expr: changes(container_last_seen[10m]) > 3
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "容器频繁重启"
          description: "容器 {{ $labels.container_name }} 在 10 分钟内重启了 {{ $value }} 次"
```
### 7.2 部署 Alertmanager
```bash
# 运行 Alertmanager
docker run -d \
  --name alertmanager \
  --restart=unless-stopped \
  -p 9093:9093 \
  prom/alertmanager:latest
```
-- -
## 八、监控组件常用命令速查表
|操作|命令|说明|
|---|---|---|
|查看容器实时资源|`docker stats`|实时查看所有容器资源使用|
|查看 Docker 磁盘使用|`docker system df`|查看镜像、容器、卷的磁盘占用|
|查看容器内进程|`docker top 容器名`|查看容器内运行的进程|
|查看 Docker 事件|`docker events`|实时查看 Docker 事件流|
|访问 cAdvisor 界面|`curl http://localhost:8080`|查看容器监控数据|
|查看 cAdvisor 指标|`curl http://localhost:8080/metrics`|查看 Prometheus 格式指标|
|查看 Prometheus 界面|`curl http://localhost:9090`|查看 Prometheus Web 界面|
|查看 Node Exporter 指标|`curl http://localhost:9100/metrics`|查看宿主机指标|
|查看 Grafana 界面|`curl http://localhost:3000`|查看 Grafana Web 界面|
|验证 Prometheus 目标|`curl http://localhost:9090/api/v1/targets`|查看所有采集目标状态|
-- -
## 九、总结
Docker 容器监控与可视化是生产环境运维的核心能力。以下是本文的核心要点：
1. 监控三个层次：
    - 基础设施层：Node Exporter(宿主机 CPU、内存、磁盘、网络)。
    - 容器层：cAdvisor(每个容器的资源使用、健康状态)。
    - 应用层：应用自身暴露的指标(请求量、错误率、响应时间)。
2. Docker 自带监控命令：
    - `docker stats`：实时查看容器资源使用。
    - `docker system df`：查看 Docker 磁盘使用情况。
    - `docker top`：查看容器内进程。
    - `docker events`：实时事件监控。
3. 标准监控体系：
    - cAdvisor：采集容器指标。
    - Prometheus：拉取并存储指标。
    - Grafana：展示指标仪表盘。
    - Node Exporter：采集宿主机指标。
4. 告警配置：
    - 在 Prometheus 中定义告警规则。
    - 使用 Alertmanager 处理告警通知。