## 一、为什么需要安全防护
### 1.1 Nginx 安全防护的核心思路
Nginx 作为 Web 服务的第一道防线，承担着“过滤恶意请求、限制非法访问、加固服务本身”的核心职责。通过内置模块(如 ngx_http_core_module、ngx_http_rewrite_module)的合理配置，可以有效封堵 SQL 注入、XSS 跨站脚本、CSRF 跨站请求伪造、恶意爬虫等大部分常见 Web 漏洞。

**安全防护的三个层次：**

| 层次 | 目标 | 手段 |
|------|------|------|
| 第一层：请求过滤 | 拦截恶意请求 | 限制请求方法、过滤恶意参数 |
| 第二层：访问控制 | 限制谁可以访问 | IP 黑白名单、目录保护、认证 |
| 第三层：服务加固 | 保护服务器本身 | 隐藏版本、安全头、SSL 加固、限流 |

### 1.2 安全配置的优先级
1. **必配**  隐藏版本号、禁用目录列表、限请求体大小、超时控制、安全响应头、设置文件/目录权限 , 零副作用，不影响业务，几行配置就能挡住基础扫描和低水平攻击.
2. **强烈推荐** 强制 HTTPS、SSL 安全加固、IP 白名单(敏感目录)、基础认证。根据业务情况配置，安全性大幅提升
3. **按需** IP 黑白名单、限流限速、请求方法限制、User-Agent 拦截、请求参数过滤(防 SQL 注入/XSS)，这些可能误伤正常用户，需要先观察业务流量特征再配置

## 二、基础安全加固
### 2.1 隐藏 Nginx 版本号
作用：默认情况下，Nginx 会在 HTTP 响应头中暴露版本号(如 Server: nginx/1.24.0)。攻击者可以利用版本信息查找已知漏洞进行针对性攻击。隐藏版本号可以增加攻击难度。

**配置方法**：
在 http、server 或 location 块中添加：
```
http {
    # 隐藏 Nginx 版本号
    server_tokens off;

    # 其他配置...
}
```
**验证方法**：
```
# 查看响应头中的 Server 字段
curl -I http://example.com
# 应显示 Server: nginx(无版本号)
```
### 2.2 禁用目录列表
作用：默认情况下，如果请求一个目录且没有默认首页文件，Nginx 可能会列出该目录下的所有文件。这会导致敏感文件(如配置文件、日志、源码)被公开暴露。

**配置方法**：
```
http {
    # 全局禁用目录列表
    autoindex off;

    server {
        # 或在 server/location 块中单独设置
        location / {
            autoindex off;
        }
    }
}
```
### 2.3 限制 HTTP 请求方法
作用：仅允许业务必需的 HTTP 方法(如 GET、POST、HEAD)，拒绝 PUT、DELETE、OPTIONS 等高危方法，防止攻击者通过非常规方法发起攻击。

**配置方法**：
```
server {
    listen 80;
    server_name example.com;

    # 限制请求方法：仅允许 GET、POST、HEAD
    if ($request_method !~ ^(GET|POST|HEAD)$ ) {
        return 403;  # 返回 403 Forbidden
    }

    # 或使用 limit_except 方式
    location / {
        limit_except GET POST HEAD {
            deny all;
        }
    }
}
```
**两种方式的区别**：

| 方式 | 优点 | 缺点 |
|------|------|------|
| `if ($request_method)` | 灵活，可配合其他条件 | `if` 指令在某些场景下可能有坑 |
| `limit_except` | 官方推荐，语义清晰 | 只能限制特定 `location` |

### 2.4 设置请求体大小限制
作用：限制客户端请求体的最大大小，防止攻击者通过上传超大文件耗尽服务器资源。

**配置方法**：
```
http {
    # 全局默认限制 1MB
    client_max_body_size 1m;

    server {
        # 上传接口单独放宽
        location /api/upload/ {
            client_max_body_size 100m;
            # ...
        }
    }
}
```
### 2.5 设置文件/目录权限
作用：限制 Nginx 配置文件的权限，避免敏感信息泄露。

**操作命令**：
```
# 配置文件权限：所有者可读写，组用户可读
chmod 640 /etc/nginx/nginx.conf

# SSL 私钥文件权限：仅所有者可读写
chmod 600 /etc/nginx/ssl/example.com.key
```

## 三、访问控制
### 3.1 IP 黑白名单
作用：基于客户端 IP 地址设置白名单(仅允许特定 IP 访问)或黑名单(禁止特定 IP 访问)。
#### 3.1.1 基础配置(allow/deny)
在 location 或 server 块中使用 allow 和 deny 指令：
```
server {
    listen 80;
    server_name example.com;

    # 白名单模式：允许特定 IP，拒绝其他所有
    location /admin/ {
        allow 192.168.1.0/24;   # 允许内网网段
        allow 10.0.0.10;        # 允许特定运维 IP
        deny all;               # 拒绝所有其他 IP
    }

    # 黑名单模式：禁止特定 IP，允许其他所有
    location / {
        deny 192.168.1.100;     # 禁止特定 IP
        deny 203.0.113.0/24;    # 禁止特定网段
        allow all;              # 允许其他所有
    }
}
```
**⚠️ 注意**：
Nginx 的匹配规则是从上往下执行的。如果把 deny all 写在第一行，后面的所有 allow 都不会生效。白名单模式下，先 allow 后 deny；黑名单模式下，先 deny 后 allow。
#### 3.1.2 通过文件管理 IP 列表(推荐)
将 IP 列表独立成文件，便于管理：
```
# 在 location 中引用外部文件
location /admin/ {
    include /etc/nginx/whitelist.conf;
    deny all;
}
```

```
# /etc/nginx/whitelist.conf 内容
allow 192.168.1.10;
allow 192.168.1.11;
allow 10.0.0.0/8;
```
#### 3.1.3 使用 geo 模块实现动态封禁
通过 geo 模块可以实现 IP 级别的动态访问控制：
```
http {
    # 定义 IP 列表
    geo $ip_list {
        default 0;
        192.168.1.0/24 1;   # 白名单 IP 返回 1
        10.0.0.0/8 1;
    }

    server {
        location / {
            if ($ip_list = 0) {
                return 403;
            }
            # 正常处理请求...
        }
    }
}
```
### 3.2 保护敏感目录
作用：禁止外部访问 .git、.htaccess、日志文件等敏感目录和文件。
配置方法：
```
server {
    root /var/www/html;

    # 禁止访问 .git 目录
    location ~ /\.git {
        deny all;
    }

    # 禁止访问 .htaccess 等文件
    location ~ /\.ht {
        deny all;
    }

    # 禁止访问日志和配置文件
    location ~ /\.(log|conf)$ {
        deny all;
    }

    # 禁止访问日志目录
    location /logs/ {
        autoindex off;
        deny all;
    }
}
```
### 3.3 基础认证(HTTP Basic Auth)
作用：为敏感路径(如管理后台)设置用户名密码认证。

**生成密码文件**：
```
# 安装 htpasswd 工具
yum install -y httpd-tools   # CentOS
# 或
apt install -y apache2-utils # Ubuntu

# 创建密码文件(-c 创建新文件)
htpasswd -c /etc/nginx/.htpasswd admin
# 按提示输入密码
```
**配置 Nginx**
```
location /admin/ {
    auth_basic "Restricted Area";
    auth_basic_user_file /etc/nginx/.htpasswd;
    # 其他配置...
}
```

## 四、限流与防攻击
### 4.1 请求频率限制(limit_req)
作用：限制每个客户端 IP 在单位时间内的请求次数，防止暴力破解、CC 攻击等。

**核心参数**：

| 参数 | 含义 | 示例 |
|------|------|------|
| `rate` | 每秒/每分钟允许的请求数 | `10r/s` 或 `5r/m` |
| `burst` | 允许的突发请求数(排队队列) | `burst=20` |
| `nodelay` | 超过限制立即拒绝，不排队 | `nodelay` |

**配置示例**：
```
http {
    # 定义限流区域
    # $binary_remote_addr：按客户端 IP 限流
    # zone=api_limit:10m：共享内存区域名称和大小(10MB 可存约 16 万个 IP)
    # rate=10r/s：每秒允许 10 个请求
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    
    # 定义更严格的登录接口限流
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

    # 自定义限流返回状态码
    limit_req_status 429;

    server {
        location /api/ {
            # 启用限流：每秒 10 个请求，允许突发 20 个，超出立即拒绝
            limit_req zone=api_limit burst=20 nodelay;
            proxy_pass http://backend;
        }

        location /api/login/ {
            # 登录接口更严格：每分钟 5 次请求
            limit_req zone=login_limit burst=5 nodelay;
            proxy_pass http://backend;
        }
    }
}
```
**不同场景的限流建议**：

| 场景 | 建议配置 | 说明 |
|------|----------|------|
| 普通 API | `rate=10r/s burst=20` | 一般业务接口 |
| 登录接口 | `rate=5r/m burst=5` | 防止暴力破解 |
| 短信验证码 | `rate=1r/m burst=1` | 防止短信轰炸 |
| 静态资源 | `rate=50r/s burst=100` | 资源文件可适当放宽 |

### 4.2 并发连接限制(limit_conn)
作用：限制每个客户端 IP 同时建立的连接数，防止单个用户占用过多连接资源。

**配置示例**:
```
http {
    # 定义并发连接限制区域
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
    
    # 自定义返回状态码
    limit_conn_status 429;

    server {
        location /download/ {
            # 每个 IP 最多 10 个并发连接
            limit_conn conn_limit 10;
            # 其他配置...
        }

        location /api/ {
            # 每个 IP 最多 100 个并发连接
            limit_conn conn_limit 100;
            proxy_pass http://backend;
        }
    }
}
```
### 4.3 超时控制(防慢速攻击)
作用：缩短超时时间，防止攻击者通过慢速发送数据耗尽服务器连接资源。

**配置示例**：
```
http {
    # 读取请求体超时(默认 60s)
    client_body_timeout 30s;

    # 读取请求头超时(默认 60s)
    client_header_timeout 30s;

    # 发送响应超时(默认 60s)
    send_timeout 30s;
}
```
### 4.4 自定义限流返回内容
当触发限流时，默认返回 503 或 429。可以自定义返回内容，提升用户体验：
```
server {
    # 自定义限流错误页面
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

### 5.1 常见安全响应头
作用：通过添加 HTTP 响应头，防止点击劫持、MIME 类型嗅探、XSS 攻击等。

**配置方法**：
```
http {
    # 或放在 server 块中

    # 1. 防止点击劫持(Clickjacking)
    # SAMEORIGIN：仅允许同源页面嵌入
    add_header X-Frame-Options "SAMEORIGIN" always;

    # 2. 防止 MIME 类型嗅探
    add_header X-Content-Type-Options "nosniff" always;

    # 3. 启用 XSS 过滤
    add_header X-XSS-Protection "1; mode=block" always;

    # 4. 控制引用来源
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # 5. 内容安全策略(CSP)- 限制资源加载来源
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
}
```
**响应头说明**：

| 响应头 | 作用 | 推荐值 |
|--------|------|--------|
| `X-Frame-Options` | 防止页面被嵌入 iframe(防点击劫持) | `SAMEORIGIN` 或 `DENY` |
| `X-Content-Type-Options` | 防止浏览器 MIME 类型嗅探 | `nosniff` |
| `X-XSS-Protection` | 启用浏览器 XSS 过滤 | `1; mode=block` |
| `Referrer-Policy` | 控制 Referer 头传递 | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | 限制资源加载来源(CSP) | `default-src 'self'` |

## 六、SSL/TLS 安全加固
### 6.1 强制 HTTPS
作用：将所有 HTTP 请求重定向到 HTTPS，确保数据传输加密。

**配置示例**：
```
server {
    listen 80;
    server_name example.com;
    # 强制跳转 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;
    # SSL 配置...
}
```
### 6.2 SSL 协议与加密套件
作用：仅启用安全的 TLS 协议和加密套件，禁用不安全的旧协议。

**SSL 安全配置**：
```
server {
    listen 443 ssl http2;
    server_name example.com;

    # 证书配置
    ssl_certificate /etc/nginx/ssl/example.com.crt;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;

    # 协议版本：仅启用 TLS 1.2 和 1.3
    ssl_protocols TLSv1.2 TLSv1.3;

    # 强加密套件(支持前向保密 PFS)
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;

    # 优先使用服务器端加密套件顺序
    ssl_prefer_server_ciphers on;

    # SSL 会话缓存
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS：强制浏览器后续使用 HTTPS(6 个月)
    add_header Strict-Transport-Security "max-age=15552000; includeSubDomains; preload" always;
}
```
**配置说明**：
1. ssl_protocols TLSv 1.2 TLSv 1.3，禁用 SSLv2/SSLv3/TLSv1.0/TLSv1.1，仅启用安全协议
2. ssl_ciphers，使用支持前向保密(PFS)的 ECDHE 套件
3. ssl_prefer_server_ciphers on，优先使用服务器端套件顺序，避免客户端弱套件
4. ssl_session_cache，缓存 SSL 会话，减少握手开销
5. Strict-Transport-Security(HSTS)，强制浏览器 6 个月内仅使用 HTTPS
### 6.3 OCSP Stapling
作用：由服务器缓存证书吊销状态，减少客户端验证延迟，提升隐私保护。

**配置示例**：
```
server {
    # ... SSL 配置 ...

    # 启用 OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
}
```

## 七、请求过滤与防攻击
### 7.1 拦截恶意请求参数
作用：通过正则匹配拦截包含 SQL 注入、XSS、文件包含等恶意特征的请求。

**配置示例**：
```
server {
    # 定义恶意特征变量
    set $block_sql_injection 0;
    set $block_xss 0;

    # 匹配 SQL 注入特征
    if ($request_uri ~* "(union|select|insert|update|delete|drop|truncate|or|and|exec|xp_cmdshell)") {
        set $block_sql_injection 1;
    }
    if ($args ~* "(union|select|insert|update|delete|drop|truncate|or|and|exec|xp_cmdshell)") {
        set $block_sql_injection 1;
    }

    # 匹配 XSS 特征
    if ($request_uri ~* "<script>|<iframe>|<img src=|onclick=|onload=|javascript:") {
        set $block_xss 1;
    }
    if ($args ~* "<script>|<iframe>|<img src=|onclick=|onload=|javascript:") {
        set $block_xss 1;
    }

    # 命中规则则拦截
    if ($block_sql_injection) {
        return 403;
    }
    if ($block_xss) {
        return 403;
    }
}
```
⚠️ **注意**：使用 if 指令进行请求过滤有一定性能开销，且 if 在 location 块中的行为可能不符合预期。对于生产环境，建议配合专业的 WAF(Web Application Firewall)如 ModSecurity 使用。
### 7.2 拦截特定 User-Agent
作用：拦截恶意爬虫或扫描工具的请求。
```
server {
    # 拦截常见恶意爬虫
    if ($http_user_agent ~* (curl|wget|python-requests|nikto|nmap|sqlmap) ) {
        return 403;
    }
}
```

## 八、文件上传安全
### 8.1 限制上传文件大小
**配置示例**：
```
location /api/upload/ {
    # 限制最大上传 100MB
    client_max_body_size 100m;

    # 上传超时设长一些
    client_body_timeout 300s;

    proxy_pass http://backend;
    # ...
}
```
### 8.2 上传目录安全配置
作用：将上传目录与可执行目录分离，禁用脚本执行。
```
location /uploads/ {
    root /var/www/uploads;
    # 禁用目录列表
    autoindex off;
    # 禁止执行 PHP 等脚本
    location ~* \.(php|php5|phtml)$ {
        deny all;
    }
}
```

## 九、日志与监控
### 9.1 隐藏后端信息
作用：隐藏后端服务器返回的敏感头信息。
```
location / {
    proxy_pass http://backend;
    # 隐藏后端返回的版本信息头
    proxy_hide_header X-Powered-By;
    proxy_hide_header Server;
}
```
### 9.2 访问日志审计
作用：记录关键访问信息，便于安全审计。
```
http {
    log_format security '$remote_addr - $remote_user [$time_local] "$request" '
                        '$status $body_bytes_sent "$http_referer" '
                        '"$http_user_agent" "$http_x_forwarded_for"';

    server {
        # 记录所有访问
        access_log /var/log/nginx/access.log security;

        # 敏感路径单独记录
        location /admin/ {
            access_log /var/log/nginx/admin_access.log security;
            # ...
        }
    }
}
```

## 十、完整安全配置示例

```
# ============================================
# /etc/nginx/nginx.conf - 安全防护完整配置
# ============================================

user nginx;
worker_processes auto;

error_log /var/log/nginx/error.log warn;

events {
    worker_connections 4096;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # ============================================
    # 1. 基础安全加固
    # ============================================

    # 隐藏版本号
    server_tokens off;

    # 禁用目录列表
    autoindex off;

    # 请求体大小限制(全局默认 1MB)
    client_max_body_size 1m;

    # ============================================
    # 2. 超时控制(防慢速攻击)
    # ============================================

    client_body_timeout 30s;
    client_header_timeout 30s;
    send_timeout 30s;

    # ============================================
    # 3. 日志格式
    # ============================================

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    # ============================================
    # 4. 限流定义
    # ============================================

    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;
    limit_req_status 429;

    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
    limit_conn_status 429;

    # ============================================
    # 5. 安全响应头
    # ============================================

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ============================================
    # 6. 引入站点配置
    # ============================================

    include /etc/nginx/conf.d/*.conf;
}
```
站点安全配置
```
# ============================================
# /etc/nginx/conf.d/example.com.conf - 站点安全配置
# ============================================

# HTTP 强制跳转 HTTPS
server {
    listen 80;
    server_name example.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS 服务
server {
    listen 443 ssl http2;
    server_name example.com;

    # SSL 证书
    ssl_certificate /etc/nginx/ssl/example.com.crt;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;

    # SSL 安全加固
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS
    add_header Strict-Transport-Security "max-age=15552000; includeSubDomains; preload" always;

    # 日志
    access_log /var/log/nginx/example_access.log main;
    error_log /var/log/nginx/example_error.log;

    # -- 限制请求方法 --
    if ($request_method !~ ^(GET|POST|HEAD)$ ) {
        return 403;
    }

    # -- 保护敏感目录 --
    location ~ /\.(git|ht|log|conf) {
        deny all;
    }

    # -- IP 白名单(管理后台) --
    location /admin/ {
        allow 192.168.1.0/24;
        allow 10.0.0.10;
        deny all;
        # 基础认证
        auth_basic "Admin Area";
        auth_basic_user_file /etc/nginx/.htpasswd;
        proxy_pass http://backend;
    }

    # -- API 接口(限流) --
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        limit_conn conn_limit 100;
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # 隐藏后端信息
        proxy_hide_header X-Powered-By;
        # 超时控制
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }

    # -- 登录接口(严格限流) --
    location /api/login/ {
        limit_req zone=login_limit burst=5 nodelay;
        proxy_pass http://backend;
    }

    # -- 上传接口 --
    location /api/upload/ {
        client_max_body_size 100m;
        client_body_timeout 300s;
        proxy_pass http://backend;
    }

    # -- 健康检查 --
    location = /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }

    # -- 自定义限流错误 --
    error_page 429 @rate_limit;
    location @rate_limit {
        return 429 '{"code":429,"msg":"请求过于频繁，请稍后再试"}';
        add_header Content-Type application/json;
    }
}
```
**总结**：Nginx 安全防护的本质是 “在流量进入应用之前，通过配置规则完成过滤、限制和加固” —隐藏版本、限制方法、控制访问、限流防刷、加密传输、添加安全头，层层递进构建完整的 Web 安全防线。
