## 一、什么是 API 网关
### 1.1 API 网关的概念
API 网关(API Gateway)是微服务架构中的一个关键组件，它作为前端客户端与后端微服务之间的统一入口，负责将客户端的请求路由到对应的后端服务。

简单来说，API 网关就是微服务架构的“总前台”—所有外部请求都先到达这里，网关根据请求的路径、方法、头部等信息，将请求转发给对应的后端服务，并在此过程中完成限流、认证、日志等一系列统一处理。
### 1.2 API 网关的核心职责
在微服务架构中，API 网关承担着以下核心职责：

| 职责 | 说明 |
|------|------|
| 请求路由 | 根据请求的 URL 路径、HTTP 方法等，将请求分发到对应的后端服务 |
| 负载均衡 | 在多台后端服务实例之间均衡分发请求 |
| 限流熔断 | 控制请求频率，防止突发流量冲垮后端服务 |
| 认证鉴权 | 验证请求身份，确保只有合法请求才能访问后端服务 |
| 协议转换 | 支持 HTTP、gRPC、WebSocket 等多种协议的适配转换 |
| 缓存加速 | 对热点请求的响应进行缓存，减少后端压力 |
| 日志监控 | 记录请求日志，监控服务健康状态 |

### 1.3 为什么用 Nginx 做 API 网关
Nginx 作为 API 网关具有独特的优势：

| 优势 | 说明 |
|------|------|
| 高性能 | 基于事件驱动的异步架构，单实例可支撑数万 QPS |
| 轻量级 | 无需额外部署复杂组件，Nginx 本身即可实现网关功能 |
| 配置灵活 | 通过 `location`、`upstream` 等指令灵活配置路由和负载均衡 |
| 生态丰富 | 支持 Lua 脚本扩展(OpenResty)，可实现动态路由等高级功能 |

## 二、核心组件一：请求路由
### 2.1 什么是请求路由
请求路由是 API 网关最基础的功能—根据请求的 URL 路径、域名或请求头，将请求转发到对应的后端微服务。
### 2.2 基于路径的路由配置
通过 location 指令匹配不同的 URL 路径，将请求转发到不同的后端服务：
```
http {
    # 定义后端服务器组
    upstream user_service {
        server 127.0.0.1:8081;
        server 127.0.0.1:8082;
    }

    upstream order_service {
        server 127.0.0.1:8083;
        server 127.0.0.1:8084;
    }

    server {
        listen 80;
        server_name api.example.com;          # 网关域名

        # 用户服务：/user/* 路径转发到 user_service
        location /user/ {
            proxy_pass http://user_service;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # 订单服务：/order/* 路径转发到 order_service
        location /order/ {
            proxy_pass http://order_service;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```
### 2.3 基于域名的路由(多网关入口)
同一个 Nginx 可以监听多个域名，根据不同的域名路由到不同的服务集群：
```
server {
    listen 80;
    server_name user-api.example.com;        # 用户 API 入口
    location / {
        proxy_pass http://user_service;
    }
}

server {
    listen 80;
    server_name order-api.example.com;       # 订单 API 入口
    location / {
        proxy_pass http://order_service;
    }
}
```
### 2.4 路径重写(rewrite)
当前端请求路径与后端服务路径不一致时，可以通过 rewrite 进行路径重写：
```
location /api/v1/ {
    # 将 /api/v1/users 重写为 /users 再转发
    rewrite ^/api/v1/(.*)$ /$1 break;
    proxy_pass http://user_service;
}
```

## 三、核心组件二：负载均衡
### 3.1 什么是负载均衡
负载均衡是将请求分发到多台后端服务实例上，实现流量分摊和高可用。Nginx 通过 upstream 模块实现负载均衡。
### 3.2 基础配置
```
http {
    upstream user_service {
        # 默认轮询算法
        server 192.168.1.10:8080;
        server 192.168.1.11:8080;
        server 192.168.1.12:8080;
    }

    server {
        location /user/ {
            proxy_pass http://user_service;
        }
    }
}
```
### 3.3 负载均衡算法
Nginx 支持多种负载均衡算法：

| 算法 | 配置 | 说明 |
|------|------|------|
| 轮询(默认) | 无 | 按顺序轮流分配请求 |
| 加权轮询 | `weight=数字` | 按权重比例分配 |
| 最少连接 | `least_conn;` | 分配给当前连接数最少的服务器 |
| IP 哈希 | `ip_hash;` | 同一 IP 始终分配到同一台服务器 |

### 3.4 加权轮询配置
```
upstream user_service {
    server 192.168.1.10:8080 weight=3;      # 高性能机器，承担 60% 流量
    server 192.168.1.11:8080 weight=2;      # 中等性能，承担 40% 流量
    server 192.168.1.12:8080 backup;        # 备用节点
}
```
### 3.5 健康检查与故障转移
通过 max_fails 和 fail_timeout 实现被动健康检查：
```
upstream order_service {
    server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;   # 3 次失败后隔离 30 秒
    server 10.0.0.2:8080 backup;                         # 主节点故障时接管
    keepalive 32;                                        # 上游长连接数
}
```

## 四、核心组件三：限流熔断
### 4.1 什么是限流
限流是 API 网关的重要安全机制，用于控制每个客户端在单位时间内的请求数量，防止恶意流量或突发流量冲垮后端服务。
### 4.2 限流配置(limit_req)
Nginx 通过 ngx_http_limit_req_module 模块实现请求频率限制。
```
http {
    # 定义限流区域：按客户端 IP 限流，每秒 10 个请求
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

    server {
        location /api/ {
            # 应用限流：允许突发 20 个请求排队，超出立即拒绝
            limit_req zone=api_limit burst=20 nodelay;
            proxy_pass http://backend;
        }
    }
}
```
**参数详解**：
1. rate=10 r/s ，每秒允许 10 个请求(r/m 表示每分钟)
2. burst=20，允许突发 20 个请求进入队列等待
3. nodelay，超过限制的请求立即拒绝，不排队等待
### 4.3 不同接口差异化限流
不同接口可以设置不同的限流策略：
```
http {
    # 通用 API 限流：10r/s
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

    # 登录接口限流：更严格，每分钟 5 次
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

    # 基于 API Key 限流：更宽松
    limit_req_zone $http_x_api_key zone=user_limit:10m rate=100r/s;

    server {
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;
            proxy_pass http://backend;
        }

        location /api/login/ {
            limit_req zone=login_limit burst=5 nodelay;
            proxy_pass http://login_backend;
        }

        location /api/orders/ {
            limit_req zone=user_limit burst=10 nodelay;
            proxy_pass http://order_backend;
        }
    }
}
```
### 4.4 自定义限流返回内容
当触发限流时，默认返回 503。可以自定义返回内容：
```
server {
    error_page 429 @rate_limit;

    location @rate_limit {
        return 429 '{"code":429,"msg":"请求过于频繁，请稍后再试"}';
        add_header Content-Type application/json;
    }

    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://backend;
    }
}
```

## 五、核心组件四：认证鉴权
### 5.1 什么是认证鉴权
认证鉴权是 API 网关的安全屏障，用于验证请求的合法性，确保只有经过授权的请求才能访问后端服务。
### 5.2 HTTP 基础认证(auth_basic)
Nginx 内置 ngx_http_auth_basic_module 模块，支持 HTTP 基础认证。

**步骤一：生成密码文件**：
```
# 安装 htpasswd 工具
yum install -y httpd-tools   # CentOS
# 或
apt install -y apache2-utils # Ubuntu

# 创建密码文件(-c 创建新文件)
htpasswd -c /etc/nginx/.htpasswd admin
# 按提示输入密码
```
**步骤二：配置 Nginx 认证**：
```
location /admin/ {
    auth_basic "Restricted Area";              # 认证提示信息
    auth_basic_user_file /etc/nginx/.htpasswd; # 密码文件路径
    proxy_pass http://admin_backend;
}
```
### 5.3 基于 API Key 的认证
通过检查请求头中的 API Key 实现认证
```
location /secure-api/ {
    # 检查 X-API-Key 请求头
    if ($http_x_api_key != "valid-api-key-123") {
        return 403;
    }
    proxy_pass http://secure_backend;
}
```
### 5.4 使用 Lua 脚本实现 JWT 认证(OpenResty)
配合 OpenResty，可以使用 Lua 脚本实现更灵活的 JWT 认证：
```
location /api/secure/ {
    access_by_lua_block {
        local token = ngx.var.http_authorization
        if not token then
            ngx.exit(ngx.HTTP_UNAUTHORIZED)
        end
        -- 这里可以添加 JWT 验证逻辑
    }
    proxy_pass http://secure_backend;
}
```

## 六、核心组件五：缓存加速
### 6.1 什么是网关缓存
网关缓存是指 Nginx 将后端服务的响应内容缓存到本地，当相同请求再次到达时直接从缓存返回，大幅减少后端服务压力。
### 6.2 缓存配置
```
http {
    # 定义缓存区域
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

    server {
        location /api/products/ {
            proxy_pass http://product_service;
            proxy_cache api_cache;                      # 启用缓存
            proxy_cache_valid 200 1m;                   # 200 状态码缓存 1 分钟
            proxy_cache_key "$scheme$request_method$host$request_uri";  # 缓存键
            add_header X-Cache-Status $upstream_cache_status;  # 调试：查看命中状态
        }
    }
}
```
**参数详解**：

| 参数 | 说明 |
|------|------|
| `proxy_cache_path` | 缓存存储路径和区域定义 |
| `keys_zone=api_cache:10m` | 缓存区域名称和内存大小 |
| `max_size=1g` | 缓存最大容量 |
| `inactive=60m` | 60 分钟未访问则清理 |
| `proxy_cache_valid 200 1m` | 200 状态码的响应缓存 1 分钟 |

## 七、核心组件六：日志与监控
### 7.1 网关日志的重要性

API 网关作为所有请求的统一入口，记录完整的请求日志对于问题排查、性能分析和安全审计至关重要。
### 7.2 自定义日志格式
```
http {
    # 定义网关专用日志格式
    log_format gateway '$remote_addr - $remote_user [$time_local] "$request" '
                       '$status $body_bytes_sent "$http_referer" '
                       '"$http_user_agent" "$http_x_forwarded_for" '
                       '$request_time $upstream_response_time '
                       '$upstream_addr';

    server {
        access_log /var/log/nginx/gateway_access.log gateway;
        error_log /var/log/nginx/gateway_error.log;
    }
}
```
### 7.3 健康检查端点
```
location = /health {
    access_log off;                              # 不记录健康检查日志
    return 200 "healthy\n";
    add_header Content-Type text/plain;
}
```
### 7.4 监控指标端点(stub_status)
```
location = /metrics {
    stub_status on;                              # 启用状态监控
    access_log off;
    allow 127.0.0.1;                             # 仅允许本机访问
    deny all;
}
```

## 八、完整综合配置示例
### 8.1 生产级 API 网关完整配置
```
# ============================================
# /etc/nginx/nginx.conf - API 网关完整配置
# ============================================

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

    # ============================================
    # 1. 日志格式
    # ============================================

    log_format gateway '$remote_addr - $remote_user [$time_local] "$request" '
                       '$status $body_bytes_sent "$http_referer" '
                       '"$http_user_agent" "$http_x_forwarded_for" '
                       '$request_time $upstream_response_time';

    # ============================================
    # 2. 性能优化
    # ============================================

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;

    # ============================================
    # 3. Gzip 压缩
    # ============================================

    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_types application/json application/javascript text/css;

    # ============================================
    # 4. 缓存定义
    # ============================================

    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:50m max_size=2g inactive=60m;

    # ============================================
    # 5. 限流定义
    # ============================================

    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

    # ============================================
    # 6. 后端服务定义
    # ============================================

    upstream user_service {
        server 192.168.1.10:8080 weight=3 max_fails=3 fail_timeout=30s;
        server 192.168.1.11:8080 weight=2 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    upstream order_service {
        server 192.168.1.20:8080 max_fails=3 fail_timeout=30s;
        server 192.168.1.21:8080 backup;
        keepalive 32;
    }

    upstream product_service {
        server 192.168.1.30:8080;
        server 192.168.1.31:8080;
        keepalive 32;
    }

    # ============================================
    # 7. 虚拟主机(API 网关入口)
    # ============================================

    server {
        listen 80;
        server_name api.example.com;

        access_log /var/log/nginx/gateway_access.log gateway;
        error_log /var/log/nginx/gateway_error.log;

        # ============================================
        # 用户服务(限流 + 路由)
        # ============================================

        location /user/ {
            limit_req zone=api_limit burst=20 nodelay;
            proxy_pass http://user_service;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_connect_timeout 5s;
            proxy_read_timeout 30s;
        }

        # ============================================
        # 订单服务(限流 + 认证)
        # ============================================

        location /order/ {
            limit_req zone=api_limit burst=10 nodelay;
            auth_basic "Order API";
            auth_basic_user_file /etc/nginx/.htpasswd;
            proxy_pass http://order_service;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # ============================================
        # 商品服务(限流 + 缓存)
        # ============================================

        location /product/ {
            limit_req zone=api_limit burst=30 nodelay;
            proxy_pass http://product_service;
            proxy_cache api_cache;
            proxy_cache_valid 200 1m;
            proxy_cache_key "$scheme$request_method$host$request_uri";
            add_header X-Cache-Status $upstream_cache_status;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # ============================================
        # 登录接口(严格限流)
        # ============================================

        location /login/ {
            limit_req zone=login_limit burst=5 nodelay;
            proxy_pass http://user_service;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # ============================================
        # 健康检查
        # ============================================

        location = /health {
            access_log off;
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }

        # ============================================
        # 监控指标
        # ============================================

        location = /metrics {
            stub_status on;
            access_log off;
            allow 127.0.0.1;
            deny all;
        }

        # ============================================
        # 限流错误处理
        # ============================================

        error_page 429 @rate_limit;

        location @rate_limit {
            return 429 '{"code":429,"msg":"请求过于频繁，请稍后再试"}';
            add_header Content-Type application/json;
        }
    }
}
```
**总结**：Nginx 作为 API 网关，通过 location(路由)、upstream(负载均衡)、limitreq(限流)、authbasic(认证)、proxy_cache(缓存)等核心组件，将分散的微服务整合为一个统一的对外入口，实现流量治理、安全控制和性能优化的集中管理。