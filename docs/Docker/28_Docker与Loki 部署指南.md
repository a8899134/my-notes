## 一、Loki 作用
### 1.1 Docker 日志管理的痛点
在生产环境中，使用 docker logs 查看日志会遇到以下问题：

|痛点|说明|
|---|---|
|容器是临时的|容器删除后日志随之消失，无法追溯历史|
|分布式难以集中|多台宿主机上的日志分散，需要逐个登录查看|
|日志量巨大|原始日志文件难以快速检索和过滤|
|无结构化查询| `grep` 无法满足复杂查询需求(如按时间范围、按字段过滤)|
### 1.2 Loki 简介
Loki 是 Grafana Labs 开源的一款轻量级日志聚合系统，专为容器化环境设计。
Loki 的核心特点：

|特点|说明|
|---|---|
|轻量高效|不对日志内容做全文索引，只索引标签(label)，存储成本低|
|与 Grafana 深度集成|直接在 Grafana 中查询和可视化日志|
|兼容 Prometheus 标签模型|使用与 Prometheus 相同的标签体系，学习曲线平缓|
|支持多租户|可按项目或团队隔离日志数据|
|部署简单|单机模式可用 Docker Compose 快速启动|
Loki 与其他日志系统的对比：

|对比维度|Loki|ELK(Elasticsearch)|Splunk|
|---|---|---|---|
|索引策略|只索引标签，不索引内容|全文索引所有字段|全文索引|
|存储成本|低|高|高|
|查询速度|依赖标签过滤 + 内容扫描|快|快|
|资源占用|低|高|高|
|适用场景|容器日志、K 8 s 环境|复杂全文检索|企业级日志分析|
### 1.3 Loki 的架构组件
Loki 由三个核心组件组成：

|组件|职责|通俗理解|
|---|---|---|
|Promtail|日志采集器|负责读取容器日志文件，推送到 Loki|
|Loki|日志存储和查询引擎|接收并存储日志，响应查询请求|
|Grafana|日志可视化界面|提供 Web 界面查询和展示日志|
-- -
## 二、部署前的准备
### 2.1 环境要求
| 项目             | 要求                          |
| -------------- | --------------------------- |
| Docker Engine  | 20.10+                      |
| Docker Compose | v1.29+ 或 V2(docker compose) |
| 磁盘空间           | 日志存储至少 20GB(按需扩展)           |
| 内存             | 最小 1GB，推荐 2GB+              |
### 2.2 确认 Docker 和 Docker Compose 已安装
```bash
# 确认 Docker 已安装
docker --version

# 确认 Docker Compose 已安装
docker compose version
```
### 2.3 目录结构规划
建议使用以下目录结构：
```text
/opt/loki/
├── docker-compose.yml    # 主配置文件
├── loki-config.yaml      # Loki 配置文件
├── promtail-config.yaml  # Promtail 配置文件
└── data/                 # 数据存储目录
    ├── loki/             # Loki 存储
    └── promtail/         # Promtail 位置(可选)
```
-- -
## 三、部署 Loki + Promtail + Grafana
### 3.1 创建配置目录
```bash
# 创建主目录
sudo mkdir -p /opt/loki
cd /opt/loki

# 创建数据目录
sudo mkdir -p data/loki data/promtail
```
### 3.2 创建 Loki 配置文件
Loki 的配置文件使用 YAML 格式，定义日志的存储方式、保留策略和查询接口。
```bash
sudo vi /opt/loki/loki-config.yaml
```
配置文件内容：
```yaml
# Loki 配置文件

# 认证配置(生产环境需要启用)
auth_enabled: false

# HTTP 服务配置
server:
  http_listen_port: 3100
  grpc_listen_port: 9096

# 存储配置(使用本地文件系统)
ingester:
  wal:
    dir: /loki/wal
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 5m
  chunk_retain_period: 30s

# 存储后端配置
storage_config:
  boltdb_shipper:
    active_index_directory: /loki/index
    cache_location: /loki/index_cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

# 查询配置
querier:
  engine:
    timeout: 5m
    max_look_back_period: 0s

# 限制配置
limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  ingestion_rate_mb: 10
  ingestion_burst_size_mb: 20

# 模式配置(单机模式)
target: all

# 启用 Prometheus 指标暴露
frontend:
  tail_proxy_url: http://localhost:3100

# 分片配置
query_range:
  split_queries_by_interval: 24h

# 配置保留策略(可选，默认 30 天)
compactor:
  working_directory: /loki/index
  retention_enabled: true
  retention_period: 720h  # 30 天
```
配置项解释：

|配置项|说明|
|---|---|
| `auth_enabled: false` |关闭认证(内网环境可以关闭，生产环境建议启用)|
| `http_listen_port: 3100` |Loki HTTP API 端口|
| `boltdb_shipper` |索引存储配置，使用 BoltDB 格式|
| `filesystem.directory` |日志块存储路径|
| `retention_period: 720h` |日志保留 30 天|
### 3.3 创建 Promtail 配置文件
Promtail 是 Loki 的日志采集器，负责从容器和日志文件中读取日志并发送到 Loki。
```bash
sudo vi /opt/loki/promtail-config.yaml
```
配置文件内容：
```yaml
# Promtail 配置文件

# HTTP 服务配置
server:
  http_listen_port: 9080
  grpc_listen_port: 0

# 日志采集位置配置
positions:
  filename: /promtail/positions.yaml

# Loki 服务地址
clients:
  - url: http://loki:3100/loki/api/v1/push

# 采集配置
scrape_configs:
  # 采集 Docker 容器日志
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container_name'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'compose_service'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_project']
        target_label: 'compose_project'

  # 采集 /var/log/ 目录下的日志
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: syslog
          __path__: /var/log/*.log
```
配置项解释：

|配置项|说明|
|---|---|
| `clients.url` |Loki 的推送地址，使用容器名 `loki` 访问|
| `docker_sd_configs` |自动发现本地 Docker 容器|
| `relabel_configs` |从 Docker 标签中提取元数据(容器名、Compose 项目名等)，为日志添加额外标签|
| `static_configs.__path__` |采集宿主机指定路径的日志文件|
### 3.4 创建 docker-compose.yml
```bash
sudo vi /opt/loki/docker-compose.yml
```
docker-compose.yml 完整配置：
```yaml
version: '3.8'

# 网络定义
networks:
  loki-net:
    driver: bridge

# 数据卷定义(持久化存储)
volumes:
  loki-storage:
  promtail-positions:

services:
  # ============================================================
  # 1. Loki：日志存储和查询引擎
  # ============================================================
  loki:
    image: grafana/loki:latest
    container_name: loki
    restart: unless-stopped
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yaml:/etc/loki/config.yaml:ro
      - loki-storage:/loki
    networks:
      - loki-net
    command: -config.file=/etc/loki/config.yaml
    # 日志驱动配置(Loki 自身的日志)
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    # 资源限制
    cpus: '1.0'
    mem_limit: 1G
    mem_reservation: 512M
    # 健康检查
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3100/ready"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  # ============================================================
  # 2. Promtail：日志采集器
  # ============================================================
  promtail:
    image: grafana/promtail:latest
    container_name: promtail
    restart: unless-stopped
    volumes:
      - ./promtail-config.yaml:/etc/promtail/config.yaml:ro
      - promtail-positions:/promtail
      # 挂载 Docker socket 用于自动发现容器
      - /var/run/docker.sock:/var/run/docker.sock:ro
      # 挂载容器日志目录(JSON 格式日志)
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      # 挂载系统日志目录(可选)
      - /var/log:/var/log:ro
    networks:
      - loki-net
    command: -config.file=/etc/promtail/config.yaml
    # 日志驱动配置
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    # 资源限制
    cpus: '0.5'
    mem_limit: 256M
    mem_reservation: 128M
    # 依赖关系
    depends_on:
      loki:
        condition: service_healthy

  # ============================================================
  # 3. Grafana：日志可视化界面
  # ============================================================
  grafana:
    image: grafana/grafana:latest
    container_name: loki-grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_INSTALL_PLUGINS=grafana-clock-panel,grafana-simple-json-datasource
    volumes:
      - grafana-storage:/var/lib/grafana
    networks:
      - loki-net
    # 日志驱动配置
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    # 资源限制
    cpus: '0.5'
    mem_limit: 512M
    mem_reservation: 256M
    # 依赖关系
    depends_on:
      loki:
        condition: service_healthy

volumes:
  loki-storage:
  promtail-positions:
  grafana-storage:
```
### 3.5 启动服务
```bash
# 进入 Loki 目录
cd /opt/loki

# 后台启动所有服务
sudo docker compose up -d

# 查看容器状态
sudo docker compose ps

# 查看日志(确认所有服务正常运行)
sudo docker compose logs -f
```
启动流程说明：

|步骤|说明|
|---|---|
| `docker compose up -d` |后台启动 Loki、Promtail、Grafana 三个容器|
| `docker compose ps` |确认三个容器状态均为 `Up` |
| `docker compose logs -f` |实时查看容器启动日志，排查可能的错误|
-- -
## 四、配置 Grafana 数据源
### 4.1 登录 Grafana
1. 在浏览器中访问：`http://服务器IP:3000`
2. 用户名：`admin`
3. 密码：`admin`(首次登录会提示修改密码)
### 4.2 添加 Loki 数据源
1. 点击左侧菜单 Configuration(齿轮图标)→ Data Sources。
2. 点击 Add data source。
3. 选择 Loki。
4. 在 URL 字段输入：`http://loki:3100`(容器名)
5. 点击 Save & Test。
6. 看到绿色对勾提示，说明数据源已成功连接。
### 4.3 查询日志
1. 点击左侧菜单 Explore(罗盘图标)。
2. 选择 Loki 数据源。
3. 在查询框中输入 LogQL 查询语句。
4. 点击 Run Query 查看日志。
常用 LogQL 查询示例：

|查询语句|说明|
|---|---|
| `{compose_service="web"}` |查询 Compose 中 web 服务的所有日志|
| `{container_name="myapp-web"}` |查询指定容器名的日志|
| `{compose_project="myapp"} \|= "ERROR"` |查询 myapp 项目中包含 ERROR 的日志|
| `{compose_service="app"} \| json \| status="500"` |查询 JSON 格式日志中 status 字段为 500 的日志|
-- -
## 五、在业务项目中采集日志
### 5.1 现有的 Compose 项目无需修改
Promtail 通过 Docker Socket 自动发现所有容器，并采集它们的标准输出日志。你不需要修改现有的业务 Compose 文件，只要容器在运行，日志就会被自动采集。
### 5.2 验证日志是否被采集
```bash
# 在 Loki 中查询最近 5 分钟的日志
# 在 Grafana Explore 中执行：
{compose_project="你的项目名"}

# 或通过命令行直接查询 Loki API
curl -s "http://localhost:3100/loki/api/v1/query_range?query={compose_service='web'}&limit=10"
```
### 5.3 日志采集的默认行为
| 采集对象     | 采集内容                                 | 说明                                     |
| -------- | ------------------------------------ | -------------------------------------- |
| 所有运行中的容器 | 容器的标准输出(stdout)和标准错误(stderr)         | 无需配置，自动采集                              |
| 宿主机日志文件  | `/var/log/*.log` 下的日志                | 通过 Promtail 的 `static_configs` 配置      |
| 容器日志文件   | `/var/lib/docker/containers/*/*.log` | 通过 Promtail 的 `docker_sd_configs` 自动发现 |
-- -
## 六、LogQL 查询语法入门
### 6.1 基本查询结构
LogQL 查询由两部分组成：
```text
{标签过滤器} 日志流选择器 {内容过滤器}
```
示例：
```logql
{compose_service="web"} |= "ERROR"
```

|部分|说明|
|---|---|
| `{compose_service="web"}` |标签过滤器：只查询 web 服务的日志|
| `\|= "ERROR"` |内容过滤器：只包含 ERROR 字符串|
### 6.2 常用标签过滤器
| 标签                | 说明             | 示例                             |
| ----------------- | -------------- | ------------------------------ |
| `compose_project` | Compose 项目名    | `{compose_project="myapp"}`    |
| `compose_service` | Compose 服务名    | `{compose_service="web"}`      |
| `container_name`  | 容器名            | `{container_name="myapp-web"}` |
| `job`             | Promtail 采集任务名 | `{job="docker"}`               |
### 6.3 内容过滤器
|操作符|说明|示例|
|---|---|---|
|`\|=`|包含字符串|`{...} \|= "ERROR"`|
|`!=`|不包含字符串|`{...} != "DEBUG"`|
|`\|~`|正则匹配|`{...} \|~ "error\\\|fail"`|
|`!~`|正则不匹配|`{...} !~ "INFO\\\|DEBUG"`|
|`\| json`|JSON 解析|`{...} \| json \| status="500"`|
-- -
## 七、与现有监控体系集成
### 7.1 统一到 Grafana
你现在已经拥有：

|组件|用途|端口|
|---|---|---|
|Prometheus|指标采集和存储|9090|
|Loki|日志存储和查询|3100|
|Grafana|统一展示|3000|
在同一个 Grafana 中配置两个数据源：
1. 添加 Prometheus 数据源：`http://prometheus:9090`
2. 添加 Loki 数据源：`http://loki:3100`
### 7.2 常用监控仪表盘组合
| 需求          | 数据源        | 说明                        |
| ----------- | ---------- | ------------------------- |
| 容器 CPU/内存曲线 | Prometheus | 展示容器资源使用趋势                |
| 容器错误日志      | Loki       | 查询 `{*} \|= "ERROR"` 查看错误 |
| 容器日志和指标关联   | 两者结合       | 在 Grafana Dashboard 中并排显示 |
-- -
## 八、日志保留策略与清理
### 8.1 配置日志保留期限
在 Loki 配置文件 loki-config.yaml 中设置：
```yaml
compactor:
  working_directory: /loki/index
  retention_enabled: true
  # 30 天(30 * 24 = 720)
  retention_period: 720h  
```
### 8.2 手动清理日志
如果需要手动清理日志：
```bash
# 停止 Loki
sudo docker compose stop loki

# 删除 Loki 数据目录
sudo rm -rf /opt/loki/data/loki/*

# 重启 Loki
sudo docker compose start loki
```
-- -
## 九、总结
Loki 是容器化环境中轻量级日志聚合的最佳选择。
1. Loki 的定位：
    - 轻量级日志聚合系统，与 Grafana 深度集成。
    - 只索引标签，不索引内容，存储成本低。
    - 适用于容器化环境(Docker、K 3 s/K 8 s)。
2. 部署架构：    
    - Promtail：采集日志并推送到 Loki(每台宿主机部署一个)。
    - Loki：存储和查询日志(中央服务)。
    - Grafana：提供 Web 界面查询日志。
3. 部署步骤：
    - 创建 Loki 配置文件(`loki-config.yaml`)。
    - 创建 Promtail 配置文件(`promtail-config.yaml`)。
    - 编写 `docker-compose.yml` 启动三个服务。
    - 在 Grafana 中添加 Loki 数据源。
4. 日志采集方式：
    - Promtail 通过 Docker Socket 自动发现容器，采集标准输出日志。
    - 业务项目的 Compose 文件无需任何修改。
    - 支持采集宿主机系统日志(`/var/log/`)。
5. 与现有监控体系的关系：
    - 你已有：Prometheus(指标)+ Loki(日志)+ Grafana(展示)。
    - 完成“指标 + 日志”的可观测性闭环。
6. 生产环境提醒：
    - 确保 `/var/run/docker.sock` 权限正确(`chmod 666` 或加入 docker 组)。
    - Loki 数据目录建议挂载到大容量磁盘。
    - 生产环境配置日志保留策略，避免磁盘占满。
    - 建议将 Loki 作为独立服务部署，与业务 Compose 项目分开。