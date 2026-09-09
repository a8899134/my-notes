## 一、故障排查的思维框架
### 1.1 排错的基本原则
容器故障排查与传统服务器排错类似，但增加了容器编排层和镜像层的复杂性。遵循以下原则可以事半功倍：

|原则|说明|
|---|---|
|先看状态，再看日志|先确认容器在不在、跑没跑，再查日志找原因|
|先看宿主机，再看容器|宿主机资源耗尽(磁盘满、内存不足)是容器问题的常见根源|
|先看配置，再看代码|配置文件错误导致的启动失败比代码 Bug 更常见|
|由外到内|从端口映射→容器状态→容器内部进程→应用日志，逐层排查|
### 1.2 故障排查的“三板斧”
无论遇到什么问题，都可以先执行以下三步，覆盖 70% 的场景：
```bash
# 第一步：查看容器状态(是不是在跑？)
docker ps -a

# 第二步：查看容器日志(有没有报错？)
docker logs 容器名 --tail 50

# 第三步：查看容器资源使用(有没有爆满？)
docker stats --no-stream 容器名
```
### 1.3 故障排查的环境上下文
在 生产环境中，排错前需要确认以下上下文信息：

|排查项|命令|说明|
|---|---|---|
|Docker 服务是否运行| `sudo systemctl status docker` |确认 dockerd 正常运行|
|当前用户是否有权限| `docker version` |如果报权限错误，检查 `docker` 组|
|磁盘空间是否充足| `df -h /var/lib/docker` |Docker 数据目录空间不足会导致无法拉取镜像或容器无法启动|
|内存是否充足| `free -h` |内存不足可能导致容器被 OOM Killer 杀死|
-- -
## 二、容器启动失败
### 2.1 容器无法启动，退出码非 0
现象：执行 docker run 后容器立即退出，docker ps -a 显示状态为 Exited。
排查步骤：
```bash
# 1. 查看退出码
docker inspect 容器名 --format='{{.State.ExitCode}}'

# 2. 查看完整状态信息
docker inspect 容器名 --format='{{.State.Status}}'

# 3. 查看错误日志(最重要)
docker logs 容器名
```
常见退出码含义：

|退出码|含义|常见原因|
|---|---|---|
|0|正常退出|容器任务已完成(非长期运行应用)|
|1|应用错误退出|应用内部报错(如 Python 异常、Java 错误)|
|125|Docker 自身错误|镜像拉取失败、命令格式错误|
|126|命令无法执行|可执行文件没有执行权限|
|127|命令找不到|CMD/ENTRYPOINT 指定的命令不存在|
|137|被 SIGKILL 杀死|OOM Killer 杀死，或手动 `docker kill` |
|143|收到 SIGTERM 信号|容器正常退出(如 `docker stop`)|
典型案例：命令找不到(退出码 127)
```bash
docker run --rm alpine:latest /no/such/command
# 输出: exec: "/no/such/command": stat /no/such/command: no such file or directory
# 退出码: 127
```
解决方案：检查 Dockerfile 中的 CMD 和 ENTRYPOINT 路径是否正确。
### 2.2 端口被占用
现象：启动容器时提示 port is already allocated 或 bind: address already in use。
排查方法：
```bash
# 查看哪个容器占用了端口
docker ps --filter "publish=8080"

# 查看宿主机端口占用
sudo netstat -tulpn | grep 8080
# 或
sudo ss -tulpn | grep 8080
```
解决方案：
```bash
# 方案一：停止占用端口的容器
docker stop 占用端口的容器名

# 方案二：修改端口映射，使用其他宿主机端口
docker run -d -p 8081:80 nginx

# 方案三：查看端口映射冲突
docker port 容器名
```
生产环境建议：在 Compose 文件中规划好端口分配，避免冲突。
### 2.3 镜像拉取失败
现象：docker pull 或 docker run 时提示 Unable to find image 或 pull access denied。
常见原因及解决方案：

|错误信息|原因|解决方案|
|---|---|---|
|pull access denied|镜像不存在或私仓未登录|检查镜像名是否正确，执行 `docker login` |
|context deadline exceeded|网络超时|配置镜像加速器，或使用镜像代理|
|no matching manifest|镜像与 CPU 架构不匹配|使用 `--platform` 指定架构(如 `--platform linux/amd64`)|
|EOF 或 connection reset|网络不稳定|重试拉取，或换用国内镜像源|
镜像加速器配置：
```bash
# 编辑 /etc/docker/daemon.json
{
  "registry-mirrors": ["https://your-mirror.aliyuncs.com"]
}
sudo systemctl restart docker
```
-- -
## 三、容器运行异常
### 3.1 容器运行中但服务不可访问
现象：docker ps 显示容器 Up，但浏览器或 curl 访问端口无响应或返回错误。
排查步骤：
```bash
# 1. 检查端口映射是否正确
docker port 容器名
# 输出示例: 80/tcp -> 0.0.0.0:8080

# 2. 检查容器内部服务是否正常监听
docker exec 容器名 netstat -tulpn | grep 端口号
# 或
docker exec 容器名 ss -tulpn | grep 端口号

# 3. 在容器内部测试服务
docker exec 容器名 curl -f http://localhost:端口号
# 如果没有 curl，可以用 wget
docker exec 容器名 wget -q -O- http://localhost:端口号

# 4. 检查宿主机防火墙是否放行端口
sudo firewall-cmd --list-ports
```
常见原因：

|原因|排查方法|解决方案|
|---|---|---|
|应用监听在 127.0.0.1 而非 0.0.0.0| `docker exec 容器名 netstat -tulpn` |修改应用配置，监听 `0.0.0.0` |
|防火墙未放行端口| `sudo firewall-cmd --list-ports` |执行 `firewall-cmd --add-port=8080/tcp --permanent` |
|容器内部服务崩溃| `docker exec 容器名 ps aux` |查看服务进程是否存在|
|健康检查失败(如有)| `docker inspect 容器名 --format='{{.State.Health.Status}}'` |查看健康检查日志|
### 3.2 容器频繁重启
现象：docker ps -a 显示容器的 STATUS 为 Restarting 或 Up X seconds，然后循环重启。
排查步骤：
```bash
# 1. 查看容器日志
docker logs 容器名 --tail 50

# 2. 查看重启次数
docker inspect 容器名 --format='{{.RestartCount}}'

# 3. 查看重启策略
docker inspect 容器名 --format='{{.HostConfig.RestartPolicy.Name}}'

# 4. 进入容器调试(如果容器能短暂启动)
docker exec -it 容器名 /bin/sh
```
常见原因：

|原因|排查方法|解决方案|
|---|---|---|
|启动命令执行失败| `docker logs` 显示错误|修复命令或配置文件|
|依赖服务未就绪| `docker logs` 显示连接超时|增加 `depends_on` 或健康检查等待|
|内存超限被 OOM| `docker inspect` 显示 `OOMKilled: true` |增加内存限制或优化应用|
|健康检查失败导致重启|查看健康检查状态|调整健康检查参数|
### 3.3 容器内应用报错
现象：容器运行正常，但业务功能异常(如数据库连接失败、返回 500 错误)。
排查方法：
```bash
# 1. 查看容器日志
docker logs 容器名 --tail 100

# 2. 进入容器内部查看应用日志(如果有写日志文件)
docker exec -it 容器名 /bin/sh
# 进入后查看 /var/log/ 下的应用日志

# 3. 检查环境变量是否正确
docker inspect 容器名 --format='{{.Config.Env}}'

# 4. 检查 DNS 解析是否正常
docker exec 容器名 cat /etc/resolv.conf
docker exec 容器名 nslookup 依赖服务名
```
环境变量未生效的常见原因：

|原因|说明|
|---|---|
|拼写错误|变量名大小写错误(如 `DB_PASSWORD` 写成了 `DB_PassWord`)|
|引用方式错误|在 Compose 中使用了 `${VAR}` 但 `.env` 文件中没有定义|
|优先级覆盖|多个地方定义了同一个变量，后定义的覆盖了先定义的|
-- -
## 四、网络故障
### 4.1 容器无法访问外网
现象：容器内 ping 8.8.8.8 或 curl 外网地址失败。
排查步骤：
```bash
# 1. 检查宿主机网络是否正常
ping 8.8.8.8

# 2. 检查容器的网络模式
docker inspect 容器名 --format='{{.HostConfig.NetworkMode}}'

# 3. 进入容器测试
docker exec -it 容器名 /bin/sh
ping 8.8.8.8
curl http://example.com

# 4. 检查 DNS 配置
docker exec 容器名 cat /etc/resolv.conf

# 5. 检查 IP 转发是否开启
sysctl net.ipv4.ip_forward
# 应为 1，如果不是则执行：
sudo sysctl -w net.ipv4.ip_forward=1
```
常见原因：

|原因|解决方案|
|---|---|
|宿主机 IP 转发未开启| `sysctl -w net.ipv4.ip_forward=1` |
|防火墙阻止转发|将 `docker0` 加入 `trusted` 区域|
|容器网络模式为 `none` |检查 `--network none` 是否误用|
|DNS 配置错误|使用 `--dns` 指定 DNS 服务器|
### 4.2 容器间无法通信
现象：容器 A 无法 ping 通或访问容器 B 的服务。
排查步骤：
```bash
# 1. 检查两个容器是否在同一网络
docker inspect 容器A --format='{{json .NetworkSettings.Networks}}' | jq
docker inspect 容器B --format='{{json .NetworkSettings.Networks}}' | jq

# 2. 检查容器 B 的服务是否在正确端口监听
docker exec 容器B netstat -tulpn | grep 端口号

# 3. 检查防火墙对 docker0 网桥的限制
sudo firewall-cmd --get-zone-of-interface=docker0

# 4. 在容器 A 中检查 DNS 解析
docker exec 容器A cat /etc/hosts
docker exec 容器A nslookup 容器B名
```
解决方案：
```bash
# 确保两个容器在同一自定义网络
docker network create mynet
docker network connect mynet 容器A
docker network connect mynet 容器B

# 将 docker0 网桥加入 trusted 区域(避免防火墙限制)
sudo firewall-cmd --zone=trusted --add-interface=docker0 --permanent
sudo firewall-cmd --reload
```
-- -
## 五、数据卷与权限故障
### 5.1 Permission Denied
现象：容器启动后无法读取或写入挂载的宿主机目录，日志中出现 Permission denied。
排查方法：
```bash
# 1. 查看宿主机目录的所有者
ls -ld /host/path

# 2. 查看容器内运行用户的 UID
docker exec 容器名 id

# 3. 查看容器内用户
docker exec 容器名 whoami
```
解决方案：

|方案|命令|
|---|---|
|修改宿主机目录 owner| `sudo chown -R 1000:1000 /host/path` |
|运行时指定用户| `docker run --user 1000:1000` |
|解决 SELinux 问题| `sudo chcon -Rt svirt_sandbox_file_t /host/path` 或挂载时加 `:z` |
|使用命名卷替代绑定挂载| `docker volume create mydata` |
### 5.2 数据卷内容为空或丢失
现象：挂载的数据卷中看不到预期的文件，或容器重启后数据丢失。
排查方法：
```bash
# 1. 查看数据卷列表
docker volume ls

# 2. 查看数据卷详情
docker volume inspect 数据卷名

# 3. 检查容器挂载是否正确
docker inspect 容器名 --format='{{.Mounts}}'

# 4. 进入数据卷目录查看内容(需 root)
sudo ls -la /var/lib/docker/volumes/数据卷名/_data
```
常见原因：

|原因|说明|
|---|---|
|挂载路径错误|容器内挂载路径写错，文件写到了其他地方|
|宿主机目录覆盖|绑定挂载时，宿主机目录覆盖了容器内已有的文件|
|命名卷名称错误|在 Compose 中引用了不存在的卷名|
|容器删除时误删数据|使用了 `docker rm -v` 删除了数据卷|
### 5.3 磁盘空间不足
现象：容器无法写入数据，或 docker pull 失败，报错 no space left on device。
排查方法：
```bash
# 1. 查看 Docker 数据目录磁盘使用率
df -h /var/lib/docker

# 2. 查看 Docker 磁盘使用概况
docker system df

# 3. 查看详细信息
docker system df -v

# 4. 查找大文件
sudo du -sh /var/lib/docker/containers/* | sort -hr | head -10
```
解决方案：
```bash
# 1. 清理未使用的资源
docker system prune -a -f

# 2. 清理所有未使用的数据卷
docker volume prune -f

# 3. 清理容器日志
sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log

# 4. 配置日志轮转(根治方案)
# 在 /etc/docker/daemon.json 中添加：
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
sudo systemctl restart docker
```
-- -
## 六、资源不足故障
### 6.1 容器内存超限(OOM)
现象：容器被杀死，docker inspect 显示 "OOMKilled": true。
排查方法：
```bash
# 1. 查看 OOM 状态
docker inspect 容器名 --format='{{.State.OOMKilled}}'

# 2. 查看容器退出码(137 表示被 SIGKILL)
docker inspect 容器名 --format='{{.State.ExitCode}}'

# 3. 查看宿主机 OOM 日志
sudo dmesg | grep -i "out of memory" | tail -10

# 4. 查看容器内存使用峰值
docker stats --no-stream 容器名

# 5. 查看容器的内存限制
docker inspect 容器名 --format='{{.HostConfig.Memory}}'
```
解决方案：

|方案|说明|
|---|---|
|增加内存限制| `--memory` 设置更大的值|
|优化应用内存使用|排查内存泄露(`docker exec` 进入容器，使用 `top` 观察)|
|禁用 Swap| `--memory-swap=--memory` |
|添加重启策略| `--restart=always` 让容器自动恢复|
### 6.2 CPU 使用率过高
现象：容器 CPU 使用率持续超过 80%，影响其他容器或宿主机性能。
排查方法：
```bash
# 1. 查看容器的 CPU 使用率
docker stats --no-stream 容器名

# 2. 查看容器内进程的 CPU 使用
docker exec 容器名 top -b -n 1 | head -20

# 3. 查看容器 CPU 限制
docker inspect 容器名 --format='{{.HostConfig.CpuQuota}}'

# 4. 查看宿主机整体负载
top -b -n 1 | head -10
```
解决方案：

|方案|说明|
|---|---|
|设置 CPU 限制| `--cpus` 限制最大使用核心数|
|绑定 CPU 核心| `--cpuset-cpus` 限制到特定核心|
|降低进程优先级|设置 `--cpu-shares` 降低权重|
|优化应用代码|减少不必要的循环、增加缓存|
-- -
## 七、镜像相关故障
### 7.1 镜像构建失败
现象：docker build 过程中某个 RUN 指令报错，构建中断。
排查方法：
```bash
# 1. 查看详细的构建输出
docker build --progress=plain -t myapp:test .

# 2. 在失败层之前调试
# 在 Dockerfile 中失败指令前，手动插入调试命令
RUN ls -la
RUN cat /etc/os-release

# 3. 利用缓存，在错误层启动容器调试
# 找到构建失败时的最后一层 ID
docker build --no-cache -t myapp:test .
# 假设失败前成功层的 ID 是 abc123
docker run -it abc123 /bin/sh
```
常见原因及解决方案：

|错误信息|原因|解决方案|
|---|---|---|
|COPY failed: no such file|源文件不存在|检查构建上下文路径是否正确|
|RUN command not found|命令不存在|检查命令拼写，或先安装依赖|
|Permission denied|权限不足|使用 `sudo` 或 `--user` |
|Network timeout|网络超时|更换软件源，或使用 `--network=host` |
### 7.2 镜像体积过大
现象：镜像文件超过 1GB，拉取和推送都很慢。
排查方法：
```bash
# 1. 查看镜像分层大小
docker history 镜像名:标签

# 2. 查看镜像中最大的文件
docker run --rm 镜像名:标签 du -sh /* 2>/dev/null | sort -hr | head -20

# 3. 分析镜像内容
docker run --rm 镜像名:标签 find / -type f -size +10M 2>/dev/null
```
**优化方案**：

|优化手段|示例|
|---|---|
|使用轻量级基础镜像|`FROM alpine:3.18` 代替 `FROM ubuntu:22.04`|
|合并 RUN 指令|`RUN apt-get update && apt-get install -y xxx`|
|清理缓存|`RUN apt-get clean && rm -rf /var/lib/apt/lists/*`|
|使用多阶段构建|构建阶段用完整镜像，运行阶段用精简镜像|
|使用 .dockerignore|排除不必要的文件|
-- -
## 八、日志相关故障
### 8.1 docker logs 不显示任何内容
现象：容器运行正常，但 docker logs 没有任何输出。
排查方法：
```bash
# 1. 检查日志驱动
docker inspect 容器名 --format='{{.HostConfig.LogConfig.Type}}'

# 2. 如果驱动是 journald
sudo journalctl CONTAINER_NAME=容器名

# 3. 检查应用是否输出到 stdout
docker exec 容器名 ps aux
```
解决方案：
```bash
# 修改日志驱动(重新创建容器)
docker run -d --log-driver json-file 容器名

# 全局配置(/etc/docker/daemon.json)
{
  "log-driver": "json-file"
}
```
### 8.2 日志文件过大占满磁盘
现象：docker logs 无法查看，磁盘空间不足。
紧急处理：
```bash
# 清空单个容器的日志
sudo truncate -s 0 $(docker inspect 容器名 --format='{{.LogPath}}')

# 清空所有容器日志
sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log
```
-- -
## 九、Docker 服务自身故障
### 9.1 Docker 守护进程无法启动
现象：systemctl start docker 失败。
排查方法：
```bash
# 查看服务状态
sudo systemctl status docker

# 查看服务日志
sudo journalctl -u docker -n 50 --no-pager

# 查看 Docker 守护进程日志
sudo tail -f /var/log/messages | grep docker
```
常见原因：

|原因|解决方案|
|---|---|
|daemon.json 语法错误|检查 JSON 格式，使用 `jq . daemon.json` 验证|
|磁盘空间不足| `df -h` 确认，清理空间后重启|
|防火墙冲突|检查 firewalld 与 Docker 的兼容性|
|内核版本过低| `uname -r` 确认内核版本 >= 3.10|
### 9.2 docker 命令返回权限错误
现象：执行 docker 命令时提示 permission denied 或 Cannot connect to the Docker daemon。
排查方法：
```bash
# 检查当前用户是否在 docker 组中
groups

# 检查 Docker socket 权限
ls -la /var/run/docker.sock
```
解决方案：
```bash
# 加入 docker 组
sudo usermod -aG docker $USER
# 重新登录后生效

# 或使用 sudo 执行
sudo docker 命令
```
-- -
## 十、故障排查命令速查表
|场景|命令|说明|
|---|---|---|
|查看所有容器状态|`docker ps -a`|显示所有容器(包括已停止的)|
|查看容器日志|`docker logs 容器名 --tail 50`|查看最近 50 行日志|
|查看容器详细信息|`docker inspect 容器名`|输出容器的完整元数据|
|查看容器退出码|`docker inspect 容器名 --format='{{.State.ExitCode}}'`|快速获取退出码|
|查看容器 OOM 状态|`docker inspect 容器名 --format='{{.State.OOMKilled}}'`|检查是否被 OOM 杀死|
|查看容器资源使用|`docker stats --no-stream 容器名`|查看 CPU、内存等使用|
|进入容器调试|`docker exec -it 容器名 /bin/sh`|进入容器 Shell|
|查看端口映射|`docker port 容器名`|查看容器的端口映射|
|查看镜像构建历史|`docker history 镜像名`|查看镜像分层历史|
|查看磁盘使用|`docker system df`|查看 Docker 磁盘占用|
|清理未使用资源|`docker system prune -a`|清理镜像、容器、网络|
|查看 Docker 服务状态|`sudo systemctl status docker`|查看 Docker 服务状态|
|查看 Docker 日志|`sudo journalctl -u docker -n 50`|查看 Docker 守护进程日志|
|验证 daemon.json|`jq . /etc/docker/daemon.json`|检查 JSON 语法|
-- -
## 十一、总结
Docker 容器故障排查是一个由外到内、层层递进的过程。
1. 排错三步走：先看状态(docker ps -a)→ 再看日志(docker logs)→ 最后查资源(docker stats)。
2. 常见启动失败原因：端口冲突、命令不存在、镜像拉取失败、内存超限。
3. 网络故障：检查网络模式、防火墙规则、容器间连通性。将 docker0 加入 trusted 区域可解决大部分防火墙问题。
4. 权限问题：内核只看 UID，容器内 UID 与宿主机目录 owner UID 必须一致。
5. 磁盘空间：配置日志轮转(max-size / max-file)是生产环境必须做的预防措施。
6. 镜像问题：使用轻量级基础镜像、合并 RUN 指令、多阶段构建是减少镜像体积的有效方法。
7. 排错底线：生产环境中，永远先备份数据再执行清理或重启操作。不确定的问题先在测试环境复现。

