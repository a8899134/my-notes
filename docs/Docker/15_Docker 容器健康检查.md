## 一、容器健康检查概念
### 1.1 健康检查的通俗理解
健康检查是 Docker 提供的一种机制，用于定期检测容器内部的应用是否真正可用，而不仅仅是“容器进程还在运行”。

打个比方：
- 你启动了一个 Nginx 容器，`docker ps` 显示状态是 `Up`(运行中)。
- 但容器内的 Nginx 进程可能已经卡死、端口无法响应、或者依赖的后端服务已经挂了。
- 此时容器“活着”，但“不健康”了。

健康检查的作用就是定期向容器内“探探脉搏”：
- 如果检查通过 → 标记为 `healthy`(健康)。
- 如果检查失败 → 标记为 `unhealthy`(不健康)。
- 持续失败达到阈值 → 容器会被自动重启(配合重启策略)。

### 1.2 健康检查作用
在生产环境中，“容器在跑”不等于“服务可用”。以下是一个典型场景：

|时间线|发生了什么| `docker ps` 显示|实际情况|
|---|---|---|---|
|10:00|容器启动成功|Up(运行中)|应用正常响应|
|10:05|应用内部发生死锁|Up(运行中)|进程还在，但端口不再响应|
|10:10|负载均衡器将流量转发到该容器|Up(运行中)|用户收到 502 错误|
|10:15|运维手动重启容器|Up(运行中)|恢复正常|

没有健康检查的情况下，负载均衡器会把流量转发给一个“死了但没断气”的容器，导致用户看到错误页面。

有了健康检查之后：

1. Docker 每 30 秒执行一次健康检查命令。
2. 检查失败 3 次后，容器状态变为 `unhealthy`。
3. 负载均衡器(或 K 8 s)会自动将不健康的容器踢出服务池。
4. 配合 `restart: always`，容器会自动重启恢复。
### 1.3 底层原理
Docker 的健康检查依赖于容器内部的健康检查命令。这个命令可以是：
- 一个 Shell 命令(如 `curl -f http://localhost/ || exit 1`)。
- 一个可执行文件(如 `/healthcheck.sh`)。
- 一个针对特定服务的客户端命令(如 `mysqladmin ping`)。
Docker 守护进程会定期执行这个命令，并根据命令的退出码(Exit Code)判断健康状态：

|退出码|健康状态|说明|
|---|---|---|
|0|healthy(健康)|检查通过，容器正常运行|
|1|unhealthy(不健康)|检查失败，容器不可用|
|其他(如 126、127)|unhealthy(不健康)|命令无法执行或找不到|

## 二、健康检查指令详解
### 2.1 HEALTHCHECK 指令语法
在 Dockerfile 中，使用 `HEALTHCHECK` 指令定义健康检查。

语法格式：
```dockerfile
HEALTHCHECK [选项] CMD <命令>
```
选项说明：

|选项|说明|默认值|
|---|---|---|
|--interval|两次检查之间的间隔时间|30 s|
|--timeout|单次检查的超时时间|30 s|
|--start-period|容器启动后等待多久才开始检查|0 s|
|--retries|连续失败多少次后判定为不健康|3|

禁用健康检查：
```dockerfile
HEALTHCHECK NONE
```
### 2.2 简单示例
```dockerfile
FROM nginx:1.26-alpine

# 添加健康检查：每 30 秒检查一次，超时 3 秒，连续失败 3 次标记为不健康
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost/ || exit 1
```
命令解释：
- `--interval=30s`：每隔 30 秒执行一次检查。
- `--timeout=3s`：每次检查最长等待 3 秒，超时则视为失败。
- `--retries=3`：连续失败 3 次后，容器状态变为 `unhealthy`。
- `CMD curl -f http://localhost/ || exit 1`：
    - `curl -f`：向 `http://localhost/` 发起 HTTP 请求，`-f` 表示失败时返回非零退出码。
    - `|| exit 1`：如果 `curl` 返回非零(请求失败)，则整个命令返回 `1`，表示检查失败。
### 2.3 使用 start-period 避免启动误判
某些应用启动较慢(如 Java Spring Boot、大型数据库)，如果健康检查在启动期间就执行，很可能因为服务尚未就绪而误判为不健康。
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1
```
命令解释：
- `--start-period=60s`：容器启动后的 60 秒内，健康检查失败不计入 `retries` 计数。这给应用留出了充分的启动时间。
- 60 秒后，如果仍然失败，开始累加失败次数。

## 三、在 Dockerfile 中配置健康检查
### 3.1 Nginx 容器健康检查
```dockerfile
FROM nginx:1.26-alpine

# 检查 Nginx 是否能够正常响应 HTTP 请求
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

EXPOSE 80
```
生产环境提示：Alpine 镜像默认没有 curl，需要在 Dockerfile 中安装：
```dockerfile
FROM nginx:1.26-alpine
RUN apk add --no-cache curl
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost/ || exit 1
```
### 3.2 MySQL 容器健康检查
```dockerfile
FROM mysql:5.7

# 使用 mysqladmin ping 检查数据库是否响应
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD mysqladmin ping -h localhost || exit 1
```
命令解释：
- `mysqladmin ping`：向 MySQL 服务发送 ping 请求，如果服务正常则返回 0，否则返回非 0。
- `-h localhost`：连接本地的 MySQL 服务。
- `--start-period=60s`：MySQL 首次启动需要初始化数据，给足 60 秒启动时间。
### 3.3 Redis 容器健康检查
```dockerfile
FROM redis:7-alpine

# 使用 redis-cli ping 检查 Redis 是否响应
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD redis-cli ping || exit 1
```
命令解释：
- `redis-cli ping`：向 Redis 发送 PING 命令，正常返回 `PONG`，否则命令失败。
- `--timeout=5s`：Redis 通常响应很快，5 秒超时足够。
### 3.4 Node.js 应用健康检查
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# 应用暴露 3000 端口
EXPOSE 3000

# 健康检查：请求应用自身的健康检查接口
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
```
注意事项：
- 应用需要提供 `/health` 接口(常见于 Express 等 Web 框架)。
- 如果应用没有提供健康接口，可以用 `wget -q -O- http://localhost:3000 | grep "OK"` 等方式检查特定响应内容。

## 四、在 Docker Compose 中配置健康检查
### 4.1 Compose 中的健康检查语法
在 docker-compose.yml 中，健康检查配置在服务的 healthcheck 字段下。
```yaml
services:
  服务名:
    image: 镜像名
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
      timeout: 3s
      start_period: 5s
      retries: 3
```
### 4.2 完整的 Compose 示例
```yaml
version: '3.8'

services:
  web:
    image: nginx:1.26-alpine
    ports:
      - "8080:80"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
      timeout: 3s
      start_period: 5s
      retries: 3
    restart: unless-stopped

  db:
    image: mysql:5.7
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 30s
      timeout: 10s
      start_period: 60s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  app:
    image: myapp:1.0
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
    restart: unless-stopped

volumes:
  db_data:
```
### 4.3 depends_on 中的健康检查依赖
在 Compose 中，depends_on 可以让一个服务等待另一个服务启动后再启动。但默认只等待“容器启动”，不等待“服务就绪”。

使用 condition: service_healthy 可以等待依赖服务变为健康状态：
```yaml
services:
  app:
    depends_on:
      db:
        condition: service_healthy      # 等 db 健康后再启动 app
      redis:
        condition: service_healthy      # 等 redis 健康后再启动 app
```
其他 condition 选项：

|选项|说明|
|---|---|
|service_started|等待依赖容器启动(默认)|
|service_healthy|等待依赖容器变为健康状态|
|service_completed_successfully|等待依赖容器成功退出|

## 五、健康检查的常用命令
### 5.1 查看容器的健康状态
```bash
# 查看所有容器的健康状态
docker ps

# 查看特定容器的健康状态
docker inspect 容器名 --format='{.State.Health.Status}'
```
命令解释：
- `docker ps` 的状态列会显示 `healthy`(健康)、`unhealthy`(不健康)或 `starting`(启动中)。
- `docker inspect --format='{.State.Health.Status}'`：只输出健康状态字段，便于脚本处理。

健康状态的几种可能值：

| 状态值       | 说明                       |
| --------- | ------------------------ |
| starting  | 容器正在启动(start-period 期间)  |
| healthy   | 检查通过，容器健康                |
| unhealthy | 连续失败达到 retries 次数，标记为不健康 |
| none      | 容器没有配置健康检查               |
### 5.2 查看健康检查的详细历史
```bash
docker inspect 容器名 --format='{json .State.Health}' | jq
```
命令解释：
- 输出一个 JSON 对象，包含：
    - `Status`：当前健康状态。
    - `Log`：历史检查记录，包含每次检查的时间、命令、输出、退出码。
- `| jq`：将 JSON 格式化输出(需要提前安装 `jq`)。

手动查看简化版：
```bash
docker inspect 容器名 --format='{range .State.Health.Log}{.Output}{end}}'
```
### 5.3 查看最近一次健康检查的日志
```bash
docker inspect 容器名 --format='{index .State.Health.Log 0}'
```
### 5.4 在容器内手动执行健康检查命令
```bash
# 进入容器后手动执行健康检查命令
docker exec -it 容器名 curl -f http://localhost/
```
用途：
- 排查健康检查为什么失败。
- 验证健康检查命令在容器内部是否可执行。

## 六、生产环境最佳实践
### 6.1 健康检查命令的设计原则
| 原则     | 说明                            |
| ------ | ----------------------------- |
| 轻量化    | 健康检查命令应占用少量系统资源，避免影响业务性能      |
| 快速执行   | 单次检查应在几秒内完成，不应执行耗时操作(如全量数据查询) |
| 准确反映状态 | 检查应覆盖应用的核心功能，而不是只检查进程是否存在     |
| 避免副作用  | 检查命令不应修改应用状态或数据(如不应该执行写操作)    |
### 6.2 不同服务的检查策略建议
| 服务类型   | 推荐检查方式                         | 检查内容                            |
| ------ | ------------------------------ | ------------------------------- |
| Web 应用 | HTTP 请求(curl/wget)             | 检查 `/health` 或 `/ping` 接口返回 200 |
| 数据库    | 客户端 Ping(mysqladmin/redis-cli) | 检查服务是否可连接                       |
| 消息队列   | 查询队列状态                         | 检查服务是否可接受连接                     |
| 缓存     | 读写测试                           | 检查是否可正常读写                       |
| 批处理任务  | 检查进程文件                         | 检查任务进程是否仍在运行                    |
### 6.3 时间参数调优建议
|参数|建议值|说明|
|---|---|---|
|interval|30s - 60s|太频繁会增加系统负担，太低会延迟发现故障|
|timeout|3s - 10s|根据服务响应速度设置，不应超过 interval|
|start_period|10s - 120s|根据应用启动速度设置，Java 应用可能需要更长时间|
|retries|3 - 5 次|避免瞬时网络抖动导致误判|
### 6.4 健康检查与重启策略的配合
健康检查本身不会自动重启容器，需要配合 restart 策略：
```yaml
services:
  web:
    image: nginx:1.26-alpine
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
      retries: 3
    restart: unless-stopped   # 容器退出时自动重启
```
重启策略说明：

|重启策略|行为|
|---|---|
|no|不自动重启|
|always|无论退出码是什么，都重启|
|on-failure|仅在非正常退出(退出码非 0)时重启|
|unless-stopped|除非手动停止，否则总是重启(生产推荐)|

### 6.5 健康检查与负载均衡的配合
在 K 3 s/K 8 s 或 Docker Swarm 中，负载均衡器会根据健康检查结果自动决定是否转发流量：
- 容器状态为 `healthy`：负载均衡器将流量转发到该容器。
- 容器状态为 `unhealthy`：负载均衡器不会将流量转发到该容器，直到其恢复健康。

这就实现了“自动摘除不健康节点”的能力，是生产环境高可用的核心机制之一。

## 七、总结
Docker 容器健康检查是生产环境高可用的基础保障。以下是的核心要点：
1. 健康检查的本质：定期执行检查命令，根据退出码判断容器是否真正可用，而非仅看进程是否运行。
2. 核心指令：`HEALTHCHECK [选项] CMD <命令>`
- `--interval`：检查间隔(默认 30 s)。
- `--timeout`：单次超时(默认 30 s)。
- `--start-period`：启动保护期(默认 0 s)。
- `--retries`：失败容忍次数(默认 3)。
3. 状态含义：
- `starting`：启动中(`start-period` 期间)。
- `healthy`：健康。
- `unhealthy`：不健康。
4. Dockerfile vs Compose：
- Dockerfile 使用 `HEALTHCHECK` 指令。
- Compose 使用 `healthcheck` 字段。
- 两者语法略有不同，但功能一致。
5. 生产环境必备：
- 所有对外提供服务的容器都应该配置健康检查。
- 健康检查命令应轻量、快速、准确反映业务状态。
- 配合 restart: unless-stopped 实现自动重启。
- 配合负载均衡实现自动摘除不健康节点。
6. 排错思路：
- 检查失败时，先用 `docker inspect` 查看健康检查日志。
- 然后手动进入容器执行检查命令，重现问题。
- 根据失败原因调整命令、增加超时、延长 `start_period`。

在生产环境中，建议将健康检查作为所有服务的标配配置，并在 Compose 文件中统一使用 `depends_on` 的 `condition: service_healthy` 来控制服务启动顺序，确保依赖服务完全就绪后再启动主服务。

