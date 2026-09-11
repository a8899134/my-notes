## 一、容器日志概念
### 1.1 容器日志的本质
Docker 容器的日志，本质上是容器内标准输出(stdout)和标准错误(stderr) 的输出内容。

在传统虚拟机中，应用程序通常将日志写入文件(如 /var/log/app.log)。但在容器中，最佳实践是让应用程序将日志直接输出到标准输出和标准错误，然后由容器运行时(Docker)统一收集和转发。

通俗理解：
- 你在容器内执行 `echo "hello"`，这条输出就是日志。
- 你运行 `python app.py`，程序里所有的 `print()` 和 `logging.info()` 输出都是日志。
- Nginx 的访问日志，如果配置成输出到 `/dev/stdout`，就会变成容器日志。

核心原则：容器不写日志文件，只输出到标准输出和标准错误。
### 1.2 统一管理容器日志作用
在生产环境中，容器日志管理面临以下挑战：

|挑战|说明|
|---|---|
|容器是临时的|容器随时可能被删除、重建，容器内的日志文件会随之消失|
|日志量巨大|多个容器、长时间运行，日志可能占满磁盘|
|日志分散|不同容器的日志散落在不同位置，难以统一查看|
|排错困难|容器重启后，旧日志丢失，无法追溯历史问题|
|合规要求|某些行业要求日志保留指定时长，需要集中归档|
统一的日志管理方案需要解决三个问题：
1. 收集：从哪里收集日志(标准输出和标准错误)。
2. 存储：日志存在哪里，存多久，怎么轮转。
3. 查询：如何快速检索和过滤日志。

## 二、Docker 默认日志驱动
### 2.1 日志驱动概念
日志驱动(Logging Driver)是 Docker 用来收集、处理和存储容器日志的机制。

当容器内的进程向标准输出和标准错误写入数据时，Docker 不会直接丢弃这些数据，而是交给配置的日志驱动处理。日志驱动负责决定这些日志最终去哪里：
- 存成本地文件(默认)。
- 发送到远程日志服务器(如 syslog、Graylog)。
- 发送到日志收集系统(如 Fluentd、Elasticsearch)。
### 2.2 默认日志驱动
Docker 安装后，默认使用的日志驱动是 json-file。它将容器的标准输出和标准错误输出以 JSON 格式存储在宿主机上。
日志文件存储位置：
```text
/var/lib/docker/containers/<容器ID>/<容器ID>-json.log
```
查看默认日志驱动：
```bash
docker info --format='{.LoggingDriver}}'
```
查看某个容器使用的日志驱动：
```bash
docker inspect 容器名 --format='{.HostConfig.LogConfig.Type}}'
```
### 2.3 常见日志驱动对比
1. json-file：默认驱动，日志存为 JSON 格式文件，适用默认情况，适合单机开发和测试场景
2. local：比 json-file 更高效，但功能更少，适合对性能敏感的场景
3. syslog：将日志发送到 syslog 服务，适用已有 syslog 日志基础设施的环境
4. journald：将日志发送到 systemd journal，Rocky Linux 默认使用 systemd
5. fluentd：将日志发送到 Fluentd 日志收集器，日志处理流水线
6. gelf：将日志发送到 Graylog 等 GELF 兼容服务：集中日志管理平台
7. none：禁用日志记录，不需要日志的场景

## 三、json-file 日志驱动详解
### 3.1 默认行为(无任何配置)
如果不做任何配置，使用 `json-file` 驱动时：
```bash
# 启动一个没有日志限制的容器
docker run -d --name web nginx
```
潜在风险：
- 容器日志会无限增长，直到占满磁盘空间。
- 没有日志轮转，单个日志文件可以变得非常大，影响 I/O 性能。
- 无法自动清理旧日志。
查看日志文件的真实路径：
```bash
# 获取容器的 ID
docker inspect web --format='{.Id}}'

# 进入日志目录
sudo ls -la /var/lib/docker/containers/<容器ID>/

# 查看日志文件大小
sudo ls -lh /var/lib/docker/containers/<容器ID>/*-json.log
```
### 3.2 配置日志轮转参数
在生产环境中，必须配置日志轮转，防止日志无限增长。

在 docker run 中配置：
```bash
docker run -d \
  --name web \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  nginx
```
命令解释：
- `--log-driver json-file`：指定使用 json-file 驱动(默认，可省略)。
- `--log-opt max-size=10m`：单个日志文件最大 10 MB，超过后轮转(重命名旧文件，创建新文件)。
- `--log-opt max-file=3`：保留 3 个日志文件(当前文件 + 2 个历史文件)。超过数量则删除最旧的。
轮转效果示例：
```text
/var/lib/docker/containers/<ID>/<ID>-json.log       # 当前正在写入
/var/lib/docker/containers/<ID>/<ID>-json.log.1     # 上一次轮转
/var/lib/docker/containers/<ID>/<ID>-json.log.2     # 上上次轮转
# .3 及更早的被自动删除
```
### 3.3 在 daemon.json 中全局配置
如果需要为所有容器统一配置日志轮转，可以在 Docker 守护进程的配置文件中设置。

编辑 /etc/docker/daemon.json：
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```
重启 Docker 使配置生效：
```bash
sudo systemctl restart docker
```
**注意**：重启 Docker 会中断所有正在运行的容器，生产环境需在维护窗口执行。

## 四、日志管理常用命令
### 4.1 查看容器日志
docker logs 是最常用的日志查看命令。

基本用法：
```bash
# 查看全部日志
docker logs 容器名

# 实时跟踪日志(类似 tail -f)
docker logs -f 容器名

# 查看最后 100 行
docker logs --tail 100 容器名

# 带时间戳查看
docker logs -t 容器名

# 查看最近 5 分钟的日志(容器启动后 5 分钟内)
docker logs --since 5m 容器名

# 查看指定时间之后的日志
docker logs --since "2026-01-01T00:00:00" 容器名

# 查看最近 100 行并实时跟踪
docker logs -f --tail 100 web

# 搜索错误日志
docker logs web 2>&1 | grep -i error
```
### 4.2 查看日志文件位置
```bash
# 获取容器日志文件的完整路径
docker inspect 容器名 --format='{.LogPath}}'
```
命令解释：
- 输出容器日志文件在宿主机上的绝对路径。
- 可用于直接使用 `tail`、`grep`、`less` 等系统命令查看。

直接查看日志文件：
```bash
# 查看日志文件(需要 root 权限)
sudo tail -f $(docker inspect web --format='{.LogPath}}')

# 搜索日志文件中的错误
sudo grep -i error $(docker inspect web --format='{.LogPath}}')
```
### 4.3 查看容器的日志驱动配置
```bash
# 查看容器使用的日志驱动类型
docker inspect 容器名 --format='{.HostConfig.LogConfig.Type}}'

# 查看容器的日志驱动参数
docker inspect 容器名 --format='{.HostConfig.LogConfig.Config}}'
```

## 五、其他日志驱动配置
### 5.1 local 驱动
local 驱动是比 json-file 更高效的日志驱动，但功能更精简。
```bash
docker run -d \
  --name web \
  --log-driver local \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  nginx
```
local 驱动特点：
- 比 json-file 性能更好(使用更高效的存储格式)。
- 不支持 `docker logs` 的 `--since` 和 `--until` 参数。
- 适合对性能敏感的场景。
### 5.2 syslog 驱动
将容器日志发送到系统的 syslog 服务。
```bash
docker run -d \
  --name web \
  --log-driver syslog \
  --log-opt syslog-address=udp://192.168.1.100:514 \
  --log-opt syslog-facility=daemon \
  --log-opt tag="nginx" \
  nginx
```
命令解释：
- `syslog-address`：syslog 服务器的地址和端口。
- `syslog-facility`：syslog 设施类型(如 `daemon`、`user`、`local0`)。
- `tag`：日志标签，用于在 syslog 中区分不同容器的日志。

适用场景：企业已有统一的 syslog 日志服务器(如 ELK、Graylog 的前端收集器)。
### 5.3 journald 驱动
将容器日志发送到 systemd journal(Rocky Linux 默认日志系统)。
```bash
docker run -d \
  --name web \
  --log-driver journald \
  --log-opt tag="nginx" \
  nginx
```
查看 journald 日志：
```bash
# 查看所有容器日志
sudo journalctl CONTAINER_NAME=web

# 查看实时日志
sudo journalctl -f CONTAINER_NAME=web

# 查看最近 100 行
sudo journalctl -n 100 CONTAINER_NAME=web
```
适用场景：宿主机使用 systemd，且不想额外部署日志收集服务。
### 5.4 fluentd 驱动
将容器日志发送到 Fluentd 日志收集器(常用于日志流水线)。
```bash
docker run -d \
  --name web \
  --log-driver fluentd \
  --log-opt fluentd-address=localhost:24224 \
  --log-opt tag="docker.web" \
  nginx
```
适用场景：已有 Fluentd 日志收集管道，需要将日志转发到 Elasticsearch、Kafka 等。

## 六、生产环境日志最佳实践
### 6.1 容器内应用日志规范
核心原则：应用程序不要写日志文件，而是直接输出到标准输出和标准错误。

错误做法(在容器内写日志文件)：
```python
# Python 错误示例
with open('/var/log/app.log', 'a') as f:
    f.write('Error occurred\n')
```
正确做法(输出到标准输出)：
```python
# Python 正确示例
import logging
logging.basicConfig(level=logging.INFO)
logging.info('Error occurred')   # 输出到 stdout
```
为什么这样做：
- Docker 只能收集标准输出和标准错误的日志。
- 写文件到容器内，容器删除后日志丢失。
- 写文件增加了不必要的磁盘 I/O 和存储管理负担。

### 6.2 日志轮转配置指南
| 参数       | 推荐值       | 说明                        |
| -------- | --------- | ------------------------- |
| max-size | 10m - 50m | 单个日志文件大小上限，达到后轮转          |
| max-file | 3 - 5     | 保留的历史文件数(包括当前文件)          |
| compress | true      | 是否压缩轮转后的旧日志(json-file 支持) |

配置示例：
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3",
    "compress": "true"
  }
}
```
### 6.3 应用内结构化日志
建议：让应用输出结构化日志(如 JSON 格式)，便于日志收集系统(如 ELK、Loki)解析和检索。

非结构化日志：
```text
2026-08-19 10:00:00 ERROR User 123 failed to login
```
结构化日志(JSON)：
```json
{"timestamp":"2026-08-19T10:00:00Z","level":"ERROR","user_id":123,"message":"login failed","ip":"192.168.1.1"}
```
好处：
- 可以直接在 Loki/Grafana 中按 `user_id` 或 `ip` 字段检索。
- 日志收集系统可以自动解析字段，无需写复杂的正则表达式。
- 便于生成统计报表和分析。
### 6.4 日志收集架构建议
对于多容器、多主机的生产环境，建议采用集中式日志收集架构：
```text
容器日志 (stdout/stderr)
    ↓
Docker 日志驱动 (json-file / fluentd)
    ↓
日志收集器 (Fluentd / Filebeat / Promtail)
    ↓
日志存储 (Elasticsearch / Loki)
    ↓
日志检索 (Kibana / Grafana)
```
各层职责：

|层级|组件|职责|
|---|---|---|
|容器层|应用本身|将日志输出到标准输出和标准错误|
|采集层|Fluentd / Promtail|从宿主机读取容器日志文件，转发到存储层|
|存储层|Elasticsearch / Loki|索引和存储日志数据|
|展示层|Kibana / Grafana|提供日志检索和可视化界面|

## 七、总结
Docker 容器日志管理是生产环境运维的核心技能之一。核心要点：
1. 日志的本质：容器日志是标准输出和标准错误，不是文件。应用应将日志输出到标准输出和标准错误，而不是写入文件。
2. 默认日志驱动：json-file 将日志以 JSON 格式存储在 /var/lib/docker/containers/ 下。
3. 日志轮转(必须配置)：
	- `max-size`：单个日志文件大小上限。
	- `max-file`：保留的历史文件数量。
	- 生产环境必须配置，否则磁盘会被占满。
4. 日志查看命令：
	- `docker logs`：查看容器日志。
	- `docker logs -f`：实时跟踪。
	- `docker logs --tail N`：查看尾部 N 行。
	- `docker logs --since`：按时间过滤。
5. 日志收集架构：生产环境建议使用集中式日志收集(如 Loki + Grafana)，实现统一检索和告警。

日志管理配置通常只需做一次，但需要长期运维。建议将日志轮转配置写入 `daemon.json` 或 Compose 文件中，作为基础设施的一部分固化下来。

