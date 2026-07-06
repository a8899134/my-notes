在 Linux 系统中，软件安装方式多样，不同的方式适用于不同的场景和需求。下面为你详细介绍几种常见软件安装方法并如何判断软件安装方法。

## 一、包管理器安装
**原理**
包管理器是一种自动化的软件管理工具，它维护着软件包数据库和软件源列表。软件源是存储大量软件包及其元数据(如依赖关系、版本信息等)的服务器。包管理器通过与软件源通信，根据用户需求自动下载、安装、升级和卸载软件包，并自动处理软件包之间的依赖关系。

**特点**
1. 自动化依赖处理：这是其显著优势，例如安装一个图形编辑软件，包管理器会自动检测并安装该软件运行所需的各种库文件和依赖项。
2. 操作简便：用户只需输入简单的命令，如在 Debian 系系统中使用 `sudo apt install <软件名>` 即可完成安装。
3. 软件更新便捷：可以轻松将系统中的软件更新到最新版本，如执行 `sudo apt update` 和 `sudo apt upgrade`。
4. 软件来源可靠：从官方或经过验证的软件源获取软件包，安全性和稳定性较高。

**适用场景**
适合大多数普通用户和系统管理员进行日常软件的安装和管理，尤其是对依赖关系处理要求较高的情况。

**示例**
```
[fmc@Rocky8Shell ~]$ dnf list --showduplicates mariadb
Last metadata expiration check: 1 day, 21:12:18 ago on Wed 24 Jun 2026 02:10:54 PM CST.
Available Packages
mariadb.x86_64                    3:10.3.39-1.module+el8.8.0+1452+2a7eab68                       appstream
mariadb.x86_64                    3:10.3.39-2.module+el8.10.0+40062+b4bfe4b1                     appstream
```
结构说明
- 包名(name)：mariadb
- 架构 (Arch)：x 86_64
- 版本 (Version)：3:10.3.39
- 发布号 (Release)：1.module+el 8.8.0+1452+2 a 7 eab 68
- 架构后缀：.x 86_64

**常用命令**
```
#安装命令
dnf install 包名-版本-发布号.架构

# 查看所有版本
dnf list --showduplicates nginx

# 查看 nginx 是否存在以及最新的版本是多少
dnf list  nginx

# 锁定 mysql 和 mariadb 的当前版本(使其永不升级)
dnf versionlock add mariadb
dnf versionlock add mysql

# 查看已锁定的包清单
dnf versionlock list

# 解锁
dnf versionlock delete mariadb

# 只安装与安全相关的补丁(不升级软件大版本)
dnf update --security -y

# 或者只更新特定的软件包，而不是全量更新
dnf update nginx -y   

#  ----卸载三板斧-----
# 卸掉主程序
sudo dnf remove nginx -y
# 清理不需要依赖
sudo dnf autoremove -y
# 如果确定不再用，手动删配置(谨慎操作)
sudo rm -rf /etc/nginx
```
- **说明**：日常我们执行 `dnf install nginx` 或 `dnf install mysql`，省略了版本号和发布号，`dnf` 会自动**在所有已启用的仓库中，找到该包最新的版本**(版本号最大、发布号最新的那个)并安装。
- **日常写法**：`sudo dnf install nginx`(DNF 内心 OS：给你装最新的 `1.26.x`)
- **精准写法**：`sudo dnf install nginx-1.20.1-10.el8.x86_64`(DNF 内心 OS：好的，我就装这个指定的)
### 1.1 基于 Debian 系列
备注:(如 Debian、Ubuntu 及其衍生版本)：使用 `apt` 命令
#### 1.1.1 更新软件源列表
在安装软件之前，建议先更新软件源列表，以获取最新的软件信息。
```
sudo apt update
```
#### 1.1.2 安装软件
使用 `apt install` 命令安装指定的软件。例如，安装 `curl` 工具：
```
sudo apt install curl
```
#### 1.1.3 升级软件
使用 `apt upgrade` 命令可以升级系统中已安装的所有软件到最新版本。
```
sudo apt upgrade
```
#### 1.1.4 卸载软件
使用 `apt remove` 命令卸载指定的软件。例如，卸载 `curl`：

```
sudo apt remove curl
```
#### 1.1.5 完全卸载软件
备注:(包括配置文件)：使用 `apt purge` 命令。
```
sudo apt purge curl
```
### 1.2 基于 Red Hat 系列
备注:(如 Red Hat、CentOS、Fedora 等)：使用 yum(较旧版本)或 dnf(较新版本)命令
#### 1.2.1 更新软件源
对于 CentOS 7 及以下版本，使用 `yum` 命令
```
sudo yum update
```
对于 Fedora 等较新版本，使用 `dnf` 命令
```
sudo dnf update
```
#### 1.2.2 安装软件
使用 `yum install` 或 `dnf install` 命令。例如，安装 `wget` 工具：

```
sudo yum install wget  # CentOS 7 及以下
sudo dnf install wget  # Fedora 等
```
#### 1.2.3 卸载软件
使用 `yum remove` 或 `dnf remove` 命令。例如，卸载 `wget`：

```
sudo yum remove wget  # CentOS 7 及以下
sudo dnf remove wget  # Fedora 等
```
### 1.3 YUM仓库配置
在/etc/yum.repos.d/下
```
cd /etc/yum.repos.d/
sudo vim nginx.repo
```
输入以下内容(软件源配置中设置多个镜像源作为备用)
```
[nginx-stable]
name=nginx stable repo
baseurl=https://mirrors.aliyun.com/nginx/stable/centos/$releasever/$basearch/ \
        https://mirrors.ustc.edu.cn/nginx/centos/$releasever/$basearch/ \
        https://nginx.org/packages/centos/$releasever/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://nginx.org/keys/nginx_signing.key
```
1. `[nginx-stable]` ——仓库 ID 名称
2. `name` —— 不是“提取稳定版本”
3. `baseurl` —— 通往下载地址的路径
4. `gpgcheck` ——要求 `dnf` 验证 RPM 包的 GPG 签名。(1 开启 0 关闭)
5. `enabled` ——判断此仓库是否启用(1 启动 0 关闭)
6. `gpgkey` ——指定用于验证签名的公钥下载地址，告诉 `dnf` 去哪里拿“验证工具”。
清理并生成缓存
```
sudo dnf clean all && sudo dnf makecache
```
然后再进行下载
```
# 查看所有版本
dnf list --showduplicates nginx

#安装命令
dnf install 包名-版本-发布号.架构
```


## 二、软件包安装
**原理**

直接使用本地的软件包文件(如 `.rpm` 或 `.deb` 文件)进行安装。这些软件包文件包含了软件的二进制文件、配置文件和元数据等。安装时，系统将软件包中的文件复制到指定目录，并进行必要的配置。

**特点**
1. 依赖手动处理：通常不会自动处理软件包之间的依赖关系，若依赖缺失，安装可能失败，需手动安装依赖包。
2. 灵活性较高：可安装不在官方软件源中的软件包，或安装特定版本的软件。
3. 安装过程较复杂：需用户自己下载软件包文件，并处理可能出现的依赖错误、文件冲突等问题。

**适用场景**
适用于需要安装特定版本软件、从非官方渠道获取软件包，或在没有网络连接的情况下安装软件的场景。
### 2.1 RPM 包安装(适用于 Red Hat 系列 )
RPM(Red Hat Package Manager)是 Red Hat 公司开发的软件包管理系统.
#### 2.1.1 安装 RPM 包
使用 `rpm -ivh` 命令安装指定的 RPM 包。例如，安装名为 `example-1.0-1.rpm` 的软件包
- `-i` = 安装。
- `-v` = 详细(verbose)。
- `-h` = 哈希进度条。
```
# 安装工具
sudo rpm -ivh example-1.0-1.rpm
```
**注意**
建议直接用 ** `dnf install` ** 取代 `rpm -ivh`。因为 `dnf` 会自动连接你系统已有的仓库(如 BaseOS、EPEL)去解决依赖，省去你手动查找和安装依赖的麻烦：
```
sudo dnf install ./example-1.0-1.rpm -y
```
#### 2.1.2 升级 RPM 包
使用 `rpm -Uvh` 命令。
```
sudo rpm -Uvh example-1.0-2.rpm
```
#### 2.1.3 卸载 RPM 包
使用 `rpm -e` 命令。
```
sudo rpm -e example
```
需要注意的是，RPM 包安装不会自动处理依赖关系，如果软件包有依赖，可能需要手动安装依赖包。
### 2.2 DPKG 包安装 (适用于 Debian 系列)
DPKG(Debian Package)是 Debian 系统的软件包管理工具。
#### 2.2.1 安装 DPKG 包
使用 `dpkg -i` 命令安装指定的 `.deb` 软件包。例如，安装 `example_1.0-1.deb`：

```
sudo dpkg -i example_1.0-1.deb
```
#### 2.2.2 卸载 DPKG 包
使用 `dpkg -r` 命令。
```
sudo dpkg -r example
```
和 RPM 包类似，DPKG 包安装也不会自动处理依赖关系。如果安装过程中出现依赖问题，可以使用 `apt --fix-broken install` 命令来尝试修复。

## 三、 预编译二进制解压
**原理**
从软件的官方网站下载**已经编译好的二进制可执行文件**，这些文件是为特定操作系统(如 Linux)和 CPU 架构(如 x 86_64)预先编译好的机器码。用户只需解压即可使用，无需在本地进行编译。

**特点**
1. **解压即用**：无需执行 `./configure` 和 `make` 编译过程，下载解压后即可运行。
2. **依赖极少**：软件依赖的库通常已被**静态编译**进二进制文件，或仅依赖系统最基础的共享库(如 `glibc`)，极大减少了手动解决依赖的麻烦。
3. **部署速度快**：省去了编译时间，特别适合大规模批量部署或紧急上线场景。
4. **定制性弱**：软件的编译参数已由官方或打包方预先固定，用户无法像源码编译那样自由调整模块或功能。
5. **升级方式**：升级时通常需要手动下载新版本压缩包，停止旧服务，覆盖文件，再重启服务(部分软件支持热更新)。

**适用场景**
适合追求快速部署、环境标准化、离线安装，或对编译不熟悉的用户。在中间件(如 Tomcat)、监控工具(如 Prometheus/Grafana)、静态编译的 Go 语言程序中被广泛采用。
### 3.1 下载二进制包
从软件的官方网站下载已编译好的压缩包，文件名通常会包含操作系统名称(如 `linux`)和 CPU 架构(如 `x86_64`、`amd64`、`arm64`)。
例如，下载 MySQL 的通用二进制包
```
wget https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.42-linux-glibc2.28-x86_64.tar.xz
```
### 3.2 解压二进制包
使用 `tar` 命令解压到常用软件目录(通常为 `/usr/local/`)。
```
tar -xvf mysql-8.0.42-linux-glibc2.28-x86_64.tar.xz -C /usr/local/
```
### 3.3 重命名目录
为了方便管理，可以将解压后的长目录名重命名为简短的软件名。
```
mv /usr/local/mysql-8.0.42-linux-glibc2.28-x86_64 /usr/local/mysql
```
### 3.4 创建专用用户
某些服务(如 MySQL)要求以非 root 用户运行，需创建专用系统用户。
```
useradd -s /sbin/nologin -r mysql
```
### 3.5 初始化数据库
以MySQL为例,进入二进制目录，执行程序自带的初始化命令，生成数据目录和初始配置文件。
```
cd /usr/local/mysql
mkdir -p /usr/local/mysql/data
bin/mysqld --initialize --user=mysql --basedir=/usr/local/mysql --datadir=/usr/local/mysql/data
```
**注意**：执行后会产生一个临时 root 密码，务必记录在安全的地方。
### 3.6 启动服务
使用官方提供的启动脚本或直接运行可执行文件来启动服务。
```
bin/mysqld_safe --user=mysql &
```
### 3.7 配置环境变量
将二进制目录下的 `bin/` 路径加入 `PATH`，方便直接执行命令。
```
echo 'export PATH=/usr/local/mysql/bin:$PATH' >> /etc/profile
source /etc/profile
```
### 3.8 设置开机自启
将启动命令写入 `rc.local` 或编写 systemd 服务文件，实现开机自动启动。
```
# 方法一：写入 rc.local
echo "/usr/local/mysql/bin/mysqld_safe --user=mysql &" >> /etc/rc.local
chmod +x /etc/rc.local

# 方法二：创建 systemd 服务(更标准，此处略，需编写 .service 文件)
```

## 四、源码编译安装
**原理**
从软件的官方网站或代码仓库获取软件的源代码，然后在本地进行编译和安装。编译过程会将源代码转换为可执行的二进制文件。

**特点**
1. 高度定制化：用户可以根据自己的需求在编译时调整各种参数，如选择不同的编译选项、指定安装路径等。
2. 获取最新版本：能获取到软件的最新开发版本，使用到最新的功能。
3. 依赖管理复杂：需要手动安装编译所需的各种依赖库和工具，编译过程中可能会遇到各种错误，需要有一定的技术水平来解决。
4. 安装时间长：编译过程通常需要较长时间，尤其是对于大型软件。

**适用场景**
适合对软件有定制化需求、追求最新功能，且具备一定技术能力的用户。
### 4.1 下载源码包
通常从软件的官方网站下载 `.tar.gz` 或 `.tar.bz2` 格式的源码压缩包。例如，下载 `nginx` 的源码包：
源码编译安装五步曲(下载、解压、配置、编译、安装)
```
wget http://nginx.org/download/nginx-1.23.4.tar.gz
```
### 4.2 解压源码包
使用 `tar` 命令解压
```
tar -zxvf nginx-1.23.4.tar.gz
```
### 4.3 进入解压后的目录
```
cd nginx-1.23.4
```
### 4.4 配置编译选项
执行 `./configure` 脚本，可以通过参数指定安装路径等选项。例如，指定安装路径为 `/usr/local/nginx`：

```
./configure --prefix=/usr/local/nginx
```
### 4.5 编译源码

执行 `make` 命令

```
make
```

### 4.6 安装软件

执行 `sudo make install` 命令。

```
sudo make install
```

## 五、使用 Docker 容器化安装
**原理**
Docker 是一种容器化技术，它将软件及其依赖打包成一个独立的容器。容器是一个轻量级的、隔离的运行环境，包含了软件运行所需的一切，如操作系统、库文件、配置文件等。通过 Docker 可以快速部署和运行软件。

**特点**
1. 环境隔离：容器之间相互隔离，不会相互影响，避免了软件之间的依赖冲突。
2. 快速部署：可以在不同的环境中快速部署软件，只需拉取相应的 Docker 镜像并运行容器即可。
3. 资源利用率高：容器共享宿主机的操作系统内核，占用资源少，启动速度快。
4. 可移植性强：Docker 镜像可以在不同的 Docker 环境中运行，方便在不同的服务器之间迁移。

**适用场景**
适用于需要快速部署、环境隔离和资源高效利用的场景，如开发、测试和生产环境的部署。
### 5.1 安装 Docker
根据不同发行版的文档进行安装。以 Ubuntu 为例：

```
sudo apt update
sudo apt install docker.io
```
### 5.2 搜索 Docker 镜像
使用 `docker search` 命令搜索可用的 Docker 镜像。例如，搜索 `nginx` 镜像：
```
docker search nginx
```
### 5.3 拉取 Docker 镜像
使用 `docker pull` 命令拉取指定的镜像。
```
docker pull nginx
```
### 5.4 运行 Docker 容器
使用 `docker run` 命令运行容器。例如，在后台运行 `nginx` 容器，并将容器的 80 端口映射到主机的 80 端口

```
docker run -d -p 80:80 nginx
```

## 六、软件安装方法判断

### 6.1 使用包管理器安装的软件
#### 6.1.1 **Debian 系**
使用 `dpkg -l` 命令列出所有已安装的软件包。
若软件在列表中，且是通过 `apt` 或 `dpkg` 安装的，可进一步使用 `apt-cache policy <package_name>` 查看软件的源信息。
例如查看 `vim` 的源信息，执行 `apt-cache policy vim`，若显示来自官方软件源等信息，则是通过包管理器安装的。
#### 6.1.2 Red Hat 系
使用 `rpm -qa` 命令列出所有已安装的 RPM 包。
若要查看某个软件的详细信息，使用 `rpm -qi <package_name>` 命令。
例如查看 `wget` 的信息，执行 `rpm -qi wget`，能看到软件的安装来源等信息。
### 6.2 源码编译安装的软件
1. 通常从源码编译安装的软件没有在系统包管理的数据库中记录。可以查看软件的安装路径是否为编译时指定的路径。例如，若 `nginx` 按上述源码编译方式安装到 `/usr/local/nginx`，可以检查该目录是否存在。另外，源码编译安装的软件一般不会有系统包管理器提供的自动升级机制。
2. 还可以查看 `/usr/local` 目录下是否有相关的软件目录，因为很多源码编译安装的软件默认会安装到 `/usr/local` 下。
### 6.3 使用 Docker 安装的软件
1. 使用 `docker ps -a` 命令查看所有 Docker 容器的状态。若能看到相关软件的容器信息，说明该软件是通过 Docker 安装的。例如，若看到 `nginx` 容器在列表中，则 `nginx` 是通过 Docker 安装的。
2. 也可以使用 `docker images` 命令查看本地的 Docker 镜像列表，若有软件对应的镜像，也表明该软件可能是通过 Docker 安装的。
## 七、总结
| 安装方式                     | 核心特点         | 依赖处理          | 版本更新      | 生产环境使用频率       | 代表场景                        |
| ------------------------ | ------------ | ------------- | --------- | -------------- | --------------------------- |
| 1. 系统包管理器(默认源)       | 安装简单，版本保守    | 自动解决      | 较老，只打安全补丁 | 非常高(基础组件)  | 装基础库、系统工具                   |
| 2. 手动 rpm 安装         | 单包安装，易遇依赖地狱  | 需手动处理     | 取决你下载的包   | 极低(除非离线应急) | 断网环境紧急救急                    |
| 3. 第三方 repo + 包管理器   | 官方维护，获取最新稳定版 | 自动解决      | 追官方最新稳定版  | 最高(生产标准)   | 装 Nginx、Docker、MySQL 官方版    |
| 4. 预编译二进制解压(.tar.gz) | 解压即用，无依赖     | 无依赖(静态编译) | 手动下载替换    | 很高(中间件/监控) | 装 Grafana、Prometheus、Tomcat |
| 5. 源码编译安装(make)      | 高度定制，排错困难    | 手动解决      | 手动维护      | 极低(除非特殊定制) | Nginx 加第三方模块、嵌入式编译          |
| 6. 容器化(Docker/K8s)   | 环境隔离，交付标准    | 镜像自带      | 镜像版本控制    | 极高(云原生时代)  | 微服务、DevOps 环境               |