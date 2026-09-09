## 一、安装前的准备
### 1.1 系统环境要求
- 操作系统：Rocky Linux 8.x (最小化安装，无图形界面)
- 内核版本：`4.18.0` 或更高(Rocky Linux 8 默认满足)
- 用户权限：具有 `sudo` 权限的普通用户(禁止直接使用 `root`)
- 网络：能够访问互联网(或配置了内部镜像仓库)
- 磁盘：至少 20 GB 可用空间(建议存放在 `/var/lib/docker` 的独立分区)
- 防火墙：默认开启 `firewalld`，后续需要开放必要端口
### 1.2 更新系统并安装依赖
```bash
sudo dnf install -y yum-utils device-mapper-persistent-data lvm2
```
命令解释：
- `yum-utils`：提供 `dnf config-manager` 等仓库管理工具，用于添加和管理软件源。
- `device-mapper-persistent-data`：Device Mapper 的持久化数据存储工具，Docker 的存储驱动依赖它。
- `lvm2`：逻辑卷管理工具，用于管理容器镜像和数据的底层存储。
### 1.3 SELinux 设置
设置为 permissive 模式
```bash
sudo setenforce 0
sudo sed -i 's/SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config
```
### 1.4 防火墙设置
根据业务需求开放端口。例如：
- SSH(22)
- HTTP(80)
- HTTPS(443)
- 如果需要外部访问 Docker API(不推荐直接暴露)，可考虑将端口绑定到本地(`127.0.0.1`)，然后通过跳板机访问。
```bash
# 开放端口
sudo firewall-cmd --permanent --add-service={http,https}
# 加载规则
sudo firewall-cmd --reload
# 查看开放的端口
sudo firewall-cmd --list-all
```
### 1.5 移除冲突软件
Rocky Linux 8 默认安装了 Podman 等容器管理工具。Podman 与 Docker 功能重叠且不兼容，必须提前卸载，否则会导致 Docker 安装失败或运行异常。
```bash
# 卸载 Podman 及相关组件
sudo dnf remove -y podman buildah containers-common
```
命令解释：
- remove：卸载指定的软件包。
- podman：Rocky Linux 自带的容器管理工具，与 Docker 冲突。
- buildah：用于构建容器镜像的工具，同样与 Docker 冲突。
- containers-common：容器相关的公共组件包。

**注意：** 如果之前安装过旧版本的 Docker(如 docker、docker-engine)，也需要一并卸载：
```bash
sudo dnf remove docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine
```

## 二、添加 Docker 官方仓库
Rocky Linux 的默认软件仓库中不包含 Docker，需要手动添加 Docker 官方或国内的软件源。

Docker 官方为 CentOS/RHEL 系统提供了仓库配置文件，Rocky Linux 作为 RHEL 的兼容发行版，可以直接使用。

由于国内访问 Docker 官方源时可能遇到网络问题(如 SSL 连接超时)，强烈推荐生产环境使用国内镜像源，例如阿里云镜像源。
### 2.1 添加稳定版仓库
```bash
# 建议用阿里云仓库(国内速度快)
sudo dnf config-manager --add-repo http://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
# 官网仓库
#sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
```
命令解释：
- 将 Docker 阿里云仓库添加到系统，以便通过 `dnf` 安装最新稳定版 Docker Engine。
### 2.2 禁用测试版仓库
(此操作可不做)默认情况下，`docker-ce.repo` 中会包含 `docker-ce-test` 等仓库。为避免误安装测试版本，建议禁用它们：
```bash
sudo dnf-config-manager --disable docker-ce-test
sudo dnf-config-manager --disable docker-ce-nightly
```
### 2.3 清理并生成缓存
```bash
sudo dnf clean all &&  sudo dnf makecache
```
### 2.4 脚本安装(可选)
一键完成 docker、docker-compose 的安装，同时自动配置国内镜像加速源。
```bash
bash <(curl -sSL https://xuanyuan.cloud/docker.sh)
```
**脚本特性**
- 广泛兼容：支持 Ubuntu、Debian、CentOS、RHEL、Rocky Linux 等主流发行版，能够自动检测系统类型并选择最优的安装方案。
- 高效下载：内置多种国内镜像源，保障在不同网络环境下都能快速下载所需组件。
- 自动配置：会自动配置轩辕镜像加速服务，有效提升后续镜像拉取等操作的速度。
- 安全开源：脚本已开源至 GitHub(GitHub 源码)，代码透明可查，经过大量用户实践检验，安全可靠，且支持一键回滚，若遇问题可快速恢复系统状态。

## 三、安装 Docker Engine
### 3.1 查看可用版本
```bash
sudo dnf list docker-ce --showduplicates
```
在生产环境中，应指定具体版本号，避免意外升级导致不兼容。记录你需要的版本号(例如 `3:26.1.0-1.el8`)。
### 3.2 安装指定或最新版
1. 安装指定版本
```bash
sudo dnf install -y docker-ce-3:26.1.0-1.el8 docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```
将 `3:26.1.0-1.el8` 替换为实际版本号。

**建议：** 实际生产运维中，锁定引擎(`docker-ce`)版本已经足够保证行为稳定

2. 安装最新版
```bash
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```
**组件说明**：
- `docker-ce`：Docker 引擎(守护进程)
- `docker-ce-cli`：命令行客户端
- `containerd.io`：容器运行时
- `docker-buildx-plugin`：多平台构建插件(推荐)
- `docker-compose-plugin`：Compose 编排插件(生产必备)
### 3.3 验证安装
安装完成后，可以通过查看版本号来验证：
```bash
docker --version
docker compose version
docker buildx version
```
输出以下信息
```text
[fmc@Docker-Rocky8-1 ~]$ docker --version
Docker version 26.1.0, build 9714adc
[fmc@Docker-Rocky8-1 ~]$ docker compose version
Docker Compose version v2.27.0
[fmc@Docker-Rocky8-1 ~]$ docker buildx version
github.com/docker/buildx v0.14.0 171fcbe
```

## 四、配置 Docker 守护进程
在国内生产环境中，直接从 Docker Hub 拉取镜像速度慢且容易超时。配置镜像加速器可以显著提升镜像拉取速度，是生产环境部署的必要步骤。
### 4.1 创建配置文件
```bash
sudo mkdir -p /etc/docker
sudo vi /etc/docker/daemon.json
```
配置如下
```json
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
1.  `log-driver` + `log-opts` 限制容器日志大小，防止磁盘占满
2. registry-mirrors 镜像加速器
3. live-restore  重启 dockerd 时保持容器运行，默认 false，设为 true 可减少守护进程重启导致的业务中断。生产环境建议保留
4. userland-proxy  是否使用用户态代理，默认在某些版本为 true，false 可提升性能。去掉会恢复默认(可能是 true)，建议保留 false。
### 4.2 设置文件权限
```bash
# 将文件所有者设为 root，组设为 root
sudo chown root:root /etc/docker/daemon.json
# 权限设为 644(root 可写，其他人只读)
sudo chmod 644 /etc/docker/daemon.json
```
防止非特权用户(不在 docker 组里的普通用户)随意篡改 Docker 核心配置，同时严格遵循了“最小权限原则”和业界基线要求。
### 4.3 验证配置语法
```bash
sudo systemctl daemon-reload
sudo dockerd --validate
```
如果输出 `configuration OK`，则配置正确。

## 五、Docker服务管理
安装完成后，Docker 服务默认处于停止状态，需要手动启动并配置为开机自动运行。
### 5.1 启动 Docker 服务
```bash
sudo systemctl start docker
```
### 5.2 重启 Docker 服务
```bash
sudo systemctl restart docker

# 重启服务(容器会在 Docker 恢复后自动重启，前提是设置了 --restart 策略)
docker restart web-app

# 强制重启(直接杀掉进程再拉起)
docker kill web-app && docker start web-app
```
**备注:** 千万别用 `sudo systemctl restart docker` 来重启单个容器：这会让这台机器上的所有容器全部重启，属于生产环境的大事故操作。

### 5.3 停止 Docker 服务
```bash
sudo systemctl stop docker
```
### 5.4 设置 Docker 开机自启
```bash
sudo systemctl enable docker
```
### 5.5 查看 Docker 服务状态
```bash
sudo systemctl status docker
```
### 5.6 重新加载配置
不重启服务
```bash
sudo systemctl daemon-reload
```
### 5.4 强制重启 Docker
一般用于Docker 服务卡死，需要强制恢复。
```bash
# 第一步：强制停止 Docker 服务
sudo systemctl kill docker

# 第二步：清理残留的容器进程(谨慎操作)
sudo pkill -f docker

# 第三步：启动 Docker
sudo systemctl start docker

# 第四步：检查状态
sudo systemctl status docker
```

## 六、验证 Docker 安装
启动服务后，通过运行一个测试容器来验证 Docker 是否正常工作。
```bash
sudo docker run hello-world
```
命令解释：
- docker run：基于指定的镜像创建并启动一个容器。
- hello-world：Docker 官方提供的测试镜像，体积很小，仅用于验证安装是否成功。
正常输出应包含以下信息：
```text
Hello from Docker!
This message shows that your installation appears to be working correctly.
```
如果看到上述输出，说明 Docker 已成功安装并可以正常运行。

## 七、配置用户管理 Docker
默认情况下，只有 root 用户和 docker 组的用户才能执行 Docker 命令。每次使用都加 sudo 比较繁琐，建议将日常操作用户加入 docker 组。
### 7.1 创建 `docker` 组并添加用户
```bash
# 通常已存在
sudo groupadd docker  
sudo usermod -aG docker $USER
```
### 7.2 重新登录或刷新组
添加用户到 docker 组后，需要重新登录才能生效。或者使用以下命令立即生效。
```bash
newgrp docker
```
命令解释：
- `newgrp`：切换到新的组，临时将当前会话的组 ID 切换为 `docker`，使组权限立即生效。
### 7.3 验证权限配置
重新登录后，执行以下命令验证是否不再需要 sudo：
```bash
docker run hello-world
```
如果命令正常执行，说明权限配置成功。

**安全提示：** `docker` 组等同于 `root` 权限(因为可以挂载宿主机目录等)。生产环境应严格控制哪些用户加入该组，并为运维人员设置独立账号。

## 八、生产环境安装最佳实践
### 8.1 修改存储路径
Docker 默认将镜像、容器、卷存储在 `/var/lib/docker`。建议将该目录挂载到独立的磁盘分区(例如 LVM 逻辑卷)，避免根分区写满。
如果需要更改存储路径(可选)，可创建软链接或修改 `daemon.json` 中的 `data-root` 参数：
```bash
{
  "data-root": "/data/docker"
}
```
然后重启 Docker：`sudo systemctl restart docker`。
### 8.2 安装流程总结
生产环境推荐的完整安装流程如下：
1. 系统准备：更新系统、安装依赖、卸载冲突软件(Podman)；
2. 配置仓库：添加国内 Docker 镜像源(如阿里云)；
3. 安装引擎：安装 docker-ce、docker-ce-cli、containerd.io 等核心组件；
4. 配置加速：配置镜像加速器，提升拉取速度；
5. 启动服务：启动 Docker 并设置开机自启；
6. 权限管理：将运维用户加入 docker 组(谨慎操作)；
7. 验证测试：运行 hello-world 确认安装成功。
### 8.3 安全提醒
- 不要在生产环境滥用 docker 组权限：该组成员拥有 root 级权限。
- 定期更新 Docker：及时修复已知安全漏洞。
- 不要将敏感信息(如密码)硬编码在 Dockerfile 中：应使用环境变量或密钥管理工具。
- 生产环境务必配置日志轮转：避免容器日志占满磁盘。
### 8.4 卸载 Docker
```bash
sudo dnf remove -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo rm -rf /var/lib/docker
sudo rm -rf /var/lib/containerd
```


