## 一、用户权限是容器安全的核心
### 1.1 容器权限的本质
容器的用户权限，本质上就是 Linux 用户权限在容器环境中的延续。容器内的进程和宿主机上的其他进程一样，都受 Linux 内核的自主访问控制(DAC) 机制约束—内核只认 UID(用户 ID)数字，不认用户名。
通俗理解：
- 容器内有一个用户叫 `appuser`，它的 UID 是 `1000`。
- 容器内还有一个用户叫 `root`，它的 UID 是 `0`。
- Linux 内核看到一个进程的 UID 是 `0`，就知道它是 root，拥有最高权限。
- 内核看到一个进程的 UID 是 `1000`，就按照普通用户权限处理。
关键认知：容器内的 root(UID=0)和宿主机的 root(UID=0)在 Linux 内核看来是同一个用户。 这就是容器逃逸风险的根本来源。
### 1.2 容器以root 运行
如果你不指定用户，Docker 容器默认以 root(UID=0) 运行。
```bash
# 启动一个容器(默认以 root 运行)
docker run -d --name web nginx

# 查看容器内当前用户
docker exec web whoami
# 输出: root
```
默认以 root 运行带来的风险：
1. 容器逃逸：如果容器内应用存在漏洞，攻击者可能突破容器限制，获得宿主机 root 权限
2. 文件权限破坏：容器内进程可以修改宿主机挂载目录中的任何文件(包括系统关键文件)
3. 安全攻击面扩大：攻击者可以利用容器内的 root 权限安装恶意软件、修改系统配置
4. 合规风险：等保、GDPR 等合规要求通常要求应用不以 root 运行
### 1.3 最小权限原则
最小权限原则是容器安全的核心指导思想：
只给予容器运行所需的最小权限，不多给任何额外权限。

|原则|在容器中的体现|
|---|---|
|不以 root 运行|创建专用用户运行应用|
|不挂载不必要的目录|只挂载应用需要访问的数据目录|
|不给予不必要的 Linux Capability|只添加必需的能力(如 NET_BIND_SERVICE)|
|不使用特权模式|绝对禁止 `--privileged` |
-- -
## 二、内核权限模型
### 2.1 UID 
Linux 内核在检查权限时，只看 UID 数字，完全忽略用户名，UID 是内核唯一的身份标识。

| 内核看到的    | 内核的处理方式                          |
| -------- | -------------------------------- |
| UID=0    | 超级用户，拥有所有权限                      |
| UID=1000 | 普通用户，按照文件权限和 Capability 决定可执行的操作 |
| UID=1001 | 另一个普通用户，和 UID=1000 完全隔离          |
用户名只是给人看的标签：
- `/etc/passwd` 文件的作用就是将 UID 映射为可读的用户名。
- 如果内核看到一个 UID 在 `/etc/passwd` 中没有对应的名字，它不会报错，只是 `ls -l` 显示数字而已。
- 权限判决完全不依赖用户名是否存在于 `/etc/passwd` 中。
### 2.2 容器与宿主机的UID 
容器内 UID=1000 的进程，在宿主机内核看来就是 UID=1000 的进程。 权限判决完全基于数字匹配：

|场景|容器内|宿主机|内核判断|
|---|---|---|---|
|进程 UID=1000，访问宿主机目录 /data(owner=1000)|appuser|(可能有用户叫 fmc，UID=1000)|✅ 允许访问|
|进程 UID=1000，访问宿主机目录 /data(owner=1001)|appuser|(可能有用户叫 mike，UID=1001)|❌ 拒绝访问|
|进程 UID=0，访问宿主机任何目录|root|root|✅ 允许访问(危险！)|
结论：
- 容器内用户名和宿主机用户名不需要一致。
- 容器内 UID 和宿主机 UID 必须匹配，才能访问对应的文件。
- 如果容器以 root(UID=0)运行，它在宿主机上就是 root，拥有所有权限。
### 2.3 官方镜像的用户 UID 查询
不同官方镜像使用的默认用户和 UID 各不相同。生产环境中如果需要挂载目录，需要知道正确的 UID。

|官方镜像|默认用户|UID|
|---|---|---|
|nginx|nginx|101|
|alpine|root|0(默认 root)|
|ubuntu|root|0(默认 root)|
|mysql|mysql|999|
|redis|redis|999|
|postgres|postgres|999|
|node|node|1000|
|python|root|0(默认 root)|
查询方法：
```bash
# 方法一：在容器内执行 id 命令
docker run --rm nginx:alpine id nginx
# 输出: uid=101(nginx) gid=101(nginx) groups=101(nginx)

# 方法二：查看镜像内的 /etc/passwd
docker run --rm nginx:alpine cat /etc/passwd | grep nginx
```
Nginx 容器挂载示例：
```bash
# Nginx 容器内的用户是 nginx，UID=101
# 宿主机挂载目录需要归 UID=101 所有
sudo mkdir -p /data/nginx
sudo chown -R 101:101 /data/nginx

# 启动容器
docker run -d -v /data/nginx:/usr/share/nginx/html nginx:alpine
```

### 2.4 验证 UID 匹配的实验
```bash
# 1. 在宿主机上创建一个目录，归 UID=1000 所有
sudo mkdir /data/test
sudo chown 1000:1000 /data/test
sudo ls -ld /data/test
# 输出: drwxr-xr-x 2 1000 1000 4096 ... /data/test

# 2. 启动一个容器，以 UID=1000 运行
docker run --rm -v /data/test:/app/data --user 1000:1000 alpine sh -c "echo hello > /app/data/hello.txt"

# 3. 在宿主机上检查文件
sudo cat /data/test/hello.txt
# 输出: hello(文件成功创建)

# 4. 启动一个容器，以 UID=1001 运行
docker run --rm -v /data/test:/app/data --user 1001:1001 alpine sh -c "echo world > /app/data/world.txt"
# 报错: Permission denied(因为目录 owner=1000，容器进程 UID=1001 无权写入)
```
-- -
## 三、在容器中配置非 root 用户
### 3.1 在 Dockerfile 中创建用户
标准做法：在 Dockerfile 中使用 adduser 或 useradd 创建专用用户，然后用 USER 指令切换。
```dockerfile
FROM alpine:3.18

# 创建用户组和用户(UID 固定为 1000)
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -D -h /app appuser

# 切换为 appuser
USER appuser

# 后续的 RUN、CMD、ENTRYPOINT 都以 appuser 身份执行
WORKDIR /app
COPY . .
CMD ["/app/start.sh"]
```
命令解释：
- `addgroup -g 1000 appgroup`：创建 GID 为 1000 的用户组 `appgroup`。
- `adduser -u 1000 -G appgroup -D -h /app appuser`：
    - `-u 1000`：指定 UID 为 1000。
    - `-G appgroup`：将用户加入 `appgroup` 组。
    - `-D`：不设置密码(disabled password)。
    - `-h /app`：设置家目录为 `/app`。
    - `appuser`：用户名。
- `USER appuser`：切换为 `appuser`，后续指令以该用户身份执行。
### 3.2 不同基础镜像的用户创建命令
|基础镜像|创建用户命令|示例|
|---|---|---|
|Alpine|`adduser -u 1000 -D appuser`|`RUN adduser -u 1000 -D appuser`|
|Debian/Ubuntu|`useradd -u 1000 -m appuser`|`RUN useradd -u 1000 -m appuser`|
|Rocky Linux|`useradd -u 1000 -m appuser`|`RUN useradd -u 1000 -m appuser`|
Alpine 完整示例：
```dockerfile
FROM alpine:3.18
RUN adduser -u 1000 -D appuser
USER appuser
```
Debian/Ubuntu 完整示例：
```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -u 1000 -m appuser
USER appuser
```
### 3.3 在 docker run 中指定用户
如果镜像中没有创建用户，也可以在运行时通过 --user 参数指定 UID。
```bash
# 以 UID=1000，GID=1000 运行
docker run --user 1000:1000 nginx

# 以用户名运行(镜像中必须已存在该用户)
docker run --user appuser nginx
```
生产环境建议：优先在 Dockerfile 中创建用户，而不是在运行时指定。因为：
- 镜像自包含，拉下来就能用，不依赖运行时参数。
- 可以在镜像构建阶段验证用户是否存在。
- 便于在 Compose 中统一管理。
### 3.4 在 Docker Compose 中指定用户
```yaml
services:
  web:
    image: nginx:1.26-alpine
    user: 1000:1000
    # 或使用用户名(镜像中需存在)
    # user: nginx
    volumes:
      - ./html:/usr/share/nginx/html
```
生产环境建议：使用数字 UID:GID，而不是用户名。因为用户名可能在不同镜像中不一致，但 UID 是固定的。
-- -
## 四、更精细的权限控制
### 4.1 Linux Capability 概念
Linux Capability 将 root 用户的特权拆分成了多个独立的能力。容器可以只获得特定的能力，而不是全部 root 权限。
默认情况下，容器拥有以下能力(非完整列表)：

|Capability|作用|
|---|---|
|CAP_CHOWN|改变文件所有者|
|CAP_DAC_OVERRIDE|绕过文件读/写/执行权限检查|
|CAP_NET_BIND_SERVICE|绑定 1024 以下的端口|
|CAP_SETUID|改变进程 UID|
|CAP_SETGID|改变进程 GID|
|CAP_SYS_CHROOT|使用 chroot 系统调用|
### 4.2 删除和添加 Capability
安全做法：删除所有不必要的 Capability，只添加必需的。
```bash
# 删除所有 Capability，只添加 NET_BIND_SERVICE(绑定 80/443 端口)
docker run -d \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  nginx
```
命令解释：
- `--cap-drop=ALL`：删除容器默认拥有的所有 Capability。
- `--cap-add=NET_BIND_SERVICE`：只添加绑定 1024 以下端口的能力。
常用 Capability 组合：

|场景|推荐配置|
|---|---|
|Nginx(绑定 80/443)| `--cap-drop=ALL --cap-add=NET_BIND_SERVICE` |
|应用(绑定 8080 以上端口)| `--cap-drop=ALL`(不需要任何额外能力)|
|数据库(需要 chown 数据目录)| `--cap-drop=ALL --cap-add=CHOWN` |
|Ping 命令(需要原始套接字)| `--cap-drop=ALL --cap-add=NET_RAW` |
### 4.3 在 Compose 中配置 Capability
```yaml
services:
  web:
    image: nginx:1.26-alpine
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    ports:
      - "80:80"
```
-- -
## 五、特权模式与安全风险
### 5.1 特权模式概念
`--privileged` 让容器获得宿主机几乎所有的权限，相当于容器内的 root 就是宿主机的 root。
```bash
# 绝对禁止(生产环境)
docker run -d --privileged nginx
```
特权模式授予的能力：
- 访问宿主机所有设备(`/dev/*`)。
- 挂载/卸载文件系统。
- 修改宿主机内核参数。
- 访问宿主机所有网络接口。
### 5.2 为什么生产环境禁止特权模式
| 风险   | 说明                     |
| ---- | ---------------------- |
| 容器逃逸 | 攻击者可以轻松突破容器隔离，控制宿主机    |
| 设备访问 | 容器可以读写宿主机任何设备(包括磁盘)    |
| 内核攻击 | 容器可以加载内核模块，造成系统崩溃      |
| 合规问题 | 等保、PCI-DSS 等合规要求禁止特权容器 |
### 5.3 容器按需添加设备
如果容器确实需要访问特定设备(如 USB、GPU)，不应该使用特权模式，而是只添加需要的设备。
```bash
# 错误(特权模式)
docker run --privileged myapp

# 正确(只添加特定设备)
docker run --device=/dev/ttyUSB0:/dev/ttyUSB0 myapp

# 正确(添加 GPU 支持)
docker run --gpus all myapp
```
-- -
## 六、在生产环境中的权限管理实践
### 7.1 统一 UID 规划
在组织内部，建议为不同项目统一规划 UID 范围，避免混乱。

|UID 范围|用途|
|---|---|
|0-99|系统保留|
|100-999|系统服务(如官方镜像的 nginx=101)|
|1000-1999|项目 A 的容器用户|
|2000-2999|项目 B 的容器用户|
|3000-3999|项目 C 的容器用户|
### 7.2 挂载目录权限管理流程
标准操作流程：
1. 确定容器内用户的 UID(如 Nginx 是 101)。
2. 在宿主机上创建挂载目录。
3. 将目录的所有权改为容器内用户的 UID。
4. 在 Compose 中挂载该目录。
```bash
# 步骤 1：确定 UID
docker run --rm nginx:alpine id nginx
# uid=101(nginx)

# 步骤 2：创建目录
sudo mkdir -p /data/project-a/nginx

# 步骤 3：修改所有权
sudo chown -R 101:101 /data/project-a/nginx

# 步骤 4：挂载目录
```

```yaml
# docker-compose.yml
services:
  web:
    image: nginx:alpine
    volumes:
      - /data/project-a/nginx:/usr/share/nginx/html
```
### 7.3 创建宿主机 UID 对应的用户(便于运维)
虽然宿主机有没有对应的用户名不影响权限，但为了运维方便，建议创建。
```bash
# 创建一个 UID=101 的用户(与 Nginx 容器匹配)
sudo useradd -u 101 -m -s /bin/bash nginx-host

# 现在 ls -l 会显示用户名
ls -ld /data/project-a/nginx
# 输出: drwxr-xr-x 2 nginx-host nginx-host 4096 ... /data/project-a/nginx
```
-- -
## 八、总结
Docker 容器用户权限与安全是生产环境稳定运行的基石。
1. 内核只看 UID，不看用户名：
    - 权限判决基于 UID 数字匹配，不是用户名。
    - 容器内 UID 和宿主机 UID 一致时，权限一致。
    - 容器内 root(UID=0)在宿主机上就是 root。
2. 不以 root 运行容器是最基本的安全措施：
    - 在 Dockerfile 中使用 `adduser` 创建专用用户。
    - 使用 `USER` 指令切换为非 root 用户。
    - 在 Compose 中使用 `user: 1000:1000` 指定用户。
3. 挂载目录权限问题的根源是 UID 不匹配：
    - 修改宿主机目录 owner 为容器内 UID。
    - 或在运行时使用 `--user` 指定与宿主机匹配的 UID。
4. Linux Capability 提供更精细的权限控制：
    - `--cap-drop=ALL` 删除所有能力。
    - `--cap-add=NET_BIND_SERVICE` 只添加绑定 80 端口的能力。
    - 生产环境禁止使用 `--privileged`。
