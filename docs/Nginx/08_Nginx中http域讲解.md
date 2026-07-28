## 一、什么是 http 域
### 1.1 http 域的概念
http 域(HTTP 配置块)是 Nginx 配置文件中与 events、stream 并列的顶级配置块，专门用于处理 HTTP/HTTPS 协议相关的所有配置。
简单来说，http 域是 Nginx 作为 Web 服务器的“大脑”—所有与网站、API、反向代理、静态资源、日志、压缩等相关的配置，都写在 http 域内部。
如果把 Nginx 比作一家餐厅：
- main 域：餐厅的营业执照、营业时间等(全局配置)
- events 域：餐厅如何接待客人(网络连接模型)
- http 域：餐厅的菜单和厨房运作流程(HTTP 服务配置)
- server 域：餐厅的某个分店(虚拟主机)
- location 域：分店里的具体档口(URL 路由)
### 1.2 http 域与 stream 域的区别
| 对比维度 | `http` 域(七层代理) | `stream` 域(四层代理) |
|----------|---------------------|----------------------|
| 工作层级 | OSI 第七层(应用层) | OSI 第四层(传输层) |
| 处理协议 | HTTP/HTTPS | TCP/UDP |
| 能否“看懂”内容 | ✅ 能解析 URL、Header、Cookie 等 | ❌ 不解析内容，只转发原始数据包 |
| 典型应用 | Web 服务器、API 网关、反向代理 | 数据库代理、Redis 代理、DNS 转发 |
| 配置复杂度 | 较复杂(`location`、`rewrite`、`proxy_pass` 等) | 较简单(无复杂路由规则) |
### 1.3 http 域的位置
http 块必须直接写在 main 域(配置文件最外层)中，与 events 块平级并列，不能放在 events、server 或 location 内部。
```
# ============================================
# main 域(配置文件最外层)
# ============================================

user nginx;
worker_processes auto;

# ============================================
# events 域：与 http 平级
# ============================================

events {
    worker_connections 1024;
}

# ============================================
# http 域：HTTP/HTTPS 服务配置
# ============================================

http {
    # 所有 HTTP 相关配置都写在这里
    include mime.types;
    sendfile on;
    keepalive_timeout 65;

    server {
        # 虚拟主机配置
    }
}

# ============================================
# stream 域：与 http 平级(可选)
# ============================================

stream {
    # TCP/UDP 四层代理配置
}
```

## 二、http 域的配置结构
### 2.1 层级结构
```
http(顶级，与 events 并列)
├── 基础指令(如 include、default_type)
├── 性能优化指令(如 sendfile、keepalive_timeout、gzip)
├── 日志指令(如 log_format、access_log)
├── upstream(二级)              # 后端服务器组定义
│   └── server(三级)            # 具体的后端服务器
├── server(二级)                # 虚拟主机(可多个)
│   ├── listen(三级指令)        # 监听端口
│   ├── server_name(三级指令)   # 域名绑定
│   ├── root(三级指令)          # 网站根目录
│   ├── access_log(三级指令)    # 访问日志
│   ├── location(三级)          # URL 路由匹配(可多个)
│   │   ├── root(四级指令)      # 覆盖上级根目录
│   │   ├── index(四级指令)     # 默认首页
│   │   ├── proxy_pass(四级指令)# 反向代理
│   │   └── try_files(四级指令) # 文件查找
│   └── error_page(三级指令)    # 自定义错误页面
└── types(二级，可选)           # MIME 类型定义(通常用 include 引入)
```
### 2.2 基础配置模板
```
http {
    # ============================================
    # 基础配置
    # ============================================

    # 引入 MIME 类型映射表
    include /etc/nginx/mime.types;

    # 默认 MIME 类型(未知文件类型)
    default_type application/octet-stream;

    # ============================================
    # 性能优化
    # ============================================

    # 开启零拷贝(提升静态文件传输效率)
    sendfile on;

    # 优化网络包发送(配合 sendfile)
    tcp_nopush on;

    # 禁用 Nagle 算法(降低小包延迟)
    tcp_nodelay on;

    # 长连接超时时间
    keepalive_timeout 65;

    # ============================================
    # Gzip 压缩
    # ============================================

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # ============================================
    # 日志配置
    # ============================================

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;

    # ============================================
    # Upstream：后端服务器组
    # ============================================

    upstream backend {
        server 192.168.1.10:8080 weight=3;
        server 192.168.1.11:8080;
    }

    # ============================================
    # Server：虚拟主机
    # ============================================

    server {
        listen 80;
        server_name www.example.com;

        root /var/www/html;
        index index.html index.htm;

        location / {
            try_files $uri $uri/ =404;
        }

        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        error_page 404 /404.html;
        error_page 500 502 503 504 /50x.html;
    }
}
```

## 三、http 域的核心指令
### 3.1 include — 引入外部配置文件
**语法**：`include 文件路径;`

**作用**：将其他配置文件的内容“复制粘贴”到当前位置。这是 Nginx 实现配置模块化的核心指令。

**常见用法**：
```
http {
    # 引入 MIME 类型映射
    include /etc/nginx/mime.types;

    # 引入所有站点配置(每个站点独立成一个文件)
    include /etc/nginx/conf.d/*.conf;
}
```
**配置解释：**
- include /etc/nginx/mime.types;：引入 MIME 类型映射表，定义不同文件后缀对应的 Content-Type
- include /etc/nginx/conf.d/.conf;：加载 conf.d/ 目录下所有 .conf 文件，每个文件通常对应一个站点

**最佳实践**：将每个站点的 server 块拆分成独立的配置文件(如 example.com.conf)，放在 conf.d/ 目录下，便于管理和维护。
### 3.2 default_type — 默认 MIME 类型
**语法**：`default_type MIME类型;`

**默认值**：`application/octet-stream`

**作用**： 当 Nginx 无法根据文件后缀名从 mime.types 中找到对应的 MIME 类型时，使用此默认值。

**示例**：
```
http {
    include mime.types;
    default_type application/octet-stream;   # 未知类型作为二进制流下载
}
```
**说明：** application/octet-stream 表示“二进制数据”，浏览器收到后会直接下载该文件，而不是尝试解析。如果希望未知类型也正常显示，可以改为 text/plain。
### 3.3 sendfile — 零拷贝传输
**语法**：`sendfile on | off;`

**默认值**：`off`

**作用**：启用零拷贝(Zero-copy)技术，直接将文件从磁盘发送到网络，跳过用户态内存拷贝，大幅提升静态文件的传输效率。

**原理对比**：

| 模式 | 数据路径 | 性能 |
|------|----------|------|
| `sendfile off` | 磁盘 → 内核缓冲区 → 用户缓冲区 → 内核缓冲区 → 网卡 | 较慢(多次拷贝) |
| `sendfile on` | 磁盘 → 内核缓冲区 → 网卡 | 极快(零拷贝) |

**示例**：
```
http {
    sendfile on;   # 静态资源服务器强烈推荐开启
}
```
适用场景：静态文件服务器、CDN 节点等以传输文件为主的场景。如果是纯反向代理(不提供静态文件)，开启与否影响不大。
### 3.4 tcp_nopush — 优化网络包发送
**语法**：`tcp_nopush on | off;`

**默认值**：`off`

**作用**：仅在 sendfile on; 时生效，告诉操作系统在收到完整的数据包之前不要发送 TCP 段，减少网络包数量，提高网络效率。

**示例**：
```
http {
    sendfile on;
    tcp_nopush on;   # 配合 sendfile，一次性发送完整响应
}
```
适用场景：静态文件传输场景，可减少网络小包数量，提升吞吐量。
### 3.5 tcp_nodelay — 禁用 Nagle 算法
**语法**：`tcp_nodelay on | off;`

**默认值**：`on`

**作用：** 禁用 Nagle 算法，立即发送数据，不等待缓冲区填满，降低小数据包的传输延迟。

**示例**：
```
http {
    tcp_nodelay on;   # 降低延迟，适合动态请求
}
```
适用场景：动态 API、实时通信等对延迟敏感的场景。对于大文件传输，可以关闭。
### 3.6 keepalive_timeout — 长连接超时
**语法**：`keepalive_timeout 时间;`

**默认值**：`75s`

**作用**：设置 HTTP 长连接(Keep-Alive)的空闲超时时间。如果客户端在指定时间内没有发送新请求，Nginx 会关闭该连接。

**示例**：
```
http {
    keepalive_timeout 65;   # 65 秒无活动则关闭连接
}
```
### 3.7 keepalive_requests — 单连接最大请求数
**语法**：`keepalive_requests 数字;`

**默认值**：`100`

**作用：** 设置一个长连接上最多可以处理多少个请求。达到上限后，Nginx 会主动关闭连接。

**示例**：
```
http {
    keepalive_requests 100000;   # 单连接最多处理 10 万个请求
}
```
适用场景：高并发场景下，适当提高此值可减少连接建立次数，提升性能。
### 3.8 client_max_body_size — 客户端请求体大小限制
**语法**：`client_max_body_size 大小;`

**默认值**：`1m`(1 兆字节)

**作用**：限制客户端请求体的最大大小。如果请求体超过此值，Nginx 返回 413 Request Entity Too Large。

**示例**：
```
http {
    client_max_body_size 10m;   # 允许上传最大 10MB 的文件
}
```
适用场景：文件上传服务需要调大此值；普通 API 服务保持默认即可。
### 3.9 client_body_timeout — 读取请求体超时
**语法**：`client_body_timeout 时间;`

**默认值**：`60s`

**作用**：设置 Nginx 从客户端读取请求体的超时时间。如果客户端在指定时间内没有发送完整请求体，Nginx 会关闭连接。

**示例**：
```
http {
    client_body_timeout 30s;   # 30 秒内未发送完请求体则超时
}
```
### 3.10 client_header_timeout — 读取请求头超时
**语法**：`client_header_timeout 时间;`

**默认值**：`60s`

**作用**：设置 Nginx 从客户端读取请求头的超时时间。如果客户端在指定时间内没有发送完整的请求头，Nginx 会关闭连接。

**示例**：
```
http {
    client_header_timeout 30s;   # 30 秒内未发送完请求头则超时
}
```

## 四、http 域中的子块
### 4.1 server 块 — 虚拟主机
server 块是 http 域中最核心的子块，每个 server 块代表一个虚拟主机(网站)，负责处理特定域名或端口的请求。
```
http {
    # 第一个虚拟主机
    server {
        listen 80;
        server_name www.example.com;
        root /var/www/example;
    }

    # 第二个虚拟主机
    server {
        listen 80;
        server_name www.another.com;
        root /var/www/another;
    }
}
```
一个 http 域下可以有多个 server 块，通过 listen 和 server_name 区分不同的站点。
### 4.2 location 块 — URL 路由匹配
location 块位于 server 块内部，根据请求的 URI(URL 路径)匹配不同的处理规则。
```
server {
    listen 80;
    server_name example.com;

    # 根路径
    location / {
        root /var/www/html;
        index index.html;
    }

    # 静态资源
    location /static/ {
        root /var/www/static;
        expires 30d;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://backend;
    }
}
```
### 4.3 upstream 块 — 后端服务器组
upstream 块定义一组后端服务器，用于反向代理 + 负载均衡。
```
http {
    upstream backend {
        server 192.168.1.10:8080 weight=3;
        server 192.168.1.11:8080;
        server 192.168.1.12:8080 backup;
    }

    server {
        location /api/ {
            proxy_pass http://backend;
        }
    }
}
```

## 五、http 域的典型配置示例
### 5.1 静态网站服务器
```
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 性能优化
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # 静态网站
    server {
        listen 80;
        server_name www.myblog.com;

        root /var/www/myblog;
        index index.html index.htm;

        location / {
            try_files $uri $uri/ =404;
        }

        # 图片等静态资源缓存 30 天
        location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
            expires 30d;
            add_header Cache-Control "public";
        }

        error_page 404 /404.html;
        error_page 500 502 503 504 /50x.html;
    }
}
```
### 5.2 反向代理 + 负载均衡
```
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    keepalive_timeout 65;

    # 后端服务器组
    upstream app_backend {
        least_conn;
        server 192.168.1.10:8080 weight=3;
        server 192.168.1.11:8080 weight=2;
        server 192.168.1.12:8080 backup;
    }

    # API 网关
    server {
        listen 80;
        server_name api.example.com;

        location / {
            proxy_pass http://app_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
        }

        # 健康检查
        location /health {
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }
    }
}
```
### 5.3 多站点(虚拟主机)
```
http {
    include /etc/nginx/mime.types;
    sendfile on;
    keepalive_timeout 65;

    # 站点 A
    server {
        listen 80;
        server_name www.site-a.com;
        root /var/www/site-a;
        index index.html;
    }

    # 站点 B
    server {
        listen 80;
        server_name www.site-b.com;
        root /var/www/site-b;
        index index.html;
    }

    # HTTPS 站点
    server {
        listen 443 ssl http2;
        server_name secure.example.com;

        ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;

        root /var/www/secure;
        index index.html;
    }
}
```

## 六、注意事项
1. http 块只能有一个，一个配置文件中只能有一个 http 块
2. http 块必须在 main 域，不能放在 server 或 location 内部
3. 修改后需重载配置	nginx -t && systemctl reload nginx
4. 子配置可拆分	通过 include 将 server 块拆分到 conf.d/ 目录
5. server_name 区分站点	同一端口多个站点靠 server_name 区分
**总结：** http 域是 Nginx 配置的“心脏”—它统领着所有 Web 服务的配置，从全局性能调优、日志格式定义，到虚拟主机(server)、URL 路由(location)、后端负载均衡(upstream)，全部在 http 域内完成。掌握了 http 域，就掌握了 Nginx 作为 Web 服务器和反向代理的 80% 配置能力。