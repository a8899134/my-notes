## 一、内网安装概述
在生产环境中，很多服务器部署在完全隔离的内网，无法直接访问外网。这种场景下，安装 Docker 需要采用特殊方法。
内网安装 Docker 通常有三种可行方案：

|方案|适用场景|前置条件|
|---|---|---|
|使用 HTTP 代理|内网可连通代理服务器，代理可访问外网|需有代理服务器地址和端口|
|完全离线安装(rpm 包 + 镜像文件)|服务器彻底隔离，无任何外网通道|需有一台可联网的“准备机”|
|内网 YUM 仓库 + 镜像仓库|企业内有统一的软件源和镜像仓库|需预先搭建好内网仓库服务|

本文重点介绍方案二(完全离线安装) ，因为这是最通用、最安全的做法，适用于绝大多数内网生产环境。方案一(代理)和方案三(私有仓库)会作为补充说明。
## 二、使用 HTTP 代理
如果内网环境允许通过 HTTP/HTTPS 代理访问互联网，可以直接在 Rocky Linux 8 上配置代理，然后按照标准联网步骤安装。
### 2.1 配置系统代理
编辑 /etc/environment 文件，添加代理变量：
```bash
sudo vi /etc/environment
```
添加以下内容(替换为实际的代理地址和端口)：
```bash
http_proxy=http://proxy.example.com:8080
https_proxy=https://proxy.example.com:8080
no_proxy=localhost,127.0.0.1,.local
```
命令解释：
- http_proxy 和 https_proxy：告诉系统使用哪个代理服务器转发 HTTP/HTTPS 请求。
- no_proxy：指定哪些地址不走代理(如内网地址)。
### 2.2 配置 DNF 使用代理
编辑 /etc/dnf/dnf.conf：
```bash
sudo vi /etc/dnf/dnf.conf
```
在文件末尾添加：
```text
proxy=http://proxy.example.com:8080
proxy=https://proxy.example.com:8080
```
### 2.3 配置 Docker 使用代理
如果 Docker 已经安装或后续安装后需要拉取镜像，可以为 Docker 守护进程配置代理。创建目录并写入配置：
```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo vi /etc/systemd/system/docker.service.d/http-proxy.conf
```
内容如下：
```bash
[Service]
Environment="HTTP_PROXY=http://proxy.example.com:8080"
Environment="HTTPS_PROXY=https://proxy.example.com:8080"
Environment="NO_PROXY=localhost,127.0.0.1,.local"
```
然后重新加载 systemd 并重启 Docker：
```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```
配置完成后，就可以像联网环境一样使用 dnf install 和 docker pull 了。

## 三、完全离线安装
这是最彻底的内网安装方法，不需要任何网络连接。整个过程分为三步：准备包 → 传输文件 → 内网安装。
### 3.1 下载 Docker RPM 包
在“准备机”(需与目标服务器相同的 Rocky Linux 版本和架构)上，先配置好 Docker 仓库，然后使用 `dnf download` 命令将所有依赖包下载到指定目录。
1. **在准备机上配置仓库**
```bash
# 添加 Docker 仓库(以阿里云源为例)
sudo dnf config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo

# 生成缓存
sudo dnf makecache
```

2. **下载所有 RPM 包及其依赖**
创建一个目录用于存放下载的包：
```bash
mkdir ~/docker-offline
cd ~/docker-offline
```
使用 `dnf download` 下载核心组件及其所有依赖(包括间接依赖)：
```bash
sudo dnf download --destdir=. --resolve docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```
命令解释：
- `download`：只下载包，不安装。
- `--destdir=.`：指定保存到当前目录。
- `--resolve`：同时下载所有依赖包(自动递归)。
- `docker-ce` 等：要下载的软件包名称。
下载完成后，当前目录下会有一堆 `.rpm` 文件，通常有几十个(包含 systemd、libseccomp 等依赖)。
**注意**：如果准备机网络不畅，也可以从 Docker 官方站点手动下载指定版本的 RPM 包，但依赖较多，建议用 `dnf download` 自动解决。
### 3.2 下载 Docker 镜像
除了 Docker 引擎本身，你还需要把生产环境所需的容器镜像提前下载好，否则在内网无法拉取。

在准备机上使用 docker pull 拉取所需镜像(准备机需先安装 Docker)，然后使用 docker save 导出为 tar 文件。
```bash
# 拉取镜像(例如 Nginx 和 MySQL)
docker pull nginx:latest
docker pull mysql:5.7

# 导出为 tar 文件
docker save -o nginx.tar nginx:latest
docker save -o mysql.tar mysql:5.7
```
命令解释：
- `docker save -o 文件名.tar 镜像名:标签`：将镜像保存为归档文件，便于迁移。

如果有多个镜像，可以一次性导出：
```bash
docker save -o all-images.tar nginx:latest mysql:5.7 redis:alpine
```
### 3.3 传输文件到内网服务器
将准备好的 RPM 包目录(`~/docker-offline`)和镜像 tar 文件(`*.tar`)通过安全方式传输到目标内网服务器。常用方式包括：
- U 盘或移动硬盘物理拷贝；
- 通过堡垒机或跳板机使用 scp 传输(如果内网有通道)；
- 通过内网 FTP 或共享存储。
假设将这些文件放置在目标服务器的 `/tmp/docker-offline/` 目录下。
### 3.4 在内网服务器上安装 RPM 包
进入存放 RPM 包的目录，使用 `dnf localinstall` 进行离线安装。
```bash
cd /tmp/docker-offline
sudo dnf localinstall -y *.rpm
```
命令解释：
- `localinstall`：从本地文件安装 RPM 包，会自动处理包之间的依赖关系(只要所有依赖都在同一目录)。
- `*.rpm`：匹配当前目录下所有 `.rpm` 文件。
如果遇到依赖问题，确保所有 RPM 包都已完整下载。如果缺少某个依赖，可以回到准备机重新下载并补充。
### 3.5 启动 Docker 服务
安装完成后，启动 Docker 并设置开机自启：
```bash
sudo systemctl start docker
sudo systemctl enable docker
```
验证安装：
```bash
docker --version
```
### 3.6 导入离线镜像文件
将之前导出的镜像 tar 文件导入到内网 Docker 中。
```bash
# 导入单个镜像
docker load -i /tmp/docker-offline/nginx.tar

# 导入多个镜像的合并文件
docker load -i /tmp/docker-offline/all-images.tar
```
命令解释：
- `docker load -i 文件.tar`：从 tar 文件恢复镜像到本地镜像库。
导入后可以用 `docker images` 查看已加载的镜像。
### 3.7 运行容器测试
使用导入的镜像启动一个容器，验证一切正常：
```bash
docker run -d --name test-nginx -p 80:80 nginx:latest
```
然后用浏览器或 `curl` 访问服务器的 80 端口，如果看到 Nginx 欢迎页，说明离线安装成功。

## 四、搭建内网YUM与镜像
如果企业有大量内网服务器需要安装 Docker，每次都手工拷贝 RPM 包会很繁琐。此时可以在内网搭建一个私有的 YUM 仓库和镜像仓库(如 Harbor)，让所有服务器从内网仓库下载。
### 4.1 搭建内网 YUM 仓库
将准备好的 RPM 包复制到一台内网服务器上，安装 `createrepo` 工具创建仓库元数据：
```bash
sudo dnf install -y createrepo   # 如果内网有epel源，否则需离线安装
createrepo /path/to/rpm-directory
```
然后配置 HTTP 服务(如 Nginx 或 Apache)将该目录对外提供访问。其他服务器配置内网仓库源：
```bash
sudo vi /etc/yum.repos.d/docker-offline.repo
```
内容如下：
```bash
[docker-offline]
name=Docker Offline Repository
baseurl=http://内网仓库服务器IP/path/
enabled=1
gpgcheck=0
```
之后其他服务器就可以用 `dnf install docker-ce` 直接从内网仓库安装。
### 4.2 搭建私有镜像仓库
Harbor 或 Registry 是企业级私有镜像仓库，支持权限管理和镜像复制。搭建完成后，将所需镜像推送至内网仓库：
```bash
# 登录内网仓库
docker login harbor.internal.com

# 给镜像打标签，指向内网仓库
docker tag nginx:latest harbor.internal.com/library/nginx:latest

# 推送镜像
docker push harbor.internal.com/library/nginx:latest
```
其他服务器配置 Docker 使用该内网仓库，就可以通过 `docker pull` 获取镜像了(内网高速)。

搭建私有仓库的详细步骤不在本文展开，但这是生产环境内网化部署的最佳实践。

## 五、常见问题汇总
### 5.1 配置 Docker 守护进程
在国内生产环境中，直接从 Docker Hub 拉取镜像速度慢且容易超时。配置镜像加速器可以显著提升镜像拉取速度，是生产环境部署的必要步骤。

1. 创建配置文件
```bash
sudo mkdir -p /etc/docker
sudo vi /etc/docker/daemon.json
```
配置如下
```conf
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run",
    "https://docker.mirrors.ustc.edu.cn"
  ],
  "live-restore": true,
  "userland-proxy": false
}
```
配置说明
-  `log-driver` + `log-opts` 限制容器日志大小，防止磁盘占满
- registry-mirrors 镜像加速器
- live-restore  重启 dockerd 时保持容器运行，默认 false，设为 true 可减少守护进程重启导致的业务中断。生产环境建议保留
- userland-proxy  是否使用用户态代理，默认在某些版本为 true，false 可提升性能。去掉会恢复默认(可能是 true)，建议保留 false。

1. 验证配置语法
```bash
sudo systemctl daemon-reload

sudo dockerd --validate
```
如果输出 `configuration OK`，则配置正确。
### 5.2 常见问题
1. 离线安装时提示缺少依赖

**现象**：执行 `dnf localinstall *.rpm` 时提示缺少某个包。

**原因**：准备机下载时未包含所有依赖(可能因为某些依赖来自 EPEL 或其他仓库)。

**解决方案**：
- 回到准备机，使用 dnf deplist docker-ce 查看所有依赖，手动下载缺失的 RPM 包。
- 或者直接使用 dnf download --resolve 确保下载完整。

2.  导入镜像时报错“open /xxx.tar: no such file or directory”

**原因**：文件路径错误或文件权限不足。

**解决方案**：
- 检查文件是否存在：`ls -l /path/to/image.tar`。
- 使用绝对路径或确保文件有读权限。

3. Docker 启动失败，查看日志提示 cgroup 问题

**原因**：内核 cgroup 配置未开启或版本低。

**解决方案**：
- 检查内核版本：`uname -r`，需 3.10 以上。
- 确保 cgroup 相关挂载：`mount | grep cgroup`。
- 在 Rocky Linux 8 上一般默认已启用，如无则需编辑内核启动参数。

## 六、总结
内网安装 Docker 并不复杂，核心思路是“用联网机器准备好所有材料，再搬运到内网”。根据自身条件选择最适合的方案：
1. 如果有代理，直接配置代理走在线安装最省事。
2. 如果完全隔离，推荐完全离线安装：下载所有 RPM 包 + 所需镜像，本地安装和导入。
3. 如果服务器数量多，建议搭建内网 YUM 仓库和私有镜像仓库，实现自动化分发，降低维护成本。
无论哪种方式，安装完成后都需验证 Docker 服务运行正常，并确保数据持久化、日志轮转等生产配置已就绪。记住，内网环境更要注重安全，不要随意开放端口，定期更新离线包版本以修复漏洞。
