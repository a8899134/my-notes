## 一、Harbor 是什么
### 1.1 私有镜像仓库作用
在企业容器化实践中，镜像仓库是基础设施的核心组件之一。

| 场景   | 公有仓库(Docker Hub)的痛点 | 私有仓库的价值                    |
| ---- | ------------------- | -------------------------- |
| 网络受限 | 内网服务器无法拉取镜像         | 内网高速分发，不受外网限制              |
| 安全合规 | 镜像可能被篡改或泄露          | 镜像存储在企业内部，数据主权可控           |
| 权限管理 | 无法精细控制谁可以推送/拉取      | 支持 RBAC(基于角色的访问控制)，按项目分配权限 |
| 镜像清理 | 无法自动清理旧镜像           | 支持自动垃圾回收，节省存储空间            |
### 1.2 Harbor 简介
Harbor 是由 VMware 开源的企业级 Docker 镜像仓库，它提供了比官方 Docker Registry 更丰富的功能：

|功能|说明|
|---|---|
|图形化管理界面|通过浏览器管理镜像、项目、用户|
|RBAC 权限控制|按项目分配用户权限(管理员/开发者/访客)|
|镜像复制|跨仓库自动同步镜像(主备/多机房)|
|镜像漏洞扫描|自动扫描镜像中的已知漏洞|
|镜像保留策略|自动清理老旧镜像，节省存储空间|
|审计日志|记录所有操作行为，满足合规要求|
Harbor 以多个 Docker 容器的形式运行，依赖 Docker Compose 进行编排管理。
-- -
## 二、部署前的准备
### 2.1 硬件要求
根据 Harbor 官方文档，部署 Harbor 的硬件要求如下：

|资源|最低配置|推荐配置(生产环境)|
|---|---|---|
|CPU|2 核|4 核以上|
|内存|4 GB|8 GB 以上|
|磁盘|40 GB|160 GB 以上(推荐 SSD)|
### 2.2 软件要求
| 软件             | 版本要求                                 |
| -------------- | ------------------------------------ |
| Docker Engine  | 17.06.0-ce+ 或更高                      |
| Docker Compose | v1.18.0+ 或 v2(docker-compose-plugin) |
| OpenSSL        | 最新版                                  |
### 2.3 端口要求
Harbor 默认需要使用以下端口：

|端口|协议|用途|
|---|---|---|
|80|HTTP|Harbor Web 界面和 API(可修改)|
|443|HTTPS|Harbor Web 界面和 API(可修改)|
|4443|HTTPS|Notary 签名服务(启用时使用，可修改)|
生产环境建议：务必使用 HTTPS 访问 Harbor，不要使用 HTTP。
### 2.4 确认 Docker 和 Docker Compose 已安装
```bash
# 确认 Docker 已安装
docker --version

# 确认 Docker Compose 已安装(V2 使用 docker compose)
docker compose version

# 或 V1 使用 docker-compose
docker-compose --version
```
-- -
## 三、Harbor 安装方式选择
Harbor 提供两种安装方式：

|安装方式|说明|适用场景|
|---|---|---|
|在线安装|安装包较小，安装过程中从网络拉取镜像|网络通畅的环境|
|离线安装|安装包包含所有镜像(约 1-2 GB)|内网环境、网络不稳定|
国内生产环境建议：使用离线安装包，避免因网络问题导致安装失败。

使用 Docker Compose V 2 的说明：Harbor 安装脚本默认使用 `docker-compose` 命令(V 1)。如果你安装的是 Docker Compose V 2(使用 `docker compose` 命令)，需要确认脚本兼容性，或通过软链接将 `docker compose` 映射为 `docker-compose` 命令。大多数情况下，Harbor 的 `install.sh` 脚本会自动检测并使用可用的 Compose 版本。
-- -
## 四、安装步骤
### 4.1 下载 Harbor 离线安装包
从 Harbor 的 GitHub Releases 页面下载最新稳定版本的离线安装包：
```bash
# 创建安装目录
sudo mkdir -p /opt/harbor
cd /opt/harbor

# 下载离线安装包(以 v2.8.3 为例，请替换为最新版本)
sudo wget https://github.com/goharbor/harbor/releases/download/v2.8.3/harbor-offline-installer-v2.8.3.tgz

# 2. 下载在线安装包 (体积小很多)
wget https://github.com/goharbor/harbor/releases/download/v2.8.3/harbor-online-installer-v2.8.3.tgz

```
命令解释：
- `mkdir -p /opt/harbor`：创建 `/opt/harbor` 目录(`-p` 自动创建父目录)。
- `wget ...`：从 GitHub 下载 Harbor 离线安装包。
- 如果需要其他版本，可以访问 `https://github.com/goharbor/harbor/releases` 查看所有版本。

内网环境：在可联网的机器上下载安装包，通过 U 盘或堡垒机传输到内网服务器。
### 4.2 解压安装包
```bash
# 解压安装包
sudo tar xvf harbor-offline-installer-v2.8.3.tgz

# 进入 Harbor 目录
cd harbor
```
### 4.3 加载离线镜像
离线安装包中包含所有 Harbor 组件所需的镜像，需要先加载到本地 Docker：
```bash
# 加载 Harbor 离线镜像(文件名可能略有不同)
sudo docker load -i harbor.v2.8.3.tar.gz
```
命令解释：
- `docker load -i`：从 tar 文件加载镜像到本地 Docker 镜像库。
- 这个步骤可能需要几分钟，取决于服务器性能。
- 加载完成后，可以使用 `docker images | grep goharbor` 查看已加载的镜像。
### 4.4 配置文件
Harbor 的配置通过 harbor.yml 文件管理。
```bash
# 复制配置模板
sudo cp harbor.yml.tmpl harbor.yml

# 编辑配置文件
sudo vi harbor.yml
```
必须修改的配置项：
```yaml
# 1. 主机名(必改)
# 使用服务器的 IP 地址或域名
hostname: 192.168.100.231

# 2. HTTP 端口(默认 80，可修改)
http:
  port: 8080

# 3. HTTPS 配置(生产环境强烈建议启用，内网可注释掉)
# 如果有证书，取消注释并配置证书路径
https:
  port: 443
  certificate: /your/certificate/path
  private_key: /your/private/key/path

# 4. 管理员密码(必改)
harbor_admin_password: harbor@123

# 5. 数据库密码(建议修改)
database:
  password: DBroot@123

# 6. 数据存储路径(可自定义)
data_volume: /data/harbor
```
### 4.5 执行安装
```bash
# 准备配置(生成 docker-compose.yml 和其他配置文件)
sudo ./prepare

# 执行安装
sudo ./install.sh
```
命令解释：
- `./prepare`：根据 `harbor.yml` 生成实际的 `docker-compose.yml` 和各个容器的配置文件。每次修改 `harbor.yml` 后都需要重新执行此命令。
- `./install.sh`：启动所有 Harbor 容器。安装脚本会自动执行 `docker compose up -d`。
安装过程说明：
- 安装脚本会启动多个容器，包括：`harbor-core`、`harbor-portal`、`harbor-db`、`redis`、`registry`、`harbor-jobservice`、`harbor-proxy` 等。
- 安装完成后，所有容器的状态应为 `Up`。

-- -
## 五、验证安装
### 5.1 检查容器状态
```bash
# 进入 Harbor 安装目录
cd /opt/harbor

# 查看所有 Harbor 容器的状态
sudo docker compose ps

# 或使用 V1
sudo docker-compose ps
```
所有容器应处于 Up 状态。
### 5.2 访问 Harbor Web 界面
在浏览器中访问 `http://服务器IP:端口`(如 `http://192.168.100.231:8080`)
- 用户名：`admin`
- 密码：`harbor.yml` 中配置的 `harbor_admin_password`
### 5.3 登录 Harbor
在命令行中测试登录：
```bash
# 登录 Harbor(使用 HTTP)
docker login 192.168.100.231:8080

# 输入用户名: admin
# 输入密码: 你设置的密码
```
如果使用 HTTP 登录报错：
Docker 默认使用 HTTPS 连接仓库。如果使用 HTTP，需要在 Docker 配置中添加 --insecure-registry 参数：
```bash
# 编辑 Docker 配置文件
sudo vi /etc/docker/daemon.json

# 添加以下内容
{
  "insecure-registries": ["192.168.100.231:8080"]
}

# 重启 Docker
sudo systemctl restart docker
```
-- -
## 六、Harbor 日常管理
### 6.1 常用管理命令
所有命令需在 Harbor 安装目录(/opt/harbor)下执行。

| 操作        | 命令(V 2)                       | 命令(V 1)                       | 说明       |
| --------- | ----------------------------- | ----------------------------- | -------- |
| 启动 Harbor | `sudo docker compose up -d`   | `sudo docker-compose up -d`   | 后台启动所有服务 |
| 停止 Harbor | `sudo docker compose stop`    | `sudo docker-compose stop`    | 停止所有容器   |
| 重启 Harbor | `sudo docker compose restart` | `sudo docker-compose restart` | 重启所有容器   |
| 停止并删除     | `sudo docker compose down`    | `sudo docker-compose down`    | 停止并删除容器  |
| 删除数据卷     | `sudo docker compose down -v` | `sudo docker-compose down -v` | 删除容器和数据卷 |
| 查看日志      | `sudo docker compose logs -f` | `sudo docker-compose logs -f` | 实时查看日志   |
### 6.2 修改配置后重新生效
如果修改了 harbor.yml 配置文件：
```bash
cd /opt/harbor

# 1. 停止 Harbor
sudo docker compose down

# 2. 重新准备配置
sudo ./prepare

# 3. 重新启动
sudo docker compose up -d
```
### 6.3 创建项目
Harbor 使用“项目(Project)”来隔离镜像：
1. 登录 Harbor Web 界面。
2. 点击“新建项目”。
3. 填写项目名称(如 `myapp`)。
4. 选择访问级别：
    - 公开：任何人都可以拉取镜像(无需登录)。
    - 私有：只有授权用户可以拉取镜像。
5. 点击“确认”创建。
### 6.4 推送和拉取镜像
```bash
# 1. 登录 Harbor
docker login 192.168.100.231:8080

# 2. 给本地镜像打标签(格式：仓库地址/项目名/镜像名:标签)
docker tag nginx:1.26-alpine 192.168.100.231:8080/myapp/nginx:1.26-alpine

# 3. 推送镜像[reference:50]
docker push 192.168.100.231:8080/myapp/nginx:1.26-alpine

# 4. 拉取镜像
docker pull 192.168.100.231:8080/myapp/nginx:1.26-alpine
```
命令解释：
- docker tag：给镜像打标签，标签格式必须包含 Harbor 的地址和项目名。
- docker push：将镜像推送到 Harbor。
- docker pull：从 Harbor 拉取镜像。
-- -
## 七、生产环境安全配置
### 7.1 启用 HTTPS
生产环境必须使用 HTTPS 访问 Harbor：
1. 获取 SSL 证书(可以从云厂商申请免费证书，或使用自签名证书)。
2. 在 `harbor.yml` 中配置 HTTPS 部分：
```yaml
https:
  port: 443
  certificate: /data/cert/server.crt
  private_key: /data/cert/server.key
```
3. 重新执行 ./prepare 和 docker compose up -d。
### 7.2 配置防火墙
```bash
# 开放 Harbor 端口(以 HTTP 8080 为例)
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --reload

# 如果是 HTTPS 443 端口
sudo firewall-cmd --add-port=443/tcp --permanent
sudo firewall-cmd --reload

# 限制访问来源(仅允许内网 IP)
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.0.0/16" port port="8080" protocol="tcp" accept'
sudo firewall-cmd --reload
```
### 7.3 配置镜像保留策略
Harbor 支持自动清理老旧镜像，节省存储空间：
1. 登录 Harbor Web 界面。
2. 进入项目 → 策略 → 镜像保留。
3. 配置保留规则，例如：
    - 保留最近推送的 5 个版本。
    - 删除 30 天前推送的镜像。
    - 每天凌晨 2 点自动执行。
### 7.4 数据备份
Harbor 的数据包括三部分：

|数据|存储位置|备份方法|
|---|---|---|
|镜像数据| `data_volume`(如 `/data/harbor`)|备份整个目录|
|数据库|Harbor 内部 PostgreSQL|使用 `pg_dump` 导出|
|配置文件| `/opt/harbor/harbor.yml` |直接复制|
```bash
# 备份 Harbor 数据目录
sudo tar czf /backup/harbor_data_$(date +%Y%m%d).tar.gz /data/harbor

# 备份配置文件
sudo cp /opt/harbor/harbor.yml /backup/harbor.yml_$(date +%Y%m%d)
```
-- -
## 八、总结
Harbor 是企业级私有镜像仓库的标准解决方案。以下是部署的核心要点：
1. 安装前准备：
    - 确认硬件满足要求(4 核/8 GB/160 GB 推荐)。
    - 安装 Docker 和 Docker Compose。
    - 准备离线安装包(内网环境推荐)。
2. 安装步骤：
    - 下载并解压离线安装包。
    - 配置 `harbor.yml`(hostname、密码、端口。
    - 执行 `./prepare` 和 `./install.sh` 。
3. 生产环境配置：
    - 启用 HTTPS。
    - 配置防火墙限制访问来源。
    - 配置镜像保留策略，自动清理老旧镜像。
    - 定期备份数据和配置文件。