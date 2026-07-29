## 一、什么是虚拟主机隔离
### 1.1 虚拟主机的概念
虚拟主机(Virtual Host)是指在一台物理服务器上，通过 Web 服务器软件的配置，同时运行多个独立的网站或应用。每个虚拟主机拥有自己独立的域名、根目录、日志文件和安全策略，在逻辑上互不干扰。

Nginx 通过server 块(Server Block)来实现虚拟主机功能。每一个 server 块就代表一个独立的虚拟主机。当用户请求到达 Nginx 时，Nginx 会根据请求中的域名(Host 头) 或 IP/端口，将请求路由到对应的 server 块进行处理。
### 1.2 虚拟主机隔离的作用
在实际生产环境中，单台服务器往往需要承载多个业务站点。如果不做隔离，所有站点共享同一套配置、同一个日志文件，会带来一系列问题。

| 问题   | 说明                            |
| - | -- |
| 日志混乱 | 所有站点的访问记录混在一起，难以定位某个站点的问题     |
| 配置冲突 | 一个站点的配置修改可能影响其他站点             |
| 安全风险 | 某个站点的漏洞可能被利用来攻击同服务器上的其他站点     |
| 资源争抢 | 某个站点流量突增可能耗尽所有连接资源，导致其他站点无法访问 |
| 运维困难 | 无法对单个站点做独立的流量分析和故障排查          |
### 1.3 虚拟主机隔离的三大优势
通过 Nginx 虚拟主机隔离技术，可以实现：
1. 安全隔离体系：每个站点拥有独立的配置块、访问日志、错误日志和访问控制规则。当某个站点遭受攻击或出现故障时，不会影响其他站点的正常运行。
2. 资源独立分配：通过 Nginx 的 worker_connections 参数和限流模块，可实现 CPU、内存、带宽等资源的差异化分配。
3. 运维效率提升：集中式配置管理、模块化配置文件、热更新能力，使站点部署时间从小时级缩短至分钟级。
### 1.4 虚拟主机的三种实现方式
Nginx 支持三种虚拟主机实现方式：

| 方式 | 原理 | 适用场景 |
|------|------|----------|
| 基于域名 | 根据请求头中的 `Host` 字段匹配不同的 `server_name` | 最常用，多个域名共享同一 IP 和端口 |
| 基于 IP | 根据请求的目标 IP 地址匹配不同的 `server` 块 | 服务器有多个 IP 地址时使用 |
| 基于端口 | 根据请求的目标端口匹配不同的 `server` 块 | 不同服务使用不同端口(如 8080、9090) |

## 二、基础配置
### 2.1 配置文件结构
在生产环境中，推荐采用模块化配置方式，将每个站点的配置独立成文件，便于管理和维护。
```
/etc/nginx/
├── nginx.conf                 # 主配置文件
├── conf.d/                    # 虚拟主机配置目录
│   ├── site1.conf             # 站点1的配置
│   ├── site2.conf             # 站点2的配置
│   └── site3.conf             # 站点3的配置
└── snippets/                  # 配置片段目录(可选)
    ├── ssl.conf               # SSL 通用配置
    └── limits.conf            # 限流通用配置
```
**核心机制：** 在 nginx.conf 的 http 块中，通过 include 指令加载 conf.d/ 目录下所有 .conf 文件
```
http {
    include /etc/nginx/conf.d/*.conf;
    # ... 其他全局配置
}
```
这样，每个站点的配置相互独立，新增或删除站点只需操作对应的 .conf 文件即可，无需修改主配置文件。
### 2.2 基础配置示例
假设我们需要在同一台服务器上托管两个网站：www.site-a.com 和 www.site-b.com。

1. 创建站点根目录
```
# 创建两个站点的根目录
mkdir -p /var/www/site-a
mkdir -p /var/www/site-b

# 创建测试页面
echo "<h1>Welcome to Site A</h1>" > /var/www/site-a/index.html
echo "<h1>Welcome to Site B</h1>" > /var/www/site-b/index.html

# 设置目录权限(Nginx 用户需有读取权限)
chown -R nginx:nginx /var/www/site-a /var/www/site-b
```
**命令解释**：
- mkdir -p：创建目录，-p 表示自动创建父目录
- chown -R nginx:nginx：递归更改目录所有者为 nginx 用户和组

2. 创建站点配置文件
在 /etc/nginx/conf.d/ 目录下创建 site-a.conf：
```
server {
    listen 80;
    server_name www.site-a.com site-a.com;

    root /var/www/site-a;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ =404;
    }

    # 独立访问日志
    access_log /var/log/nginx/site-a/access.log;
    error_log /var/log/nginx/site-a/error.log;
}
```
创建 site-b.conf：
```
server {
    listen 80;
    server_name www.site-b.com site-b.com;

    root /var/www/site-b;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ =404;
    }

    # 独立访问日志
    access_log /var/log/nginx/site-b/access.log;
    error_log /var/log/nginx/site-b/error.log;
}
```
### 2.4 验证与生效
配置完成后，执行以下命令验证并生效：
```
# 1. 检查配置文件语法
nginx -t

# 2. 如果语法正确，重载配置(不中断服务)
systemctl reload nginx
# 或
nginx -s reload
```

## 三、日志分离
### 3.1 为什么需要日志分离
如果不进行日志分离，所有站点的访问记录和错误信息都会混在一起，写入同一个日志文件(通常是 /var/log/nginx/access.log 和 /var/log/nginx/error.log)。这会导致：
1. 难以定位某个站点的问题
2. 日志文件过大，影响读取效率
3. 无法对单个站点做独立的流量分析
通过日志分离，每个站点拥有独立的日志文件，管理更清晰，也便于使用工具(如 GoAccess、AWStats)进行访问日志分析。
### 3.2 配置独立日志
1. 创建日志目录
```
# 为每个站点创建专属日志目录
mkdir -p /var/log/nginx/site-a
mkdir -p /var/log/nginx/site-b

# 确保 Nginx 进程有写入权限
chown -R nginx:nginx /var/log/nginx/site-a /var/log/nginx/site-b
```
2. 在配置中指定日志路径
```
server {
    listen 80;
    server_name www.site-a.com;

    root /var/www/site-a;

    # 独立的访问日志
    access_log /var/log/nginx/site-a/access.log;

    # 独立的错误日志
    error_log /var/log/nginx/site-a/error.log;

    location / {
        try_files $uri $uri/ =404;
    }
}
```
**说明**：
- 如果不指定 `access_log`，Nginx 会使用全局配置中的日志路径.
- 要完全关闭某个站点的日志，可写成 `access_log off;`
### 3.3 验证日志分离
```
# 访问站点 A，然后查看其日志
curl http://www.site-a.com/
tail -f /var/log/nginx/site-a/access.log

# 访问站点 B，查看其日志
curl http://www.site-b.com/
tail -f /var/log/nginx/site-b/access.log
```
你应该能看到：访问站点 A 的记录只出现在 site-a/access.log 中，站点 B 同理。

## 四、安全隔离
### 4.1 基于 IP 的访问控制
可以为不同的虚拟主机设置不同的 IP 访问规则，限制敏感站点的访问来源。
```
server {
    listen 80;
    server_name admin.internal.com;

    root /var/www/admin;

    # 仅允许内网 IP 访问管理后台
    location / {
        allow 192.168.1.0/24;
        allow 10.0.0.0/8;
        deny all;
    }
}
```
### 4.2 独立的错误页面
每个站点可以拥有自己独立的错误页面，提升用户体验。
```
server {
    listen 80;
    server_name www.site-a.com;

    root /var/www/site-a;

    # 站点 A 的自定义错误页面
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    location = /404.html {
        root /var/www/site-a/errors;
    }

    location = /50x.html {
        root /var/www/site-a/errors;
    }
}
```
### 4.3 隐藏 Nginx 版本号
在 http 块中统一配置，隐藏所有站点的 Nginx 版本信息：
```
http {
    server_tokens off;   # 隐藏版本号
    # ...
}
```
### 4.4 禁用目录列表
为每个站点禁用目录列表功能，防止敏感文件结构被暴露：
```
server {
    root /var/www/site-a;
    autoindex off;   # 禁用目录列表(默认已禁用)
}
```
## 五、性能隔离
### 5.1 全局连接数的理解
Nginx 的 worker_connections 是全局共享的，所有虚拟主机共用由 worker_processes 和 worker_connections 所定义的全局连接池。Nginx 本身没有内置机制为每个 server 块设定独立的并发连接上限。
```
events {
    worker_connections 10240;   # 所有站点共享这 10240 个连接
}
```
### 5.2 使用限流模块实现站点级隔离

虽然无法直接限制单个站点的连接数，但可以通过 limit_conn 和 limit_req 模块实现应用层隔离。
**限制单个站点的总连接数**：
```
# 在 http 块中定义限流区域
http {
    limit_conn_zone $server_name zone=by_site:10m;

    server {
        listen 80;
        server_name www.site-a.com;

        # 限制该站点总连接数不超过 300
        limit_conn by_site 300;

        location / {
            root /var/www/site-a;
        }
    }
}
```
**限制单个客户端的请求频率**：
```
http {
    limit_req_zone $binary_remote_addr zone=site_a_limit:10m rate=10r/s;

    server {
        listen 80;
        server_name www.site-a.com;

        location / {
            limit_req zone=site_a_limit burst=20 nodelay;
            root /var/www/site-a;
        }
    }
}
```
### 5.3 站点级超时控制
可以为不同站点设置不同的超时时间，避免某个慢请求长时间占用连接资源。
```
server {
    listen 80;
    server_name api.heavy.com;

    # 大文件上传站点：调大超时和 body 大小
    client_max_body_size 100m;
    client_body_timeout 120s;

    location / {
        proxy_pass http://backend;
        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;   # 允许较长的处理时间
    }
}

server {
    listen 80;
    server_name api.fast.com;

    # 轻量级 API：严格的超时控制
    client_max_body_size 1m;
    client_body_timeout 10s;

    location / {
        proxy_pass http://backend;
        proxy_connect_timeout 3s;
        proxy_read_timeout 5s;
    }
}
```

## 六、综合配置示例
以下是一个生产级别的多站点虚拟主机隔离配置，涵盖两个完整的站点配置。
### 6.1 主配置文件 `/etc/nginx/nginx.conf`
```
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;

error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    use epoll;
    worker_connections 10240;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    # 性能优化
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # 隐藏版本号
    server_tokens off;

    # 加载所有站点配置
    include /etc/nginx/conf.d/*.conf;
}
```
### 6.2 站点 A 配置 `/etc/nginx/conf.d/site-a.conf`
```
server {
    listen 80;
    server_name www.site-a.com site-a.com;

    root /var/www/site-a;
    index index.html index.htm;

    # 独立日志
    access_log /var/log/nginx/site-a/access.log main;
    error_log /var/log/nginx/site-a/error.log;

    # 静态资源缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    # 默认请求
    location / {
        try_files $uri $uri/ =404;
    }

    # 错误页面
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    location = /404.html {
        root /var/www/site-a/errors;
    }

    location = /50x.html {
        root /var/www/site-a/errors;
    }
}
```
### 6.3 站点 B 配置 `/etc/nginx/conf.d/site-b.conf`
```
server {
    listen 80;
    server_name www.site-b.com site-b.com;

    root /var/www/site-b;
    index index.html index.htm;

    # 独立日志
    access_log /var/log/nginx/site-b/access.log main;
    error_log /var/log/nginx/site-b/error.log;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }

    # 静态资源
    location /static/ {
        root /var/www/site-b;
        expires 30d;
    }

    # 默认请求
    location / {
        try_files $uri $uri/ /index.html;
    }

    # IP 访问控制(仅限内网访问管理后台)
    location /admin/ {
        allow 192.168.1.0/24;
        deny all;
        proxy_pass http://127.0.0.1:8080;
    }
}
```
**总结：** 虚拟主机隔离是 Nginx 多站点部署的核心技术—通过为每个站点创建独立的 server 块，实现配置隔离、日志分离、安全独立和资源可控，让一台服务器高效、安全地承载多个网站。