## 一、核心概念

在 Linux 中，“下载”指的是 从远程服务器(如网站、FTP、Git 仓库等)将文件复制到本地机器 的过程。

常见的下载来源：

- HTTP/HTTPS 网站(如 `https://example.com/file.tar.gz`)
- FTP 服务器
- Git 代码仓库(如 GitHub)
- 软件包仓库(如 yum/dnf/apt 源)

## 二、常用下载工具详解

### 2.1 wget

特点：轻量、稳定、支持断点续传、后台下载。

基本语法：
```
wget [选项] URL
```
#### 2.1.1 普通下载
(直接保存为默认文件名)：
下载 Nginx 源码包(默认保存为 nginx-1.24.0.tar.gz)
```
wget https://nginx.org/download/nginx-1.24.0.tar.gz
```
#### 2.1.2 指定保存文件名
(-O 文件名，大写 O)：
下载并保存为 nginx-latest.tar.gz(避免文件名过长)
```
wget -O nginx-latest.tar.gz https://nginx.org/download/nginx-1.24.0.tar.gz
```
#### 2.1.3 断点续传
(-c，适合大文件下载中断后继续)：
继续下载未完成的大文件
```
wget -c https://example.com/large-file.iso
```
#### 2.1.4 后台下载
(-b，避免终端关闭后下载停止)
后台下载，日志保存到 wget-log
```
wget -b https://example.com/big-file.zip
```
查看下载进度
```
tail -f wget-log
```
#### 2.1.5 下载带用户名密码的资源
```
wget --user=username --password=password https://example.com/protected-file.tar.gz
```
### 2.2 curl

特点：不仅支持下载，还支持上传、API 调用、模拟浏览器等，是开发者最爱。

基本语法(下载)：

```
curl [选项] URL -o 本地文件名
```
#### 2.2.1 普通下载
(-o 文件名，小写 o 指定保存名)：
下载并保存为 nginx.tar.gz
```
curl -o nginx.tar.gz https://nginx.org/download/nginx-1.24.0.tar.gz
```
#### 2.2.2 断点续传
```
curl -C - -o large-file.iso https://example.com/large-file.iso
```
#### 2.2.3 显示下载进度
```
curl -# -o test.zip https://example.com/test.zip
```
### 2.3 包管理器下载
备注说明:(yum / dnf / apt)—— 安装软件的标准方式,是官方软件源下载并自动安装 RPM/DEB 包。
openEuler / CentOS 8+ 使用 `dnf`：

```
# 下载但不安装(包会缓存在 /var/cache/dnf/)
sudo dnf download nginx

# 下载并安装
sudo dnf install nginx
```
CentOS 7 使用 `yum`：
```
sudo yum install wget
```
### 2.4 git clone
如果你要下载开源项目(如 Zabbix 源码)，用 Git：
```
# 安装 git(如果没装)
sudo dnf install git

# 克隆仓库
git clone https://github.com/zabbix/zabbix.git

# 只下载特定版本(节省时间)
git clone --branch release/6.0 https://github.com/zabbix/zabbix.git
```
### 2.5 scp / rsync
适用于服务器之间的文件传输。
```
# 从远程服务器下载文件
scp user@remote-server:/path/to/file ./local_dir/

# 同步整个目录(更高效)
rsync -avz user@remote:/backup/ ./local_backup/
```

## 三、下载位置与权限问题

### 3.1 下载的文件路径
- 默认情况下，`wget` 和 `curl` 会把文件保存在你执行命令时所在的当前目录。
- 你可以用 `pwd` 查看当前目录，用 `ls` 查看文件是否下载成功。
### 3.2 权限问题
如果你要下载到系统目录(如 `/usr/local/src`)，需要 `sudo`：
```
sudo wget -P /usr/local/src https://example.com/file.tar.gz
# -P 指定目录
```
- 但不建议普通用户直接往系统目录写文件，最好先下载到家目录(`～/`)，再用 `sudo cp` 移动。

## 四、安全注意事项

### 4.1 不要随意下载并运行脚本

```
# 危险！可能包含恶意代码
curl -s https://some.site/install.sh | bash
```

正确做法：先下载，检查内容，再运行。

```
wget https://example.com/install.sh
cat install.sh    # 仔细阅读
chmod +x install.sh
./install.sh
```

### 4.2 验证文件完整性

下载大软件(如 ISO 镜像)后，用 `sha256sum` 核对校验值：

```
sha256sum centos.iso
# 对比官网提供的 SHA256 值
```

优先使用 HTTPS  
避免使用 `http://`，防止中间人篡改。

## 五、实例

### 5.1 下载 Zabbix 源码

```
cd /tmp
wget https://cdn.zabbix.com/zabbix/sources/stable/6.0/zabbix-6.0.24.tar.gz
tar -xzvf zabbix-6.0.24.tar.gz
```
### 5.2 下载并安装 RPM 包

```
# 先下载 repo 文件
sudo wget -O /etc/yum.repos.d/zabbix.repo https://repo.zabbix.com/zabbix/6.0/rhel/7/x86_64/zabbix-release-6.0-4.el7.noarch.rpm

# 再安装软件
sudo dnf install zabbix-server-mysql
```

### 5.3 下载大文件

```
# 后台 + 断点续传
wget -b -c https://backup.example.com/db_dump.sql.gz
```

## 六、工具对比表

| 工具          | 适用场景          | 是否预装   | 特点         |
| ----------- | ------------- | ------ | ---------- |
| `wget`      | 下载单个/多个文件     | ✅ 几乎都有 | 简单、稳定、支持续传 |
| `curl`      | 下载 + API + 调试 | ✅ 大多数有 | 功能强，适合开发者  |
| `dnf/yum`   | 安装系统软件        | ✅      | 自动解决依赖，最安全 |
| `git`       | 下载代码          | ❌ 需安装  | 用于开源项目     |
| `scp/rsync` | 服务器间传文件       | ✅      | 安全、高效      |

## 七、终极建议
1. 日常下载文件，用 `wget` —— 简单可靠。
2. 安装软件，优先用 `dnf install` 或 `yum install` —— 不要自己编译除非必要。
3. 下载后先检查文件是否存在：`ls -lh 文件名`
4. 大文件加 `-c`(续传)和 `-b`(后台)。
5. 永远不要盲目执行网上的一键脚本！