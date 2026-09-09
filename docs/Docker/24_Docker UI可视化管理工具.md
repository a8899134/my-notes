## 一、 UI 管理工具作用
### 1.1 命令行 vs 可视化界面的取舍
Docker 命令行工具(`docker` 命令)功能强大、灵活高效，但在某些场景下，图形化界面可以显著提升效率。

|场景|命令行(CLI)|可视化界面(UI)|
|---|---|---|
|快速查看所有容器状态| `docker ps -a`，信息有限|一眼看到所有容器的状态、资源使用、健康检查|
|查看容器日志| `docker logs -f`，需手动滚动|点击容器即可查看实时日志，支持搜索和过滤|
|进入容器执行命令| `docker exec -it`，需记住命令|点击“终端”按钮即可进入容器 Shell|
|管理多个容器|需记住多个容器名|勾选即可批量操作(启动、停止、删除)|
|新手学习曲线|陡峭(需记住大量命令)|平缓(所见即所得)|
|自动化脚本|强(适合 CI/CD)|弱(不适合自动化)|
结论：UI 工具不能替代命令行，但可以作为辅助工具，提高日常管理和故障排查的效率。
### 1.2 UI 工具的核心功能
| 功能         | 说明                  |
| ---------- | ------------------- |
| 容器管理       | 查看、启动、停止、重启、删除、进入终端 |
| 镜像管理       | 查看镜像列表、拉取、删除、构建     |
| 数据卷管理      | 查看和删除数据卷            |
| 网络管理       | 查看网络、容器连接情况         |
| 日志查看       | 实时查看和搜索容器日志         |
| 资源监控       | 查看 CPU、内存、网络、磁盘使用情况 |
| Compose 管理 | 查看 Compose 项目和服务状态  |
-- -
## 二、主流 Docker UI 工具对比
### 2.1 工具分类概览
| 工具名称           | 定位                | 适用场景                       |
| -------------- | ----------------- | -------------------------- |
| Portainer      | 通用型容器管理平台         | 单机、Swarm、K8s 全场景           |
| Dockge         | 轻量级 Compose 专属 UI | 专注 `docker-compose.yml` 管理 |
| Docker Desktop | 集成开发环境(带 UI)      | 本地开发环境(macOS/Windows)      |
| cAdvisor       | 监控数据采集器           | 查看容器资源使用(无管理功能)            |
| Rancher        | 企业级容器管理平台         | Kubernetes 集群管理            |
### 2.2 工具功能对比
| 功能           | Portainer | Dockge | Docker Desktop | cAdvisor | Rancher |
| ------------ | --------- | ------ | -------------- | -------- | ------- |
| 容器管理(启停删)    | ✅         | ✅      | ✅              | ❌        | ✅       |
| 镜像管理         | ✅         | ❌      | ✅              | ❌        | ✅       |
| Compose 项目管理 | ✅         | ✅      | ✅              | ❌        | ❌       |
| 资源监控图表       | ✅         | ❌      | ✅              | ✅        | ✅       |
| 日志实时查看       | ✅         | ✅      | ✅              | ❌        | ✅       |
| 终端访问         | ✅         | ✅      | ✅              | ❌        | ✅       |
| 数据卷管理        | ✅         | ❌      | ✅              | ❌        | ✅       |
| 集群管理(K8s)    | ✅         | ❌      | ❌              | ❌        | ✅       |
| 安装复杂度        | 中         | 低      | 高(需图形界面)       | 低        | 高       |
| 资源占用         | 中         | 低      | 高              | 低        | 高       |
### 2.3 选择建议
| 你的场景                      | 推荐工具                |
| ------------------------- | ------------------- |
| 单机 Docker(测试/学习)          | Portainer 或 Dockge  |
| 多台 Docker 主机管理            | Portainer(支持多环境)    |
| 专门管理 `docker-compose.yml` | Dockge(轻量、专注)       |
| Kubernetes 集群             | Rancher 或 Portainer |
| 仅需查看容器资源                  | cAdvisor            |
-- -
## 三、Portainer
### 3.1 Portainer 简介
Portainer 是目前最流行的 Docker UI 管理工具，它支持：
- 单机 Docker 管理。
- Docker Swarm 集群管理。
- Kubernetes 集群管理(社区版支持有限，企业版更完善)。
Portainer 以容器方式运行，部署简单，开箱即用。
### 3.2 部署 Portainer
1. 使用 docker run 命令
```
docker volume create portainer_data

docker run -d \
  --name portainer \
  --restart=unless-stopped \
  -p 9000:9000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```
命令解释：
- `docker volume create portainer_data`：创建数据卷，用于持久化 Portainer 的配置数据。
- `-p 9000:9000`：将 Portainer Web 界面映射到宿主机的 9000 端口。
- `-v /var/run/docker.sock:/var/run/docker.sock`：挂载 Docker socket，让 Portainer 可以直接与 Docker 守护进程通信。
- `portainer/portainer-ce:latest`：Portainer 社区版镜像。

2. 使用 Docker Compose
```yaml
version: '3.8'

services:
  portainer:
    image: portainer/portainer-ce:latest
    container_name: portainer
    restart: unless-stopped
    ports:
      - "9000:9000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer_data:/data

volumes:
  portainer_data:
```
启动：
```bash
docker compose up -d
```
### 3.3 初次访问配置
1. 浏览器访问 `http://宿主机IP:9000`。
2. 首次访问需要创建管理员账号(用户名 + 密码)。
3. 选择“本地 Docker 环境”连接(默认已自动识别)。
### 3.4 Portainer 核心功能
| 功能模块               | 作用                              |
| ------------------ | ------------------------------- |
| Dashboard(仪表盘)     | 概览所有容器、镜像、数据卷、网络的数量和状态          |
| Containers(容器)     | 查看、启动、停止、重启、删除、进入终端、查看日志        |
| Images(镜像)         | 查看镜像列表、拉取镜像、删除镜像                |
| Volumes(数据卷)       | 查看和管理数据卷                        |
| Networks(网络)       | 查看网络和容器连接关系                     |
| Stacks(Compose 项目) | 管理 Compose 项目，支持 Web 编辑 YAML 文件 |
| Settings(设置)       | 配置环境、用户权限、API 密钥                |
### 3.5 Portainer 的优势与局限
| 优势                         | 局限                       |
| -------------------------- | ------------------------ |
| 界面直观，适合新手                  | 资源占用相对较高(约 100-200MB 内存) |
| 支持多环境(可管理多台 Docker 主机)     | 社区版不支持 Kubernetes 高级功能   |
| 可直接在 Web 中编辑 Compose 文件并部署 | 对于大规模集群，性能不如 K8s 原生 UI   |
| 内置终端，免去 `docker exec` 命令   | 无法完全替代命令行(自动化场景)         |
-- -
## 四、Dockge
### 4.1 Dockge 简介
Dockge 是一款专注于 docker-compose.yml 管理的轻量级 UI 工具。它和 Portainer 的定位不同：
- Portainer：全功能容器管理平台，什么都管。
- Dockge：专精于 Compose 文件的管理和部署。
Dockge 非常轻量，资源占用极低(约 30-50 MB 内存)，界面简洁，特别适合管理多个 Compose 项目。
### 4.2 部署 Dockge
```bash
# 创建目录结构
mkdir -p /opt/dockge
cd /opt/dockge
```
docker-compose.yml：
```yaml
version: '3.8'

services:
  dockge:
    image: louislam/dockge:latest
    container_name: dockge
    restart: unless-stopped
    ports:
      - "5001:5001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
      # 挂载你的 Compose 项目目录
      - /opt/docker:/opt/docker:ro
    environment:
      - DOCKGE_STACKS_DIR=/opt/docker
```
启动：
```bash
docker compose up -d
```
命令解释：
- `-p 5001:5001`：Web 界面端口。
- `-v /opt/docker:/opt/docker:ro`：挂载 Compose 项目目录，让 Dockge 读取已有的 `docker-compose.yml` 文件。
- `DOCKGE_STACKS_DIR=/opt/docker`：指定 Compose 文件存放的目录。
### 4.3 Dockge 核心功能
| 功能              | 说明                               |
| --------------- | -------------------------------- |
| 查看 Compose 项目列表 | 自动扫描目录中的 `docker-compose.yml` 文件 |
| 查看服务状态          | 显示每个服务的容器状态、端口映射                 |
| 启动/停止/重启        | 对整个 Compose 项目或单个服务操作            |
| 查看日志            | 点击服务查看实时日志                       |
| 进入终端            | 点击服务进入容器 Shell                   |
| 编辑 Compose 文件   | 在 Web 界面中直接编辑 YAML 文件            |
| 快速部署            | 粘贴 Compose 内容直接部署                |
### 4.4 Dockge 与 Portainer 的选择
| 对比维度       | Dockge      | Portainer     |
| ---------- | ----------- | ------------- |
| 资源占用       | 低(~30-50MB) | 中(~100-200MB) |
| 界面风格       | 极简          | 全面            |
| 镜像管理       | ❌ 不支持       | ✅ 支持          |
| 数据卷管理      | ❌ 不支持       | ✅ 支持          |
| 网络管理       | ❌ 不支持       | ✅ 支持          |
| Compose 管理 | ✅ 专注且强大     | ✅ 支持          |
| 多环境支持      | ❌ 单机        | ✅ 多机          |
-- -
## 五、UI 工具与生产环境安全
### 5.1 UI 工具使用选择

|结论|说明|
|---|---|
|✅ 可以使用|UI 工具可以提升运维效率，降低误操作风险|
|⚠️ 注意安全|所有 UI 工具都需要暴露 Web 端口，必须做好安全防护|
|❌ 不要依赖|UI 工具不能替代命令行的自动化和脚本能力|
### 5.2 生产环境部署建议
| 措施      | 说明                                              |
| ------- | ----------------------------------------------- |
| 不暴露到公网  | 只绑定内网 IP 或 127.0.0.1，如 `-p 127.0.0.1:9000:9000` |
| 配置强密码   | Portainer 等工具有认证机制，务必设置强密码                      |
| 限制来源 IP | 使用防火墙限制只能从特定 IP 访问(如办公网 IP)                     |
| 内网使用    | 通过 VPN 或跳板机访问内网 UI 工具                           |
| 审计日志    | 开启审计功能，记录操作行为(Portainer 支持)                     |
