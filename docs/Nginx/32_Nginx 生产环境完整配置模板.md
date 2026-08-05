适用场景：小中大型生产项目，涵盖 HTTP/HTTPS、反向代理、负载均衡、静态缓存、限流、SSL 安全加固、日志切割、监控告警、容错兜底。

## 一、文件结构
```
/etc/nginx/
├── nginx.conf                          # 主配置文件
├── conf.d/
│   └── example.com.conf                # 站点配置(按域名区分)
├── ssl/
│   ├── example.com.crt                 # 证书文件
│   └── example.com.key                 # 私钥文件(权限 600)
├── .htpasswd                           # 基础认证(可选)
└── snippets/
    ├── security.conf                   # 安全头配置片段
    └── ssl.conf                        # SSL 配置片段(可复用)
```

## 二、主配置文件
/etc/nginx/nginx.conf 的参考模板，根据自己情况而修改。
```
# ============================================
# Nginx 生产环境主配置文件
# ============================================

# -- --- 运行用户与进程 -- ---
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;

# -- --- 错误日志(全局) -- ---
error_log /var/log/nginx/error.log warn;

# -- --- PID -- ---
pid /var/run/nginx.pid;

# -- --- 事件驱动模型 -- ---
events {
    use epoll;
    worker_connections 4096;
    multi_accept on;
}

# -- --- HTTP 核心配置 -- ---
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # ============================================
    # 1. 日志格式
    # ============================================

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    '$request_time $upstream_response_time';

    # ============================================
    # 2. 性能调优
    # ============================================

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    client_body_timeout 30s;
    client_header_timeout 30s;

    # 请求体大小限制(全局默认 1MB，上传接口单独放宽)
    client_max_body_size 1m;

    # ============================================
    # 3. Gzip 压缩
    # ============================================

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 3;                      # 平衡 CPU 与压缩率
    gzip_types text/plain text/css text/xml
           application/json application/javascript
           application/xml application/rss+xml
           font/woff2 image/svg+xml;           

    # ============================================
    # 4. 安全防护(基础)
    # ============================================

    server_tokens off;                      # 隐藏 Nginx 版本

    # 安全响应头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    # 强制 HTTPS，告诉浏览器在接下来 6 个月内只用 HTTPS 访问
    add_header Strict-Transport-Security "max-age=15552000; includeSubDomains; preload" always;

    # ============================================
    # 5. 限流(定义)
    # ============================================

    # 按 IP 限流：每秒 10 个请求，突发 20 个排队
    limit_req_zone $binary_remote_addr zone=global_limit:10m rate=10r/s;
    # 触发限流时返回 429
    limit_req_status 429;   

    # 按 IP 限制并发连接数：每个 IP 最多 100 个连接
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
    # 触发连接限制时返回 429
    limit_conn_status 429;  
    

    # ============================================
    # 6. 引入站点配置
    # ============================================

    include /etc/nginx/conf.d/*.conf;
}

# ============================================
# 7. 四层代理(stream)— 可选
# ============================================

# stream {
#     include /etc/nginx/stream.d/*.conf;
# }
```

## 三、站点配置文件
/etc/nginx/conf.d/example.com.conf，仅供参考，根据自己情况而修改。
```
# ============================================
# 站点配置：example.com
# 使用前替换以下占位符：
#   {项目名}   → 你的项目名称
#   {域名}     → 你的域名(如 example.com)
#   {后端IP}   → 后端服务器 IP
#   {证书路径} → SSL 证书路径
# ============================================

# -- --- 1. 后端服务器组(负载均衡) -- ---
upstream {项目名}_backend {
    least_conn;                             # 最少连接算法
    server 127.0.0.1:8080 weight=3 max_fails=3 fail_timeout=30s;
    # server {后端IP2}:8080 weight=2 max_fails=3 fail_timeout=30s;   # 扩容时取消注释
    # server {后端IP3}:8080 weight=1 max_fails=3 fail_timeout=30s;   # 扩容时取消注释
    # server {后端IP4}:8080 backup;
    keepalive 64;                           # 上游长连接数
}

# -- --- 2. HTTP 强制跳转 HTTPS -- ---
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name {域名} www.{域名};

    # 限流：防止 HTTP 入口被刷
    limit_req zone=global_limit burst=20 nodelay;

    # 强制跳转 HTTPS
    return 301 https://$server_name$request_uri;
}

# -- --- 3. HTTPS 服务(核心) -- ---
server {
    # 1.25之前的版本写法
    # listen 443 ssl http2 default_server;
    # listen [::]:443 ssl http2 default_server;
    # 1.25版本后的写法
    listen 443 ssl default_server;   
    listen [::]:443 ssl default_server;
    http2 on;
    
    # 设置域名
    server_name {域名} www.{域名};

    # ============================================
    # 3.1 SSL 证书配置
    # ============================================

    ssl_certificate /etc/nginx/ssl/{域名}.crt;
    ssl_certificate_key /etc/nginx/ssl/{域名}.key;

    # SSL 安全加固(现代最佳实践)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # ============================================
    # 3.2 日志(按站点独立)
    # ============================================

    access_log /var/log/nginx/{项目名}_access.log main;
    error_log /var/log/nginx/{项目名}_error.log;

    # ============================================
    # 3.3 根目录(静态文件)
    # ============================================

    root /var/www/{项目名};
    index index.html index.htm;

    # ============================================
    # 3.4 静态资源(长期缓存)
    # ============================================

    location ~* \.(jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location ~* \.(css|js)$ {
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    # ============================================
    # 3.5 API 反向代理(核心)— 已合并为一个 location
    # ============================================

    location /api/ {
        # -- --- 限流(启用) -- ---
        limit_req zone=global_limit burst=20 nodelay;
        limit_conn conn_limit 300;              # 每个 IP 最多 300 个并发连接

        # -- --- 代理转发 -- ---
        proxy_pass http://{项目名}_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        # -- --- 透传客户端信息 -- ---
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # -- --- 超时控制(按场景调整) -- ---
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;

        # -- --- 请求体大小(上传接口单独放宽) -- ---
        client_max_body_size 1m;

        # -- --- 故障转移 -- ---
        proxy_next_upstream error timeout http_500 http_502 http_503 http_504;

        # -- --- 容错兜底：拦截后端错误，由 Nginx 处理 -- ---
        proxy_intercept_errors on;              # ← 合并到这里
        # error_page 已移到 server 级别统一处理
    }

    # -- --- 上传接口(单独放宽限制) -- ---
    location /api/upload/ {
        client_max_body_size 100m;
        proxy_pass http://{项目名}_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;                # 上传超时设长一些
    }

    # ============================================
    # 3.6 SPA 路由兜底(前端项目)
    # ============================================

    location / {
        limit_req zone=global_limit burst=20 nodelay;
        try_files $uri $uri/ /index.html;
    }

    # ============================================
    # 3.7 健康检查(配合监控系统)
    # ============================================

    location = /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }

    # ============================================
    # 3.8 错误页面(server 级别统一处理)
    # ============================================

    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    location = /404.html {
        root /var/www/{项目名}/errors;
        internal;
    }

    location = /50x.html {
        root /var/www/{项目名}/errors;
        internal;
    }

    # -- --- 后端全挂时的 JSON 兜底响应(可选) -- ---
    # error_page 502 503 504 = @fallback;
    # location @fallback {
    #     return 503 '{"code":503,"msg":"系统维护中，请稍后再试"}';
    #     add_header Content-Type application/json;
    # }
}
```

## 四、日志切割
运维配套：做日志切割，路径 /etc/logrotate.d/nginx，主要防止日志爆满。
```
/var/log/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 nginx adm
    postrotate
        if [ -f /var/run/nginx.pid ]; then
            kill -USR1 `cat /var/run/nginx.pid`
        fi
    endscript
}
```

## 五、数据采集
运维配套：监控采集，`stub_status` + Prometheus+zabbix
### 5.1 在站点配置中增加 `stub_status` 端点
```
# 在站点配置文件的 server 块中添加
location = /nginx_status {
    stub_status on;
    access_log off;
    allow 127.0.0.1;        # 只允许本机访问
    allow 10.0.0.0/8;       # 允许内网网段(根据需要)
    deny all;
}
```
### 5.2 配合 Prometheus Exporter
```
# 安装 nginx-prometheus-exporter
docker run -d --restart=always \
  -p 9113:9113 \
  nginx/nginx-prometheus-exporter:latest \
  -nginx.scrape-uri=http://127.0.0.1/nginx_status
```
### 5.3 Zabbix 监控模板
Zabbix 官方提供 Nginx 监控模板，通过 stub_status 采集数据，配置后即可监控连接数、请求数等指标。

## 六、安全加固
### 6.1 SSL 私钥权限
```
# 安装证书后执行
chmod 600 /etc/nginx/ssl/{域名}.key
chown root:root /etc/nginx/ssl/{域名}.key
```
### 6.2 模板使用检查清单
| 检查项 | 说明 |
|--------|------|
| ☐ 替换 {项目名} | 所有出现的地方保持一致 |
| ☐ 替换 {域名} | 实际域名，如 `example.com` |
| ☐ 替换 {后端IP} | 后端服务器内网 IP |
| ☐ 配置 SSL 证书 | 证书路径正确，私钥权限 `600` |
| ☐ 调整 `worker_connections` | 根据服务器配置调整(如 `10240`) |
| ☐ 调整 `keepalive` | 根据后端服务器数量调整(如 `64`) |
| ☐ 调整 `limit_req rate` | 根据业务 QPS 调整(如 `10r/s`) |
| ☐ 配置日志切割 | 检查 `logrotate` 配置 |
| ☐ 配置监控告警 | `stub_status` + Prometheus / Zabbix |
| ☐ 测试配置并生效 | `nginx -t && systemctl reload nginx` |

