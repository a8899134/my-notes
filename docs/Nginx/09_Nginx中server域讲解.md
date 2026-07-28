## 一、什么是 server 域
### 1.1 server 域的概念
server 域(虚拟主机配置块)是 Nginx 配置中最核心的业务单元，用于定义一个独立的虚拟主机(网站)。
简单来说，每个 server 块代表一个网站—它告诉 Nginx：“当用户访问某个域名或 IP 时，应该返回哪个目录下的文件，或者转发到哪个后端服务。”
如果把 Nginx 比作一栋写字楼：
- http 域：整栋写字楼的管理规定(水电、网络、安保等通用规则)
- server 域：楼里的某一家公司(有自己独立的门牌号、前台、办公区域)
- location 域：公司里的具体部门(财务部、技术部、前台—不同的 URL 路径走不同的处理流程)
每个 server 块通过 listen 和 server_name 来区分不同的网站。
### 1.2 server 域的位置
server 块可以出现在 http 块或 stream 块内部，但不能直接写在 main 域或 events 域中。它所在的位置决定了它的用途—在 http 中代表虚拟主机，在 stream 中代表四层代理服务。
```
http {
    # ============================================
    # 第一个虚拟主机(网站 A)
    # ============================================

    server {
        listen 80;
        server_name www.site-a.com;
        root /var/www/site-a;
    }

    # ============================================
    # 第二个虚拟主机(网站 B)
    # ============================================

    server {
        listen 80;
        server_name www.site-b.com;
        root /var/www/site-b;
    }

    # ============================================
    # 第三个虚拟主机(HTTPS)
    # ============================================

    server {
        listen 443 ssl;
        server_name secure.example.com;
        root /var/www/secure;
    }
}
```
一个 http 域下可以有任意多个 server 块，每个 server 块代表一个独立的虚拟主机。

## 二、server 域的核心指令
### 2.1 listen — 监听端口和地址
**语法**：`listen address[:port] [参数];` 或 `listen port [参数];`

**默认值**：`listen 80;`(普通用户)或 `listen 8000;`(非 root 用户)

**作用**：指定 Nginx 在哪个 IP 地址和端口上监听请求。当客户端请求到达时，Nginx 会根据 listen 匹配到对应的 server 块。

**常用参数**：
| 参数 | 说明 |
|------|------|
| `default_server` | 将此 `server` 块设为该端口的默认服务器，处理所有没有匹配到 `server_name` 的请求 |
| `ssl` | 启用 SSL/TLS 加密(HTTPS) |
| `http2` | 启用 HTTP/2 协议 |
| `reuseport` | 多个 Worker 进程共享同一端口，提升性能 |
| `backlog=数字` | 设置连接等待队列的最大长度 |
| `proxy_protocol` | 启用 PROXY 协议(获取客户端真实 IP) |

**配置示例**：
```
server {
    # 监听所有 IP 的 80 端口(HTTP)
    listen 80;
}

server {
    # 仅监听本地 IP 的 8080 端口
    listen 127.0.0.1:8080;          
}

server {
    # 监听 IPv6 地址
    listen [::]:80;
}

server {
    # 指定为默认服务器(处理所有未匹配域名的请求)
    listen 80 default_server;       
}

server {
    # HTTPS + HTTP/2
    listen 443 ssl http2;
}

server {
    # 监听 Unix 域 socket
    listen unix:/var/run/nginx.sock;
}
```
**default_server 的说明:**
- 如果请求的 Host 头与任何 server_name 都不匹配，Nginx 会将请求路由到该端口的默认服务器。如果没有显式指定 default_server，则配置文件中第一个匹配 listen 的 server 块会被隐式地作为默认服务器。
- 生产环境建议：显式指定一个 default_server，用于处理非法域名或直接 IP 访问，通常返回 403 或 444。
```
server {
    listen 80 default_server;
    server_name _;          # _ 表示匹配任何域名
    return 403;             # 拒绝非法访问
}
```
### 2.2 server_name — 域名绑定
**语法**：`server_name 域名1 域名2 ...;`

**默认值**：空(匹配所有域名)

**作用**：指定此 server 块负责处理的域名(Host 头)。当 listen 匹配后，Nginx 会检查请求的 Host 头，与 server_name 进行匹配。

**匹配规则**(按优先级从高到低)：

| 优先级   | 类型    | 示例                           | 说明                                                                                                                                       |
| -- | -- | - | - |
| 1(最高) | 精确匹配  | server_name example.com;     | 完全匹配域名                                                                                                                                   |
| 2     | 通配符前缀 | server_name *.example.com;   | 匹配 `www.example.com`、`api.example.com` 等 |
| 3     | 通配符后缀 | server_name mail.*;          | 匹配 `mail.example.com`、`mail.other.com` 等 |
| 4(最低) | 正则表达式 | server_name ~^(www\.)?(.+)$; | 使用 ~ 开头的 Perl 正则表达式                                                                                                                      |

**配置示例**：
```
server {
    listen 80;
    # 精确匹配：处理 example.com 和 www.example.com
    server_name example.com www.example.com;    
}

server {
    listen 80;
    # 通配符：处理所有 *.example.com 的子域名
    server_name *.example.com;                  
}

server {
    listen 80;
    # 正则表达式：处理以 www 开头或不以 www 开头的域名
    server_name ~^(www\.)?(?<domain>.+)$;        
}

server {
    listen 80 default_server;
    # 特殊值 _ ：匹配任何域名(通常用于默认服务器)
    server_name _;                               
}
```
**注意事项**：
- 多个 server 块监听相同端口时，通过 server_name 区分不同站点。
- 如果同一个域名匹配了多个 server 块，Nginx 会按上述优先级顺序选择第一个匹配的。
- 匹配顺序是：先按 listen 匹配端口，再按 server_name 匹配域名。
### 2.3 root — 网站根目录
**语法**：`root 目录路径;`

**作用**：设置此 server 块的网站根目录。当请求一个静态文件时，Nginx 会将 root 路径与请求 URI 拼接，形成完整的文件系统路径。

**示例**：
```
server {
    listen 80;
    server_name example.com;
    root /var/www/example.com;    # 网站根目录
}
```
**请求处理逻辑**：
| 请求 URI | 实际读取的文件路径 |
|----------|-------------------|
| `/index.html` | `/var/www/example.com/index.html` |
| `/css/style.css` | `/var/www/example.com/css/style.css` |
| `/images/logo.png` | `/var/www/example.com/images/logo.png` |

**与 `root`与`alias` 的区别**：
| 指令 | 行为 | 示例 |
|------|------|------|
| `root` | 将 URI 追加到 root 路径后面 | `root /var/www;` + `/images/1.jpg` → `/var/www/images/1.jpg` |
| `alias` | 用 alias 路径替换 URI 中匹配的部分 | `alias /var/www/static/;` + `/images/1.jpg` → `/var/www/static/1.jpg` |

alias 通常用于 location 块中，而 root 通常用于 server 块或 location 块中。
### 2.4 index — 默认首页
**语法**：`index 文件1 文件2 ...;`

**默认值**：`index index.html;`

**作用**：当请求的 URI 是一个目录(如 / 或 /about/)时，Nginx 会按照 index 指定的顺序依次查找默认首页文件。

**示例**：
```
server {
    listen 80;
    server_name example.com;
    root /var/www/example.com;

    # 按顺序查找：index.html → index.htm → index.php
    index index.html index.htm index.php;     
}
```
**请求处理逻辑**：

| 请求 URI  | 实际查找的文件(按顺序)                                                                                      |
| - | - |
| /       | /var/www/example.com/index.html → /var/www/example.com/index.htm → /var/www/example.com/index.php |
| /about/ | /var/www/example.com/about/index.html → /var/www/example.com/about/index.htm                      |
### 2.5 access_log — 访问日志
**语法**：`access_log 路径 格式;`

**作用**：为此 `server` 块单独指定访问日志的存放路径和格式。

**示例**：
```
http {
    # 全局日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';

    server {
        listen 80;
        server_name example.com;

        # 为此站点单独记录访问日志
        access_log /var/log/nginx/example.com/access.log main;    
        error_log  /var/log/nginx/example.com/error.log;         
    }
}
```
**最佳实践**：为每个站点单独配置日志文件，便于排查问题和统计流量。

### 2.6 error_log — 错误日志
**语法**：`error_log 路径 级别;`

**作用**：为此 server 块单独指定错误日志的存放路径和日志级别。

**日志级别**(从低到高)：`debug` → `info` → `notice` → `warn` → `error` → `crit` → `alert` → `emerg`

**示例**：
```
server {
    listen 80;
    server_name example.com;

    # 错误日志级别为 warn(生产环境推荐)
    error_log /var/log/nginx/example.com/error.log warn;
}
```
### 2.7 error_page — 自定义错误页面
**语法**：`error_page 状态码 路径;`

**作用**：为指定的 HTTP 状态码自定义错误页面，提升用户体验。

**示例**：
```
server {
    listen 80;
    server_name example.com;
    root /var/www/example.com;

    # 自定义错误页面
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    # 错误页面的 location(确保能正确访问)
    location = /404.html {
        root /var/www/example.com/errors;
    }

    location = /50x.html {
        root /var/www/example.com/errors;
    }
}
```
### 2.8 try_files — 文件查找
**语法**：`try_files 文件列表 最后处理;`

**作用**：按顺序检查文件是否存在，如果存在则直接返回该文件；如果都不存在，则执行最后的处理(如返回 404 或内部重定向)。

**示例**：
```
server {
    listen 80;
    server_name example.com;
    root /var/www/example.com;

    location / {
        # 查找顺序：$uri → $uri/ → 返回 404
        try_files $uri $uri/ =404;              # 
    }
}
```
**常见用法**：
| 用法 | 说明 |
|------|------|
| `try_files $uri $uri/ =404;` | 先找文件，再找目录，都不存在返回 404 |
| `try_files $uri $uri/ /index.html;` | 找不到文件时内部重定向到 `index.html`(SPA 应用常用) |
| `try_files $uri @backend;` | 找不到文件时转发到名为 `@backend` 的命名 location |

## 三、server 块的匹配流程
当一个 HTTP 请求到达 Nginx 时，server 块的匹配遵循以下流程：
```
客户端请求到达
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 第一步：根据 listen 匹配 IP 地址和端口             │
│  - 找出所有监听该 IP:端口 的 server 块            │
│  - 如果没有精确匹配，使用 default_server           │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 第二步：根据 server_name 匹配域名(Host 头)       │
│  - 按优先级：精确匹配 → 通配符前缀 → 通配符后缀 → 正则 │
│  - 如果都不匹配，使用该端口的默认 server           │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 第三步：进入匹配到的 server 块内部                │
│  - 执行 location 匹配(由 location 块处理)       │
└──────────────────────────────────────────────────┘
```
**匹配规则要点**：
1. 先端口，后域名：Nginx 首先根据 listen 匹配 IP 和端口，然后再根据 server_name 匹配域名。
2. 默认服务器兜底：如果 server_name 匹配失败，请求会被该端口的 default_server 处理。
3. 未指定 default_server 时：配置文件中第一个匹配该端口的 server 块被隐式地作为默认服务器。

## 四、典型配置示例
### 4.1 单站点(最简配置)
```
http {
    server {
        listen 80;
        server_name example.com;
        root /var/www/example.com;
        index index.html;
    }
}
```
### 4.2 多站点(虚拟主机)
```
http {
    # 站点 A
    server {
        listen 80;
        server_name www.site-a.com site-a.com;
        root /var/www/site-a;
        index index.html;
        access_log /var/log/nginx/site-a/access.log;
        error_log  /var/log/nginx/site-a/error.log;
    }

    # 站点 B
    server {
        listen 80;
        server_name www.site-b.com site-b.com;
        root /var/www/site-b;
        index index.html;
        access_log /var/log/nginx/site-b/access.log;
        error_log  /var/log/nginx/site-b/error.log;
    }
}
```
### 4.3 默认服务器(拒绝非法访问)
```
http {
    # 默认服务器：处理所有未匹配的域名/IP 访问
    server {
        listen 80 default_server;          
        server_name _;                     # 匹配任何域名
        return 403;                        # 直接返回 403
    }

    # 正常业务站点
    server {
        listen 80;
        server_name example.com;
        root /var/www/example.com;
    }
}
```
### 4.4 HTTP + HTTPS 同时配置
```
http {
    # HTTP 跳转 HTTPS
    server {
        listen 80;
        server_name example.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS 实际服务
    server {
        listen 443 ssl http2;
        server_name example.com;

        ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;

        root /var/www/example.com;
        index index.html;
    }
}
```
### 4.5 动静分离配置
```
server {
    listen 80;
    server_name example.com;
    root /var/www/example.com;

    # 静态资源：浏览器缓存 30 天
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 30d;
        add_header Cache-Control "public";
    }

    # 动态请求：转发到后端
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 其他请求：返回 index.html(SPA 应用)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 五、注意事项
1. server 块必须在 http 内部	不能直接写在 main 域
2. listen 端口冲突	多个 server 块可以监听相同端口，通过 server_name 区分
3. 修改后需重载配置	nginx -t && systemctl reload nginx
4. 建议显式指定 default_server	避免隐式默认服务器带来的不确定性
5. SSL 证书独立配置	每个 HTTPS 站点需单独配置证书
**总结：** server 域是 Nginx 中“一个网站”的完整定义—它通过 listen 指定入口，通过 server_name 绑定域名，通过 root 指向文件目录，是 Nginx 从“通用 Web 服务器”变为“具体网站托管平台”的关键配置单元。掌握了 server 域，就掌握了 Nginx 多站点托管的全部能力。