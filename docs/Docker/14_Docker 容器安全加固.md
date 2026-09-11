## 一、安全加固作用
### 1.1 容器安全的常见误区
很多人认为容器是天然安全的，因为容器之间相互隔离。但这是一个严重的误解。

常见的错误认知：

|错误认知|实际情况|
|---|---|
|容器内部是安全的|容器共享宿主机内核，内核漏洞可能导致容器逃逸|
|容器隔离性等于虚拟机隔离性|容器的隔离级别远低于虚拟机，共享内核意味着更高的风险|
|镜像来自官方就是安全的|官方镜像也可能包含漏洞或配置不当|
|容器只跑自己的应用就没问题|应用本身的漏洞可能导致容器被入侵|
### 1.2 容器面临的主要安全威胁
在生产环境中，容器面临以下几类安全威胁：
1. 容器逃逸：攻击者利用容器内的漏洞，突破容器隔离边界，获得宿主机权限。这是最严重的安全威胁。
2. 镜像供应链攻击：使用了包含恶意代码或已知漏洞的基础镜像，或者镜像在传输过程中被篡改。
3. 敏感信息泄露：在镜像中硬编码了密码、密钥、Token 等敏感信息，一旦镜像被获取，这些信息即告泄露。
4. 资源耗尽攻击：单个容器消耗过多 CPU、内存、磁盘 I/O，导致宿主机或其他容器无法正常工作。
5. 网络攻击：容器之间缺乏网络隔离，攻击者可以从一个容器横向移动到另一个容器。
### 1.3 安全加固的目标
安全加固的目标不是“绝对安全”(这是不可能的)，而是：

|目标|说明|
|---|---|
|降低攻击面|移除不必要的软件和功能，减少可被利用的入口|
|最小权限原则|只给予容器运行所需的最小权限|
|深度防御|多层防护，即使某一层被突破，还有其他层阻止攻击|
|可审计|所有操作有记录，便于事后追溯|

## 二、Docker 守护进程安全配置
### 2.1 使用非 root 用户管理 Docker
安全评估：

|做法|安全风险|
|---|---|
|直接使用 root 用户执行 Docker 命令|极高(所有操作都是 root)|
|使用 `sudo` 执行 Docker 命令|中等(有 sudo 审计日志，需输入密码)|
|将用户加入 `docker` 组|高(无需密码即可获得 root 级权限)|

生产环境建议：
```bash
# 1. 为运维人员创建专用账号
sudo useradd -m -s /bin/bash docker-admin

# 2. 仅在必要时授予 docker 组权限
sudo usermod -aG docker docker-admin

# 3. 记录所有用户的 Docker 操作(通过系统审计)
# 在 /etc/audit/rules.d/docker.rules 中添加：
-a always,exit -S execve -F path=/usr/bin/docker -k docker
```
命令解释：
- `useradd -m -s /bin/bash`：创建新用户，创建家目录，设置默认 Shell。
- `usermod -aG docker`：将用户添加到 docker 组(谨慎操作)。
- 审计规则：记录所有 `docker` 命令的执行，便于事后追溯。
### 2.2 限制 Docker API 的访问
Docker 守护进程默认监听 Unix 套接字( `/var/run/docker.sock))。如果将其暴露在网络上，存在严重安全风险。

错误做法：
```bash
# 将 Docker API 暴露在网络上(生产环境绝对禁止)
sudo dockerd -H tcp://0.0.0.0:2375
```
正确做法：
```bash
# 只在本地 Unix 套接字上监听(默认配置)
sudo dockerd -H unix:///var/run/docker.sock
```
如果需要远程管理 Docker：
```bash
# 使用 TLS 加密并启用认证
sudo dockerd \
  --tlsverify \
  --tlscacert=/etc/docker/ca.pem \
  --tlscert=/etc/docker/server-cert.pem \
  --tlskey=/etc/docker/server-key.pem \
  -H tcp://0.0.0.0:2376 \
  -H unix:///var/run/docker.sock
```
### 2.3 配置 Docker 守护进程的日志级别
合理的日志级别可以帮助运维人员及时发现异常行为。
```bash
# 在 /etc/docker/daemon.json 中配置
{
  "log-level": "info"
}
```
日志级别说明：

|级别|说明|适用场景|
|---|---|---|
|debug|输出所有调试信息|开发环境|
|info|输出常规信息(默认)|生产环境推荐|
|warn|只输出警告和错误|日志量过大的环境|
|error|只输出错误|极简日志需求|
### 2.4 限制容器获取宿主机内核信息
默认情况下，容器可以获取宿主机的一些内核信息，这为攻击者提供了信息收集的机会。
```bash
# 在 /etc/docker/daemon.json 中配置
{
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65536,
      "Soft": 65536
    }
  }
}
```

## 三、镜像安全
### 3.1 选择可信的基础镜像
镜像安全是整个容器安全链的起点。如果基础镜像存在问题，后续所有加固措施都将失效。
选择原则：

|原则|说明|
|---|---|
|优先使用官方镜像|Docker Hub 上带有 `OFFICIAL` 标记的镜像经过审查|
|使用轻量级镜像|Alpine、Debian-slim 等小体积镜像攻击面更小|
|固定版本标签|禁止使用 `latest`，必须指定具体版本号|
|验证镜像签名|启用 Docker Content Trust 验证镜像来源|

启用镜像内容信任：
```bash
# 启用内容信任，国内没法访问docker hub，所以不可取
export DOCKER_CONTENT_TRUST=1

# 拉取签名镜像(如果镜像没有签名，会失败)
docker pull nginx:1.26-alpine
```
命令解释：
- `DOCKER_CONTENT_TRUST=1`：开启镜像签名验证，只有经过签名(且签名有效)的镜像才能被拉取。
- 拉取未签名的镜像会报错：`Error: remote trust data does not exist`。
### 3.2 扫描镜像漏洞
在将镜像部署到生产环境之前，必须进行漏洞扫描。常用的扫描工具有：

| 工具           | 说明                 |
| ------------ | ------------------ |
| Docker Scout | Docker 官方提供的漏洞扫描工具 |
| Trivy        | 开源、快速、全面的漏洞扫描器     |
| Clair        | 开源的容器漏洞分析工具        |

使用 Trivy 扫描镜像：
```bash
# 安装 Trivy(Rocky Linux 8)
sudo dnf install -y wget
wget https://github.com/aquasecurity/trivy/releases/latest/download/trivy_0.50.2_Linux-64bit.rpm
sudo dnf localinstall -y trivy_0.50.2_Linux-64bit.rpm

# 扫描镜像漏洞
trivy image nginx:1.26-alpine

# 只显示严重和中危以上的漏洞
trivy image --severity HIGH,CRITICAL nginx:1.26-alpine
```
命令解释：
- `trivy image`：分析镜像文件系统，与已知漏洞库(CVE)进行比对。
- `--severity`：过滤漏洞级别，只显示指定级别以上的漏洞。
### 3.3 不在镜像中存储敏感信息
绝对禁止在 Dockerfile 或镜像中硬编码任何敏感信息。

错误做法：
```dockerfile
# 绝对禁止！(密码硬编码在镜像中)
ENV DB_PASSWORD=SuperSecret123
RUN echo "api_key=abc123def456" > /app/config.txt
```
正确做法：
```dockerfile
# 使用 ARG 接收构建参数(仅在构建时可用，不保存在镜像中)
ARG DB_PASSWORD
ENV DB_PASSWORD=${DB_PASSWORD}

# 运行时通过环境变量注入
# docker run -e DB_PASSWORD=实际密码 ...
```

```bash
# 运行时通过环境变量注入敏感信息
docker run -d -e DB_PASSWORD=${DB_PASSWORD} -e API_KEY=${API_KEY} myapp:1.0

# 或使用 env-file
docker run -d --env-file ./secrets.env myapp:1.0
```
### 3.4 精简镜像
每个不必要的软件包都会增加攻击面。在构建镜像时，只安装运行时必需的软件。

错误做法(包含大量不必要的工具)：
```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    curl wget vim net-tools telnet \
    python3 python3-pip \
    nginx
```
正确做法(只安装必需的依赖)：
```dockerfile
FROM alpine:3.18
RUN apk add --no-cache \
    nginx \
    tzdata
# 只安装运行 Nginx 必需的包，不要安装调试工具
```
### 3.5 使用多阶段构建
多阶段构建可以分离构建环境和运行环境，最终镜像只包含运行所需的文件。
```dockerfile
# 阶段 1：构建阶段(包含所有构建工具)
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o myapp .

# 阶段 2：运行阶段(只包含二进制文件)
FROM alpine:3.18
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/myapp /usr/local/bin/
CMD ["myapp"]
```
安全收益：最终镜像中不包含编译器、构建工具等，攻击面大幅减少。
### 3.6 定期更新镜像
定期检查并更新镜像，修复已知漏洞。
```bash
# 定期拉取最新版本的基础镜像
docker pull alpine:3.18

# 重新构建应用镜像
docker build --no-cache -t myapp:latest .

# 清理旧版本镜像
docker image prune -f
```

## 四、容器运行时安全加固
### 4.1 禁止以 root 用户运行容器
容器默认以 root 用户运行，一旦被攻破，攻击者将获得宿主机 root 权限。这是容器安全中最重要的加固措施。

在 Dockerfile 中创建非 root 用户：
```dockerfile
FROM alpine:3.18

# 创建用户和用户组(UID 和 GID 为 1000)
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -D -h /app appuser

# 切换为 appuser
USER appuser

# 后续命令都以 appuser 身份执行
CMD ["/app/start.sh"]
```
在 docker run 中指定用户：
```bash
# 使用 --user 参数指定 UID
docker run -d --user 1000:1000 myapp:1.0

# 或使用用户名(需要在镜像中提前创建)
docker run -d --user appuser myapp:1.0
```
在 Compose 中指定用户：
```yaml
services:
  app:
    image: myapp:1.0
    user: 1000:1000
    # 或使用用户名
    # user: appuser
```
命令解释：
- `adduser -u 1000 -D`：创建 UID 为 1000 的用户，不设置密码。
- `USER appuser`：将后续指令的执行用户切换为 `appuser`。
- `--user 1000:1000`：容器启动时以 UID 1000、GID 1000 的身份运行。
### 4.2 限制容器的权限
在 docker run 中，通过 --cap-drop 和 --cap-add 控制容器的 Linux 能力(Capabilities)。

默认情况：容器拥有一系列能力(如 CAP_CHOWN、CAP_NET_BIND_SERVICE 等)，其中一些能力可能被滥用。

安全做法：删除所有不必要的权限，只添加必需的。
```bash
# 删除所有能力，只添加必需的 NET_BIND_SERVICE(绑定 80 端口)
docker run -d --cap-drop=ALL --cap-add=NET_BIND_SERVICE nginx:1.26-alpine

# 删除特定的危险能力
docker run -d --cap-drop=SYS_ADMIN --cap-drop=NET_ADMIN --cap-drop=DAC_OVERRIDE nginx
```
常见需要保留的能力：

|能力|说明|是否需要保留|
|---|---|---|
|NET_BIND_SERVICE|绑定 1024 以下端口|如果容器监听 80、443 端口则需要|
|CHOWN|改变文件所有者|大多数应用不需要|
|DAC_OVERRIDE|绕过文件访问权限|大多数应用不需要|
|SYS_ADMIN|各种系统管理操作|高危险，通常不需要|
### 4.3 禁止容器运行特权模式
特权模式(--privileged)让容器获得宿主机几乎所有的权限，生产环境绝对禁止使用。
```bash
# 绝对禁止(生产环境)
docker run -d --privileged myapp:1.0
```
如果需要访问宿主机设备(如 USB、GPU)：
```bash
# 只添加特定设备，而不是使用特权模式
docker run -d --device=/dev/ttyUSB0:/dev/ttyUSB0 myapp:1.0

# 或为 GPU 使用专门的 runtime
docker run -d --gpus all myapp:1.0
```
### 4.4 限制容器的文件系统权限
将容器的根文件系统设置为只读，防止攻击者在容器内创建或修改文件。
```bash
# 根文件系统只读 + 临时目录可写
docker run -d --read-only --tmpfs /tmp:rw myapp:1.0
```
命令解释：
- `--read-only`：容器的根文件系统为只读模式。
- `--tmpfs /tmp:rw`：将 `/tmp` 目录挂载为可读写(用于存放临时文件)。
在 Compose 中配置：
```yaml
services:
  app:
    image: myapp:1.0
    read_only: true
    tmpfs:
      - /tmp:rw
```
### 4.5 设置容器资源限制
资源限制不仅是性能优化手段，也是安全措施。它可以防止单个容器耗尽宿主机资源，导致 DoS(拒绝服务)攻击。
```bash
# CPU 和内存限制
docker run -d --cpus=1.0 --memory=512M --memory-swap=512M myapp:1.0
```
生产环境必设参数：

|参数|建议值|说明|
|---|---|---|
|--memory|根据应用需求|硬限制，必须设置|
|--memory-swap|等于 --memory|禁用 Swap|
|--cpus|根据应用需求|CPU 软限制|
|--restart|unless-stopped|异常退出时自动恢复|
### 4.6 禁止容器间使用 --link
`--link` 是旧版本的容器通信方式，存在安全风险。应使用自定义网络替代。
```bash
# 不推荐(旧方式)
docker run -d --name db mysql
docker run -d --name web --link db:db nginx

# 推荐(自定义网络)
docker network create appnet
docker run -d --network appnet --name db mysql
docker run -d --network appnet --name web nginx
```
### 4.7 使用 seccomp 限制系统调用
seccomp(安全计算模式)限制容器可以使用的 Linux 系统调用(syscall)，减少攻击面。
Docker 默认使用 seccomp 配置文件，但可以使用自定义的严格配置文件：
```bash
# 使用 Docker 默认的 seccomp 配置(已经比较严格)
docker run -d nginx:1.26-alpine

# 使用自定义的严格配置文件
docker run -d --security-opt seccomp=./strict-seccomp.json nginx
```

## 五、网络安全
### 5.1 使用自定义网络隔离服务
不同服务应该部署在不同的网络中，只允许必要的通信。

错误做法(所有服务在同一个网络)：
```yaml
services:
  web:
    image: nginx
    networks:
      - default
  db:
    image: mysql
    networks:
      - default
```
正确做法(网络分层隔离)：
```yaml
version: '3.8'

services:
  web:
    image: nginx
    networks:
      - frontend
    # Web 只能访问 App，不能访问 DB

  app:
    image: myapp
    networks:
      - frontend
      - backend
    # App 同时连接两个网络，作为桥梁

  db:
    image: mysql
    networks:
      - backend
    # DB 只暴露在 backend，Web 完全看不到

networks:
  frontend:
  backend:
```
### 5.2 不对外暴露不必要的端口
数据库、缓存、消息队列等内部服务不应该暴露在宿主机端口上。
错误做法：
```yaml
services:
  db:
    image: mysql:5.7
    ports:
      - "3306:3306"  # 数据库直接暴露在宿主机
```
正确做法：
```yaml
services:
  db:
    image: mysql:5.7
    # 不写 ports，只暴露在内部网络
    # 只有 App 容器可以通过 db:3306 访问
    networks:
      - backend
```
### 5.3 配置宿主机防火墙
在 Rocky Linux 8 上，使用 `firewalld` 限制对宿主机端口的访问。
```bash
# 只允许特定 IP 访问 SSH
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port port="22" protocol="tcp" accept'

# 只允许特定 IP 访问 Web 端口
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="80" protocol="tcp" accept'

# 重新加载防火墙规则
sudo firewall-cmd --reload
```
### 5.4 限制容器访问外网
对于不需要访问外网的容器(如数据库)，可以限制其出站流量。
```bash
# 创建没有出站路由的网络
docker network create --internal internal-net

# 在 internal-net 中运行容器(无法访问外网)
docker run -d --network internal-net --name db mysql:5.7
```
命令解释：
- --internal：创建的网桥网络没有 NAT 规则，容器无法访问宿主机外部网络。

## 六、数据安全
### 6.1 加密敏感数据存储
对于数据库密码、API 密钥等敏感信息，不应明文存储。

|方式|安全性|推荐度|
|---|---|---|
|硬编码在 Dockerfile 中|极低|绝对禁止|
|放在环境变量文件中|中等|开发环境可用|
|使用 Docker Secrets|高|Swarm 模式|
|使用密钥管理工具(Vault、KMS)|极高|生产环境推荐|
|使用 Kubernetes Secrets|高|K 3 s/K 8 s 环境|

使用 Docker Secrets(Swarm 模式)：
```yaml
version: '3.8'

services:
  app:
    image: myapp:1.0
    secrets:
      - db_password
      - api_key

secrets:
  db_password:
    external: true
  api_key:
    external: true
```
### 6.2 限制数据卷的访问权限
在挂载数据卷时，应限制容器对宿主机目录的写入权限。
```bash
# 只读挂载(容器只能读取，不能修改)
docker run -d -v /config:/app/config:ro myapp:1.0

# 限制目录权限(SELinux)
docker run -d -v /host/data:/app/data:z myapp:1.0
```
### 6.3 定期备份数据卷
数据卷中的内容应定期备份，防止数据丢失。
```bash
# 备份数据卷
docker run --rm -v mydata:/source -v $(pwd):/backup alpine \
  tar czf /backup/mydata-$(date +%Y%m%d).tar.gz -C /source .

# 保留最近 30 天的备份
find . -name "mydata-*.tar.gz" -mtime +30 -delete
```

## 七、日志与审计
### 7.1 配置容器日志轮转
防止容器日志无限增长占满磁盘。
```bash
# 在 daemon.json 中全局配置
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}

# 或在 docker run 中单独指定
docker run -d --log-opt max-size=10m --log-opt max-file=3 nginx
```
### 7.2 启用 Docker 守护进程的审计日志
在 系统上，通过 auditd 记录 Docker 操作。
```bash
# 创建审计规则
sudo cat > /etc/audit/rules.d/docker.rules << EOF
# 记录所有 docker 命令的执行
-a always,exit -S execve -F path=/usr/bin/docker -k docker
# 记录对 docker.sock 的访问
-a always,exit -S openat -F path=/var/run/docker.sock -k docker-sock
EOF

# 重启 auditd 服务
sudo systemctl restart auditd

# 查看审计日志
sudo ausearch -k docker
```
### 7.3 查看容器日志中的可疑行为
```bash
# 查看容器日志
docker logs web

# 搜索错误和警告
docker logs web 2>&1 | grep -i "error\|warn\|fail"

# 查看最近 100 行
docker logs --tail 100 web
```



