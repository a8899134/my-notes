## 一、Docker Compose 概念
### 1.1 Compose 介绍
Docker Compose 是一个用于定义和运行多容器 Docker 应用的工具。你可以通过一个 YAML 文件来配置应用的所有服务(如 Web 服务、数据库、缓存等)，然后只需一条命令就能启动所有服务。

打个比方：
- 不使用 Compose 时，你需要像“手工炒菜”一样，逐个启动每个容器，还要记住它们的启动顺序、网络配置、数据卷挂载等细节。如果涉及 5 个服务，就要敲 5 条 `docker run` 命令，而且每条命令都很长。
- 使用 Compose 后，你只需要把所有的“菜谱”写在一个文件里(`docker-compose.yml`)，然后一键执行，所有服务就按照你定义的方式依次启动。
再换个比喻：
- 单个 `docker run` 命令就像控制一盏灯的开关。
- Docker Compose 就像整个房子的智能家居总控面板，一键可以控制灯光、空调、窗帘、安防系统同时联动工作。
### 1.2 Docker Compose 作用
在真实的生产环境中，一个应用通常由多个服务组成：
- 一个 Web 前端(如 Nginx)
- 一个后端应用(如 Java Spring Boot)
- 一个数据库(如 MySQL)
- 一个缓存服务(如 Redis)
- 一个消息队列(如 RabbitMQ)

使用 `docker run` 逐个启动这些容器，会遇到以下问题：

|问题|说明|
|---|---|
|命令冗长|每个容器的启动命令都很长，容易出错|
|启动顺序|需要手动控制容器启动顺序(如先启动数据库，再启动应用)|
|网络配置|需要手动创建网络并连接各个容器|
|环境变量|每个容器的环境变量需要单独传递|
|复制困难|开发环境、测试环境、生产环境的配置难以复用|
|团队协作|团队成员需要分别了解每个服务的启动参数|

Docker Compose 完美解决了这些问题：
- 所有配置集中在一个 YAML 文件中。
- 支持定义服务依赖关系(如 Web 服务依赖数据库)。
- 自动创建共享网络，服务之间通过服务名自动通信。
- 支持环境变量文件(`.env`)，便于不同环境切换。
- 配置文件可版本控制，团队共享。
### 1.3 Compose 的核心概念
| 概念          | 说明                                         |
| ----------- | ------------------------------------------ |
| 服务(Service) | 一个容器的配置定义(镜像、端口、环境变量等)，对应 `docker run` 的参数 |
| 项目(Project) | 由一组服务组成的完整应用，由一个 `docker-compose.yml` 文件定义 |
| 网络(Network) | Compose 自动为项目创建默认网络，所有服务自动加入该网络            |
| 数据卷(Volume) | 用于数据持久化和服务间数据共享                            |

简单说：一个 docker-compose.yml 文件 = 一个项目 = 多个服务 = 多个容器。

## 二、安装 Docker Compose
### 2.1 Compose 版本
Docker Compose 有两个主要版本，使用方式不同：

| 对比维度  | Compose V 1(旧版)        | Compose V 2(新版)         |
| ----- | ---------------------- | ----------------------- |
| 命令格式  | `docker-compose`(带短横线) | `docker compose`(用空格分隔) |
| 安装方式  | 独立二进制文件                | Docker 引擎内置插件           |
| 功能完整性 | 基本功能                   | 功能更全，持续更新               |
| 状态    | 已停止维护                  | 当前主流，推荐使用               |

生产环境强烈推荐使用 Compose V2。
### 2.2 Compose V2 安装
在系统 上，如果按照标准方式安装 Docker(使用官方或阿里云源)，Compose V2 插件会自动安装。
```bash
# 验证 Compose 是否可用，正常输出Docker Compose version v2.27.0
docker compose version

# 安装compose
sudo dnf install -y docker-compose-plugin

# 查看版本
docker compose version
```
生产环境提示：如果在内网离线环境，请在联网机器下载 docker-compose-plugin 的 RPM 包，传输到内网后用 dnf localinstall 安装。

## 三、docker-compose.yml 文件详解
### 3.1 文件结构概览
一个 `docker-compose.yml` 文件主要包含以下顶级元素：
```yaml
# 版本号(指定 Compose 文件格式版本)
version: '3.8'

# 定义所有服务
services:
  服务名1:
    # 服务配置
  服务名2:
    # 服务配置

# 定义网络(可选)
networks:
  网络名:
    # 网络配置

# 定义数据卷(可选)
volumes:
  数据卷名:
    # 数据卷配置
```
### 3.2 完整的示例
以下是一个包含 Web 服务 + 数据库服务的完整示例，我们先展示全貌，然后逐行拆解。
docker-compose.yml：
```yaml
version: '3.8'

services:
  web:
    image: nginx:1.26-alpine
    container_name: my-web
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html
    networks:
      - appnet
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: mysql:5.7
    container_name: my-db
    environment:
      MYSQL_ROOT_PASSWORD: secret
      MYSQL_DATABASE: myapp
    volumes:
      - dbdata:/var/lib/mysql
    networks:
      - appnet
    restart: unless-stopped

networks:
  appnet:
    driver: bridge

volumes:
  dbdata:
```
1. version(版本号)
```yaml
version: '3.8'
```
- 指定 Compose 文件格式的版本号。
- 目前生产环境推荐使用 `'3.8'` 或 `'3.9'`。
- 不同版本支持的语法和功能不同，建议使用最新的 3.x 版本。

2. services(服务定义)
```yaml
services:
  web:
  db:
```
- `services` 下定义应用中的所有服务。
- 每个服务对应一个容器。
- 服务名(如 `web`、`db`)可以自定义，在容器间通信时作为主机名使用。

3. image(使用镜像)
```yaml
image: nginx:1.26-alpine
```
- 指定服务使用的镜像名称和标签。
- 与 `docker run` 中的镜像名用法一致。
- 也可以使用私有仓库的镜像，如 `harbor.internal.com/project/nginx:1.26`。

4. container_name(容器名)
```yaml
container_name: my-web
```
- 指定容器的名称。
- 如果不指定，Docker Compose 会自动生成名称，格式为 `项目名_服务名_序号`。
- 建议显式命名，便于管理。

5. ports(端口映射)
```yaml
ports:
  - "8080:80"
```
- 与 `docker run -p` 参数作用相同。
- 格式：`"宿主机端口:容器端口"`。
- 支持指定 IP：`"127.0.0.1:8080:80"`。
- 支持 UDP：`"53:53/udp"`。

6. volumes(数据卷挂载)
```yaml
volumes:
  - ./html:/usr/share/nginx/html
  - dbdata:/var/lib/mysql
```
- 与 `docker run -v` 参数作用相同。
- `./html:/usr/share/nginx/html`：绑定挂载，将宿主机的 `./html` 目录挂载到容器内。
- `dbdata:/var/lib/mysql`：数据卷挂载，使用名为 `dbdata` 的数据卷。

7. environment(环境变量)
```yaml
environment:
  MYSQL_ROOT_PASSWORD: secret
  MYSQL_DATABASE: myapp
```
- 与 `docker run -e` 参数作用相同。
- 设置容器内的环境变量。
- 生产环境敏感信息不要明文写在文件中，应使用 .env 文件或 secrets。

8. networks(网络配置)
```yaml
networks:
  - appnet
```
- 将服务连接到指定的网络。
- 同一网络中的服务可以通过服务名互相访问。
- 本文底部定义了 `appnet` 网络。

9. depends_on(依赖关系)
```yaml
depends_on:
  - db
```
- 指定服务之间的启动顺序依赖。
- `web` 服务会等待 `db` 服务启动后才启动。
- 注意：`depends_on` 只控制启动顺序，不等待服务就绪(如需等待就绪，需使用 `healthcheck`)。

10. restart(重启策略)
```yaml
restart: unless-stopped
```
- 与 `docker run --restart` 参数作用相同。
- 可选值：`no`、`always`、`on-failure`、`unless-stopped`。
- 生产环境推荐 `unless-stopped`。

## 四、常用 Compose 命令
### 4.1 命令格式
Compose V 2 的命令格式为：
```bash
docker compose [选项] [子命令] [服务名...]
```
### 4.2 启动所有服务
```bash
# 启动所有服务(前台运行，日志输出到终端)
docker compose up

# 后台启动所有服务(推荐生产环境)
docker compose up -d

# 启动指定服务
docker compose up -d web

# 启动前重新构建镜像
docker compose up -d --build
```
命令解释：
- `up`：创建并启动所有服务的容器。
- `-d`：detach 模式，后台运行。
- `--build`：启动前强制重新构建镜像(忽略缓存)。
- 首次执行 `docker compose up` 时，会自动创建网络、数据卷等资源。
### 4.3 停止并移除所有服务
```bash
# 停止并移除所有容器、网络(默认保留数据卷)
docker compose down

# 停止并移除所有容器、网络和数据卷
docker compose down -v

# 移除容器、网络、数据卷、镜像
docker compose down --rmi all -v
```
命令解释：
- `down`：停止并移除 `up` 创建的所有资源。
- `-v`：同时删除定义的数据卷(**注意**：会丢失数据)。
- `--rmi all`：删除服务使用的镜像。
- 生产环境慎用 `-v`，避免误删数据。
### 4.4 查看服务状态
```bash
# 查看所有服务的状态
docker compose ps

# 查看指定服务的状态
docker compose ps web
```
命令解释：
- 显示每个服务的容器状态(运行中、已停止等)、端口映射、容器名称等信息。
### 4.5 查看日志
```bash
# 查看所有服务的日志
docker compose logs

# 查看指定服务的日志
docker compose logs web

# 实时跟踪日志
docker compose logs -f

# 查看最近 100 行日志
docker compose logs --tail 100

# 带时间戳查看
docker compose logs -t
```
### 4.6 在运行中的服务中执行命令
```bash
# 进入 web 服务的容器执行 bash
docker compose exec web sh

# 在 web 服务中执行单条命令
docker compose exec web curl http://db:3306

# 在 web 服务中执行命令并设置环境变量
docker compose exec -e DEBUG=1 web python app.py
```
命令解释：
- exec：在运行中的服务容器内执行命令。
- 与 docker exec 用法类似，但直接使用服务名。
### 4.7 停止启动重启服务
```bash
# 停止所有服务
docker compose stop

# 停止指定服务
docker compose stop web

# 启动所有服务(已停止的容器重新运行)
docker compose start

# 启动指定服务
docker compose start web

# 重启所有服务
docker compose restart

# 重启指定服务
docker compose restart web
```
### 4.8 构建或重新构建镜像
```bash
# 构建所有服务的镜像
docker compose build

# 构建指定服务的镜像
docker compose build web

# 构建时不使用缓存
docker compose build --no-cache
```
命令解释：
- `build`：根据 Dockerfile 构建服务的镜像。
- 适用于 `build` 方式定义的服务(非 `image` 方式)。
### 4.9 拉取镜像
```bash
# 拉取所有服务的镜像
docker compose pull

# 拉取指定服务的镜像
docker compose pull web
```
### 4.10 验证配置文件
```bash
# 验证 docker-compose.yml 文件语法
docker compose config
```
命令解释：
- `config`：解析并验证 Compose 文件，输出最终配置。
- 如果配置有误，会显示错误信息。
- 适合在部署前检查配置文件是否正确。
### 4.11 查看容器内的进程
```bash
# 查看所有服务容器内的进程
docker compose top

# 查看指定服务容器内的进程
docker compose top web
```
### 4.12 命令速查表
|命令|说明|
|---|---|
|docker compose up -d|后台启动所有服务|
|docker compose down|停止并移除所有服务|
|docker compose ps|查看服务状态|
|docker compose logs -f|实时查看日志|
|docker compose exec 服务名 sh|进入服务容器|
|docker compose stop 服务名|停止指定服务|
|docker compose start 服务名|启动指定服务|
|docker compose restart 服务名|重启指定服务|
|docker compose build 服务名|构建指定服务镜像|
|docker compose pull 服务名|拉取指定服务镜像|
|docker compose config|验证配置文件|

## 五、高级配置
### 5.1 从 Dockerfile 构建
除了使用现成的 `image`，你也可以在 Compose 文件中指定从 Dockerfile 构建。
```yaml
version: '3.8'

services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile
    # 或者简写为：
    # build: ./app
    ports:
      - "3000:3000"
```
配置解释：

|配置项|说明|
|---|---|
|build|指定构建配置，替代 image|
|context|Dockerfile 所在的目录(构建上下文)|
|dockerfile|Dockerfile 文件名(默认为 Dockerfile)|
|args|构建参数(类似 `--build-arg`)|

带构建参数的示例：
```yaml
services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile.prod
      args:
        VERSION: 1.0.0
        ENV: production
```
### 5.2 environment vs env_file
1. 方式一：直接定义环境变量(适合少量变量)
```yaml
environment:
  DB_HOST: db
  DB_PORT: 3306
  DB_USER: root
```
2. 方式二：从文件读取(推荐生产环境)
```yaml
env_file:
  - .env
  - ./config/db.env
```
env_file 文件示例(.env)：
```yaml
DB_HOST=db
DB_PORT=3306
DB_USER=root
DB_PASSWORD=secret
```
生产环境建议：使用 env_file 而非 environment，因为：
- 敏感信息(如密码)不会暴露在 Compose 文件中。
- 不同环境可以使用不同的 `.env` 文件。
- `.env` 文件可以加入 `.gitignore`，避免提交到版本库。
### 5.3 depends_on + healthcheck
默认 depends_on 只控制启动顺序，不保证服务已完全就绪。如需等待服务就绪，需要配合 healthcheck。
```yaml
services:
  db:
    image: mysql:5.7
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    image: nginx:1.26-alpine
    depends_on:
      db:
        condition: service_healthy
```
healthcheck 配置解释：

|配置项|说明|
|---|---|
|test|健康检查命令(数组或字符串)|
|interval|检查间隔时间|
|timeout|单次检查超时时间|
|retries|连续失败多少次后标记为不健康|
### 5.4 环境变量替换
Compose 文件中支持使用宿主机的环境变量进行替换。
```yaml
services:
  web:
    image: nginx:${NGINX_VERSION:-1.26-alpine}
    ports:
      - "${HOST_PORT:-8080}:80"
```
用法：
- `${VAR}`：使用环境变量 `VAR` 的值。
- `${VAR:-default}`：如果 `VAR` 未设置，使用默认值 `default`。
- 环境变量可以在 `.env` 文件中定义，或在执行 `docker compose` 前通过 `export` 设置。
### 5.5 容器资源限制
Compose 支持为每个服务设置资源限制，与 `docker run --cpus` 和 `--memory` 对应。
```yaml
services:
  web:
    image: nginx:1.26-alpine
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```
配置解释：
- `limits`：硬上限，容器最多使用的资源。
- `reservations`：软下限，系统保证分配的资源。
- 这是 Docker Swarm 模式下的配置，在单机 Compose 中同样生效。

## 六、生产环境最佳实践
### 6.1 配置文件管理
|实践|说明|
|---|---|
|使用版本控制|将 `docker-compose.yml` 提交到 Git 仓库|
|区分环境|使用不同的 Compose 文件(如 `docker-compose.dev.yml`、`docker-compose.prod.yml`)|
|敏感信息不提交|使用 `.env` 文件存放密码，并加入 `.gitignore`|
|固定镜像版本|不使用 `latest` 标签，固定具体版本号|

多环境文件示例：
```bash
# 开发环境
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 生产环境
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```
### 6.2 服务配置规范
| 规范     | 说明                                      |
| ------ | --------------------------------------- |
| 设置重启策略 | `restart: unless-stopped` 确保容器异常退出后自动恢复 |
| 设置资源限制 | 避免单个服务耗尽宿主机资源                           |
| 配置健康检查 | 确保服务真正可用，而非只处于运行状态                      |
| 日志轮转   | 配置 `logging` 驱动限制日志大小                   |
| 只读挂载   | 对于不需要写入的挂载，使用 `read_only: true`         |

包含日志轮转的配置：
```yaml
services:
  web:
    image: nginx:1.26-alpine
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```
### 6.3 网络与安全
|实践|说明|
|---|---|
|使用自定义网络|避免使用默认网络，自定义网络更可控|
|不暴露数据库端口|数据库只连接内部网络，不对外暴露端口|
|使用非 root 用户运行|在 Dockerfile 中创建应用用户，以非 root 身份运行|
|定期更新镜像|使用最新稳定版镜像，修复已知漏洞|
### 6.4 数据持久化
| 实践       | 说明                              |
| -------- | ------------------------------- |
| 数据库使用数据卷 | 使用命名数据卷(Volume)持久化数据库数据         |
| 代码使用绑定挂载 | 开发环境用绑定挂载实现热更新                  |
| 备份数据卷    | 定期备份数据卷内容                       |
| 清理未使用数据卷 | 定期执行 `docker volume prune` 释放空间 |
### 6.5 Compose 文件拆分
对于大型应用，可以将 Compose 文件拆分为多个文件，便于管理。
```bash
# 基础配置
docker-compose.yml
# 开发环境覆盖
docker-compose.override.yml
# 生产环境覆盖
docker-compose.prod.yml
```
使用多文件：
```bash
# 开发环境
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d

# 生产环境
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 七、LNMP 环境完整示例
### 7.1 项目结构
```text
~/lnmp-demo/
├── docker-compose.yml
├── nginx.conf
├── html/
│   └── index.php
└── mysql/
    └── (空目录，用于挂载数据)
```
### 7.2 编写 docker-compose.yml
```yaml
version: '3.8'

services:
  nginx:
    image: nginx:1.24-alpine
    container_name: lnmp_nginx
    ports:
      - "80:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - php
    restart: always

  php:
    image: php:8.2-fpm-alpine
    container_name: lnmp_php
    volumes:
      - ./html:/var/www/html:ro
    environment:
      - MYSQL_HOST=mysql
      - MYSQL_DATABASE=testdb
      - MYSQL_USER=testuser
      - MYSQL_PASSWORD=testpass
    restart: always

  mysql:
    image: mysql:5.7
    container_name: lnmp_mysql
    environment:
      MYSQL_ROOT_PASSWORD: root123
      MYSQL_DATABASE: testdb
      MYSQL_USER: testuser
      MYSQL_PASSWORD: testpass
    volumes:
      - ./mysql:/var/lib/mysql
    restart: always
```
### 7.3 编写 Nginx 配置 nginx.conf
```conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \.php$ {
        fastcgi_pass php:9000;   # 注意：php 是服务名
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }
}
```
### 7.4 编写 html/index.php
```php
<?php
phpinfo();
?>
```
### 7.5 启动
```bash
cd ~/lnmp-demo
docker compose up -d
```
访问 `http://localhost`，如果看到 phpinfo 页面，说明 LNMP 环境搭建成功。