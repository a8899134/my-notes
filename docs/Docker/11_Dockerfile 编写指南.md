## 一、Dockerfile 概念
### 1.1 Dockerfile 概念
Dockerfile 是一个文本文件，里面包含了一条条的指令(Instruction)，每条指令都对应一个步骤，用来自动化地构建 Docker 镜像。

打个比方：
- Dockerfile 就像一份“菜谱”，上面写着做一道菜需要哪些原材料(基础镜像)、每一步做什么(复制文件、安装软件)、最后怎么上桌(启动命令)。
- Docker 镜像 就是按照菜谱做出来的那道菜(成品)。
- Docker 容器 就是这道菜被端上桌开始吃的状态(运行中的实例)。
### 1.2 Dockerfile 作用

| 优势    | 说明                                 |
| ----- | ---------------------------------- |
| 可复现   | 同一份 Dockerfile，在任何环境构建出的镜像理论上一致    |
| 可追溯   | 每条指令都写在文件里，一目了然                    |
| 可版本控制 | 文本文件，可用 Git 管理变更记录和版本历史            |
| 可审计   | 可以逐行审查构建过程，发现安全隐患                  |
| 可自动化  | 可无缝集成 Jenkins、GitLab CI 等 CI/CD 工具 |
### 1.3 Dockerfile 的构建流程
```bash
# 编写 Dockerfile → docker build → 镜像 → docker run → 容器
```
详细流程：
1. 编写 Dockerfile 文件。
2. 执行 `docker build -t 镜像名:标签 .` 命令。
3. Docker 守护进程读取 Dockerfile，逐条执行指令。
4. 每一条指令生成一个只读的镜像层。
5. 所有层叠加在一起，形成最终的镜像。
6. 执行 `docker run 镜像名:标签` 启动容器。
### 1.4 Dockerfile 的基本语法规则
|规则|说明|
|---|---|
|指令大写|如 `FROM`、`RUN`、`COPY`，大小写不敏感但惯例使用大写|
|指令顺序|按从上到下的顺序执行|
|`#` 注释|以 `#` 开头的行是注释，不会被解析|
|每条指令生成一层|每条指令都会在镜像中产生一个新的只读层|
|每条指令独立执行|上一条指令的结果不会影响下一条指令的环境(除了通过文件系统)|
### 1.5 示例(通用版)
以后写 Dockerfile，就照着下面这个骨架填空：
```bash
vim Dockerfile
```
输入以下内容
```dockerfile
# 1. 选个基础系统(尽量用 alpine 或 slim，体积小)
FROM python:3.9-slim

# 2. 指定工作目录(相当于 cd /app)
WORKDIR /app

# 3. 先把依赖文件拷进去(这一步是为了利用缓存，省得每次都重装依赖)
COPY requirements.txt .

# 4. 安装依赖(构建时执行，只跑一次)
RUN pip install --no-cache-dir -r requirements.txt

# 5. 把剩下的所有代码拷进去
COPY . .

# 6. 告诉别人这个容器用哪个端口(只是说明，实际映射还得靠 -p)
EXPOSE 8080

# 7. 容器启动时跑什么命令(每次启动都执行)
CMD ["python", "app.py"]
```
保存后，在同一个目录下执行：
```bash
docker build -t my-nginx:1.0 .
```
有了这个 Dockerfile，执行 `docker build -t myapp .` 就能构建镜像，执行 `docker run myapp` 就能运行容器。
-- -
## 二、常用 Dockerfile 指令详解
### 2.1 FROM：指定基础镜像
FROM 是 Dockerfile 的第一条指令，用于指定构建所基于的基础镜像。

语法：
```dockerfile
FROM [--platform=<平台>] <镜像名>[:<标签>] [AS <别名>]
```
示例：
```dockerfile
# 基于 Alpine Linux 的 Nginx 镜像
FROM nginx:1.26-alpine

# 基于特定版本的 Node.js
FROM node:18.20.0-alpine

# 基于一个阶段别名(用于多阶段构建)
FROM golang:1.21 AS builder
```
注意事项：
- 一个 Dockerfile 中可以出现多个 `FROM` 指令，用于多阶段构建。
- 基础镜像应该尽量选择体积小、安全性高的版本(如 Alpine)。
- 必须使用稳定的官方镜像或可信的私有仓库镜像。
- 生产环境禁止使用 latest 标签，必须指定具体版本号。
### 2.2 RUN：执行命令(构建时)
RUN 在构建镜像时执行命令，通常用于安装软件包、创建目录、下载文件等。
语法(两种形式)：
```dockerfile
# Shell 形式(默认使用 /bin/sh -c)
RUN <命令>

# Exec 形式(推荐，可避免 Shell 解析问题)
RUN ["可执行文件", "参数1", "参数2"]
```
示例：
```dockerfile
# Shell 形式
RUN apt-get update && apt-get install -y curl

# Exec 形式
RUN ["pip", "install", "-r", "requirements.txt"]

# 安装 Alpine 软件包
RUN apk add --no-cache tzdata nginx
```
最佳实践：
- 合并多个 RUN 命令：使用 && 将多个命令合并为一条 RUN，减少层数。
- 清理缓存：在安装软件后删除包管理器缓存，减小镜像体积。
- 使用 --no-cache 等参数：避免缓存占用空间。
错误示例：
```dockerfile
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get clean
```
(三层，体积大)
正确示例：
```dockerfile
RUN apt-get update && apt-get install -y curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
```
(一层，体积小)
### 2.3 COPY：复制文件(推荐)
COPY 将构建上下文(docker build 命令指定的目录)中的文件或目录复制到镜像中的指定路径。
语法：
```dockerfile
COPY [--chown=<用户>:<组>] <源路径>... <目标路径>
COPY [--chown=<用户>:<组>] ["源路径", "目标路径"]  # 路径含空格时使用
```
示例：
```dockerfile
# 复制单个文件
COPY package.json /app/

# 复制整个目录(复制 app 目录下的所有内容到 /app)
COPY app/ /app/

# 复制并设置所有者
COPY --chown=nginx:nginx index.html /usr/share/nginx/html/

# 复制多个文件
COPY package.json package-lock.json /app/
```
COPY vs ADD 的选择：

|场景|推荐使用|原因|
|---|---|---|
|复制本地文件/目录|COPY|语义清晰，功能单一，没有额外操作|
|需要自动解压压缩包|ADD|ADD 支持自动解压 tar 文件|
|需要从 URL 下载|ADD|ADD 支持从 URL 下载文件|
|其他场景|COPY|COPY 行为可预测，更安全|
生产环境建议：优先使用 COPY，除非确实需要 ADD 的自动解压或下载功能。
### 2.4 ADD：增强版复制
ADD 是 COPY 的超集，除了复制文件外，还支持：
- 自动解压本地 tar 压缩包。
- 从 URL 下载文件。
示例：
```dockerfile
# 自动解压 tar 文件
ADD app.tar.gz /app/

# 从 URL 下载
ADD https://example.com/file.tar.gz /tmp/
```
注意事项：
- ADD 从 URL 下载的文件不会被缓存，每次构建都会重新下载。
- 自动解压功能在某些情况下可能导致意外行为，需谨慎使用。
- 生产环境建议：尽量使用 COPY，只在需要解压或下载时使用 ADD。
### 2.5 WORKDIR：设置工作目录
WORKDIR 为后续的 RUN、CMD、ENTRYPOINT、COPY、ADD 指令设置工作目录。
语法：
```dockerfile
WORKDIR <目录路径>
```
示例：
```dockerfile
WORKDIR /app
RUN npm install
COPY . .
CMD ["node", "server.js"]
```
注意事项：
- 如果目录不存在，WORKDIR 会自动创建。
- 可以多次使用 WORKDIR，路径为相对于前一个 WORKDIR 的相对路径。
- 建议将 WORKDIR 放在 Dockerfile 的靠前位置，统一所有命令的执行路径。
```dockerfile
WORKDIR /app
WORKDIR backend      # 实际为 /app/backend
WORKDIR /var/log     # 使用绝对路径切换
```
### 2.6 ENV：设置环境变量
ENV 为镜像设置环境变量，这些变量在构建过程中和容器运行时都可用。
语法：
```dockerfile
ENV <键> <值>
ENV <键>=<值> <键>=<值> ...
```
示例：
```dockerfile
ENV NODE_ENV production
ENV APP_PORT 3000
ENV DB_HOST=db.example.com DB_USER=appuser
```
注意事项：
- 生产环境不要在 ENV 中硬编码密码、Token 等敏感信息(会暴露在镜像层中)。
- 环境变量可以在后续的 `RUN` 中使用 `$变量名` 引用。
- 可以在容器运行时通过 `-e` 参数覆盖。
### 2.7 EXPOSE：声明暴露端口
EXPOSE 用于声明容器在运行时监听的端口。它不会实际映射端口，只起到文档说明作用，并可在 docker run -P(大写 P)时自动映射。
语法：
```dockerfile
EXPOSE <端口>[/<协议>] ...
```
示例：
```dockerfile
# 声明 TCP 端口 80
EXPOSE 80

# 声明 UDP 端口 53
EXPOSE 53/udp

# 声明多个端口
EXPOSE 80 443 8080
```
注意事项：
- EXPOSE 是文档性指令，不会实际打开端口。
- 实际端口映射仍需要在 docker run 时使用 -p 参数。
- 可以声明多个 EXPOSE 指令。
### 2.8 CMD：容器启动命令(可被覆盖)
CMD 指定容器启动时执行的命令。一个 Dockerfile 中只能有一个 CMD，如果有多个，只有最后一个生效。
语法(三种形式)：
```dockerfile
# Exec 形式(推荐)
CMD ["可执行文件", "参数1", "参数2"]

# Shell 形式(不推荐)
CMD 可执行文件 参数1 参数2

# 作为 ENTRYPOINT 的默认参数
CMD ["参数1", "参数2"]
```
示例：
```dockerfile
# Exec 形式(推荐)
CMD ["nginx", "-g", "daemon off;"]

# Shell 形式(不推荐，会通过 /bin/sh -c 执行)
CMD nginx -g "daemon off;"
```
覆盖方式：
```bash
# 运行容器时追加命令，会覆盖 CMD
docker run my-image /bin/bash
```
### 2.9 ENTRYPOINT：入口点(不可被覆盖)
ENTRYPOINT 指定容器启动时执行的主命令，与 CMD 配合使用。docker run 后面的参数会作为 ENTRYPOINT 命令的参数追加，而不是覆盖。
语法：
```dockerfile
# Exec 形式(推荐)
ENTRYPOINT ["可执行文件", "参数1", "参数2"]

# Shell 形式(不推荐)
ENTRYPOINT 可执行文件 参数1 参数2
```
CMD 与 ENTRYPOINT 的配合：

|配置方式|效果|适用场景|
|---|---|---|
|只有 CMD| `docker run` 参数覆盖 CMD|简单应用，默认命令可随意替换|
|只有 ENTRYPOINT| `docker run` 参数作为 ENTRYPOINT 的参数|容器必须运行特定命令|
|ENTRYPOINT + CMD|ENTRYPOINT 固定，CMD 作为默认参数|灵活配置(最常用)|
示例：
```dockerfile
ENTRYPOINT ["/app/start.sh"]
CMD ["--config", "/etc/app/config.yaml"]
```
运行效果：
```bash
# 使用默认 CMD
docker run myapp
# 实际执行：/app/start.sh --config /etc/app/config.yaml

# 自定义参数
docker run myapp --config /custom/config.yaml
# 实际执行：/app/start.sh --config /custom/config.yaml
```
### 2.10 USER：切换执行用户
USER 指定后续指令的执行用户(以非 root 身份运行，提高安全性)。
语法：
```dockerfile
USER <用户名>[:<用户组>]
USER <UID>[:<GID>]
```
示例：
```dockerfile
# 创建专用用户并切换
RUN addgroup -g 1000 appuser && adduser -u 1000 -G appuser -D appuser
USER appuser

# 或使用 UID
USER 1000:1000
```
生产环境安全提醒：容器内默认以 root 运行。强烈建议创建专用用户并以该用户身份运行应用，遵循最小权限原则。
### 2.11 VOLUME：声明数据卷
VOLUME 声明一个或多个数据卷挂载点，用于数据持久化或容器间数据共享。
语法：
```dockerfile
VOLUME <路径>
VOLUME ["路径1", "路径2"]
```
示例：
```dockerfile
# 声明 /data 为数据卷
VOLUME /data

# 声明多个数据卷
VOLUME ["/var/lib/mysql", "/var/log/mysql"]
```
注意事项：
- `VOLUME` 只是声明，实际挂载在 `docker run` 时指定。
- 指定为数据卷的目录，容器内对该目录的写入会持久化保存。
- 该指令不能指定宿主机路径，宿主机路径应在 `docker run` 或 Compose 中配置。
### 2.12 LABEL：添加元数据标签
`LABEL` 为镜像添加键值对形式的元数据，用于组织、分类和检索镜像。
语法：
```dockerfile
LABEL <键>=<值> <键>=<值> ...
```
示例：
```dockerfile
LABEL maintainer="devops@example.com"
LABEL version="1.0.0"
LABEL description="My application image"
```
生产用途：
- 标记维护者信息。
- 标记版本和构建信息。
- 便于在镜像仓库中筛选和分类。
### 2.13 ARG：构建参数
ARG 定义构建时传递的参数，在构建过程中可用，镜像构建完成后不保留在镜像中。
语法：
```dockerfile
ARG <变量名>[=<默认值>]
```
示例：
```dockerfile
ARG VERSION=latest
FROM nginx:${VERSION}
```
传递方式：
```bash
docker build --build-arg VERSION=1.26 -t mynginx:1.26 .
```
### 2.14 ONBUILD：延迟指令
`ONBUILD` 为镜像设置触发器，当该镜像被用作另一个 Dockerfile 的基础镜像时，触发的指令会执行。
示例：
```dockerfile
ONBUILD COPY . /app
ONBUILD RUN npm install
```
适用场景：构建基础镜像，让子镜像自动执行某些操作。
### 2.15 SHELL：更改 Shell
SHELL 更改默认 Shell，影响后续的 Shell 形式命令。
示例：
```dockerfile
# 改为使用 /bin/bash
SHELL ["/bin/bash", "-c"]
RUN echo "Hello"
```
-- -
## 三、Dockerfile 编写最佳实践
### 3.1 尽量选择体积小的基础镜像
| 镜像 | 大小(压缩后) | 说明 |
|------|-------------|------|
| alpine | ~5MB | 基于 musl libc，轻量，但可能缺少某些 glibc 依赖 |
| slim | ~50-100MB | 基于 Debian/Ubuntu，去掉了很多工具，体积适中 |
| 完整版 | ~500MB+ | 包含完整工具链，适合调试，不推荐生产使用 |
生产环境推荐：优先选择 Alpine 或 Distroless，默认情况下体积更小、攻击面更少。
### 3.2 利用构建缓存
Docker 在构建镜像时，会尝试复用之前的缓存层。只有当某层的指令或文件发生变化时，该层及之后的层才会重新构建。
缓存生效条件：
- FROM：基础镜像必须相同。
- RUN：命令字符串必须完全相同。
- COPY / ADD：文件的哈希值(内容)必须相同。
最佳实践：
- 将不常变化的指令放在前面(如 `FROM`、`ENV`、`RUN apt-get update`)。
- 将频繁变化的指令放在最后(如 `COPY . .`)。
- 这样可以利用缓存加速构建过程。
错误示例(缓存几乎无效)：
```dockerfile
FROM node:18
COPY . .
RUN npm install
RUN npm run build
```
正确示例(缓存最大化)：
```dockerfile
FROM node:18
WORKDIR /app
COPY package.json package-lock.json .
RUN npm install          # 只有 package.json 变化时才重新安装
COPY . .                 # 代码变化不影响依赖安装层
RUN npm run build
```
### 3.3 合并 RUN 指令
每个 `RUN` 指令都会生成一个新的镜像层，过多的层会增加镜像体积。
错误示例(3 层)：
```dockerfile
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get clean
```
正确示例(1 层)：
```dockerfile
RUN apt-get update && apt-get install -y curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
```
### 3.4 清理缓存和临时文件
在安装软件后，及时清理包管理器的缓存和临时文件，避免它们被保留在镜像中。
Alpine(apk)：
```dockerfile
RUN apk add --no-cache tzdata nginx
# --no-cache 不会在本地保存缓存
```
Debian/Ubuntu(apt)：
```dockerfile
RUN apt-get update && apt-get install -y curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
```
通用清理：
```dockerfile
RUN rm -rf /tmp/* /var/tmp/*
```
### 3.5 使用 .dockerignore 文件
`.dockerignore` 文件的作用与 `.gitignore` 类似，指定哪些文件和目录**不被**发送到 Docker 构建上下文。
示例 .dockerignore：
```text
node_modules/
.git/
*.log
*.tmp
README.md
.env
Dockerfile
.dockerignore
```
好处：
- 减小构建上下文的大小，加快构建速度。
- 避免敏感信息(如 `.env`)被意外打包进镜像。
- 避免无关文件(如 `node_modules`)被包含在镜像中。
### 3.6 固定版本号
禁止使用 latest。在生产环境中，所有镜像和依赖都应锁定具体版本。
错误示例：
```dockerfile
FROM node:latest
RUN apk add curl
```
**正确示例**：
```dockerfile
FROM node:18.20.0-alpine
RUN apk add --no-cache curl=8.4.0-r0
```
### 3.7 最小权限原则
- 创建专用用户运行应用，不要以 root 运行。
- 只安装必要的软件包。
- 只暴露必要的端口。
- 只复制必要的文件。
示例：
```dockerfile
FROM node:18-alpine

# 创建非 root 用户
RUN addgroup -g 1000 appuser && adduser -u 1000 -G appuser -D appuser

WORKDIR /app

# 以 appuser 身份运行
USER appuser

COPY --chown=appuser:appuser . .

CMD ["node", "server.js"]
```
### 3.8 多阶段构建
多阶段构建允许在同一个 Dockerfile 中使用多个 `FROM` 指令，在不同阶段使用不同的基础镜像，最终只将必要的产物复制到最终镜像中。
示例(Go 应用)：
```dockerfile
# 阶段 1：构建阶段(使用完整 Golang 镜像)
FROM golang:1.21 AS builder
WORKDIR /app
COPY go.mod go.sum .
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o myapp .

# 阶段 2：运行阶段(使用最小镜像)
FROM alpine:3.18
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /app/myapp .
EXPOSE 8080
ENTRYPOINT ["./myapp"]
```
好处：
- 最终镜像只包含运行产物，不含构建工具和源代码。
- 镜像体积大幅减小(从 ~800 MB 降到 ~20 MB)。
- 构建环境与运行环境解耦。
-- -
## 四、完整 Dockerfile 示例
### 4.1 示例一：Nginx 静态网站
```dockerfile
# 使用官方 Nginx 镜像(基于 Alpine)
FROM nginx:1.26-alpine

# 添加维护者标签
LABEL maintainer="devops@example.com"
LABEL version="1.0.0"

# 删除默认的欢迎页
RUN rm -rf /usr/share/nginx/html/*

# 复制自定义网页文件
COPY ./html /usr/share/nginx/html

# 复制自定义 Nginx 配置文件
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# 声明暴露 80 端口
EXPOSE 80

# 使用 Nginx 的默认启动命令
CMD ["nginx", "-g", "daemon off;"]
```
### 4.2 示例二：Node.js 应用(多阶段构建)
```dockerfile
# ========== 构建阶段 ==========
FROM node:18.20.0-alpine AS builder

WORKDIR /app

# 复制依赖文件(利用构建缓存)
COPY package.json package-lock.json ./
RUN npm ci --only=production

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# ========== 运行阶段 ==========
FROM node:18.20.0-alpine

# 创建非 root 用户
RUN addgroup -g 1000 appuser && adduser -u 1000 -G appuser -D appuser

WORKDIR /app

# 从构建阶段复制必要的文件和依赖
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/package.json ./

# 切换为非 root 用户
USER appuser

# 声明端口
EXPOSE 3000

# 启动应用
CMD ["node", "dist/server.js"]
```
### 4.3 示例三：Java Spring Boot 应用
```dockerfile
# 使用 OpenJDK
FROM openjdk:17-jre-slim

# 添加维护者标签
LABEL maintainer="devops@example.com"

# 创建非 root 用户
RUN addgroup -g 1000 appuser && adduser -u 1000 -G appuser -D appuser

WORKDIR /app

# 复制 Jar 文件
COPY --chown=appuser:appuser target/myapp-*.jar app.jar

# 切换为用户
USER appuser

# 声明端口
EXPOSE 8080

# 启动 Jar
ENTRYPOINT ["java", "-jar", "app.jar"]
```
-- -
## 五、生产环境检查清单
在将 Dockerfile 部署到 Rocky Linux 8 生产环境之前，请逐项确认以下内容：

| 检查项                        | 状态  |
| -------------------------- | --- |
| 基础镜像固定了具体版本(非 latest)      | ☐   |
| 所有软件包固定了具体版本               | ☐   |
| 已合并多个 RUN 指令，减少层数          | ☐   |
| 已清理包管理器缓存和临时文件             | ☐   |
| 已配置 .dockerignore，排除无关文件   | ☐   |
| 已创建非 root 用户并以该用户运行        | ☐   |
| 敏感信息未硬编码在 Dockerfile 中     | ☐   |
| 已使用多阶段构建(如适用)              | ☐   |
| 已添加必要的 LABEL 标签            | ☐   |
| 已正确声明 EXPOSE 端口            | ☐   |
| CMD/ENTRYPOINT 使用了 Exec 形式 | ☐   |
| 在系统上成功构建并通过测试              | ☐   |
| 镜像已推送到内网私有仓库               | ☐   |
-- -
## 六、总结
Dockerfile 是将应用容器化的核心方法，通过将构建过程“代码化”，实现了镜像构建的自动化、可追溯和可复现。以下是本文的核心要点：
1. **Dockerfile 的本质**：一个文本文件，包含构建镜像所需的指令，是构建过程的“代码化”表达。
2. **核心指令**：
    - `FROM`：指定基础镜像。
    - `RUN`：构建时执行命令。
    - `COPY` / `ADD`：复制文件到镜像。
    - `WORKDIR`：设置工作目录。
    - `ENV`：设置环境变量。
    - `EXPOSE`：声明端口。
    - `CMD` / `ENTRYPOINT`：指定启动命令。
    - `USER`：切换执行用户。
3. **最佳实践**：
    - 利用构建缓存，将不常变的指令放在前面。
    - 合并 RUN 指令，减少镜像层数。
    - 清理缓存和临时文件，减小镜像体积。
    - 使用 `.dockerignore` 排除无关文件。
    - 固定版本号，禁止使用 `latest`。
    - 使用非 root 用户运行应用。
    - 使用多阶段构建减小最终镜像体积。
4. **生产环境提醒**
    - 注意基础镜像与 CPU 架构的兼容性(x 86_64 / ARM 64)。
    - 建议在构建阶段使用国内镜像源加速(如 Alpine 的 `mirrors.aliyun.com`)。
    - 构建后的镜像推送到内网私有仓库(如 Harbor)分发。
掌握 Dockerfile 编写规范是容器化部署的必备技能。建议从简单应用开始实践，逐步掌握多阶段构建和复杂场景下的编写技巧。

