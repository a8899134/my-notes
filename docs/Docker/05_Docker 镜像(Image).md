Docker 镜像是 Docker 最核心的基础概念，新手可以先记住一句话：镜像是容器的 “只读模板”，容器是镜像的 “运行实例”。下面从 “是什么、怎么来、怎么用、怎么管” 四个维度，用通俗的语言 + 实操命令讲清楚，新手能直接落地。

## 一、Docker 镜像概念
### 1.1 镜像的概念
Docker 镜像可以理解为一个轻量级的、可执行的独立软件包，里面包含了运行某个程序所需的一切：代码、运行时环境、系统工具、库文件和设置参数。

打个比方：镜像就像一个“菜谱”。

- 菜谱上详细记录了做一道菜需要的所有食材、调料、厨具和操作步骤。
- 你只要按照菜谱操作，不管在谁家的厨房，都能做出味道完全一样的菜。
- 镜像就是这个“菜谱”，容器就是照着菜谱做出来的那道“菜”。
### 1.2 镜像的核心特性
Docker 镜像有四个显著特征，理解它们有助于在生产环境中更好地使用镜像。
1. 只读性：镜像本身不能被修改，要改只能基于原镜像做 “新镜像”；
2. 分层存储：镜像由多个只读层叠加而成(比如基础系统层 + Nginx 安装层 + 配置层)，分层可复用(比如多个镜像共用同一个 CentOS 基础层)，节省磁盘空间；
3. 可移植性：镜像可在任何装了 Docker 的机器上运行，无需适配环境。
4. 轻量级：镜像只包含运行应用所必需的文件和依赖，不包含完整的操作系统内核。它共享宿主机的内核，所以体积远小于传统的虚拟机镜像。一个最小的 Alpine Linux 镜像只有几兆字节。
### 1.3 镜像与容器的关系
为了更清晰地理解二者关系，可以用一张表格来对比：

|对比维度|镜像(Image)|容器(Container)|
|---|---|---|
|本质|只读的静态文件包|运行中的进程|
|状态|不运行，只是存在|正在运行或已停止|
|可写性|只读，不可修改|可读写(有临时容器层)|
|生命周期|长期保存，可复用|临时性，可随时创建和销毁|
|对应关系|一个镜像可以创建无数个容器|每个容器都基于某个镜像|

## 二、镜像的存储与命名
### 2.1 镜像仓库
镜像仓库是存放和分发镜像的地方。你可以把它理解为一个“应用商店”，里面有很多不同的“软件包”(镜像)。

最常用的公共镜像是 Docker Hub，由 Docker 官方维护，上面有成千上万的官方和社区镜像，比如 Nginx、MySQL、Redis、Ubuntu 等。

除了公共仓库，企业生产环境通常会搭建私有仓库(如 Harbor)，用于存储内部开发的业务镜像，确保代码安全和网络访问速度。
### 2.2 镜像命名规范
一个完整的镜像名称由四个部分组成：
`[仓库地址]/[命名空间]/[镜像名]:[标签] `
各部分含义：

| 组成部分 | 含义               | 是否必须              |
| ---- | ---------------- | ----------------- |
| 仓库地址 | Docker 仓库的域名或 IP | 非必须(默认为docker.io) |
| 命名空间 | 通常是用户名或组织名       | 非必须(默认为 library)  |
| 镜像名  | 镜像的具体名称          | 必须                |
| 标签   | 版本或变体标识          | 非必须(默认为 latest)   |

常见示例：
- nginx → 完整写法是 `docker.io/library/nginx:latest`
- nginx:1.21 → 指定版本为 1.21
- myregistry.com:5000/myapp:v1.0 → 私有仓库中的镜像

生产环境建议：

|建议|说明|
|---|---|
|避免使用 latest 标签|latest 指向的版本会变化，生产环境应固定具体版本号|
|使用有意义的标签|如 `v1.0.0`、`20260113`、`git-commit-hash`，便于追溯|
|私有仓库使用内网域名|避免外网访问，提高安全性和拉取速度|
### 2.3 查看本地镜像
```bash
docker images
```
输出以下内容
```text
[fmc@Docker-Rocky8-1 ~]$ docker images
REPOSITORY    TAG       IMAGE ID       CREATED        SIZE
hello-world   latest    e2ac70e7319a   4 months ago   10.1kB
```
命令解释：
- 列出本地已经下载的所有镜像。
- 输出信息包括：仓库名(REPOSITORY)、标签(TAG)、镜像 ID(IMAGE ID)、创建时间(CREATED)、大小(SIZE)。

## 三、镜像的分层原理
### 3.1 分层概念
Docker 镜像是由多个只读层(Layer)堆叠而成的。每一层都对应 Dockerfile 中的一条指令(如 RUN、COPY、ADD)。
通俗理解：镜像就像一个千层蛋糕。
- 最底层是基础镜像层(如操作系统层)。
- 往上依次是安装软件层、复制代码层、修改配置层等。
- 每一层都叠在上一层的上面，但每一层都是独立的。
### 3.2 分层的好处
1. 节省存储空间：
多个镜像可以共享相同的基础层。比如你有 10 个基于 alpine:3.18 的镜像，Alpine 基础层只在磁盘上存储一份，所有镜像复用。
2. 加速构建和拉取:
如果镜像的某一层没有变化，Docker 会直接使用缓存，不需要重新下载或重新构建。比如你只改了代码，而基础镜像和依赖安装层没有变，那么构建时只需要重新构建代码复制那一层，其他层直接复用缓存。
3. 便于调试:
如果镜像构建失败，Docker 会保留失败之前的所有层，你可以基于最新的成功层启动一个容器，在里面手动调试，找到问题所在。
### 3.3 写时复制
当容器基于镜像启动时，Docker 会在所有只读的镜像层顶部添加一个可写的容器层。
- 读取文件：从最顶层的容器层往下找，如果容器层有该文件则直接读取，否则逐层往下找。
- 修改文件：Docker 不会直接修改只读镜像层中的文件，而是将文件从镜像层复制到容器层，然后在容器层中修改这个副本。
这个机制称为写时复制(Copy-on-Write)，它的好处是：
- 镜像始终保持只读和不可变。
- 多个容器可以共享同一份镜像数据。
- 每个容器只保存自己修改过的文件，节省磁盘空间。
- 容器删除时，只删除容器层的数据，不影响镜像。
### 3.4 查看镜像的分层历史
```bash
docker history nginx:latest
```
命令解释：
- 显示指定镜像的构建历史，每一行代表一个层。
- 输出包括每一层使用的指令(如 FROM、RUN)、层的大小、创建时间等。

生产用途：
- 检查镜像是否包含过多不必要的层(层数过多会增加体积)。
- 确认镜像构建过程是否符合预期。
- 排查镜像体积过大的原因。

## 四、镜像管理基础命令
### 4.1 拉取镜像
```bash
# 拉取最新版本 默认是latest
docker pull nginx

# 生产环境建议拉取固定版本号，不要使用 latest，
docker pull nginx:1.21.6

# 从私有仓库拉取
docker pull harbor.internal.com/project/myapp:v1.0
```
命令解释：
- `pull`：从仓库拉取镜像到本地。
- 如果不指定标签，默认拉取 `latest`。
- 拉取过程会显示每一层的下载进度。
### 4.2 查看本地镜像
```bash
# 列出所有镜像
docker images

# 查看镜像详情
docker inspect nginx:1.21
```
命令解释：
- `docker inspect` 输出镜像的底层元数据，包括：
    - 镜像的层信息(Layers)。
    - 环境变量(Env)。
    - 默认命令(Cmd)。
    - 暴露的端口(ExposedPorts)。
    - 镜像的架构和操作系统。
### 4.3 删除镜像
```bash
# 按名称删除
docker rmi nginx:1.21

# 按镜像 ID 删除
docker rmi abc123def456

# 强制删除(即使有容器引用)
docker rmi -f nginx:1.21

# 删除所有未被使用的镜像
docker image prune

# 删除所有镜像(危险操作)
docker rmi $(docker images -q)
```
命令解释：
- rmi：remove image 的缩写。
- 如果该镜像正在被某个容器使用(包括已停止的容器)，会提示无法删除，需要先删除容器或加 -f 强制删除。
### 4.4 标记镜像
```bash
docker tag nginx:1.21 myregistry.com/mynginx:prod
```
命令解释：
- 为本地镜像添加一个新的标签，相当于给镜像起了一个别名。
- 原镜像不会被复制或修改，只是多了一个引用名。
- 常用于为推送私有仓库做准备。
### 4.5 推送镜像到仓库
```bash
# 先登录私有仓库
docker login harbor.internal.com

# 推送镜像
docker push myregistry.com/mynginx:prod
```
命令解释：
- `push` 将本地镜像上传到远程仓库。
- 推送前需要先用 `docker tag` 将镜像标记为仓库地址格式。
### 4.6 导出和导入镜像
在生产内网环境中，常常需要将镜像从联网机器迁移到内网服务器。
1. 导出镜像为 tar 文件：
```bash
docker save -o nginx.tar nginx:1.21
```
命令解释：
- `save -o`：将镜像保存为归档文件(tar 格式)。
- `-o` 指定输出文件名。
- 可以一次性保存多个镜像：`docker save -o all.tar nginx:1.21 mysql:5.7`。

2. 导入 tar 文件到本地镜像库：
```bash
docker load -i nginx.tar
```
命令解释：
- `load -i`：从 tar 文件恢复镜像。
- 导入后可以用 `docker images` 查看。

save 与 export 的区别(容易混淆)：

|命令|操作对象|保留分层历史|保留元数据|适用场景|
|---|---|---|---|---|
|docker save|镜像|是|是|迁移完整镜像|
|docker export|容器|否(扁平化)|否|仅迁移文件系统快照|

## 五、构建自定义镜像
### 5.1 Dockerfile 概念
Dockerfile 是一个文本文件，里面包含了构建镜像所需要执行的一系列指令。通过 Dockerfile，你可以把应用程序的构建过程“代码化”，实现自动化构建和版本控制。

通俗理解：Dockerfile 就是制作镜像的“菜谱”，里面一步一步写着需要准备什么原材料(基础镜像)、做哪些处理(安装依赖、复制代码)、最后怎么启动(启动命令)。
### 5.2  Dockerfile 常用指令
以下是最常用的 Dockerfile 指令及其解释。

|指令|作用|示例|
|---|---|---|
|FROM|指定基础镜像(必须是第一条指令)|FROM alpine:3.18|
|WORKDIR|设置工作目录，后续指令在该目录下执行|WORKDIR /app|
|COPY|将构建上下文中的文件复制到镜像|COPY package.json /app/|
|ADD|类似 COPY，但支持自动解压压缩包和 URL 下载|ADD app.tar.gz /app/|
|RUN|在构建过程中执行命令(常用于安装依赖)|RUN apk add --no-cache nginx|
|ENV|设置环境变量|ENV NODE_ENV=production|
|EXPOSE|声明容器运行时监听的端口(仅文档作用)|EXPOSE 8080|
|CMD|指定容器启动时执行的命令(可被覆盖)|CMD ["nginx", "-g", "daemon off;"]|
|ENTRYPOINT|指定容器启动时执行的命令(不可被覆盖)|ENTRYPOINT ["/app/start.sh"]|
|VOLUME|声明数据卷挂载点|VOLUME /data|
|USER|切换执行用户|USER nginx|
|LABEL|添加元数据标签|LABEL version="1.0"|

CMD 与 ENTRYPOINT 的区别：
- `CMD`：容器启动时执行的命令，但在 `docker run` 后面追加参数时会覆盖 CMD。
- `ENTRYPOINT`：容器启动时执行的命令，`docker run` 后面的参数会作为 ENTRYPOINT 的参数追加，而不是覆盖。
- 最佳实践：通常组合使用 `ENTRYPOINT` 设置固定的主命令，用 `CMD` 提供默认参数。

示例组合：
```dockerfile
ENTRYPOINT ["/app/start.sh"]
CMD ["--config", "/etc/app/config.yaml"]
```
### 5.3 Dockerfile 示例
以下是一个简单的 Nginx 网页应用 Dockerfile。
项目结构：
```text
myweb/
├── Dockerfile
├── index.html
└── nginx.conf
```
Dockerfile 内容：
```dockerfile
# 第一步：指定基础镜像
FROM nginx:1.21-alpine

# 第二步：设置作者标签
LABEL maintainer="devops@example.com"

# 第三步：复制自定义网页文件
COPY index.html /usr/share/nginx/html/

# 第四步：复制自定义配置文件(覆盖默认配置)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 第五步：声明暴露端口
EXPOSE 80

# 第六步：容器启动命令(继承自基础镜像，此处不需要额外指定)
```
构建命令：
```bash
docker build -t myweb:1.0 .
```
### 5.4 构建镜像
```bash
docker build -t myapp:1.0 .
```
命令解释：
- `build`：根据 Dockerfile 构建镜像。
- `-t myapp:1.0`：为构建出的镜像指定名称和标签。
- `.`：指定构建上下文(build context)，即当前目录。Docker 会将当前目录下的所有文件发送给 Docker 守护进程。
构建参数：
```bash
# 使用构建参数(可在 Dockerfile 中用 ARG 接收)
docker build --build-arg VERSION=1.2 -t myapp:1.2 .

# 不使用缓存重新构建
docker build --no-cache -t myapp:1.0 .
```
### 5.5 构建最佳实践
|实践建议|说明|
|---|---|
|使用轻量级基础镜像|优先选择 Alpine、Debian-slim 等小体积镜像|
|合并 RUN 指令|将多个 RUN 指令合并为一条，减少层数|
|利用构建缓存|将不经常变化的指令放在前面(如 COPY package.json 在 COPY . 之前)|
|使用 .dockerignore|排除不需要的文件(如 node_modules、.git)，加快构建速度|
|固定版本号|基础镜像和依赖版本都要固定，避免构建不稳定|
|多阶段构建|利用多个 FROM 指令分离构建环境和运行环境，减小最终镜像体积|

## 六、镜像安全与生产环境建议
### 6.1 选择可靠的基础镜像
生产环境务必从可信来源选择基础镜像：
- 官方镜像：优先使用 Docker Hub 上带有 OFFICIAL 标志的镜像。
- 轻量级镜像：Alpine 系列体积小、安全性高(攻击面小)。
- 版本固定：不要使用 latest，指定具体版本号。
### 6.2 不要在镜像中存储敏感信息
绝对禁止在 Dockerfile 中硬编码密码、私钥、API 密钥等敏感信息。
```dockerfile
# 错误示例(不要这样做！)
ENV DB_PASSWORD=123456
RUN echo "secret" > /config/key.txt
```
### 6.3 定期扫描镜像漏洞
生产环境应当定期对镜像进行漏洞扫描，常用的工具有：
- Docker Scout(Docker 官方)
- Trivy
- Clair
在 Rocky Linux 8 上可以使用：
```bash
# 需要安装 Docker Scout 插件
docker scan nginx:1.21
```
### 6.4 最小权限原则
- 不要在容器中以 root 用户运行应用。在 Dockerfile 中创建专用用户并切换到该用户：
```dockerfile
RUN addgroup -g 1000 appuser && adduser -u 1000 -G appuser -D appuser
USER appuser
```
- 只暴露必要的端口，不必要的端口不要用 `EXPOSE` 声明。
### 6.5 控制镜像大小
过大的镜像会导致：
- 拉取慢(尤其在内网环境)。
- 占用大量磁盘空间。
- 攻击面更大(包含更多不必要的软件包)。

减小组件的方法：
- 使用 Alpine 等小体积基础镜像。
- 多阶段构建(Multi-stage Build)，只把最终运行所需的文件复制到最终镜像。
- 清理包管理器的缓存(如 `apk cache clean`、`rm -rf /var/cache/apt/*`)。
### 6.6 镜像版本管理策略
生产环境建议采用以下版本命名规则：

|环境|标签示例|说明|
|---|---|---|
|开发|dev-20260113|按日期标识|
|测试|test-v 1.0.0-rc 1|测试版本|
|预发布|pre-v 1.0.0|灰度验证版本|
|生产|v 1.0.0|正式发布版本|
|生产|latest|仅指向最新的稳定版本(谨慎使用)|

## 七、总结
Docker 镜像是容器化技术的基石，掌握镜像就掌握了 Docker 的一大半。
1. 镜像的核心价值：打包环境，一次构建，到处运行，解决 “环境不一致” 问题；
2. 新手优先用 docker pull 拉取现成镜像(指定版本，别用 latest)；
3. 必记命令：docker pull(拉)、docker images(看)、docker rmi(删)、docker build(构建)；
4. 镜像出问题先查：① 镜像加速是否配置；② 命令格式是否正确；③ 容器是否关联镜像。

在生产环境中，建议建立标准化的镜像构建流程和版本管理规范，将镜像安全管理纳入日常运维巡检内容。