-- -
## 一、前置条件

### 1.1 目标

- 操作系统：Rocky Linux 8 或 9
- 域名：`www.rax.com`
- 网站目录：`/data/www`
- 自动 HTTPS(Let's Encrypt)
- 资源限制(CPU/内存)
- 日志通过 `docker logs` 查看
- 符合 2026 年 Docker compose & Nginx 最佳实践

### 1.2 系统要求

- Rocky Linux 8.6+ 或 9.0+
- 公网 IP + 防火墙开放 80/443 端口
- 域名 `www.rax.com` 已正确解析到服务器公网 IP
- root 权限或 sudo 用户
-- -
## 二、安装 Docker

💡 Rocky Linux 基于 RHEL，使用 `dnf` 包管理器，需启用官方 Docker 仓库。
### 2.1 安装必要依赖
```
sudo dnf install -y dnf-plugins-core
```
### 2.2 添加 Docker 官方仓库
```
# Rocky Linux 8
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Rocky Linux 9(兼容 CentOS Stream 9)
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
```
🔍 注：Docker 官方未单独提供 Rocky 仓库，但 CentOS 仓库完全兼容 Rocky Linux。
### 2.3 安装 Docker Engine 和 Compose Plugin
```
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```
### 2.4 启动 Docker 并设置开机自启
```
sudo systemctl enable --now docker
```
### 2.5 将当前用户加入 `docker` 组
```
sudo usermod -aG docker $USER
newgrp docker  # 刷新组权限(或重新登录 SSH)
```
### 2.6 验证安装
```
docker --version        # 应 ≥ 24.0
docker compose version  # 应 ≥ v2.23.0(如 v2.27.0)
```

```
Docker version 25.0.3, build 44e9ca7
Docker Compose version v2.27.0
```
-- -
## 三、配置防火墙(firewalld)

Rocky Linux 默认启用 `firewalld`，需开放 HTTP/HTTPS

```
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

```
sudo firewall-cmd --list-services | grep -E 'http|https'
```
-- -
## 四、准备网站目录

```
sudo mkdir -p /data/www
echo '<h1>Welcome to www.rax.com</h1>' | sudo tee /data/www/index.html
sudo chmod -R 755 /data/www
sudo chown -R root:root /data/www  # Nginx 容器内以 nginx 用户运行，只需可读
```
-- -
## 五、创建 Nginx 配置目录

```
sudo mkdir -p /data/nginx/{conf.d,webroot,certs}
```

```
/data/
├── www/
└── nginx/
    ├── compose.yml
    ├── nginx.conf
    └── conf.d/
        └── rax.com.conf
```
-- -
## 六、编写主配置`nginx.conf`

```
# /data/nginx/nginx.conf
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;

error_log /dev/stderr warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /dev/stdout main;
    error_log  /dev/stderr warn;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 100;

    server_tokens off;
    client_max_body_size 20M;
    client_body_buffer_size 128k;
    reset_timedout_connection on;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    location ~ /\.(env|git|ht) {
        deny all;
    }

    include /etc/nginx/conf.d/*.conf;
}
```

✅ 关键：日志输出到 `/dev/stdout` 和 `/dev/stderr`，由 Docker 引擎捕获。
-- -
## 七、编写站点配置`rax.com.conf`

```
server {
    listen 80;
    server_name www.rax.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name www.rax.com;

    ssl_certificate /etc/nginx/ssl/live/www.rax.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/live/www.rax.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;

    add_header Strict-Transport-Security "max-age=63072000" always;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```
-- -
## 八、编写 `compose.yml`

```
# /data/nginx/compose.yml

services:
  nginx:
    image: nginx:alpine
    container_name: nginx-web
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    mem_limit: 256m
    mem_reservation: 64m
    cpus: 0.5
    volumes:
      - /data/www:/var/www/html:ro
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./conf.d:/etc/nginx/conf.d:ro
      - ./certs:/etc/nginx/ssl:ro
      - ./webroot:/var/www/certbot:rw
    depends_on:
      certbot:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost"]
      interval: 30s
      timeout: 10s
      retries: 3

  certbot:
    image: certbot/certbot
    container_name: certbot
    restart: on-failure
    volumes:
      - ./certs:/etc/letsencrypt
      - ./webroot:/var/www/certbot
    command: >
      certonly --webroot --webroot-path=/var/www/certbot
      --email admin@rax.com --agree-tos --no-eff-email
      --non-interactive
      -d www.rax.com
```

⚠️ 注意：不要使用 `deploy` 字段，它在非 Swarm 模式下无效。使用 `mem_limit` 和 `cpus`。
-- -
## 九、首次部署与证书申请

### 9.1 启动服务

```
cd /data/nginx
docker compose up -d
```

### 9.2 验证 80 端口可访问(用于 ACME)

```
curl -I http://www.rax.com
# 应返回 301(跳转 HTTPS)或 404(如果 challenge 不存在)
```

### 9.3申请 Let's Encrypt 证书

```
docker compose run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  --email admin@rax.com --agree-tos --no-eff-email \
  --non-interactive -d www.rax.com
```

✅ 成功提示：`Congratulations! Your certificate and chain have been saved...`

### 9.4 重载 Nginx

```
docker compose exec nginx nginx -s reload
```
-- -
## 十、验证与日常运维

### 10.1 访问网站

- 浏览器打开：`https://www.rax.com`
- 应显示绿色锁图标 + 欢迎页面

### 10.2 查看日志

```
# 实时日志
docker compose logs -f nginx

# 错误日志
docker compose logs nginx 2>&1 | grep -i error
```

### 10.3 检查资源使用

```
docker stats nginx-web
```

### 10.4 设置自动续签

```
# 创建续签脚本
cat > /data/nginx/renew.sh <<'EOF'
#!/bin/bash
cd /data/nginx
docker compose run --rm certbot renew --quiet
docker compose exec nginx nginx -s reload
EOF

chmod +x /data/nginx/renew.sh

# 添加到系统 cron
echo "0 2 1 * * root /data/nginx/renew.sh" | sudo tee -a /etc/crontab
```
-- -
## 十一、总结

### 11.1 安全建议

| 项目        | 操作                                                   |
| -- --- --- - | -- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- -- |
| SELinux   | 默认启用，但 Docker 已自动处理上下文，无需禁用                          |
| firewalld | 已配置开放 80/443                                         |
| 更新系统      | `sudo dnf update -y` 定期执行                            |
| 审计日志      | 可选：`sudo auditctl -w /data/www -p wa -k web_content` |

✅ 不要禁用 SELinux！现代 Docker 与 SELinux 兼容良好。

### 11.2 资源规划

| 资源  | 推荐值    | 说明            |
| -- - | -- --- - | -- --- --- --- -- |
| 内存  | 256 MB | 足够应对 5000+ 日活 |
| CPU | 0.5 核  | 留余量防突发流量      |
| 磁盘  | <50 MB | 仅配置+证书，无日志写入  |
