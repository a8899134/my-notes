## 一、生产模板作用
### 1.1 从“能跑”到“能稳”的跨越
很多 Docker Compose 初学者写出来的文件只解决了“能不能跑起来”的问题，但离“能不能在生产环境稳定运行”还有很大距离。

| 对比维度 | 开发/测试 Compose     | 生产级 Compose                |
| ---- | ----------------- | -------------------------- |
| 镜像版本 | 使用 `latest`，版本不可控 | 固定具体版本号，可追溯                |
| 容器用户 | 默认 root，存在安全风险    | 指定非 root 用户运行              |
| 资源限制 | 无限制，可能耗尽宿主机资源     | 设置 CPU 和内存上限               |
| 健康检查 | 无，容器假死无法发现        | 配置健康检查，自动摘除不健康节点           |
| 日志管理 | 无轮转，日志占满磁盘        | 配置日志轮转，防止磁盘占满              |
| 重启策略 | 无或 `no`，异常退出不会恢复  | 配置 `unless-stopped`，异常自动恢复 |
| 敏感信息 | 硬编码在 Compose 文件中  | 通过 `.env` 文件注入             |
| 网络   | 使用默认网络，所有容器互通     | 网络分层隔离，限制横向访问              |
| 防火墙  | 未配置               | 配置防火墙规则，限制访问来源             |
| 文件权限 | 未配置               | 宿主机目录权限与容器 UID 对齐          |
### 1.2 生产模板的核心目标
|目标|说明|
|---|---|
|可复用|一份模板可以复制到不同项目，只需修改少量配置|
|可运维|出现问题时有日志、有健康检查、有自动恢复|
|可追溯|镜像版本固定，环境变量外部化，配置可审计|
|安全合规|非 root 运行、网络隔离、敏感信息加密|
-- -
## 二、模板的十个核心配置项
### 2.1 配置项总览
|序号|配置项|解决的问题|在 Compose 中的体现|
|---|---|---|---|
|1|镜像版本固定|`latest` 带来的非预期变更|`image: nginx:1.26-alpine`|
|2|非 root 运行|容器被攻破后的权限提升风险|`user: 1000:1000`|
|3|资源限制|单个容器耗尽宿主机资源|`mem_limit`、`cpus`|
|4|健康检查|容器假死但进程仍在|`healthcheck`|
|5|日志驱动|日志无限增长占满磁盘|`logging.options`|
|6|重启策略|异常退出后无法自动恢复|`restart: unless-stopped`|
|7|敏感信息外部化|密码硬编码在 Compose 文件中|`environment: ${VAR}`|
|8|网络分层|容器间横向渗透|`networks: frontend/backend/database`|
|9|文件权限设置|容器内用户无写权限|宿主机 `chown` + `user` 匹配|
|10|防火墙规则|端口暴露在公网或内网无限制|`firewall-cmd` 配置|
-- -
## 三、各配置项详细说明
### 3.1 镜像版本固定
latest 标签是“浮动”的，它指向的版本会不断变化。你今天部署的是 1.26，明天重新拉取可能变成 1.27，导致生产环境出现非预期的行为变更。
```
services:
  web:
    # 正确：固定到具体版本
    image: nginx:1.26-alpine

  app:
    # 正确：固定到具体版本
    image: myapp:1.0.0

  db:
    # 正确：固定到具体版本
    image: mysql:5.7.40
```
### 3.2 非 root 运行
容器默认以 root(UID=0)运行。如果容器内的应用存在漏洞被攻破，攻击者获得的是宿主机 root 权限。
1. 在 Dockerfile 中创建用户：
```dockerfile
FROM alpine:3.18
RUN adduser -u 1000 -D appuser
USER appuser
```
2. 在 Compose 中指定用户：
```yaml
services:
  app:
    image: myapp:1.0.0
    user: 1000:1000   # UID:GID
```
官方镜像的默认用户 UID 参考：

|官方镜像|默认用户|UID|
|---|---|---|
|nginx|nginx|101|
|mysql|mysql|999|
|redis|redis|999|
|postgres|postgres|999|
|node|node|1000|
|alpine|root|0(默认 root)|
重要提醒：如果挂载了宿主机目录，容器内用户 UID 必须与宿主机目录的 owner UID 匹配。
### 3.3 资源限制
没有资源限制的容器，可能因为内存泄露或异常流量耗尽宿主机所有资源，导致其他容器甚至宿主机本身崩溃。
```yaml
services:
  web:
    image: nginx:1.26-alpine
    cpus: '0.5'           # 最多使用 0.5 个 CPU 核心
    mem_limit: 256M       # 内存硬限制，超限会被 OOM 杀死
    mem_reservation: 128M # 内存软限制，系统内存紧张时强制回收到该值以内
```
各类型服务的推荐配置：

|服务类型|CPU|内存上限|
|---|---|---|
|静态 Web(Nginx)|0.5 - 1 核|256 - 512 MB|
|动态 Web(Node.js/Python)|1 - 2 核|512 MB - 1 GB|
|数据库(MySQL/PostgreSQL)|2 - 4 核|2 - 8 GB|
|缓存(Redis)|1 - 2 核|1 - 4 GB|
|日志收集(Filebeat/Fluentd)|0.5 核|256 - 512 MB|
### 3.4 健康检查
容器进程还在运行，但业务已经不可用(如死锁、内存溢出导致响应超时)。健康检查可以定期探测业务是否正常响应。
```yaml
services:
  web:
    image: nginx:1.26-alpine
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s       # 每 30 秒检查一次
      timeout: 3s         # 单次检查超时 3 秒
      start_period: 5s    # 容器启动后等待 5 秒再开始检查
      retries: 3          # 连续失败 3 次标记为 unhealthy

  db:
    image: mysql:5.7.40
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 30s
      timeout: 10s
      start_period: 60s   # MySQL 首次启动需要更长时间
      retries: 5

  redis:
    image: redis:7.0-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 5s
      retries: 3
```
常见健康检查命令：

| 服务类型       | 检查命令                                  |
| ---------- | ------------------------------------- |
| HTTP 服务    | `curl -f http://localhost:端口号/health` |
| MySQL      | `mysqladmin ping -h localhost`        |
| Redis      | `redis-cli ping`                      |
| PostgreSQL | `pg_isready -U 用户名`                   |
### 3.5 日志驱动
容器日志默认无限增长，可能占满整个磁盘，导致服务无法写入数据、无法拉取镜像，甚至系统崩溃。
```yaml
services:
  web:
    image: nginx:1.26-alpine
    logging:
      driver: json-file
      options:
        max-size: "10m"   # 单个日志文件最大 10MB
        max-file: "3"     # 保留 3 个文件(当前 + 2 个轮转历史)
```
参数说明：

|参数|说明|推荐值|
|---|---|---|
|max-size|单个日志文件大小上限|10 m - 50 m|
|max-file|保留的日志文件数量|3 - 5|
|compress|是否压缩轮转后的历史日志|true(json-file 驱动支持)|
### 3.6 重启策略
容器可能因为应用崩溃、内存超限、宿主机重启等原因意外退出。配置重启策略后，Docker 会自动将容器重新拉起。
```yaml
services:
  web:
    image: nginx:1.26-alpine
    restart: unless-stopped
```
重启策略对比：

|策略|行为|适用场景|
|---|---|---|
|no|不自动重启|批处理任务，运行完即可退出|
|always|任何退出都重启|必须持续运行的服务|
|on-failure|仅非正常退出时重启|需要区分正常退出和异常退出|
|unless-stopped|除非手动停止，否则始终重启|生产环境推荐|
### 3.7 敏感信息外部化
在 Compose 文件中硬编码密码、Token、API Key 等敏感信息，会导致这些信息暴露在代码仓库中，造成安全泄露。
1. 创建 .env 文件
```bash
# .env 文件(不要提交到 Git 仓库)
MYSQL_ROOT_PASSWORD=YourStrongPassword123
MYSQL_DATABASE=myapp
MYSQL_USER=appuser
MYSQL_PASSWORD=AppUserPassword456
TZ=Asia/Shanghai
```
2. 在 Compose 文件中引用
```yaml
services:
  db:
    image: mysql:5.7.40
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
      - MYSQL_DATABASE=${MYSQL_DATABASE}
      - MYSQL_USER=${MYSQL_USER}
      - MYSQL_PASSWORD=${MYSQL_PASSWORD}
      - TZ=${TZ}
```
3. 设置 .env 文件权限
```bash
chmod 600 .env   # 仅当前用户可读写
```
### 3.8 网络分层
默认情况下，Compose 会为所有服务创建一个共享网络，所有容器可以互相通信。如果 Web 容器被攻破，攻击者可以直接访问数据库。网络分层通过限制通信路径，减少横向渗透的风险。
```yaml
version: '3.8'

services:
  web:
    image: nginx:1.26-alpine
    networks:
      - frontend
    # Web 只连接 frontend，无法访问 database 网络

  app:
    image: myapp:1.0.0
    networks:
      - frontend
      - backend
    # App 同时连接两个网络，作为前后端的桥梁

  db:
    image: mysql:5.7.40
    networks:
      - backend
    # DB 只连接 backend，Web 完全无法访问

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
```
网络分层架构图：
```text
外部用户 → frontend网络 → Web容器 → frontend网络 → App容器 → backend网络 → DB容器
```
### 3.9 文件权限设置
当容器挂载宿主机目录时，如果容器内用户的 UID 与宿主机目录的 owner UID 不一致，会导致 `Permission denied` 错误。
1. 确定容器内用户的 UID
```bash
# 查看官方镜像的用户 UID
docker run --rm nginx:1.26-alpine id nginx
# 输出: uid=101(nginx) gid=101(nginx)
```
2. 在宿主机上创建目录并设置权限
```bash
# 创建目录
sudo mkdir -p /data/nginx/html

# 将目录所有者改为容器内用户的 UID(Nginx 是 101)
sudo chown -R 101:101 /data/nginx/html

# 设置合适的目录权限
sudo chmod 755 /data/nginx/html
```
3. 在 Compose 中挂载
```yaml
services:
  web:
    image: nginx:1.26-alpine
    user: 101:101   # 与宿主机目录 owner 一致
    volumes:
      - /data/nginx/html:/usr/share/nginx/html
```
### 3.10 防火墙规则设置
即使 Compose 中映射了端口(如 `-p 8080:80`)，如果宿主机的防火墙没有开放该端口，外部可能会造成无法访问。防火墙是保护服务器的第一道防线。
```bash
# 1. 查看当前开放的端口
sudo firewall-cmd --list-ports

# 2. 放行需要的端口(如 Web 服务的 8080 端口)
sudo firewall-cmd --add-port=8080/tcp --permanent

# 3. 限制访问来源(只允许内网 IP 访问)
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.0.0/16" port port="8080" protocol="tcp" accept'

# 4. 将 docker0 网桥加入 trusted 区域(解决容器间通信问题)
sudo firewall-cmd --zone=trusted --add-interface=docker0 --permanent

# 5. 重新加载防火墙配置
sudo firewall-cmd --reload

# 6. 验证配置
sudo firewall-cmd --list-all
```
-- -
## 四、完整的生产级 Compose 模板
### 4.1 项目目录结构
```text
/opt/docker/myapp/
├── docker-compose.yml
├── .env
├── html/                    # Web 静态文件
│   └── index.html
├── config/                  # 应用配置文件
│   └── app.conf
└── data/                    # 数据库数据目录
    └── mysql/
```
### 4.2 .env 文件
```bash
# .env - 敏感信息与配置(权限 600，不提交 Git)

# 时区
TZ=Asia/Shanghai

# MySQL 配置
MYSQL_ROOT_PASSWORD=YourStrongRootPassword
MYSQL_DATABASE=myapp
MYSQL_USER=appuser
MYSQL_PASSWORD=YourAppPassword

# Redis 配置
REDIS_PASSWORD=YourRedisPassword

# 应用配置
APP_ENV=production
APP_DEBUG=false
```
### 4.3 docker-compose.yml
```yaml
version: '3.8'

# ============================================================
# 网络分层定义
# ============================================================
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
  database:
    driver: bridge

# ============================================================
# 数据卷定义
# ============================================================
volumes:
  db_data:
  redis_data:

# ============================================================
# 服务定义
# ============================================================
services:

  # ----------------------------------------------------------
  # 1. Web 服务(Nginx)
  # ----------------------------------------------------------
  web:
    # 1.1 镜像版本固定
    image: nginx:1.26-alpine
    # 1.2 非 root 运行(Nginx 默认用户 nginx，UID=101)
    user: 101:101
    # 1.3 容器名称
    container_name: myapp-web
    # 1.4 重启策略
    restart: unless-stopped
    # 1.5 端口映射(宿主机端口：容器端口)
    ports:
      - "8080:80"
    # 1.6 网络分层：只连接 frontend
    networks:
      - frontend
    # 1.7 数据卷挂载
    volumes:
      - ./html:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    # 1.8 资源限制
    cpus: '0.5'
    mem_limit: 256M
    mem_reservation: 128M
    # 1.9 健康检查
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
      timeout: 3s
      start_period: 5s
      retries: 3
    # 1.10 日志驱动
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    # 1.11 依赖关系
    depends_on:
      - app

  # ----------------------------------------------------------
  # 2. 应用服务(后端应用)
  # ----------------------------------------------------------
  app:
    # 2.1 镜像版本固定
    image: myapp:1.0.0
    # 2.2 非 root 运行
    user: 1000:1000
    # 2.3 容器名称
    container_name: myapp-app
    # 2.4 重启策略
    restart: unless-stopped
    # 2.5 网络分层：同时连接 frontend 和 backend(作为桥梁)
    networks:
      - frontend
      - backend
    # 2.6 数据卷挂载(配置文件、日志等)
    volumes:
      - ./config:/app/config:ro
      - ./logs:/app/logs
    # 2.7 环境变量(从 .env 读取)
    environment:
      - TZ=${TZ}
      - APP_ENV=${APP_ENV}
      - APP_DEBUG=${APP_DEBUG}
      - DB_HOST=db
      - DB_PORT=3306
      - DB_DATABASE=${MYSQL_DATABASE}
      - DB_USERNAME=${MYSQL_USER}
      - DB_PASSWORD=${MYSQL_PASSWORD}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
    # 2.8 资源限制
    cpus: '1.0'
    mem_limit: 512M
    mem_reservation: 256M
    # 2.9 健康检查
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      start_period: 15s
      retries: 3
    # 2.10 日志驱动
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    # 2.11 依赖关系(等待数据库和缓存就绪)
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  # ----------------------------------------------------------
  # 3. 数据库服务(MySQL)
  # ----------------------------------------------------------
  db:
    # 3.1 镜像版本固定
    image: mysql:5.7.40
    # 3.2 非 root 运行(MySQL 默认用户 mysql，UID=999)
    user: 999:999
    # 3.3 容器名称
    container_name: myapp-db
    # 3.4 重启策略
    restart: unless-stopped
    # 3.5 网络分层：只连接 database 网络(App 通过 backend 访问)
    networks:
      - backend
    # 3.6 数据卷挂载(使用命名卷持久化数据)
    volumes:
      - db_data:/var/lib/mysql
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro
    # 3.7 环境变量(从 .env 读取)
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
      - MYSQL_DATABASE=${MYSQL_DATABASE}
      - MYSQL_USER=${MYSQL_USER}
      - MYSQL_PASSWORD=${MYSQL_PASSWORD}
      - TZ=${TZ}
    # 3.8 资源限制
    cpus: '1.0'
    mem_limit: 1G
    mem_reservation: 512M
    # 3.9 健康检查
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 30s
      timeout: 10s
      start_period: 60s
      retries: 5
    # 3.10 日志驱动
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # ----------------------------------------------------------
  # 4. 缓存服务(Redis)
  # ----------------------------------------------------------
  redis:
    # 4.1 镜像版本固定
    image: redis:7.0-alpine
    # 4.2 非 root 运行(Redis 默认用户 redis，UID=999)
    user: 999:999
    # 4.3 容器名称
    container_name: myapp-redis
    # 4.4 重启策略
    restart: unless-stopped
    # 4.5 网络分层：只连接 backend 网络
    networks:
      - backend
    # 4.6 数据卷挂载(持久化 Redis 数据)
    volumes:
      - redis_data:/data
    # 4.7 启动命令(需要设置密码)
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    # 4.8 环境变量
    environment:
      - TZ=${TZ}
    # 4.9 资源限制
    cpus: '0.5'
    mem_limit: 256M
    mem_reservation: 128M
    # 4.10 健康检查
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 30s
      timeout: 5s
      retries: 3
    # 4.11 日志驱动
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```
-- -
## 五、模板使用指南
### 5.1 快速开始
```bash
# 1. 创建项目目录
mkdir -p /opt/docker/myapp
cd /opt/docker/myapp

# 2. 创建 .env 文件，填写配置
cp .env.example .env
chmod 600 .env
vi .env

# 3. 创建必要的目录
mkdir -p html logs config

# 4. 启动所有服务
docker compose up -d

# 5. 验证服务状态
docker compose ps
docker compose logs

# 6. 查看健康状态
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```
### 5.2 常用运维命令
|操作|命令|说明|
|---|---|---|
|启动所有服务|`docker compose up -d`|后台启动|
|停止所有服务|`docker compose down`|停止并移除容器|
|停止但保留数据|`docker compose stop`|只停止容器，不删除|
|查看状态|`docker compose ps`|查看所有服务状态|
|查看日志|`docker compose logs -f`|实时查看所有日志|
|查看特定服务日志|`docker compose logs -f web`|只看 Web 服务日志|
|进入容器|`docker compose exec web sh`|进入 Web 容器 Shell|
|重启服务|`docker compose restart web`|重启 Web 服务|
|更新并重启|`docker compose up -d --build`|重新构建镜像并启动|
|清理|`docker compose down -v`|停止并删除所有数据卷|
-- -
## 六、检查清单
在将 Compose 文件部署到生产环境之前，请逐项确认：

|序号|检查项|状态|
|---|---|---|
|1|所有镜像使用了具体版本号(非 latest)|☐|
|2|所有服务配置了非 root 用户(user: UID:GID)|☐|
|3|所有服务配置了资源限制(mem_limit 和 cpus)|☐|
|4|所有对外服务配置了健康检查(healthcheck)|☐|
|5|所有服务配置了日志轮转(logging.options)|☐|
|6|所有服务配置了重启策略(restart: unless-stopped)|☐|
|7|敏感信息已从 Compose 移除，使用 .env 引用|☐|
|8|.env 文件权限为 600，且未提交到 Git|☐|
|9|网络分层配置正确(frontend/backend/database)|☐|
|10|宿主机挂载目录的 owner 与容器内用户 UID 匹配|☐|
|11|防火墙已放行必要端口|☐|
|12|数据库等内部服务未对外映射端口|☐|
|13|生产环境的 Compose 已通过 `docker compose config` 验证语法|☐|
-- -
## 七、进阶优化策略
按需选择情况进行优化。
### 7.1 `profiles`(按需启动)
当你的 Compose 项目里有多个服务，但某些服务(如监控组件、测试工具)并非每次都需要启动时，可以用 `profiles` 控制。
```yaml
services:
  app:
    image: myapp:1.0.0
    # 默认启动

  phpmyadmin:
    image: phpmyadmin:latest
    profiles:
      - dev
      - debug
    # 默认不启动，需要加 --profile dev 才启动
```
启动方式：
```bash
# 只启动默认服务
docker compose up -d

# 启动默认 + dev 配置下的服务
docker compose --profile dev up -d
```
适用场景：开发和调试时启用辅助工具，生产环境不启动，避免暴露额外的攻击面。
### 7.2 `extends`(配置复用)
当你有多个服务共享相同配置(如日志驱动、资源限制、重启策略)时，用 extends 可以避免重复编写相同代码，提高配置的可维护性。
```yaml
# base-services.yaml
services:
  base-app:
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```
调用 base-services.yaml
```
# docker-compose.yml
services:
  web:
    extends:
      file: base-services.yaml
      service: base-app
    image: nginx:1.26-alpine

  app:
    extends:
      file: base-services.yaml
      service: base-app
    image: myapp:1.0.0
```
适用场景：微服务项目(10+ 个服务需要统一配置)，单体项目用不上。
### 7.3 `ontainer_name` 的命名冲突
模板里每个服务都配置了固定的 container_name。这个做法的好处是方便识别和运维，但在多项目场景下需要特别注意：如果两个项目在同一个目录下启动，或者不同目录下但使用了相同的 container_name，会报容器名冲突的错误。

如果你的生产环境是“一个目录一个项目”，使用固定 container_name 是合适的。如果存在多个项目可能部署在同一台宿主机上，建议删除 container_name，让 Compose 自动生成唯一名称。
### 7.4 depends_on 的局限性
模板中使用了 depends_on: condition: service_healthy，这是正确的做法。但需要说明一点：depends_on 只控制启动顺序，不控制“服务已完全就绪”。即使你配置了 condition: service_healthy，健康检查是定期执行的(如每 30 秒一次)，App 可能在第一次健康检查通过前就已经启动了。

如果 App 启动速度比数据库健康检查通过更快，可能会有一瞬间的连接失败。对于大多数应用，应用本身的重试机制可以解决这个问题。如果应用不支持重试，可以考虑在应用启动脚本中添加等待逻辑：
```bash
# 在应用启动脚本中添加
while ! nc -z db 3306; do
  echo "Waiting for database..."
  sleep 2
done
```
### 7.5 自定义网络时避免子网冲突
模板中定义了 frontend、backend、database 三个网络，但没有指定子网。当 Docker 自动分配子网时，默认从 172.17.0.0/16 开始往后分配。

如果同一台宿主机上有多个 Compose 项目，或者宿主机本身的内网 IP 正好在 172.17.0.0/16 网段内，可能会出现 IP 冲突，导致容器无法访问宿主机内网资源。

```yaml
networks:
  frontend:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/24
```
-- -
## 八、总结
这份生产模板将 Docker Compose 的十个核心安全配置项整合在一起，形成了一份可直接复用的标准配置。
模板的核心价值：
1. 标准化：所有服务采用统一的配置模式，降低了人为遗漏风险。
2. 安全基线：包含了非 root 运行、网络分层、敏感信息外部化等关键安全措施。
3. 可运维性：健康检查、日志轮转、重启策略保证了服务稳定运行。
4. 可复用性：一份模板可复制到不同项目，只需修改镜像名和环境变量。
生产环境使用建议：
- 将这份模板复制到新项目后，先修改 image 和 environment 部分。
- 在部署前执行 docker compose config 验证 YAML 语法。
- 部署后执行 docker compose ps 确认所有服务状态为 Up。
- 定期更新基础镜像版本(如 Nginx、MySQL)，修复安全漏洞。
