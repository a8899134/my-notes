HTTP 请求的处理过程可分为 11 个阶段，HTTP 请求处理阶段如下表所示。
## 一、请求读取与预处理阶段
### 1.1 NGX_HTTP_POST_READ_PHASE —读取请求头
**作用**：Nginx 接收到客户端发来的 HTTP 请求后，首先会读取并解析请求行(例如 `GET /index.html HTTP/1.1`)和所有请求头(例如 `Host`、`User-Agent`、`Cookie` 等)，并将它们存入内部数据结构。  
**你能做什么**：普通用户通常无需干预这个阶段，但某些 Nginx 模块(如 `realip`)可以在这里修改客户端 IP 地址(例如从 `X-Forwarded-For` 头中取真实 IP)。  
**典型指令**：无直接配置，但 `set_real_ip_from`、`real_ip_header` 等指令在 `realip` 模块中，它们会影响这个阶段。

**示例**
```
# 配置 realip 模块
set_real_ip_from 10.0.0.0/8;
real_ip_header X-Forwarded-For;
```
**请求**
```
GET /index.html HTTP/1.1
Host: example.com
X-Forwarded-For: 203.0.113.5
```
在 `POST_READ` 阶段，Nginx 读取到 `X-Forwarded-For` 头，并将 `$remote_addr` 变量从代理 IP 改为 `203.0.113.5`。后续所有访问控制都将基于这个真实 IP。
### 1.2 NGX_HTTP_SERVER_REWRITE_PHASE —server 重定向
**作用**：在找到匹配的 `server` 块之后、进入 `location` 路由之前，执行该 `server` 块内定义的 `rewrite` 指令。  
**典型指令**：`rewrite`、`set`(部分)

**示例**
```
server {
    listen 80;
    server_name example.com;
    # 将所有 /old/xxx 重写为 /new/xxx，并重新走一遍请求处理流程
    rewrite ^/old/(.*)$ /new/$1 last;
    location / {
        # ...
    }
}
```
**请求**：`GET /old/foo/bar HTTP/1.1`
在 `SERVER_REWRITE` 阶段，URI 从 `/old/foo/bar` 被改为 `/new/foo/bar`。`last` 标志会让 Nginx **重新从第一阶段开始**处理这个新 URI(再次匹配 location)。

## 二、路由与重写阶段
### 2.1 NGX_HTTP_FIND_CONFIG_PHASE —URI 匹配
**作用**：根据当前的 URI 查找匹配的 `location` 块。该阶段由 Nginx 内部完成，**不支持外部模块注入**。

**你能做的**：无，但你需要知道 Nginx 是如何匹配 `location` 的(前缀匹配、正则匹配、精确匹配等顺序)。

**示例**
```
location /documents/ { ... }         # 前缀匹配
location ~ \.html$ { ... }           # 正则匹配(大小写敏感)
```
**当前 URI**：`/documents/read.html`。  
在 `FIND_CONFIG` 阶段，Nginx 先检查所有前缀 `location`，找到 `/documents/`，然后继续按顺序检查正则 `location`，如果 `~ \.html$` 匹配也会记录下来。最终根据匹配规则选择最合适的 `location`(通常正则优先级更高)。结果会记录并用于后续阶段。
### 2.2 NGX_HTTP_REWRITE_PHASE —location 内的重写
**作用**：执行匹配到的 `location` 块内部的 `rewrite` 指令。  
**典型指令**：`rewrite`、`set`、`if`(部分)。

**示例**
```
location /images/ {
    rewrite ^/images/(.*)\.jpg$ /pics/$1.png break;
}
```
**请求**：`GET /images/cat.jpg`
在 `REWRITE` 阶段，URI 被改为 `/pics/cat.png`，`break` 标志表示不重新进行 location 匹配，直接进入后续阶段。
### 2.3 NGX_HTTP_POST_REWRITE_PHASE —重写后处理

**作用**：检查重写是否形成了循环(例如 A → B → A)，如果重写次数超过 10 次，则认为死循环，返回 500 错误。

**你能做的**：无，该阶段不支持外部模块。

**示例(错误配置导致循环)**
```
location /a {
    rewrite ^/a$ /b last;
}
location /b {
    rewrite ^/b$ /a last;
}
```
**请求**：`GET /a`  
第一次重写后 URI 变为 `/b`；第二次重写后 URI 变回 `/a`。`POST_REWRITE` 阶段检测到重写次数超过 10 次，立即返回 500 Internal Server Error。

## 三、访问控制阶段
### 3.1 NGX_HTTP_PREACCESS_PHASE —访问控制前
**作用**：在真正进行权限检查之前，先处理连接数和请求速率限制。  
**典型指令**：`limit_conn`(限制并发连接数)、`limit_req`(限制请求频率)。

**示例**
```
limit_conn_zone $binary_remote_addr zone=addr:10m;
limit_req_zone $binary_remote_addr zone=perip:10m rate=10r/s;

server {
    location / {
        limit_conn addr 10;          # 同一 IP 最多 10 个并发连接
        limit_req zone=perip burst=5; # 每秒最多 10 个请求，允许突发 5 个排队
    }
}
```
**请求**：来自 `203.0.113.5` 的第 11 个并发连接。  
在 `PREACCESS` 阶段，Nginx 检查到该 IP 的连接数已超过 10，立即返回 503 Service Unavailable，不会继续执行后续访问控制或内容生成。
### 3.2 NGX_HTTP_ACCESS_PHASE —访问控制
**作用**：执行用户认证、IP 黑白名单等访问权限检查。  
**典型指令**：`allow`、`deny`、`auth_basic`、`auth_request`

**示例**
```
location /admin/ {
    allow 192.168.1.0/24;
    deny all;
    auth_basic "Restricted Area";
    auth_basic_user_file /etc/nginx/.htpasswd;
}
```
**请求**：来自 IP `10.0.0.5`(不在白名单内)  
在 `ACCESS` 阶段，`deny all` 生效，返回 403 Forbidden。如果 IP 在白名单内，则继续要求 HTTP Basic 认证，密码错误返回 401。
### 3.3 NGX_HTTP_POST_ACCESS_PHASE —访问控制后
**作用**：处理访问控制的结果，例如发送拒绝响应。该阶段不支持外部模块。  
**你能做的**：无，但可以通过 `error_page` 自定义错误页面。

**示例**
```
error_page 403 /custom_403.html;
location = /custom_403.html {
    root /usr/share/nginx/html;
    internal;
}
```
当 `ACCESS` 阶段返回 403 时，`POST_ACCESS` 阶段会触发 `error_page` 重定向，最终返回自定义页面。

## 四、内容生成前与内容生成阶段
### 4.1 NGX_HTTP_PRECONTENT_PHASE —准备内容
**作用**：在真正生成响应内容之前，执行 `try_files`(检查文件是否存在)和 `mirror`(复制流量)等指令。以前这个阶段叫做 `NGX_HTTP_TRY_FILES_PHASE`。  
**典型指令**：`try_files`、`mirror`。

**示例**
```
location / {
    try_files $uri $uri/ /index.php?$args;
}
```
1. 检查 `/about.html` 文件是否存在 → 存在则直接进入 `CONTENT` 阶段返回文件。
2. 若不存在，检查 `/about.html/` 目录是否存在 → 存在则内部重定向到该目录。
3. 目录也不存在，则内部重定向到 `/index.php?args`，重新进入第一阶段(URI 变为 `/index.php`)。
### 4.2 NGX_HTTP_CONTENT_PHASE —生成响应内容
**作用**：真正产生响应数据并返回给客户端。这是最核心的阶段，也是绝大多数配置指令最终生效的地方。  
**典型指令**：`root`、`index`、`proxy_pass`、`fastcgi_pass`、`uwsgi_pass`、`return`、`try_files`(如果前面没处理完)。

**示例**
```
# 静态文件
location /static/ {
    root /var/www;
    index index.html;
}
# 反向代理
location /api/ {
    proxy_pass http://backend_server;
}
# PHP 动态处理
location ~ \.php$ {
    fastcgi_pass unix:/var/run/php-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include fastcgi_params;
}
# 直接返回响应
location /health {
    return 200 "OK\n";
    add_header Content-Type text/plain;
}
```
**请求**：`GET /api/users`  
在 `CONTENT` 阶段，Nginx 执行 `proxy_pass`，将请求转发给 `backend_server`，收到响应后返回给客户端。若请求 `/health`，则直接返回 `200 OK`。

## 五、日志记录阶段
### 5.1 NGX_HTTP_LOG_PHASE —记录日志
**作用**：在请求处理完毕之后，将访问记录写入日志文件。该阶段由内部完成，但你可以通过指令控制日志格式和位置。  
**典型指令**：`access_log`、`log_format`。

**示例**
```
http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;
}
```
**请求**：`GET /index.html` 成功(状态码 200)  
在 `LOG` 阶段，Nginx 将如下格式的日志写入文件：
```
203.0.113.5 - - [30/May/2026:10:15:30 +0800] "GET /index.html HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
```

## 六、完整综合示例
下面用一个完整的 Nginx 配置和具体请求，从头到尾展示每个阶段实际发生了什么。
### 6.1 使用配置
```
http {
    # 定义日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';

    access_log /var/log/nginx/access.log main;

    # 限制连接数区域
    limit_conn_zone $binary_remote_addr zone=addr:10m;
    # 限制请求频率区域
    limit_req_zone $binary_remote_addr zone=perip:10m rate=5r/s;

    server {
        listen 80;
        server_name example.com;

        # 用于测试 realip(假设前置代理 IP 是 10.0.0.1)
        set_real_ip_from 10.0.0.0/8;
        real_ip_header X-Forwarded-For;

        # server 级重写：将 /old/ 转为 /new/
        rewrite ^/old/(.*)$ /new/$1 last;

        location / {
            # 并发连接限制
            limit_conn addr 10;
            # 请求频率限制
            limit_req zone=perip burst=3;

            # IP 访问控制
            allow 192.168.1.0/24;
            deny all;

            # 尝试文件是否存在，否则交给 index.php
            try_files $uri $uri/ /index.php?$args;
        }

        location /admin {
            auth_basic "Admin Area";
            auth_basic_user_file /etc/nginx/.htpasswd;
        }

        location ~ \.php$ {
            fastcgi_pass 127.0.0.1:9000;
            fastcgi_param SCRIPT_FILENAME /var/www/html$fastcgi_script_name;
            include fastcgi_params;
        }

        location /mirror {
            mirror /mirror-backend;
            proxy_pass http://localhost:8080;
        }

        location = /mirror-backend {
            internal;
            proxy_pass http://logserver:9090;
        }
    }
}
```
### 6.2 发起请求
客户端真实 IP `203.0.113.5`，经过代理 `10.0.0.1` 转发：
```
GET /old/foo/bar?page=2 HTTP/1.1
Host: example.com
X-Forwarded-For: 203.0.113.5
User-Agent: Mozilla/5.0
```
### 6.3 分阶段详解
 1. NGX_HTTP_POST_READ_PHASE
- 发生了什么：Nginx 读取请求行和所有头部，解析出 method= GET，URI= /old/foo/bar?page=2，协议= HTTP/1.1。
- realip 模块工作：因为配置了 set_real_ip_from 10.0.0.0/8 且 X-Forwarded-For 头存在，Nginx 将 $remote_addr 从 10.0.0.1 改为 203.0.113.5。后续所有访问控制都会基于这个真实 IP。

 2. NGX_HTTP_SERVER_REWRITE_PHASE
- 发生了什么：进入 server 块后，执行 rewrite ^/old/(.*)$ /new/$1 last;。URI 从 /old/foo/bar 变为 /new/foo/bar。因为标志为 last，Nginx 会 重新开始整个处理流程(重新从阶段 1 开始，但 URI 已经改变)。
- 注意：如果使用 break，则不会重新开始，直接进入后续阶段。这里 last 导致流程重启。

 3. NGX_HTTP_FIND_CONFIG_PHASE
- 重启后的第一次匹配：新 URI /new/foo/bar。Nginx 查找 location。没有 /new 的精确前缀匹配，于是进入默认的 location / 块。

 4. NGX_HTTP_REWRITE_PHASE
- location / 块内没有 rewrite 指令，此阶段无动作。

 5. NGX_HTTP_POST_REWRITE_PHASE
- 没有重写循环，正常通过。

 6. NGX_HTTP_PREACCESS_PHASE
- 限制并发连接：limit_conn addr 10; 检查 $binary_remote_addr(即真实 IP 203.0.113.5)当前已建立的连接数，若超过 10 则返回 503。
- 限制请求频率：limit_req zone=perip burst=3; 检查该 IP 的请求速率是否超过 5 请求/秒，且瞬时突发不超过 3 个排队。若超出则返回 503。

 7. NGX_HTTP_ACCESS_PHASE
- location / 中有 allow 192.168.1.0/24; deny all;。真实 IP 203.0.113.5 不在 192.168.1.0/24 范围内，因此触发 deny all，Nginx 立即返回 403 Forbidden。
- 由于请求已经被拒绝，不会继续执行 try_files 以及后续阶段。
- 提前终止：后续阶段(8~11)可能仍会执行部分收尾工作(如日志记录)，但响应内容已经确定为 403。

 8. NGX_HTTP_POST_ACCESS_PHASE
- 内部处理访问控制的结果，发送 403 状态码。

 9. NGX_HTTP_PRECONTENT_PHASE
- 被跳过：因为已经决定返回 403，不再需要检查 try_files。

 10. NGX_HTTP_CONTENT_PHASE
- 不执行任何内容生成(除了错误页)。默认错误页面会被发送。

 11. NGX_HTTP_LOG_PHASE
- 记录日志：203.0.113.5 - - [时间] "GET /old/foo/bar?page=2 HTTP/1.1" 403 ...。

### 6.4 修改配置让请求成功
如果要让请求正常到达后端 PHP，需要将 allow 改为包含客户端 IP 的网段，或者直接注释掉 deny all。修改后，流程继续：
- 阶段 7 通过，无拒绝。
- 阶段 9 PRECONTENT ：执行 try_files $uri $uri/ /index.php?$args。  
     假设 /new/foo/bar 文件不存在，/new/foo/bar/ 目录也不存在，则内部重定向到 /index.php?page=2(注意 $args 保留原始查询参数)。
- 阶段 3 再次启动(因为 try_files 内部重定向)：URI 变为 /index.php?page=2，匹配 location ~ \.php$。
- 阶段 4-8 无特殊规则(location ~ \.php$ 中没有额外限制)。
- 阶段 9：新的 location 中没有 try_files。
- 阶段 10 CONTENT ：执行 fastcgi_pass，将请求交给 PHP-FPM 处理，最终生成 HTML 响应。
- 阶段 11：记录日志，状态码 200。

## 七、请求完整流程图解
```
客户端请求
    │
    ▼
┌─────────────────────────────────────┐  ← 读取与预处理阶段
│ 1. POST_READ     读取并解析请求头     │ ← realip 等模块
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐ ← 读取与预处理阶段
│ 2. SERVER_REWRITE server内重写       │ ← rewrite, set
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐ ← 路由与重写阶段
│ 3. FIND_CONFIG   匹配 location       │ ← 内部处理
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐ ← 路由与重写阶段
│ 4. REWRITE       location内重写      │ ← rewrite, if
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐ ← 路由与重写阶段
│ 5. POST_REWRITE  检查重写循环        │ ← 内部处理
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐ ← 访问控制前阶段
│ 6. PREACCESS     连接/请求数限制     │ ← limit_conn, limit_req
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐  ← 访问控制阶段
│ 7. ACCESS        认证/IP黑白名单     │  ← allow, auth_basic
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐  ← 访问控制后阶段
│ 8. POST_ACCESS   处理拒绝响应        │  ← 内部处理
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐  ← 内容生成前阶段
│ 9. PRECONTENT    try_files/mirror   │  ← try_files, mirror
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐ ← 内容生产后阶段
│10. CONTENT       生成响应内容        │ ← proxy_pass, root, fastcgi_pass
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐ ← 日志记录
│11. LOG           记录访问日志        │ ← access_log
└─────────────────────────────────────┘
    │
    ▼
  响应客户端
```
