Docker 容器是 Docker 最核心的 “运行单元”，新手可以先记住：容器是镜像的 “可运行实例” — 镜像是只读的 “模板”，容器是模板跑起来的 “活应用”，所有实际的业务运行都在容器里。

下面用通俗的语言 + 实操命令，讲清容器的 “是什么、怎么用、怎么管”，新手能直接落地。
-- -
## 一、Docker 容器概念
### 1.1 容器的概念
容器是基于镜像创建的可读写、独立隔离的运行环境，包含镜像的所有内容，还能动态修改(比如改配置、加文件)，同时与主机和其他容器隔离 ，就像一台 “超轻量的虚拟机”，但比虚拟机启动快、资源占用少。

Docker 容器是镜像的运行实例。如果说镜像是“菜谱”(静态的)，那么容器就是“按照菜谱做出来的那道菜”(动态的、正在运行的)。
### 1.2 容器的本质
很多初学者会把容器想象成一个“小虚拟机”，这是一个常见的误解。

容器的本质，就是宿主机上的一个普通进程，只不过这个进程通过 Linux 内核的命名空间(Namespace)技术，拥有了自己独立的文件系统、网络栈、进程号和用户，看起来像一台独立的“小电脑”。同时，通过控制组(Cgroup)技术，它的资源使用被限制在设定的范围内。

### 1.4 容器的核心特性
1. 隔离性：每个容器有自己的网络、文件系统、进程空间，比如 Nginx 容器和 MySQL 容器互不干扰，就像手机里微信和支付宝分开运行；
2. 可读写：容器基于镜像的只读层，新增一层 “可写层”，修改只在容器内生效，不影响原镜像；
3. 轻量级：启动毫秒级(比如 Nginx 容器 1 秒内启动)，占用内存只有几十 MB(对比虚拟机几百 MB)；
4. 一次性：可随时创建 / 删除，删除后容器内的修改(未挂载到宿主机的部分)会丢失(所以重要数据要挂载到宿主机)。
### 1.4 容器的生命周期状态
一个容器从创建到彻底消失，会经历以下几种状态：

| 状态      | 含义      | 通俗理解                     |
| ------- | ------- | ------------------------ |
| Created | 已创建但未启动 | 容器文件已准备好，但进程还没跑起来        |
| Running | 正在运行    | 容器内的进程正在执行中              |
| Paused  | 暂停      | 进程被挂起(冻结)，不再消耗 CPU，但内存还在 |
| Stopped | 已停止     | 进程已退出，但容器的文件系统还在         |
| Deleted | 已删除     | 容器的所有数据被清理，彻底消失          |

## 二、容器的核心管理命令
### 2.1 运行容器
运行容器是使用 Docker 最频繁的操作。docker run 命令负责从镜像创建并启动一个新容器。

**基本语法**：
```bash
docker run [选项] 镜像名[:标签] [启动命令]
```
最简单的示例：
```bash
docker run nginx:latest
```
该命令会基于 `nginx:latest` 镜像创建一个新容器并启动。但此时容器在前台运行，会输出 Nginx 的访问日志到终端，按 `Ctrl+C` 会停止容器。

生产环境中更常用的后台运行方式：
```bash
# 基础格式：docker run [参数] 镜像名:版本
docker run -d \
  --name my-nginx \  # 给容器命名(自定义，方便管理，避免默认随机名)
  --restart=always \ # 开机自启(服务器重启后容器自动运行)
  -p 80:80 \         # 端口映射：宿主机80→容器80(外部能访问)
  -v /data/www/docker-nginx/:/usr/share/nginx/html \ # 挂载目录：宿主机目录→容器目录(数据持久化)
  nginx:1.24-alpine  # 基于哪个镜像启动
```
命令解释：

| 参数          | 作用                                                      |
| ----------- | ------------------------------------------------------- |
| `-d`        | 后台运行(容器不占用终端，关掉终端也能继续跑)                                 |
| `--name`    | 给容器命名(比如 my-nginx)，后续操作不用记复杂的容器 ID                      |
| `--restart` | 重启策略：`always` (开机自启)、`on-failure` (失败时重启)、`no` (默认，不自启) |
| `-p`        | 端口映射(宿主机端口：容器端口)，外部访问宿主机端口就能访问容器服务                      |
| `-v`        | 目录挂载(宿主机路径：容器路径)，容器内的数据同步到宿主机(防止数据丢失)                   |
| `--rm`      | 容器停止后自动删除(适合临时测试，比如 `docker run --rm hello-world`)      |
### 2.2 查看容器
查看正在运行的容器：
```bash
# 查看正在运行的容器
docker ps
# 查看所有容器(包括已停止的)
docker ps -a
```
命令解释：
- 列出当前正在运行的所有容器。
- 输出信息包括：容器 ID、镜像、命令、创建时间、状态、端口映射、容器名。
- `-a`：all 的缩写，显示所有容器，不管处于什么状态。
### 2.3 停止容器
```bash
docker stop web
```
命令解释：
- 向容器内的主进程发送 SIGTERM 信号，让进程有机会优雅退出(如保存数据、关闭连接)。
- 如果容器在 10 秒内没有退出，Docker 会发送 SIGKILL 信号强制终止。
- web 是容器的名称，也可以用容器 ID 替代。

**生产环境提示**：优先使用 `docker stop`(优雅停止)，而非 `docker kill`(强制杀死)，避免数据丢失或连接异常中断。
### 2.4 启动已停止的容器
```bash
docker start web
```
命令解释：
- 启动一个已经停止的容器。容器启动后会恢复运行，之前的文件修改(如写入的日志、生成的文件)仍然存在。
- 如果容器从未启动过(状态为 Created)，应使用 `docker run` 而非 `docker start`。
### 2.5 重启容器
```bash
docker restart web
```
命令解释：
- 相当于先执行 `docker stop` 再执行 `docker start`。
- 常用于配置更新后让容器重新加载配置。
### 2.6 删除容器
```bash
# 删除已停止的容器
docker rm web

# 强制删除正在运行的容器
docker rm -f web

# 删除容器并同时删除其关联的数据卷
docker rm -v web

# 删除所有已停止的容器
docker container prune

# 删除所有容器(包括运行中的，危险操作)
docker rm -f $(docker ps -aq)
```
命令解释：
- `rm`：remove 的缩写。
- `-f`：force 的缩写，强制删除运行中的容器(会先停止再删除)。
- `-v`：同时删除容器关联的匿名数据卷。
### 2.7 进入容器内部
容器是隔离环境，需进入内部操作(比如改 Nginx 配置、看日志)：
```bash
# 进入容器
docker exec -it web bash
# 容器镜像精简(如 Alpine)，需要用sh
docker exec -it web sh
# 退出容器
exit
```
命令解释：
- `exec`：在运行中的容器内执行命令。
- `-it`：交互式终端(`-i` 保持标准输入打开，`-t` 分配一个伪终端)。
- `web`：容器的名称。
- `bash`：要执行的命令(也可以是 `sh`、`/bin/bash` 等)。
进入容器后可以做什么：
- 查看容器内的进程和文件。
- 调试应用程序(查看日志、测试配置)。
- 临时修改配置文件。
### 2.8 查看容器日志
容器运行中的报错、访问记录都在日志里，排错先看日志：
```bash
# 查看全部日志
docker logs web

# 实时跟踪日志输出(类似 tail -f)
docker logs -f web

# 查看最近 100 行日志
docker logs --tail 100 web

# 带时间戳查看
docker logs -t web
```
命令解释：
- `logs`：输出容器的标准输出和标准错误日志。
- `-f`：follow 的缩写，持续输出新增的日志。
- `--tail`：只显示最后 N 行。

**生产环境建议**：配置日志轮转，避免容器日志无限增长占满磁盘：

```bash
docker run -d --log-opt max-size=10m --log-opt max-file=3 nginx
```
### 2.9 查看容器详细信息
```bash
# 容器详细信息
docker inspect web

# 获取容器的 IP 地址
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' web

# 获取容器的 PID
docker inspect -f '{{.State.Pid}}' web
```
命令解释：
- `inspect`：输出容器的底层元数据(JSON 格式)，包含：
    - 容器的完整配置(环境变量、挂载卷、网络设置)。
    - 容器的运行状态(是否在运行、启动时间、退出码)。
    - 容器在宿主机上的真实 PID。
    - 容器的 IP 地址。
### 2.10 容器数据备份和迁移
如果容器内有未挂载的重要数据，可导出为 tar 包：
```bash
# 导出容器文件系统为tar包(备份)
docker export my-nginx > nginx-container.tar
# 导入为镜像(后续可基于这个镜像创建新容器)
docker import nginx-container.tar my-nginx-backup:v1
```
### 2.11 宿主机与容器间复制文件
```bash
# 从宿主机复制文件到容器
docker cp /host/file.txt web:/app/file.txt

# 从容器复制文件到宿主机
docker cp web:/app/logs/access.log /host/logs/
```
**常见用途**：
- 将配置文件复制进容器。
- 从容器中导出日志文件或数据文件。
### 2.12 暂停和恢复容器
使用 cgroup freezer 挂起容器内的所有进程，进程不再占用 CPU，暂停的容器状态会显示为 `Paused`。
```bash
# 暂停容器(冻结进程)
docker pause web

# 恢复容器
docker unpause web
```
适用场景：
- 临时腾出 CPU 资源给其他任务。
- 做快照前暂停容器保证数据一致性。

## 三、容器的资源限制
在生产环境中，必须对容器进行资源限制，防止单个容器耗尽宿主机资源，导致整台服务器宕机。
### 3.1 CPU 限制
```bash
# 限制容器最多使用 2 个 CPU 核心
docker run -d --cpus=2 nginx

# 限制容器使用 CPU 核心范围(0-3 号核心)
docker run -d --cpuset-cpus=0-3 nginx

# 限制容器使用 CPU 的权重(相对份额，默认 1024)
docker run -d --cpu-shares=512 nginx
```
命令解释：
- `--cpus`：指定容器可以使用的 CPU 核心数量上限(可以是小数，如 `1.5`)。
- `--cpuset-cpus`：指定容器只能在哪些 CPU 核心上运行(绑定核心)。
- `--cpu-shares`：设置 CPU 优先级，当宿主机 CPU 争抢时，该值越高分配到的 CPU 时间越多。
### 3.2 内存限制
```bash
# 限制容器最多使用 512MB 内存
docker run -d --memory=512m nginx

# 限制容器最多使用 1GB 内存，并禁用 Swap
docker run -d --memory=1g --memory-swap=1g nginx
```
命令解释：
- `--memory` 或 `-m`：设置内存使用上限。
- `--memory-swap`：设置内存 + Swap 的总上限。设置为相同值时，禁用 Swap。
- 单位：`b`(字节)、`k`(千字节)、`m`(兆字节)、`g`(千兆字节)。

**生产环境建议**：始终为容器设置内存上限。如果容器超限，会被 OOM Killer 终止，避免影响宿主机。

### 3.3 重启策略
```bash
# 容器退出时自动重启(除非手动停止)
docker run -d --restart=unless-stopped nginx

# 总是重启(即使手动停止也会在重启后重新拉起)
docker run -d --restart=always nginx

# 失败时最多重启 5 次
docker run -d --restart=on-failure:5 nginx
```
命令解释：
- `--restart`：设置容器的重启策略。
- `unless-stopped`：生产环境最推荐，容器退出时自动重启，只有手动 `docker stop` 后才不会自动重启。
- `always`：任何退出都会重启(包括手动停止后，系统重启时也会自动拉起)。
- `on-failure`：仅在非正常退出时重启(退出码非 0)，可指定最大重试次数。

## 四、容器的环境变量和配置
### 4.1 设置环境变量
环境变量是向容器传递配置信息的标准方式。
```bash
# 设置单个环境变量
docker run -d -e MY_ENV=production nginx

# 设置多个环境变量
docker run -d -e DB_HOST=192.168.1.100 -e DB_PORT=3306 nginx

# 从文件读取环境变量(推荐生产环境使用)
docker run -d --env-file ./env.list nginx
```
命令解释：
- `-e` 或 `--env`：设置环境变量，格式为 `KEY=value`。
- `--env-file`：从文件中批量读取环境变量，每行一个 `KEY=value`。
env.list 文件示例：
```text
DB_HOST=192.168.1.100
DB_PORT=3306
DB_USER=appuser
DB_PASSWORD=secure_password
```
生产环境建议：
- 不要在镜像中硬编码敏感信息。
- 使用 `--env-file` 管理配置，不要直接在命令行暴露密码(命令行历史会记录)。
- 配合密钥管理工具(如 Vault、KMS)更安全。
### 4.2 在容器内查看环境变量
进入容器后，可以用以下命令查看：
```
docker exec -it web env
# 或
docker exec -it web printenv
```
## 五、容器的网络设置
### 5.1 端口映射
让宿主机外的用户能够访问容器内的服务，需要做端口映射。
```bash
# 将宿主机的 80 端口映射到容器的 80 端口
docker run -d -p 80:80 nginx

# 映射到宿主机的随机端口
docker run -d -p 80 nginx

# 只允许特定 IP 访问(本机 IP)
docker run -d -p 127.0.0.1:8080:80 nginx

# 映射多个端口
docker run -d -p 80:80 -p 443:443 nginx

# UDP 端口映射
docker run -d -p 53:53/udp dns-server
```
命令解释：
- `-p` 或 `--publish`：发布容器端口到宿主机。
- 格式：`[宿主机IP:]宿主机端口:容器端口[/协议]`
- 不指定宿主机端口时，Docker 会分配一个随机端口(可用 `docker ps` 查看)。
### 5.2 指定容器网络模式
```bash
# 使用默认桥接网络(默认)
docker run -d --network bridge nginx

# 使用宿主机的网络栈(无独立 IP，性能最高)
docker run -d --network host nginx

# 没有网络(完全隔离)
docker run -d --network none nginx

# 使用自定义网络
docker run -d --network mynet nginx
```
各网络模式适用场景：

|网络模式|说明|适用场景|
|---|---|---|
|bridge|默认模式，容器有独立 IP，通过 NAT 访问外网|单机多容器通信|
|host|容器直接使用宿主机网络，无性能损耗|对网络性能要求极高的场景|
|none|无网络，完全隔离|安全要求极高的批处理任务|
|自定义|用户创建的 bridge/overlay 网络|容器间通过容器名通信(内置 DNS)|

**生产环境建议**：使用自定义桥接网络，让容器之间通过容器名互相访问，而不是通过易变的 IP 地址。

## 六、容器的数据持久化
容器本身是无状态的。容器删除后，容器层(可写层)中的所有数据会丢失。生产环境必须将数据持久化存储。
### 6.1 绑定挂载(Bind Mount)
将宿主机上的目录或文件挂载到容器内部。
```bash
# 将宿主机的 /data/website 挂载到容器的 /usr/share/nginx/html
docker run -d -v /data/website:/usr/share/nginx/html nginx
```
命令解释：
- `-v`：挂载卷(volume)或绑定挂载。
- 格式：`宿主机路径:容器路径[:选项]`
- 选项：`:ro`(只读)、`:z`(SELinux 上下文)。

**特殊提示**：如果遇到 SELinux 权限问题，添加 `:z` 参数：
```bash
docker run -d -v /data/website:/usr/share/nginx/html:z nginx
```
### 6.2 数据卷(Volume)
数据卷是 Docker 管理的存储空间，独立于容器生命周期。
```bash
# 创建数据卷
docker volume create mydata

# 查看所有数据卷
docker volume ls

# 使用数据卷
docker run -d -v mydata:/app/data nginx

# 查看数据卷详情
docker volume inspect mydata

# 删除数据卷
docker volume rm mydata
```
数据卷 vs 绑定挂载：

|对比维度|数据卷(Volume)|绑定挂载(Bind Mount)|
|---|---|---|
|管理方|Docker 管理|用户管理|
|存储位置|/var/lib/docker/volumes/|用户指定的任意路径|
|备份|较方便(docker volume 命令)|手动复制目录|
|权限问题|由 Docker 处理|需手动处理(SELinux)|
|适用场景|生产环境推荐|开发环境、共享配置文件|

**生产环境建议**：优先使用数据卷(Volume)，因为它更安全、便于备份和迁移。

### 6.3 清理未使用的数据卷
```bash
# 删除所有未被任何容器使用的数据卷
docker volume prune
```
### 6.4 示例
Nginx 容器持久化配置和网站数据
```bash
# 1. 宿主机创建目录(存放配置和数据)
mkdir -p /data/nginx/conf /data/nginx/logs /data/www/rax
# 2. 把容器内默认的nginx.conf复制到宿主机(方便修改)
docker run --rm nginx:1.24-alpine cat /etc/nginx/nginx.conf > /data/nginx/conf/nginx.conf
# 3. 启动容器时挂载3个目录
docker run -d \
  --name my-nginx \
  --restart=always \
  -p 80:80 \
  -v /data/nginx/conf/nginx.conf:/etc/nginx/nginx.conf \ # 挂载配置文件(改宿主机文件即改容器配置)
  -v /data/nginx/logs:/var/log/nginx \ # 挂载日志(宿主机能看Nginx日志)
  -v /data/www/rax:/usr/share/nginx/html \ # 挂载网站数据(网站文件存在宿主机，容器删了数据还在)
  nginx:1.24-alpine
```
✅ 核心：容器内的 “可写数据” 都挂载到宿主机，比如配置、日志、业务数据，只留程序运行在容器内。

## 七、容器日志管理
### 7.1 日志驱动程序
Docker 支持多种日志驱动，用于控制容器日志的输出方式。

|日志驱动|说明|适用场景|
|---|---|---|
|json-file|默认驱动，将日志存为 JSON 文件|默认情况|
|syslog|将日志发送到 syslog 服务|需要系统日志集中管理|
|journald|将日志发送到 systemd journal|Rocky Linux 默认使用 systemd|
|gelf|将日志发送到 Graylog 等日志平台|集中日志收集|
|fluentd|将日志发送到 Fluentd|日志处理流水线|
|none|禁用日志记录|不需要日志的场景|

配置日志驱动：
```bash
# 使用 json-file 并限制大小
docker run -d --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 nginx

# 使用 syslog
docker run -d --log-driver syslog --log-opt syslog-address=udp://192.168.1.100:514 nginx
```
### 7.2 生产环境日志配置
在生产环境中，务必配置日志轮转，避免容器日志无限增长：
```bash
# 方法一：在 docker run 时指定
docker run -d --log-opt max-size=50m --log-opt max-file=5 nginx

# 方法二：在 daemon.json 中全局配置
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

## 八、高级容器管理技巧
### 8.1 容器命名
给容器起一个好记的名称，便于日常管理。
```bash
# 显式命名
docker run -d --name web-nginx nginx

# 不指定名称时，Docker 会随机生成一个名字(如 quirky_curie)
```
命名规范建议：<环境>-<服务名>-<序号>，如 prod-nginx-01、test-mysql-02。
### 8.2 容器标签(Label)
为容器添加元数据标签，便于分类和检索。
```
docker run -d --label environment=prod --label version=v1.0 nginx
```
查看带标签的容器：
```bash
# 按标签过滤
docker ps --filter "label=environment=prod"

# 查看容器的所有标签
docker inspect --format='{{json .Config.Labels}}' 容器名
```
### 8.3 容器健康检查
Docker 支持在容器中运行健康检查命令，定期检查应用是否正常。
在 Dockerfile 中定义：
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD curl -f http://localhost/ || exit 1
```
在 docker run 时定义：
```bash
docker run -d --health-cmd="curl -f http://localhost/ || exit 1" --health-interval=30s nginx
```
查看健康状态：
```bash
docker ps
# 状态列会显示 healthy 或 unhealthy

docker inspect --format='{{.State.Health.Status}}' 容器名
```
### 8.4 容器退出码
容器退出时，会返回一个退出码(Exit Code)，用于判断退出原因。

|退出码|含义|
|---|---|
|0|正常退出|
|1|应用内部错误退出|
|125|Docker 守护进程自身错误|
|126|容器内命令无法执行|
|127|容器内命令找不到|
|137|被 SIGKILL 杀死(OOM 或被 kill)|
|143|收到 SIGTERM 信号后退出|
查看退出码：
```bash
docker inspect --format='{{.State.ExitCode}}' 容器名
```

## 九、总结
1. 容器核心价值：隔离运行环境，快速部署，资源占用少，解决 “应用之间干扰、环境不一致” 问题；
2. 新手必记命令：docker run(启动)、docker ps(查看)、docker start/stop(启停)、docker exec(进入)、docker rm(删除)；
3. 核心原则：容器内不存重要数据，所有数据 / 配置都挂载到宿主机(避免数据丢失)；
4. 排错顺序：先看容器状态(docker ps)→ 看日志(docker logs)→ 检查端口 / 挂载→ 检查配置。