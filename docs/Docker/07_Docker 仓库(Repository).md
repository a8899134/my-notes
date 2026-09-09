Docker 仓库(Repository)是 Docker 生态中存储和分发镜像的核心平台，新手可以先记住：仓库就是 “镜像的应用商店” — 你可以从仓库下载(pull)别人做好的镜像(比如 Nginx、MySQL)，也可以把自己定制的镜像上传(push)到仓库，方便在不同机器上复用。

下面从 “是什么、有哪些类型、怎么用、新手避坑” 四个维度，用通俗的语言 + 实操命令讲清楚，新手能直接落地。

## 一、Docker 仓库概念
### 1.1 仓库概念
仓库是集中存储 Docker 镜像的远程服务平台，本质是 “镜像的托管服务器”— 就像 GitHub 托管代码、应用商店托管 App 一样，仓库托管镜像，让你不用在每台机器上手动构建镜像，直接下载就能用。

打个比方：
- Docker 镜像就像一瓶饮料(可乐、雪碧、果汁)。
- Docker 仓库就像存放这些饮料的货架或仓库。
- 仓库服务器就像整栋超市大楼，里面有很多货架(仓库)。

当你需要某个镜像时，就从仓库里“取”出来(`docker pull`)，当你制作了自己的镜像时，就把它“存”进去(`docker push`)。
### 1.2 仓库与镜像的关系
为了更清晰地理解二者的关系，可以用一个表格来对比：

|概念|含义|通俗类比|
|---|---|---|
|镜像(Image)|应用程序的打包文件|一瓶饮料|
|仓库(Repository)|存放镜像的地方|放饮料的货架|
|仓库服务器(Registry)|运行仓库服务的系统|整栋超市大楼|

一个仓库服务器(如 Docker Hub)下面有成千上万个仓库，每个仓库里存放着同一个镜像的不同版本(标签)。

例如：
- `nginx` 是一个仓库。
- `nginx:1.21` 是仓库中的一个标签(版本)。
- `nginx:latest` 是另一个标签(通常指向最新版本)。

### 1.3 仓库的核心作用
Docker 仓库解决了三个核心问题：
1. 分发：开发者制作好镜像后，推送到仓库，其他人或服务器可以从仓库拉取，实现快速分发。无论是团队内部协作还是对外发布，仓库都是镜像流通的中转站。
2. 版本管理：通过标签(Tag)机制，同一个仓库可以存放多个版本的镜像。你可以随时回滚到历史版本，也可以区分开发版、测试版和生产版。
3. 统一交付：在 CI/CD 流水线中，构建好的镜像推送到仓库，部署系统从仓库拉取镜像进行发布。仓库成为了开发到运维之间的交付桥梁。

## 二、仓库的分类
Docker 仓库可以分为两类：公有仓库和私有仓库。
### 2.1 公有仓库
由云服务商托管的仓库服务，如阿里云 ACR、腾讯云 TCR、华为云 SWR。用户不需要自己维护服务器，只需按使用量付费，适合大部分中小企业。

|对比维度|说明|
|---|---|
|优点|无需注册即可拉取，镜像资源丰富|
|缺点|推送需要账号，公开镜像任何人都能下载(存在安全风险)|
|常见示例|Docker Hub、阿里云容器镜像服务、腾讯云容器镜像服务|
|适用场景|个人学习、开源项目、公共基础镜像|
### 2.2 私有仓库
在企业内网自行搭建的仓库服务，如 Harbor、Docker Registry。完全由企业控制，数据不出内网，适合对数据安全和网络速度有严格要求的生产环境。

|对比维度|说明|
|---|---|
|优点|安全可控，内网访问速度快，可精细管理权限|
|缺点|需要自行搭建和维护(或购买商业服务)|
|常见示例|自建 Harbor、自建 Docker Registry、云厂商私有仓库|
|适用场景|企业内部生产环境、商业项目|

## 三、仓库核心操作命令
### 3.1 登录与退出仓库
在使用私有仓库或向仓库推送镜像之前，通常需要先登录认证。
```bash
# 登录 Docker Hub
docker login

# 登录公共仓库(以阿里云为例)
docker login registry.cn-hangzhou.aliyuncs.com
# 执行后输入阿里云账号+密码，提示“Login Succeeded”即登录成功

# 登录私有仓库(指定仓库地址)
docker login harbor.internal.com

# 登录时指定用户名(交互式输入密码)
docker login -u admin harbor.internal.com

# 退出登录
docker logout harbor.internal.com

# 退出仓库(操作完成后建议退出，尤其是公共机器)
docker logout 仓库地址(如registry.cn-hangzhou.aliyuncs.com)
```
命令解释：
- `docker login`：登录到 Docker 仓库。如果不指定地址，默认登录 Docker Hub。
- 登录过程中会提示输入密码或 Token。
- 登录成功后，认证信息保存在 `~/.docker/config.json` 文件中。
- `docker logout`：清除本地保存的登录凭证。

**生产环境建议**：
- 不要在命令行中直接写密码(会被历史命令记录)。使用交互式输入或环境变量。
- CI/CD 中使用 Access Token 而非个人密码。
```bash
# 使用环境变量传递密码(更安全)
echo "your-token" | docker login -u username --password-stdin harbor.internal.com
```
### 3.2 搜索镜像
在仓库中搜索镜像(仅对支持搜索功能的仓库有效)。

基本用法：docker search 镜像名
```bash
# 在 Docker Hub 上搜索 nginx 相关的镜像
docker search nginx

# 搜索特定用户的镜像
docker search nginx --filter=is-official=true

# 限制搜索结果数量
docker search nginx --limit=10

# 只看收藏数>1000的镜像(质量更高)
docker search --filter=stars=1000 nginx  

# 只看官方镜像
docker search --filter=is-official=true nginx  
```
命令解释：
- `search`：在仓库中搜索镜像。
- 输出信息包括：镜像名称(NAME)、描述(DESCRIPTION)、星级(STARS)、是否官方(OFFICIAL)、是否自动化构建(AUTOMATED)。

**生产环境提示**：
- 优先使用带有 `OFFICIAL` 标记的官方镜像。
- 搜索结果中的镜像来自公共仓库，不一定安全，下载前需确认来源可信。

### 3.3 拉取镜像
基本用法：docker pull 仓库名/镜像名:标签(标签不写默认拉 latest)

从仓库下载镜像到本地，这是使用镜像的第一步。
```bash
# 拉取最新版本的 Nginx
docker pull nginx

# 拉取指定版本的 Nginx
docker pull nginx:1.21

# 拉取第三方镜像(比如带PHP的Nginx镜像)
docker pull richarvey/nginx-php-fpm:latest

# 从私有仓库拉取镜像
docker pull harbor.internal.com/project/myapp:v1.0

# 拉取镜像并显示详细进度
docker pull --progress=plain nginx
```
命令解释：
- `pull`：从仓库拉取镜像到本地。
- 如果本地已经有该镜像的某些层，只会下载缺失的层。
- 不指定标签时，默认拉取 `latest` 标签(生产环境不建议使用)。
### 3.4 标记镜像
将本地镜像打上标签，指向目标仓库。这是推送镜像到私有仓库前的必要步骤。
```bash
# 基本格式：docker tag 源镜像 目标仓库地址/镜像名:标签
docker tag nginx:1.21 harbor.internal.com/project/nginx:prod

# 也可以给本地镜像打多个标签
docker tag myapp:latest myapp:v1.0.0
docker tag myapp:latest harbor.internal.com/project/myapp:20260113
```
命令解释：
- `tag`：为本地镜像添加一个新的标签。
- 原镜像不会被复制或修改，只是多了一个引用名。
- 标签格式：`[仓库地址/][命名空间/]镜像名[:标签]`
- 如果目标是私有仓库，需要先 `docker login`。
### 3.5 推送镜像
将本地镜像上传到远程仓库。

基本用法：docker push 打标签后的镜像名
```bash
# 推送到 Docker Hub(先登录)
docker push myusername/myapp:v1.0

# 上传到阿里云仓库
docker push registry.cn-hangzhou.aliyuncs.com/你的阿里云用户名/my-nginx:v1

# 推送到私有仓库
docker push harbor.internal.com/project/nginx:prod

# 推送所有标签
docker push harbor.internal.com/project/nginx --all-tags
```
命令解释：
- `push`：将本地镜像推送到远程仓库。
- 推送前需要先用 `docker tag` 将镜像标记为仓库地址格式。
- 推送时会上传所有缺失的层，已有层会跳过。
- 推送速度受网络带宽和镜像大小影响。
### 3.6 查看镜像标签
Docker 命令行本身不提供直接查看仓库中所有标签的功能。需要借助以下方式：
1. 使用 skopeo 工具：
```bash
# 安装 skopeo
sudo dnf install -y skopeo

# 查看镜像的所有标签
skopeo list-tags docker://nginx
```
2. 使用仓库的 API(如 Harbor API)或 Web 界面查看。
3. 使用第三方命令行工具，如 regctl 或 crane。

## 四、镜像命名与标签规范
### 4.1 完整的镜像名称结构
一个完整的镜像名称由以下部分组成：
`[仓库地址]/[命名空间]/[镜像名]:[标签] `

各部分含义：

| 组成部分 | 含义                     | 是否必须 | 默认值                   |
| ---- | ---------------------- | ---- | --------------------- |
| 仓库地址 | Docker 仓库服务器的域名或 IP:端口 | 非必须  | docker.io(Docker Hub) |
| 命名空间 | 用户名或组织名                | 非必须  | library(官方镜像)         |
| 镜像名  | 镜像的具体名称                | 必须   | 无                     |
| 标签   | 版本标识                   | 非必须  | latest                |

示例解析：

| 镜像名称                                  | 仓库地址                | 命名空间    | 镜像名    | 标签     |
| ------------------------------------- | ------------------- | ------- | ------ | ------ |
| nginx                                 | docker.io           | library | nginx  | latest |
| nginx:1.21                            | docker.io           | library | nginx  | 1.21   |
| alpine:3.18                           | docker.io           | library | alpine | 3.18   |
| myuser/myapp                          | docker.io           | myuser  | myapp  | latest |
| `harbor.internal.com/prod/nginx:1.21` | harbor.internal.com | prod    | nginx  | 1.21   |
### 4.2 生产环境标签命名规范
在生产环境中，建议遵循以下标签命名规范：

| 环境         | 标签示例                   | 说明                   |
| ---------- | ---------------------- | -------------------- |
| 开发环境       | dev-20260113           | 按构建日期命名              |
| 测试环境       | test-v 1.0.0-rc1       | 测试候选版本               |
| 预发布环境      | pre-v 1.0.0            | 灰度验证版本               |
| 生产环境       | v 1.0.0                | 语义化版本号               |
| 生产环境(快速迭代) | build-20260113-a1b2c3d | 时间戳 + Git Commit 短哈希 |

核心原则：
1. 避免使用 latest 标签：latest 指向的版本会变化，无法追溯具体版本，生产环境部署风险极高。
2. 标签具有可追溯性：标签应该能关联到源码(如 Git Tag 或 Commit ID)。
3. 标签具有唯一性：同一镜像的每次构建应该使用不同的标签，不要覆盖已有标签。
4. 区分环境：不同环境的镜像使用不同的标签前缀或命名空间，避免混淆。

## 五、私有仓库搭建
### 5.1 Docker Registry
Docker 官方提供了一个轻量级的私有仓库服务 Docker Registry，适合小规模使用。

启动 Registry 容器：
```bash
docker run -d --name registry -p 5000:5000 registry:2
```
命令解释：
- 基于 registry:2 镜像启动一个容器。
- -p 5000:5000：将宿主机的 5000 端口映射到容器的 5000 端口。
- Registry 默认将镜像数据存储在容器内部，容器删除后数据丢失。

配置持久化存储：
```bash
docker run -d --name registry -p 5000:5000 -v /data/registry:/var/lib/registry registry:2
```
向 Registry 推送镜像：
```bash
# 打标签时使用 Registry 地址
docker tag nginx:1.21 localhost:5000/nginx:1.21

# 推送
docker push localhost:5000/nginx:1.21
```
从 Registry 拉取镜像：
```bash
docker pull localhost:5000/nginx:1.21
```
Registry 的局限性：
- 没有 Web 管理界面。
- 没有权限控制(任何人可以推送和拉取)。
- 没有镜像复制和同步功能。
- 适合个人学习或极小规模使用。
### 5.2 Harbor
公共仓库(Docker Hub)、私有仓库搭建(Registry / Harbor)、镜像推送与拉取、镜像标签管理
能搭建公司内部镜像仓库,适合企业私用。
Harbor 的核心功能：

|功能|说明|
|---|---|
|基于角色的访问控制|支持项目级别的用户权限管理|
|镜像复制|支持多仓库间的镜像同步|
|漏洞扫描|集成 Trivy 或 Clair，自动扫描镜像漏洞|
|Web 管理界面|提供友好的图形化管理页面|
|镜像保留策略|自动清理老旧镜像，节省存储空间|
|审计日志|记录所有操作，满足合规要求|

Harbor 安装简要步骤

1. 需提前安装 Docker 和 Docker Compose
2. 下载 Harbor 安装包：`wget https://github.com/goharbor/harbor/releases/`
3. 解压并修改 `harbor.yml` 配置文件(配置域名、密码、存储路径等)。
4. 运行安装脚本：`./install.sh --with-trivy`。

安装完成后，可以通过 `https://harbor.internal.com` 访问管理界面。

使用 Harbor 推送镜像：
```bash
# 登录 Harbor
docker login harbor.internal.com

# 打标签
docker tag myapp:v1.0 harbor.internal.com/project/myapp:v1.0

# 推送
docker push harbor.internal.com/project/myapp:v1.0
```
### 5.3 云服务商私有仓库
如果不想自建仓库，也可以使用云服务商提供的容器镜像服务：
- 阿里云：容器镜像服务 ACR，国内访问快，支持公网/专线/内网访问
- 腾讯云：容器镜像服务 TCR，稳定可靠，与腾讯云生态集成
- 华为云：容器镜像服务 SWR，支持跨地域同步，安全合规
- 火山引擎：容器镜像服务，字节跳动旗下，性能优秀
云服务商仓库通常提供免费额度，适合中小型企业使用。

## 六、镜像安全与仓库管理
### 6.1 镜像来源安全
**6.1.1 优先使用官方镜像**

Docker Hub 上带有 `OFFICIAL` 标记的镜像经过 Docker 官方审查，安全性较高。

**6.1.2 验证镜像签名**

Docker 支持镜像内容信任(Docker Content Trust, DCT)，确保镜像未被篡改。

```bash
# 启用内容信任
export DOCKER_CONTENT_TRUST=1

# 拉取签名镜像
docker pull nginx:1.21

# 查看签名信息
docker trust inspect nginx:1.21
```
**生产环境建议**：
- 在 CI/CD 流水线中启用 DCT。
- 定期扫描镜像中的已知漏洞。
- 建立内部镜像白名单机制。

### 6.2 私有仓库安全配置

|安全配置项|说明|
|---|---|
|启用 HTTPS|使用 TLS 证书加密传输，防止镜像被中间人截获|
|启用认证|配置用户和密码，禁止匿名访问|
|最小权限原则|为不同用户分配最小必要的权限|
|定期清理|删除过期镜像，回收存储空间|
|审计日志|开启操作审计，追踪镜像拉取和推送记录|
|网络隔离|私有仓库部署在内网，不对外开放|

### 6.3 镜像清理与维护
仓库中的镜像会随着时间推移不断累积，占用大量存储空间。需要定期清理。
```bash
# 清理本地未使用的镜像(针对本地仓库缓存)
docker image prune

# 清理所有未使用的镜像(更彻底)
docker system prune -a

# 清理 Registry 中的镜像(需调用 Registry API)
# 通常通过 Harbor 等工具的 Web 界面操作
```
Harbor 的镜像保留策略：
- 支持按“保留最新 N 个版本”规则自动清理。
- 支持按“保留 N 天内的版本”规则自动清理。
### 6.4 镜像缓存与加速
在内网生产环境中，所有服务器从外网拉取镜像会非常慢甚至不可行。常见的优化方案有：
1. 内网私有仓库
搭建 Harbor 或 Registry，将常用镜像从外网拉取后推送到内网仓库，所有服务器从内网仓库拉取。
2. 仓库代理
在 Docker 配置中使用代理仓库地址：
```json
{
  "registry-mirrors": ["https://docker.m.daocloud.io""]
}
```
3. 离线传输
使用 `docker save` 和 `docker load` 进行镜像的离线迁移。

## 七、核心总结
Docker 仓库是镜像分发和版本管理的核心组件。
1. 仓库核心价值：集中管理镜像，跨机器复用，不用重复构建环境；  
2. 新手优先用国内公共仓库(阿里云 / 华为云 / 中科大)，配置加速后拉取镜像；  
3. 必记命令：docker search(搜)、docker pull(拉)、docker login(登)、docker tag(打标签)、docker push(传)；  
4. 核心原则：
	- 拉取镜像指定版本标签，别用 latest；
	- 上传镜像前必须打包含仓库地址的标签，且先登录；
	- 私有仓库需配置 insecure-registries 才能访问。