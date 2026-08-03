## 一、什么是反向代理
### 1.1 代理的基本概念
在计算机网络中，代理(Proxy) 是指客户端不直接与目标服务器通信，而是通过一个中间服务器转发请求和响应。根据服务对象的不同，代理分为两种：

| 代理类型 | 服务对象 | 方向 | 典型用途 |
|----------|----------|------|----------|
| 正向代理 | 客户端 | 客户端 → 代理 → 互联网 | 翻墙、匿名访问、绕过限制 |
| 反向代理 | 服务器 | 互联网 → 代理 → 后端服务器 | 负载均衡、安全隔离、缓存加速 |

**正向代理**：客户端主动配置代理服务器，代表客户端去访问互联网资源(如公司内网通过代理上网)。

**反向代理**：客户端完全不知道后端服务器的存在，它只和反向代理服务器通信。反向代理接收客户端请求后，将请求转发给一个或多个后端服务器，并将响应返回给客户端。

### 1.2 反向代理的核心工作流程
```
用户浏览器
    │
    │ 1. 发送请求(如 http://example.com/api/users)
    ▼
Nginx 反向代理服务器
    │
    │ 2. 根据配置规则，将请求转发给后端服务器
    ▼
后端应用服务器(Java/Go/PHP/Python)
    │
    │ 3. 处理请求，生成响应数据
    ▼
Nginx 反向代理服务器
    │
    │ 4. 将响应返回给用户
    ▼
用户浏览器
```
在整个流程中，用户始终只与 Nginx 通信，完全不知道后端服务器的存在。
### 1.3 为什么使用反向代理
使用 Nginx 作为反向代理服务器，可以带来以下核心优势。

| 优势 | 说明 |
|------|------|
| 隐藏后端服务器 | 用户只能看到 Nginx 的 IP 和域名，后端服务器的真实 IP 被隐藏，避免直接攻击 |
| 负载均衡 | 将请求分发到多台后端服务器，避免单台过载 |
| SSL 终结 | 在 Nginx 层统一处理 HTTPS 加密解密，减轻后端服务器负担 |
| 缓存加速 | Nginx 可以缓存后端响应，减少重复请求对后端的压力 |
| 统一入口 | 多个后端服务通过同一个 Nginx 入口对外提供服务，便于管理和监控 |
| HTTP/2 支持 | Nginx 处理 HTTP/2 协议，提高页面加载速度 |

## 二、反向代理的基础配置
### 2.1 最简单的反向代理
Nginx 反向代理的核心指令是 proxy_pass。以下是最基础的反向代理配置：
```
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
    }
}
```
**效果**：用户访问 http://example.com/api/users 时，Nginx 会将请求转发，给 http://127.0.0.1:8080/api/users。
### 2.2 proxy_pass 的两种写法
proxy_pass 后面是否带斜杠 /，会直接影响转发时 URI 的拼接方式。

1. 不带斜杠(相对路径)
```
location /api/ {
    proxy_pass http://backend:8080;
}
```
- 用户请求GET /api/users，转发给后端GET `http://backend:8080/api/users`
- 用户请求 GET /api/orders/123,转发给后端 GET `http://backend:8080/api/orders/123`

**效果：** location 匹配到的 /api/ 会保留在转发路径中。

2. 带斜杠(绝对路径)
```
location /api/ {
    proxy_pass http://backend:8080/;
}
```
- 用户请求 GET /api/users，转发给后端 GET `http://backend:8080/users`
- 用户请求 GET /api/orders/123,转发给后端 GET `http://backend:8080/orders/123`

**效果**：location 匹配到的 /api/ 被替换为 /。

**记忆口诀**：
- `proxy_pass` **不带斜杠** → 原样拼接，保留 location 的路径
- `proxy_pass` **带斜杠** → 替换路径，去掉 location 的路径前缀
### 2.3 转发到 upstream 服务器组
proxy_pass 不仅可以转发到单个后端地址，还可以转发到 upstream 定义的服务器组。
```
http {
    # 定义后端服务器组
    upstream backend {
        server 192.168.1.10:8080;
        server 192.168.1.11:8080;
    }

    server {
        listen 80;
        server_name example.com;

        location / {
            # 转发到 upstream 定义的服务器组
            proxy_pass http://backend;
        }
    }
}
```
当使用 upstream 时，proxy_pass 的地址是 http:// + upstream 名称，不包含具体的 IP 和端口。Nginx 会根据 upstream 中定义的负载均衡策略，将请求分发到不同的后端服务器。


## 三、透传客户端信息
### 3.1 为什么要透传客户端信息
当 Nginx 作为反向代理时，后端服务器默认只能看到 Nginx 的 IP 地址，而不是真实客户端的 IP。
```
用户(IP: 203.0.113.5)→ Nginx(IP: 192.168.1.100)→ 后端服务器
后端服务器看到的来源 IP：192.168.1.100(Nginx 的 IP)
后端服务器想要知道的真实 IP：203.0.113.5(用户的 IP)
```
如果后端服务器需要记录真实用户 IP(如日志分析、风控、地域限制)，就必须通过 HTTP 请求头将真实 IP 传递给后端。
### 3.2 透传客户端信息的核心配置
```
location / {
    proxy_pass http://backend;

    # 透传原始域名
    proxy_set_header Host $host;

    # 透传客户端真实 IP
    proxy_set_header X-Real-IP $remote_addr;

    # 透传代理链中的所有 IP
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # 透传原始协议(HTTP 或 HTTPS)
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
1. proxy_set_header Host $host;将客户端请求中的原始域名(Host 头)传递给后端，确保后端能正确识别用户访问的是哪个站点.
2. proxy_set_header X-Real-IP $remote_addr;将客户端的真实 IP 放入 X-Real-IP 头中传递给后端.
3. proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;将客户端 IP 追加到 X-Forwarded-For 头中。如果请求已有多层代理，这个头会记录完整的代理链.
4. proxy_set_header X-Forwarded-Proto $scheme;告诉后端原始请求使用的是 HTTP 还是 HTTPS，避免后端生成错误的跳转链接
### 3.3 完整的实际例子
假设你的环境是这样的：
1. 客户端用户，内网 IP：192.168.10.50 ，公网 IP：203.0.113.5
2. Nginx 代理服务器，反向代理入口  ，内网 IP：10.0.0.8 ，公网 IP：203.0.222.5
3. 后端应用服务器，实际运行业务的服务器，内网 IP：10.0.0.9

**用户访问流程**：
用户(`203.0.113.5`)通过浏览器访问 `https://fmc.ccwu.cc/`，请求经过公网到达 Nginx 服务器(`203.0.222.5`)，Nginx 将请求转发给内网后端服务器(`10.0.0.9`)。
在转发过程中，proxy_set_header 指令向后端转发的请求中添加了以下请求头：

| 配置指令 | Nginx 中的变量值 | 后端收到的请求头 | 说明 |
|----------|-----------------|-----------------|------|
| `proxy_set_header Host $host;` | `fmc.ccwu.cc` | `Host: fmc.ccwu.cc` | 传递用户访问的原始域名，后端据此识别要访问的站点 |
| `proxy_set_header X-Real-IP $remote_addr;` | `203.0.113.5` | `X-Real-IP: 203.0.113.5` | 传递用户的真实公网 IP |
| `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` | `203.0.113.5` | `X-Forwarded-For: 203.0.113.5` | 记录代理链信息，第一个 IP 始终是用户真实 IP |
| `proxy_set_header X-Forwarded-Proto $scheme;` | `https` | `X-Forwarded-Proto: https` | 告诉后端原始请求使用的是 HTTPS |

最终，后端应用服务器 10.0.0.9 收到的请求头中，关键信息如下：

```
Host: fmc.ccwu.cc
X-Real-IP: 203.0.113.5
X-Forwarded-For: 203.0.113.5
X-Forwarded-Proto: https
```
后端应用可以通过读取这些请求头，获得用户的真实 IP 和访问协议，而不会误以为请求来自 Nginx 的内网 IP 10.0.0.8。

### 3.4 X-Real-IP 与 X-Forwarded-For 的区别
| 请求头 | 内容 | 适用场景 |
|--------|------|----------|
| `X-Real-IP` | 只包含一个 IP(客户端的真实 IP) | 单层代理场景，后端直接读取即可 |
| `X-Forwarded-For` | 包含一串 IP，格式为 `客户端IP, 代理1IP, 代理2IP, ...` | 多层代理场景，记录完整的代理链路 |

**示例**：
- 用户 IP：203.0.113.5
- 经过一层 Nginx 代理(IP：10.0.0.8)
- X-Real-IP：203.0.113.5
- X-Forwarded-For：203.0.113.5
如果经过两层代理：
- 用户 IP：203.0.113.5
- 第一层代理(IP：10.0.0.8)
- 第二层代理(IP：10.0.0.100)
- X-Forwarded-For：203.0.113.5, 10.0.0.8
后端服务器可以读取 X-Forwarded-For 头的第一个 IP 作为真实客户端 IP。

### 3.5 后端如何获取真实 IP
**Java(Spring Boot)**：
```
String realIp = request.getHeader("X-Real-IP");
if (realIp == null) {
    realIp = request.getRemoteAddr();
}
```
**Go**：
```
realIP := r.Header.Get("X-Real-IP")
if realIP == "" {
    realIP = r.RemoteAddr
}
```
**PHP**：
```
$realIp = $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'];
```
**Python(Django)**：
```
real_ip = request.META.get('HTTP_X_REAL_IP', request.META.get('REMOTE_ADDR'))
```

## 四、超时控制
### 4.1 为什么需要超时控制
反向代理场景中，Nginx 与后端服务器之间的网络通信可能因为各种原因出现延迟或中断。如果没有超时控制，一个慢请求可能长时间占用连接资源，影响其他请求的处理。
Nginx 提供了多种超时配置选项，用于控制与后端服务器通信的各个环节。
### 4.2 常用超时指令
```
location / {
    proxy_pass http://backend;

    # 连接超时：Nginx 与后端建立连接的最长等待时间,默认值是60秒
    proxy_connect_timeout 5s;

    # 读取超时：Nginx 等待后端返回数据的超时时间，默认值是60秒
    proxy_read_timeout 60s;

    # 发送超时：Nginx 向后端发送请求数据的超时时间，默认值是60秒
    proxy_send_timeout 60s;
}
```
1. proxy_connect_timeout 60 s; Nginx 与后端服务器建立 TCP 连接的超时时间。如果后端无响应超过此时间，Nginx 返回 504
2. proxy_read_timeout 60s;Nginx 从后端服务器读取响应数据的超时时间。如果后端处理请求时间过长，会触发此超时
3. proxy_send_timeout 60 s;Nginx 向后端服务器发送请求数据的超时时间。如果上传大文件时网络慢，可能触发此超时
### 4.3 不同场景的超时建议

| 场景 | 建议配置 | 理由 |
|------|----------|------|
| 普通 API | `proxy_connect_timeout 5s;`  <br>`proxy_read_timeout 30s;` | API 通常响应快，超时不宜过长 |
| 文件上传 | `proxy_connect_timeout 10s;`  <br>`proxy_read_timeout 300s;` | 大文件上传需要更长的时间 |
| 报表/导出 | `proxy_read_timeout 600s;` | 复杂报表生成可能需要几分钟 |
| SSE/长轮询 | `proxy_read_timeout 3600s;` | 长连接需要保持较长时间 |

## 五、缓冲区配置
### 5.1 什么是代理缓冲区
当 Nginx 从后端服务器接收到响应数据时，默认会先存入缓冲区，再逐步发送给客户端。这样做的好处是：
1. 提高效率：Nginx 可以一次性接收完整响应，再统一发送
2. 减少连接数：后端可以快速完成响应并释放连接
3. 应对慢客户端：如果客户端网络慢，Nginx 可以先从后端接收完整响应，再慢慢发送给客户端
### 5.2 缓冲区配置指令
```
location / {
    proxy_pass http://backend;

    # 启用响应缓冲(默认开启)
    proxy_buffering on;

    # 单个缓冲区大小
    proxy_buffer_size 4k;

    # 缓冲区的数量和大小
    proxy_buffers 8 4k;

    # 缓冲区总大小的上限
    proxy_busy_buffers_size 8k;
}
```
1. proxy_buffering on; 默认值是 on，是否启用响应缓冲。关闭后，响应数据实时转发，适合大文件下载或 SSE 场景
2. proxy_buffer_size 4k; 默认值4k/8k，用于存储响应头部的缓冲区大小
3. proxy_buffers 8 4 k; 默认值是 8 4k/8k，用于存储响应体的缓冲区数量和大小
4. proxy_busy_buffers_size 8 k; 默认值是 8k/16k，在响应未完全接收时，允许发送给客户端的缓冲区大小上限

**何时需要调整缓冲区**：
- 后端响应体较大(如 API 返回大量数据)→ 调大 proxy_buffers
- 大文件下载或视频流 → 关闭 proxy_buffering off;

## 六、高级配置
### 6.1 proxy_redirect — 重定向改写
当后端服务器返回 30x 重定向响应时，Location 头中的地址可能是后端的内网地址，客户端无法访问。proxy_redirect 可以将这些地址改写为 Nginx 的对外地址。
```
location / {
    proxy_pass http://backend:8080;

    # 将后端返回的 http://backend:8080/xxx 改写为 http://example.com/xxx
    proxy_redirect http://backend:8080/ http://example.com/;
}
```
**简化写法**(直接替换)：
```
proxy_redirect http://backend:8080/ /;
```
### 6.2 proxy_next_upstream — 故障转移
当配置了多个后端服务器时，proxy_next_upstream 决定在什么情况下将请求转发给下一个服务器。
```
upstream backend {
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}

location / {
    proxy_pass http://backend;

    # 遇到以下错误时，尝试转发给下一个服务器
    proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
}
```
**可选参数**：

| 参数 | 说明 |
|------|------|
| `error` | 与后端建立连接、发送请求或读取响应时发生错误 |
| `timeout` | 与后端的操作超时 |
| `http_500` | 后端返回 500 错误 |
| `http_502` | 后端返回 502 错误 |
| `http_503` | 后端返回 503 错误 |
| `http_504` | 后端返回 504 错误 |
| `non_idempotent` | 允许对非幂等请求(如 POST)进行重试(默认不重试) |

### 6.3 支持 WebSocket 代理
WebSocket 协议与 HTTP 不同，需要额外的配置才能正确代理。
```
location /ws/ {
    proxy_pass http://backend:8080;

    # 必须升级到 HTTP/1.1
    proxy_http_version 1.1;

    # 设置 Upgrade 和 Connection 头
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # 透传其他信息
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
关键配置：
1. proxy_http_version 1.1;：WebSocket 需要 HTTP/1.1
2. proxy_set_header Upgrade $http_upgrade;：传递 Upgrade 头
3. proxy_set_header Connection "upgrade";：告诉后端这是一个升级请求

## 七、完整综合配置示例
### 7.1 生产级反向代理配置
```
# ============================================
# /etc/nginx/conf.d/proxy.conf
# 生产级反向代理完整配置
# ============================================

http {
    # ============================================
    # 定义后端服务器组(负载均衡)
    # ============================================

    upstream app_backend {
        server 192.168.1.10:8080 weight=3 max_fails=3 fail_timeout=30s;
        server 192.168.1.11:8080 weight=2 max_fails=3 fail_timeout=30s;
        server 192.168.1.12:8080 backup;
        keepalive 32;
    }

    # ============================================
    # 虚拟主机配置
    # ============================================

    server {
        listen 80;
        server_name api.example.com;

        # 访问日志
        access_log /var/log/nginx/api_access.log;
        error_log /var/log/nginx/api_error.log;

        # ============================================
        # 根路径：反向代理到后端
        # ============================================

        location / {
            proxy_pass http://app_backend;

            # -- 透传客户端信息 --
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # -- 超时控制 --
            proxy_connect_timeout 5s;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;

            # -- 缓冲区配置 --
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;

            # -- HTTP 版本(支持长连接) --
            proxy_http_version 1.1;
            proxy_set_header Connection "";

            # -- 重定向改写 --
            proxy_redirect http://app_backend/ /;

            # -- 故障转移 --
            proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
        }

        # ============================================
        # 健康检查端点(直接返回，不代理)
        # ============================================

        location = /health {
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }

        # ============================================
        # 错误页面
        # ============================================

        error_page 502 503 504 /50x.html;

        location = /50x.html {
            root /var/www/errors;
        }
    }
}
```
**总结**：反向代理是 Nginx 最核心的功能之一,通过 `proxy_pass` 指令将客户端请求转发给后端服务器，并结合 `proxy_set_header` 透传客户端信息、`proxy_*_timeout` 控制超时、`proxy_buffering` 优化缓冲，实现请求的灵活转发与性能优化。掌握了反向代理，就掌握了 Nginx 作为 API 网关和负载均衡器的核心能力。