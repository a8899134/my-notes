## 一、为什么需要监控 Nginx
### 1.1 监控的价值
Nginx 作为 Web 服务的入口，其运行状态直接影响用户体验。如果没有监控，你将无法回答以下问题：

|问题|没有监控的后果|
|---|---|
|服务器现在忙不忙？|凭感觉猜测，无法量化|
|流量高峰时连接数有多少？|不知道什么时候该扩容|
|为什么突然出现了 502 错误？|只能等用户投诉才发现|
|限流规则是否生效？|无法验证配置效果|

监控的核心目标：从“被动救火”变为“主动发现”。
### 1.2 Nginx 监控的三大层次
| 层次      | 内容              | 工具                  |
| ------- | --------------- | ------------------- |
| 基础状态    | 活跃连接数、请求总数、连接状态 | stub_status 模块      |
| 指标采集与存储 | 采集、存储、查询历史指标数据  | Prometheus / Zabbix |
| 可视化与告警  | 图表展示、异常告警       | Grafana / Zabbix UI |

## 二、stub_status 模块
### 2.1 什么是 stub_status
stub_status 是 Nginx 内置的 ngx_http_stub_status_module 模块，用于提供实时的基础性能指标。它通过一个 HTTP 接口返回 Nginx 当前的状态数据，是所有监控方案的数据源头,监控的基石。
无论你最终使用 Prometheus 还是 Zabbix，第一步都是先配置 stub_status。
### 2.2 检查模块是否已启用
执行以下命令确认 Nginx 是否已编译该模块：
```
nginx -V 2>&1 | grep -o with-http_stub_status_module
```
如果输出 with-http_stub_status_module，说明已支持。

如果无输出，说明编译时未包含该模块，需要重新编译 Nginx 时添加 --with-http_stub_status_module 参数。
### 2.3 配置 stub_status
编辑 Nginx 配置文件(如 /etc/nginx/conf.d/status.conf)，在 server 块中添加以下内容：
```
server {
    listen 80;
    server_name your_server_ip;

    location /nginx_status {
        stub_status on;           # 启用 stub_status 模块
        access_log off;           # 关闭访问日志，减少磁盘 I/O
        allow 127.0.0.1;          # 仅允许本机访问(生产环境建议限制为监控服务器 IP)
        deny all;                 # 拒绝所有其他 IP
    }
}
```
**配置说明**：
1. stub_status on;启用状态页面
2. access_log off; 不记录该页面的访问日志
3. allow 127.0.0.1;只允许本机 IP 访问(生产环境应改为监控服务器的 IP)
4. deny all; 拒绝其他所有来源

配置完成后，验证并重载 Nginx：
```
nginx -t && systemctl reload nginx
```
### 2.4 验证 stub_status
访问状态页面：
```
curl http://127.0.0.1/nginx_status
```
输出示例：
```
Active connections: 3
server accepts handled requests
 1000 1000 2000
Reading: 0 Writing: 1 Waiting: 2
```
**字段含义：**
1. Active connections，当前活跃连接数(包含 Reading + Writing + Waiting)
2. accepts，Nginx 启动以来总共接受的连接数
3. handled，成功完成握手的连接数(正常情况下 ≈ accepts)
4. requests，Nginx 启动以来总共处理的请求数
5. Reading，正在读取请求头的连接数
6. Writing，正在写入响应的连接数
7. Waiting，空闲 Keep-Alive 连接数

## 三、Prometheus + Grafana
### 3.1 方案概述
Prometheus + Grafana 是目前最流行的现代监控方案，尤其适合容器化和微服务架构。

**架构流程**：
```
Nginx(stub_status)→ Nginx Exporter → Prometheus → Grafana
```
1. Nginx Exporter，从 stub_status 采集指标，转换为 Prometheus 可识别的格式
2. Prometheus，时序数据库，负责拉取和存储指标数据
3. Grafana，可视化仪表盘，展示监控图表和配置告警
### 3.2 安装 Nginx Exporter
Nginx Exporter 默认监听 9113 端口，通过 --nginx.scrape-uri 参数指定 stub_status 的地址。
1. 方式一：使用预编译包(Debian/Ubuntu)
```
wget https://github.com/nginxinc/nginx-prometheus-exporter/releases/download/v0.11.0/nginx-prometheus-exporter_0.11.0_linux_amd64.deb
sudo dpkg -i nginx-prometheus-exporter_0.11.0_linux_amd64.deb
sudo systemctl start nginx-prometheus-exporter
sudo systemctl enable nginx-prometheus-exporter
```
2. 方式二：使用 Docker
```
docker run -d \
  --name nginx-exporter \
  -p 9113:9113 \
  nginx/nginx-prometheus-exporter:latest \
  -nginx.scrape-uri=http://nginx/nginx_status
```
3. 方式三：手动下载二进制文件
```
wget https://github.com/nginxinc/nginx-prometheus-exporter/releases/download/v0.11.0/nginx-prometheus-exporter_0.11.0_linux_amd64.tar.gz
tar -xzf nginx-prometheus-exporter_0.11.0_linux_amd64.tar.gz
./nginx-prometheus-exporter -nginx.scrape-uri=http://127.0.0.1/nginx_status
```
验证 Exporter 是否正常：
```
curl http://127.0.0.1:9113/metrics
```
如果返回大量以 nginx_ 开头的指标数据，说明 Exporter 工作正常。
### 3.3 配置 Prometheus
编辑 Prometheus 配置文件 /etc/prometheus/prometheus.yml：
```
global:
  scrape_interval: 15s      # 每 15 秒采集一次
  evaluation_interval: 15s  # 每 15 秒评估一次告警规则

scrape_configs:
  - job_name: 'nginx'
    scrape_interval: 10s    # Nginx 指标采集间隔
    static_configs:
      - targets: ['localhost:9113']   # Exporter 地址和端口
```
重启 Prometheus：
```
sudo systemctl restart prometheus
```
### 3.4 安装和配置 Grafana
安装 Grafana
```
# Ubuntu / Debian
sudo apt install -y grafana
sudo systemctl start grafana
sudo systemctl enable grafana

# RockyLinux / CentOS
sudo yum install -y grafana
sudo systemctl start grafana
sudo systemctl enable grafana
```
默认访问地址：http://your_server_ip:3000，默认账号密码均为 admin。

**添加 Prometheus 数据源**

1. 登录 Grafana(默认账号 admin/admin)
2. 点击左侧菜单 Configuration → Data Sources
3. 点击 Add data source，选择 Prometheus
4. 设置 URL 为 `http://localhost:9090`
5. 点击 Save & Test

**导入 Nginx 监控仪表盘**

方法一：通过仪表盘 ID 导入
1. 点击左侧 + → Import
2. 输入仪表盘 ID：12708或 6927
3. 选择 Prometheus 数据源
4. 点击 Import

方法二：搜索并导入社区仪表盘
1. 点击 + → Import
2. 在搜索框输入 Nginx
3. 选择合适的仪表盘导入
### 3.5 配置告警规则
在 Grafana 中配置告警：
1. 点击左侧 Alerting → Alert rules
2. 点击 New alert rule
3. 选择 Nginx 指标(如 nginxhttprequests_total)
4. 设置阈值(如 1 分钟内请求量超过 1000 次)
5. 配置通知渠道(邮件、Slack、钉钉等)

## 四、Zabbix 监控方案
### 4.1 方案概述
Zabbix 是一个功能全面的企业级监控解决方案，适合混合环境和传统物理机/虚拟机集群。Zabbix 官方提供了 Nginx by Zabbix agent 模板，无需编写额外脚本即可完成监控。
### 4.2 前置条件
第一步：配置 Nginx stub_status
参考第二章配置 stub_status，
Zabbix 模板默认使用路径 /basic_status：
```
location /basic_status {
    stub_status on;
    access_log off;
    allow 127.0.0.1;
    deny all;
}
```
### 4.3 导入 Zabbix 模板

1. 登录 Zabbix Web 界面
2. 进入 Configuration → Templates
3. 点击右上角 Import 按钮
4. 上传官方 Nginx 模板 JSON 文件
5. 确认导入

官方模板可在 Zabbix GitHub 仓库获取：https://github.com/zabbix/zabbix/tree/master/templates/app/nginx_agent

### 4.4 配置模板宏
模板使用以下宏变量，需要根据实际环境调整：

| 宏名称 | 默认值 | 说明 |
|--------|--------|------|
| `{$NGINX.STUBSTATUS.HOST}` | `localhost` | Nginx 状态页面的主机名或 IP |
| `{$NGINX.STUBSTATUS.PORT}` | `80` | Nginx 状态页面的端口 |
| `{$NGINX.STUBSTATUS.PATH}` | `basicstatus` | 状态页面的路径 |
| `{$NGINX.PROCESSNAME}` | `nginx` | Nginx 进程名称 |
| `{$NGINX.RESPONSETIME.MAX.WARN}` | `10` | 响应时间警告阈值(秒) |
| `{$NGINX.DROP_RATE.MAX.WARN}` | `1` | 连接丢弃率警告阈值 |

配置方法：
1. 在模板页面找到 Nginx by Zabbix agent
2. 点击 Macros 标签页
3. 根据需要修改宏值

### 4.5 将模板应用到主机
1. 进入 Configuration → Hosts
2. 择要监控的主机
3. 在 Templates 标签页点击 Select
4. 搜索并选择 Nginx by Zabbix agent
5. 点击 Update 保存

### 4.6 验证数据采集
等待几分钟后：
1. 进入 Monitoring → Latest data
2. 筛选主机
3. 查看 Nginx 相关指标
### 4.7 Zabbix 模板主要监控项
**连接状态监控**：
- `nginx.connections.active` — 活跃连接数
- `nginx.connections.reading` — 正在读取的连接数
- `nginx.connections.writing` — 正在写入的连接数
- `nginx.connections.waiting` — 等待中的连接数

**请求统计**：
- `nginx.requests.total` — 总请求数
- `nginx.requests.total.rate` — 每秒请求数

**进程监控**：
- `nginx.proc.num` — Nginx 进程数
- `nginx.proc.rss` — 内存使用
- `proc.cpu.util` — CPU 使用率
### 4.8 预定义图形与触发器

**预定义图形**：
- Nginx: Connections by state(各状态连接数)
- Nginx: Connections per second(每秒连接数)
- Nginx: Requests per second(每秒请求数)
- Nginx: Memory usage(内存使用)

**预定义触发器**
- Nginx: Version has changed(版本变化，信息级别)
- Nginx: Process is not running(进程未运行，高优先级)
- Nginx: Failed to fetch stub status page(状态页获取失败，警告级别)
- Nginx: High connections drop rate(连接丢弃率高，警告级别)
- Nginx: Service is down(服务宕机，一般级别)
- Nginx: Service response time is too high(响应时间过高，警告级别)

## 五、方案对比与选型建议
| 对比维度 | Prometheus + Grafana | Zabbix |
|----------|-----------------------|--------|
| **架构模式** | 拉取(Pull) | 拉取 + 推送 |
| **适用场景** | 云原生、容器化、微服务 | 传统物理机、虚拟机、混合环境 |
| **可视化** | Grafana(功能强大、生态丰富) | Zabbix 内置图形(功能完善) |
| **告警** | Alertmanager / Grafana Alerting | Zabbix 内置告警 |
| **数据存储** | Prometheus TSDB(时序数据库) | 关系型数据库 / 时序数据库 |
| **学习曲线** | 中等(需理解 PromQL) | 较低(开箱即用) |
| **扩展性** | 高(与云原生生态集成) | 中(Agent 模式) |

**总结**：Nginx 监控体系从 stub_status 起步—它提供了活跃连接数、请求数等核心指标；在此基础上，Prometheus + Grafana 是云原生时代的首选监控方案，而 Zabbix 则是传统企业环境的成熟选择。无论选择哪种方案，监控的目标都是让 Nginx 从“能跑”变为“跑得稳、出问题能快速定位”。
