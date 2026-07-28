本文主要介绍三种安装 Nginx方式，分别是Nginx YUM 源安装、二进制安装、源码编译安装，并附上一些常用核心命令。

## 一、前置准备
### 1.1 系统环境
1. **适用环境**：RockyLinux 8 x 86_64、root 权限、服务器可访问外网
2. **使用中科大镜像源**(`https://mirrors.ustc.edu.cn`)，国内访问速度快、稳定性高
### 1.2 清理旧配置
检测 Nginx 是否安装(返回版本则已装，无输出则未装)
```
nginx -v >/dev/null 2>&1 && echo "✅ Nginx 已安装，版本：$(nginx -v 2>&1 | awk '{print $3}')" || echo "❌ Nginx 未安装"
```
额外检测是否运行(可选，快速看状态)
```
systemctl is-active nginx >/dev/null 2>&1 && echo "✅ Nginx 正在运行" || echo "❌ Nginx 未运行/未安装"
```
如果服务器之前配置过 Nginx 官方源 / 第三方源，先清理避免冲突：
删除可能存在的旧 Nginx 源文件
```
rm -rf /etc/yum.repos.d/nginx.repo
```
清理 YUM 缓存并重建 YUM 缓存
```
dnf clean all && dnf makecache
```
### 1.3 配置防火墙
如果服务器开启了防火墙 `firewalld`，需要放行 HTTP(80 端口)
```
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

## 二、YUM安装
YUM(Yellowdog Updater Modified)是 RockyLinux 的包管理工具，自动处理软件包的依赖关系，安装、升级、卸载都非常方便。
YUM 安装的 Nginx 会自动完成以下工作：
- 创建 `nginx` 系统用户
- 注册 `systemd` 服务(可用 `systemctl` 管理)
- 将配置文件放在标准路径 `/etc/nginx/`
- 自动安装 PCRE、zlib、OpenSSL 等依赖库
**适用场景**：绝大多数生产环境，尤其是对定制化要求不高的场景。
### 2.1 安装 yum-utils 工具
```
dnf install -y yum-utils
```
**命令解释**：
- `yum-utils`：YUM 工具集，提供 `yum-config-manager` 等实用命令
### 2.2 添加中科大 Nginx 仓库
```
cd /etc/yum.repos.d
sudo vim nginx.repo
```
添加以下内容
```
[nginx-stable]
name=nginx stable repo
baseurl=https://mirrors.ustc.edu.cn/nginx/centos/$releasever/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://nginx.org/keys/nginx_signing.key
module_hotfixes=true

[nginx-mainline]
name=nginx mainline repo
baseurl=https://mirrors.ustc.edu.cn/nginx/mainline/centos/$releasever/$basearch/
gpgcheck=1
enabled=0
gpgkey=https://nginx.org/keys/nginx_signing.key
module_hotfixes=true
```
**配置解释**：
- `[nginx-stable]`：仓库名称。nginx-stable (稳定版) ，nginx-mainline(主线版)。
- `name`：仓库描述
- `baseurl`：软件包下载地址。`$releasever` 会自动替换为系统版本号(如 `8`)，`$basearch` 替换为系统架构(如 `x86_64`)
- `gpgcheck=1`：启用 GPG 签名验证，确保软件包未被篡改
- `enabled=1`：启用该仓库(`0` 表示禁用)
- `gpgkey`：GPG 公钥地址，用于验证软件包签名
- `module_hotfixes=true`：允许该仓库覆盖系统模
### 2.3 更新缓存
```
sudo dnf clean all && sudo dnf makecache
```
### 2.4 安装 Nginx
默认安装 stable(稳定版)，一般生产环境是以稳定为主。
```
dnf install -y nginx
```
如需安装 mainline(主线版)，先启用 mainline 仓库再安装:
```
yum-config-manager --enable nginx-mainline
dnf install -y nginx
```
**命令解释**：
- `yum-config-manager --enable nginx-mainline`：启用名为 `nginx-mainline` 的仓库。
### 2.5 验证安装
```
nginx -v
```
**命令解释**：
- `nginx -v`：显示 Nginx 版本号。如果输出版本信息(如 `nginx version: nginx/1.24.0`)，说明安装成功。
### 2.6 启动并设置开机自启
```
systemctl start nginx
systemctl enable nginx
```
**命令解释**：
- `systemctl start nginx`：立即启动 Nginx 服务
- `systemctl enable nginx`：设置 Nginx 在系统启动时自动运行
### 2.7 检查服务状态
```
systemctl status nginx
```
**命令解释**：
- `systemctl status nginx`：查看 Nginx 的运行状态。输出中应包含 `active (running)`，表示服务正在运行。
### 2.8 卸载
```
systemctl stop nginx
dnf remove -y nginx
# 看需求清理repo文件
rm -f /etc/yum.repos.d/nginx.repo
```

## 三、预编译二进制安装
二进制安装是指直接下载 Nginx 官方已经编译好的可执行文件(RPM 包)，然后通过包管理器手动安装

**优点**：
- 比源码编译简单，无需编译环境
- 比 YUM 安装更灵活，可选择特定版本
- 适合无法连接外网或需要特定版本的场

**缺点**：
- 需要手动处理依赖关系
- 更新和卸载不如 YUM 方便 

**适用场景**：需要安装特定版本、离线环境、或不想配置 YUM 源的场景。
### 3.1 安装依赖工具
```
dnf install -y wget
```
**命令解释**：
- `wget`：命令行下载工具
### 3.2 下载 Nginx RPM 包
访问 Nginx 官方下载页面查看可用版本：[https://nginx.org/download/]
以 1.24.0 版本为例：
```
cd /usr/local/src/
wget https://nginx.org/packages/centos/8/x86_64/RPMS/nginx-1.24.0-1.el8.ngx.x86_64.rpm
```
**命令解释**：
- `cd /usr/local/src/`：切换到源码存放目录(惯例将源码放在 `/usr/local/src/`)
- `wget`：从网络下载文件
**注意**：请将 URL 中的版本号替换为所需版本。中科大镜像也提供了 RPM 包：  `https://mirrors.ustc.edu.cn/nginx/centos/8/x86_64/RPMS/`
### 3.3 安装 RPM 包
```
dnf install -y nginx-1.24.0-1.el8.ngx.x86_64.rpm
```
**命令解释**：
用 `dnf install` 取代 `rpm -ivh`。因为 `dnf` 会自动连接你系统已有的仓库(如 BaseOS、EPEL)去解决依赖，省去你手动查找和安装依赖的麻烦。
- `dnf install`：安装本地 RPM 包，并自动解决依赖关系
- `-y`：自动确认
**重要补充**：如果系统无法访问外网导致 dnf 无法拉取依赖，可以这样解决：
```
# 方法一：用 rpm 强制安装(需手动解决依赖)
rpm -ivh --nodeps nginx-1.24.0-1.el8.ngx.x86_64.rpm

# 方法二：提前下载好所有依赖包(离线场景)
dnf download --resolve nginx-1.24.0-1.el8.ngx.x86_64.rpm
```
### 3.4 验证安装
```
nginx -v
```
### 3.5 启动并设置开机自启
```
systemctl start nginx
systemctl enable nginx
```
### 3.6 检查服务状态
```
systemctl status nginx
```
### 3.7 卸载
```
systemctl stop nginx
dnf remove -y nginx
```

## 四、源码编译安装
源码编译安装是指**从 Nginx 官方网站下载源代码，在本地编译成可执行文件**的过程。

**优点**：
- **高度定制化**：可以按需选择编译模块，添加第三方模块
- **性能优化**：可针对服务器硬件进行编译优化
- **最新版本**：可在官方发布后立即获得最新版本

**缺点**：
- 安装过程复杂，步骤较多
- 需要手动解决依赖问题
- 没有自动升级和卸载机制

**适用场景**：需要特定模块(如第三方模块)、对性能有极致要求、或需要使用最新特性的场景。
### 4.1 安装编译工具和依赖库
源码编译需要 C 编译器和相关开发库：
```
dnf install -y gcc gcc-c++ make pcre-devel zlib-devel openssl-devel libtool autoconf
```
**依赖库解释**：
- `gcc` / `gcc-c++`：C/C++ 编译器，用于编译源代码
- `make`：构建工具，根据 Makefile 编译程序
- `pcre-devel`：PCRE(Perl Compatible Regular Expressions)开发库，Nginx 的 `rewrite` 模块需要它来支持正则表达式
- `zlib-devel`：zlib 压缩库开发文件，Nginx 的 `gzip` 压缩功能依赖它
- `openssl-devel`：OpenSSL 开发库，Nginx 的 HTTPS(SSL/TLS)功能依赖它
- `libtool` `autoconf` 某些第三方模块(如 Lua 模块)可能会用到
### 4.2 创建 Nginx 运行用户
为了安全起见，建议创建一个专门的系统用户来运行 Nginx：
```
useradd -r -s /sbin/nologin nginx
```
**命令解释**：
- `useradd`：添加新用户
- `-r`：创建系统用户(UID 在系统范围内，不会登录)
- `-s /sbin/nologin`：指定用户的登录 Shell 为 `/sbin/nologin`，禁止该用户登录系统
- `nginx`：用户名
### 4.3 下载 Nginx 源码
访问 [https://nginx.org/download/](https://nginx.org/download/) 查看可用版本，以 1.24.0 为例：
```
cd /usr/local/src/
wget https://nginx.org/download/nginx-1.24.0.tar.gz
```
**命令解释**：
- `cd /usr/local/src/`：切换到源码存放目录(惯例将源码放在 `/usr/local/src/`)
- `wget`：从网络下载文件
### 4.4 解压源码
```
tar -zxvf nginx-1.24.0.tar.gz
cd nginx-1.24.0
```
**命令解释**：
- `tar -zxvf`：解压 `.tar.gz` 格式的压缩包
    - `-z`：通过 gzip 解压
    - `-x`：解包(extract)
    - `-v`：显示详细信息(verbose)
    - `-f`：指定文件名(file)
### 4.5 配置编译参数
`./configure` 脚本会检查系统环境并生成 Makefile：
```
./configure \
    --prefix=/usr/local/nginx \
    --user=nginx \
    --group=nginx \
    --with-http_ssl_module \
    --with-http_gzip_static_module \
    --with-http_stub_status_module \
    --with-http_v2_module
```
**参数解释**：
- `--prefix=/usr/local/nginx`：指定安装目录，后续所有文件都会安装到这个目录下
- `--user=nginx` / `--group=nginx`：指定运行 Nginx 的用户和组(需与之前创建的用户一致)
- `--with-http_ssl_module`：启用 HTTPS 支持(SSL/TLS)
- `--with-http_gzip_static_module`：启用静态 Gzip 压缩模块(预压缩文件)
- `--with-http_stub_status_module`：启用状态监控页面(`/nginx_status`)
- `--with-http_v2_module`：启用 HTTP/2 协议支持
**提示**：运行 `./configure --help` 可查看所有可选参数。
### 4.6 编译并安装
```
make -j$(nproc) && make install
```
**命令解释**：
- `make`：根据 Makefile 编译源代码
- `-j$(nproc)`：并行编译，`$(nproc)` 返回 CPU 核心数，可大幅加快编译速度
- `&&`：前一条命令成功后才执行后一条
- `make install`：将编译好的文件安装到 `--prefix` 指定的目录
### 4.7 创建软链接
为了方便在任何目录下执行 `nginx` 命令，创建软链接到系统 PATH：
```
ln -s /usr/local/nginx/sbin/nginx /usr/bin/nginx
```
**命令解释**：
- `ln -s`：创建符号链接(类似于 Windows 的快捷方式)
- 第一个路径是**目标文件**(实际的可执行文件)
- 第二个路径是**链接名称**(快捷方式)
### 4.8 验证安装
```
nginx -V
```
**命令解释**：
- `nginx -V`：显示版本号和编译参数(可确认 SSL 等模块是否已启用)
### 4.9 配置 systemd 服务
为了便于统一管理(用 `systemctl` 命令)，需要手动创建 systemd 服务文件：
```
cat > /usr/lib/systemd/system/nginx.service << 'EOF'
[Unit]
Description=nginx - high performance web server
Documentation=https://nginx.org/en/docs/
After=network-online.target remote-fs.target nss-lookup.target
Wants=network-online.target

[Service]
Type=forking
PIDFile=/usr/local/nginx/logs/nginx.pid
ExecStart=/usr/local/nginx/sbin/nginx -c /usr/local/nginx/conf/nginx.conf
ExecReload=/usr/local/nginx/sbin/nginx -s reload
ExecStop=/usr/local/nginx/sbin/nginx -s quit
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```
**配置解释**：
- `[Unit]`：服务说明
    - `Description`：服务描述
    - `After`：在哪些服务之后启动(确保网络已就绪)
- `[Service]`：服务运行配置
    - `Type=forking`：服务以守护进程方式运行(父进程退出，子进程继续)
    - `PIDFile`：PID 文件路径，用于跟踪主进程
    - `ExecStart`：启动命令(`-c` 指定配置文件)
    - `ExecReload`：重载配置命令(`-s reload` 热重载，不中断服务)
    - `ExecStop`：停止命令(`-s quit` 优雅停止，处理完当前请求后退出)
    - `PrivateTmp=true`：使用独立的临时目录，增强安全性
- `[Install]`：安装配置
    - `WantedBy=multi-user.target`：在多用户模式下自动启动
### 4.10 启动服务
```
systemctl daemon-reload
systemctl start nginx
systemctl enable nginx
```
**命令解释**：
- `systemctl daemon-reload`：重新加载 systemd 配置(识别新创建的 `nginx.service` 文件)
- `systemctl start nginx`：启动 Nginx
- `systemctl enable nginx`：设置开机自启
### 4.11 卸载
```
systemctl stop nginx
rm -rf /usr/local/nginx
```

## 五、安装方式对比与总结

### 5.1 方式差异

| 对比项 | 中科大 YUM 源安装 | 手动二进制安装 | 源码编译安装 |
|--------|-------------------|----------------|--------------|
| **安装难度** | ⭐ 最简单 | ⭐⭐ 简单 | ⭐⭐⭐⭐ 较复杂 |
| **版本新鲜度** | 官方源最新 | 取决于下载的版本 | 任意版本 |
| **定制化能力** | 无 | 无 | 高度灵活 |
| **依赖处理** | 自动 | 部分自动 | 手动 |
| **升级/卸载** | 方便(`dnf` 管理) | 不便(需手动) | 不便(需手动) |
| **推荐场景** | 生产环境首选 | 特定版本/离线环境 | 定制模块/特殊需求 |

### 5.2 路径差异

由于安装方式不同，默认路径有差异，执行命令时如果不注意可能会报错。整理如下：

| 路径/文件 | YUM 安装(默认) | 源码编译安装(默认) |
|-----------|----------------|-------------------|
| **主配置文件** | `/etc/nginx/nginx.conf` | `/usr/local/nginx/conf/nginx.conf` |
| **子配置目录** | `/etc/nginx/conf.d/*.conf` | `/usr/local/nginx/conf/conf.d/`(需手动创建) |
| **访问日志** | `/var/log/nginx/access.log` | `/usr/local/nginx/logs/access.log` |
| **错误日志** | `/var/log/nginx/error.log` | `/usr/local/nginx/logs/error.log` |
| **PID 文件** | `/var/run/nginx.pid` | `/usr/local/nginx/logs/nginx.pid` |
| **可执行文件** | `/usr/sbin/nginx` | `/usr/local/nginx/sbin/nginx` |
| **systemd 服务** | 自动配置，直接 `systemctl` 可用 | 需手动创建 `nginx.service` 文件 |

## 六、核心命令

| 命令 | 作用 | 说明 |
|------|------|------|
| `systemctl start nginx` | 启动 Nginx | |
| `systemctl stop nginx` | 停止 Nginx | 内部调用 `nginx -s quit` |
| `systemctl reload nginx` | 热重载配置 | 内部调用 `nginx -s reload` |
| `systemctl restart nginx` | 重启 Nginx(先停止再启动) | 会中断请求，慎用 |
| `systemctl status nginx` | 查看运行状态、PID 和最近日志 | |
| `systemctl enable nginx` | 设置开机自启 | |
| `systemctl disable nginx` | 取消开机自启 | |
| `nginx -t` | 检查配置文件语法 | 输出 `test is successful` 即为正常 |
| `nginx -v` | 显示版本号 | |
| `ss -tlnp \| grep nginx` | 查看端口监听状态 | 检查 80/443 是否正常绑定 |
| `ps -ef \| grep nginx` | 查看 Nginx 进程 | 能看到 Master 进程和 Worker 进程 |
| `tail -f /var/log/nginx/error.log` | 实时查看错误日志 | 启动失败或出现 502/504 时必看 |
| `tail -f /var/log/nginx/access.log` | 实时查看访问日志 | 观察实时请求流量和状态码 |
| `curl -I 127.0.0.1` | 测试本地 HTTP 响应 | 绕过防火墙和网络，直接验证 Nginx 是否正常工作 |
| `nginx -V` | 显示版本 + 编译参数 | 排查 SSL 模块是否开启，源码编译时务必用此确认参数 |
| `nginx -s quit` | 优雅停止(处理完当前请求后退出) | 生产环境停机维护时推荐 |
| `nginx -s reopen` | 重新打开日志文件 | 日志切割(logrotate)后使用 |
| `nginx -s stop` | 强制停止(立即终止) | 紧急故障时使用，会中断请求，慎用 |