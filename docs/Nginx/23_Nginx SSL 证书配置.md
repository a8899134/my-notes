## 一、为什么需要 SSL 证书
### 1.1 HTTP 的三大风险
在互联网高度发达的今天，数据安全早已不是“锦上添花”的选项，而是每一个网站必须构筑的核心防线。

| 问题 | HTTP(不安全) | HTTPS(安全) |
|------|--------------|-------------|
| 数据是否加密？ | ❌ 明文传输(可被窃听) | ✅ 加密传输(防窃听) |
| 身份是否可信？ | ❌ 可能是钓鱼网站 | ✅ 由 CA 机构验证身份 |
| 浏览器是否信任？ | ⚠️ 标记“不安全” | ✅ 显示锁图标 |

### 1.2 SSL 证书的三大核心功能
SSL 证书的作用是建立一条加密通道，确保客户端与服务器之间的每一次通信都不被窃听、篡改或冒充：

| 功能 | 说明 |
|------|------|
| 数据加密 | 采用非对称加密协商会话密钥，再用对称加密传输数据 |
| 身份验证 | 证书内嵌域名及签发机构标识，防御“中间人攻击” |
| 信任链构建 | 由全球公认的 CA 签发，浏览器自动完成校验 |

此外，启用 HTTPS 还能获得 SEO 加分(Google 优先收录 HTTPS 站点)和 用户体验升级(浏览器不再提示“不安全”).
## 二、证书类型对比与选择
### 2.1 三种证书方案对比
根据使用场景，SSL 证书主要有以下三种选择：

| 对比维度 | Let's Encrypt | 商业购买证书 | 自签名证书 |
|----------|---------------|-------------|-----------|
| 费用 | 完全免费 | 付费(有免费 DV 版) | 免费 |
| 浏览器信任 | ✅ 完全信任 | ✅ 完全信任 | ❌ 提示不安全 |
| 有效期 | 90 天(自动续期) | 1-2 年 | 自定义 |
| 适用场景 | 个人博客、中小企业、公网服务 | 电商、金融、高信任要求 | 本地开发、内部测试 |
| 获取方式 | Certbot 自动申请 | 从权威 CA(如 DigiCert、阿里云、腾讯云)购买 | OpenSSL 或 mkcert 生成 |

### 2.2 商业证书的验证级别

| 类型 | 验证级别 | 适用场景 |
|------|----------|----------|
| DV(域名验证型) | 最低，仅验证域名所有权 | 个人博客、测试环境、小型项目 |
| OV(组织验证型) | 中等，需提交企业资料 | 企业官网、B2B 平台 |
| EV(扩展验证型) | 最高，人工审核+法律文件 | 金融支付、政府门户、电商平台 |

**建议**：对于绝大多数个人博客、企业官网和小型应用，DV 型免费证书(Let's Encrypt 或云服务商免费证书)完全够用。

## 三、Let's Encrypt 免费证书配置
### 3.1 前置条件
Let's Encrypt 必须从公网访问你的域名与服务器完成验证：

| 条件 | 说明 |
|------|------|
| 域名解析 | DNS 的 A 记录必须指向服务器的公网 IP(不是 127.0.0.1) |
| 端口开放 | TCP 80(用于签发验证)和 443(用于 HTTPS 服务)必须可访问 |
| Nginx 已安装 | Nginx 能正常启动并监听 80 端口 |

**验证命令**：
```
# 验证域名解析
dig +short yourdomain.com

# 验证 80 端口监听
sudo ss -lntp | grep ':80'

# 验证 Nginx 配置
sudo nginx -t
```
### 3.2 安装 Certbot
**RockyLinux / CentOS**：
```
# 安装 EPEL 仓库(如未安装)
sudo yum install -y epel-release
# 安装 certbot 和 nginx 插件
sudo yum install -y certbot python3-certbot-nginx
```
**Ubuntu / Debian**：
```
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```
**通用方式(snap)**：
```
sudo apt update
sudo apt install -y snapd
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
```
### 3.3 自动模式申请证书(推荐)
```
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
**执行过程**：
1. Certbot 自动检测 Nginx 配置
2. 验证你对域名的控制权
3. 从 Let's Encrypt 获取证书
4. 自动修改 Nginx 配置，添加 HTTPS 相关设置
5. 提示是否将 HTTP 重定向到 HTTPS(建议选 Yes)
✅ 成功后证书位于：
- 证书链：`/etc/letsencrypt/live/yourdomain.com/fullchain.pem`
- 私钥：`/etc/letsencrypt/live/yourdomain.com/privkey.pem`
### 3.4 Webroot 模式(适合源码编译安装 Nginx)
如果 Nginx 是源码编译安装的(如路径 `/usr/local/nginx`)，`certbot --nginx` 可能无法自动识别配置，建议使用 Webroot 模式。

**第一步：配置 Nginx 验证路径**
编辑站点配置，添加 Let's Encrypt 验证专用 location：
```
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }
}
```
创建目录并重载 Nginx：
```
sudo mkdir -p /var/www/html
sudo nginx -s reload
```
**第二步：手动申请证书**
```
sudo certbot certonly --webroot \
  -w /var/www/html \
  -d yourdomain.com \
  -d www.yourdomain.com
```
### 3.5 证书自动续期
Let's Encrypt 证书有效期为 90 天，必须配置自动续期。
测试续期是否正常：
```
sudo certbot renew --dry-run
```
✅ 如果看到 “Congratulations, all simulated renewals succeeded”，说明配置 OK。
确认自动续期任务：
```
# 查看是否已有 certbot 定时任务
sudo crontab -l | grep certbot
# 或查看 systemd timer(Ubuntu 18.04+ 默认)
systemctl list-timers | grep certbot
```
如果未自动创建，可手动添加 cron 任务：
```
echo "0 3 * * * root /usr/bin/certbot renew --quiet && /usr/bin/systemctl reload nginx" >> /etc/crontab
```
⚠️ 如果 Nginx 是源码编译安装的，将 /usr/bin/systemctl reload nginx 替换为 /usr/bin/nginx -s reload。

## 四、商业购买证书配置
### 4.1 获取证书文件
无论从哪个服务商(阿里云、腾讯云、DigiCert、GlobalSign 等)购买，流程基本一致：

| 步骤 | 说明 |
|------|------|
| 1. 购买证书 | 按需选择 DV/OV/EV 类型 |
| 2. 域名验证 | 通过 DNS 解析或站点文件方式完成验证 |
| 3. 下载证书 | 选择服务器类型为 Nginx 下载 |
| 4. 解压文件 | 通常包含 `.crt` / `.pem`(证书)和 `.key`(私钥)文件 |

解压后你会得到：
1. yourdomain.crt 或 yourdomain.pem → 证书文件
2. yourdomain.key → 私钥文件
3. ca-bundle.crt(可能)→ 中间证书链
### 4.2 上传证书到服务器
```
# 1. 创建证书目录
sudo mkdir -p /etc/nginx/ssl

# 2. 上传证书文件到 /etc/nginx/ssl/(使用 SCP 或 SFTP 工具)

# 3. 设置文件权限(私钥严格保密)
sudo chmod 600 /etc/nginx/ssl/yourdomain.key
sudo chmod 644 /etc/nginx/ssl/yourdomain.crt
```
### 4.3 配置 Nginx
编辑站点配置文件(如 /etc/nginx/conf.d/yourdomain.conf)：
```
# HTTP 强制跳转 HTTPS
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

# HTTPS 服务
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL 证书配置[reference:37][reference:38]
    ssl_certificate /etc/nginx/ssl/yourdomain.crt;
    ssl_certificate_key /etc/nginx/ssl/yourdomain.key;
    # 如有中间证书(部分 CA 需要)
    ssl_trusted_certificate /etc/nginx/ssl/ca-bundle.crt;

    # 安全协议(仅启用安全版本)
    ssl_protocols TLSv1.2 TLSv1.3;

    # 加密套件[reference:40]
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;

    # 会话缓存[reference:41]
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 强制全站 HTTPS[reference:42]
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # 隐藏版本
    server_tokens off;

    # 站点配置
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```
### 4.4 验证配置
```
# 检查配置语法[reference:43]
sudo nginx -t

# 重载配置[reference:44]
sudo systemctl reload nginx

# 或在浏览器访问 https://yourdomain.com，查看地址栏锁图标
```

## 五、自签名证书配置
### 5.1 什么是自签名证书
自签名证书是自己生成的证书，没有经过权威 CA 机构签名。它在浏览器中会提示“不安全”，但加密通道是正常建立的。
适用场景：本地开发环境、内部测试系统、内网服务。
### 5.2 使用 OpenSSL 生成自签名证书
**第一步：创建证书目录**
```
sudo mkdir -p /etc/nginx/ssl
sudo chmod 700 /etc/nginx/ssl
```
**第二步：生成私钥和证书(一条命令)**
```
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/selfsigned.key \
  -out /etc/nginx/ssl/selfsigned.crt \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=MyOrg/CN=yourdomain.com"
```
**命令拆解**：

| 参数 | 说明 |
|------|------|
| `req` | 证书请求和生成工具 |
| `-x509` | 生成自签名证书(而非证书请求) |
| `-nodes` | 不加密私钥(启动 Nginx 时无需输入密码) |
| `-days 365` | 证书有效期 365 天 |
| `-newkey rsa:2048` | 生成 2048 位 RSA 私钥 |
| `-keyout` | 私钥输出路径 |
| `-out` | 证书输出路径 |
| `-subj` | 证书主题信息(CN 必须与域名匹配) |

💡 如果 `openssl` 未安装：
```
# RockyLinux / CentOS
sudo yum install -y openssl
# Ubuntu / Debian
sudo apt install -y openssl
```
### 5.3 配置 Nginx
```
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/selfsigned.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}

# HTTP 跳转 HTTPS(可选，开发环境建议保留 HTTP 方便调试)
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}
```
### 5.4 使用 mkcert 生成浏览器信任的自签名证书(开发环境推荐)
mkcert 专为开发环境设计，可一键安装本地 CA 并签发浏览器信任的证书。

**安装 mkcert：**
1. 从 GitHub Releases 下载对应平台版本
2. 安装本地 CA：mkcert -install
3. 生成证书：mkcert localhost 192.168.1.100 yourdomain.com
生成后会得到 .pem(证书)和 -key.pem(私钥)，在 Nginx 中配置即可。
## 六、SSL 安全最佳实践(通用)
无论使用哪种证书，以下安全配置都推荐在 server 块中启用：
### 6.1 核心安全配置
```
server {
    listen 443 ssl http2;                    # 启用 HTTP/2
    server_name yourdomain.com;

    # 证书配置
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_trusted_certificate /path/to/ca-bundle.crt;  # 如有中间证书

    # 协议版本：仅启用安全协议
    ssl_protocols TLSv1.2 TLSv1.3;           # 禁用 TLSv1.1 及以下

    # 加密套件
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;            # 优先使用服务端加密套件

    # 会话缓存(提升性能)
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS：强制浏览器使用 HTTPS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # 隐藏 Nginx 版本
    server_tokens off;
}
```
### 6.2 强制 HTTP 跳转 HTTPS
```
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;    # 永久重定向到 HTTPS
}
```
