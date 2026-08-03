## 一、什么是动静分离
### 1.1 动静分离的概念
动静分离(Dynamic/Static Separation)是指将 Web 服务中的静态资源(如图片、CSS、JS 等无需实时计算的文件)与动态内容(如需要后端程序处理的 API 请求、页面渲染等)分开处理的一种架构模式。

静态资源：内容固定不变的文件，不需要经过后端程序处理，Nginx 可以直接读取文件系统并返回给客户端。常见类型包括：

| 类型 | 文件格式 | 说明 |
|------|----------|------|
| HTML 文档 | `.html`、`.htm` | 网页结构 |
| 样式文件 | `.css` | 网页样式 |
| 脚本文件 | `.js` | 前端交互逻辑 |
| 图片文件 | `.jpg`、`.png`、`.gif`、`.svg`、`.webp` | 视觉元素 |
| 字体文件 | `.woff`、`.woff2`、`.ttf` | 自定义字体 |
| 多媒体 | `.mp4`、`.webm`、`.mp3` | 视频和音频 |

动态内容：需要后端程序(如 Java、PHP、Python、Go)实时计算、访问数据库后生成的内容，包括 API 接口、用户登录、订单处理等。
### 1.2 为什么需要动静分离
在传统的 Web 架构中(如 Tomcat 直接提供服务)，静态资源和动态请求混在一起处理。Tomcat 虽然功能全面，但处理静态文件的效率远不及 Nginx。据测试，Nginx 处理静态资源的能力是 Tomcat 的 6 倍。
动静分离的核心价值在于：
1. 性能大幅提升：Nginx 处理静态资源效率远高于后端应用服务器，静态请求由 Nginx 直接处理，无需占用后端服务的宝贵线程资源。
2. 减轻后端压力：静态资源请求不再消耗后端服务的 CPU 和内存，后端可以专注于处理业务逻辑。
3. 架构解耦：静态资源与动态业务逻辑分离，便于独立扩展和维护。
4. 缓存友好：静态资源可以设置长期缓存，大幅减少重复请求。
5. 高可用保障：即使动态服务不可用，静态资源仍然可以正常访问。
### 1.3 动静分离的优势
使用 Nginx 实现动静分离，可以带来以下核心优势：

| 优势 | 说明 |
|------|------|
| 减少后端负载 | 静态资源由 Nginx 直接处理，后端服务只需处理动态请求 |
| 提升响应速度 | Nginx 处理静态资源极快，用户加载页面更快 |
| 节省带宽 | 配合 Gzip 压缩和缓存策略，大幅减少传输数据量 |
| 便于扩展 | 静态资源可独立部署到 CDN 或专用服务器 |
| 提高可用性 | 静态资源不受后端服务故障影响 |

## 二、动静分离的实现方式
### 2.1 核心实现思路
动静分离的实现主要依靠 Nginx 的 location 匹配规则。Nginx 根据请求的 URL 路径或文件后缀，将不同类型的请求分流到不同的处理逻辑：
```
用户请求
    │
    ▼
Nginx 接收请求
    │
    ▼
根据 location 规则判断
    │
    ├── 匹配静态资源规则(.jpg、.css、.js 等)
    │       │
    │       ▼
    │   直接读取文件系统返回(不走后端)
    │
    └── 匹配动态请求规则(/api/、.php 等)
            │
            ▼
        通过 proxy_pass 转发给后端服务器
```
### 2.2 两种实现方案
**方案一：单服务器分离(适合中小型项目)**
在同一台 Nginx 服务器上，通过不同的 location 块分别处理静态资源和动态请求。
```
server {
    listen 80;
    server_name example.com;

    # 静态资源：Nginx 直接处理
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
        root /var/www/static;
        expires 30d;
    }

    # 动态请求：转发给后端
    location / {
        proxy_pass http://127.0.0.1:8080;
    }
}
```
**方案二：多服务器分离(适合大型/高并发项目)**
静态资源部署到独立服务器或 CDN，动态请求通过负载均衡分发到后端集群。
```
# 静态资源服务器(独立域名或 CDN)
server {
    listen 80;
    server_name static.example.com;
    root /var/www/static;
    expires 1y;
}

# 动态请求服务器(反向代理到后端集群)
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://backend_cluster;
    }
}
```
对于绝大多数中小型项目，方案一已经足够，且配置更简单、维护成本更低。
## 三、动静分离的核心配置
### 3.1 静态资源处理(Nginx 直接返回)
静态资源由 Nginx 直接从文件系统读取并返回，不经过后端应用服务器。

**配置示例**：
```
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
    root /var/www/static;
    expires 30d;
    add_header Cache-Control "public";
    access_log off;
}
```
**配置逐行解释**：
1. location ~* \.(jpg|...)$，正则匹配：匹配以指定后缀结尾的请求。~* 表示不区分大小写
2. root /var/www/static; 指定静态文件根目录。请求 /images/logo.png 会读取 /var/www/static/images/logo.png
3. expires 30d; 设置浏览器缓存时间为 30 天，减少重复请求
4. add_header Cache-Control "public";允许 CDN 和浏览器缓存该资源
5. access_log off; 关闭静态资源的访问日志，减少磁盘 I/O
### 3.2 动态请求处理(转发给后端)
动态请求由 Nginx 通过 proxy_pass 转发给后端应用服务器处理。

**配置示例**：
```
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
### 3.3 root 与 alias 的区别
在配置静态资源时，root 和 alias 是两个容易混淆的指令：

| 指令 | 行为 | 示例 |
|------|------|------|
| `root` | 将 URI 拼接到 root 路径后面 | `root /data;` + `/images/1.jpg` → `/data/images/1.jpg` |
| `alias` | 用 alias 路径替换 URI 中匹配的部分 | `alias /data/static/;` + `/images/1.jpg` → `/data/static/1.jpg` |

**使用建议**：
- root 适用于整个站点或大部分路径共用同一根目录
- alias 适用于将特定 URL 路径映射到不同的物理目录

⚠️ **注意**：alias 的路径结尾斜杠需要与 location 的匹配规则对应，否则容易出现路径拼接错误。

## 四、进阶配置与优化
### 4.1 静态资源缓存策略
合理的缓存策略可以大幅减少重复请求，提升用户体验。
```
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
    root /var/www/static;

    # 长期缓存(适合带哈希的文件名)
    expires 1y;
    add_header Cache-Control "public, immutable";

    # 或短期缓存(适合可能更新的文件)
    # expires 7d;
    # add_header Cache-Control "public";
}
```
**缓存策略建议**：

| 资源类型 | 缓存时长 | 说明 |
|----------|----------|------|
| 图片、字体 | 1 年 | 内容极少变化，适合长期缓存 |
| CSS、JS(带哈希) | 1 年 | 文件名变化代表内容变化 |
| CSS、JS(不带哈希) | 7-30 天 | 可能更新，不宜过长 |
| HTML | 1 小时或更短 | 内容可能频繁变化 |

### 4.2 Gzip 压缩优化
对文本类静态资源开启 Gzip 压缩，压缩率通常可达 70%。
```
location ~* \.(css|js|svg|json|xml|txt)$ {
    root /var/www/static;
    gzip on;
    gzip_comp_level 5;
    expires 30d;
    add_header Cache-Control "public";
}
```
### 4.3 高性能传输优化
启用 Nginx 的零拷贝和网络优化特性：
```location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    root /var/www/static;

    # 零拷贝传输
    sendfile on;

    # 优化网络包发送
    tcp_nopush on;

    # 缓存控制
    expires 30d;
    add_header Cache-Control "public";
}

```
**指令说明**：
- `sendfile on;`：跳过用户态数据拷贝，直接从内核缓存发送文件。
- `tcp_nopush on;`：仅在数据包满时发送，提升网络效率。
### 4.4 使用 upstream 实现后端负载均衡
当后端有多台服务器时，可以使用 upstream 定义服务器组：
```
# 定义后端服务器组
upstream backend {
    server 127.0.0.1:8080 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8081 weight=2 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8082 backup;    # 备用服务器[reference:39]
}

server {
    listen 80;
    server_name example.com;

    # 动态请求转发到 upstream
    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 五、完整配置示例
### 5.1 生产级动静分离完整配置
```
# ============================================
# /etc/nginx/conf.d/example.com.conf
# 生产级动静分离完整配置
# ============================================

server {
    listen 80;
    server_name example.com;

    # 字符集
    charset utf-8;

    # 默认根目录(用于动态请求)
    root /var/www/html;
    index index.html index.htm;

    # ============================================
    # 静态资源：Nginx 直接处理
    # ============================================

    # 图片、字体等：长期缓存
    location ~* \.(jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot)$ {
        root /var/www/static;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;

        # 高性能传输
        sendfile on;
        tcp_nopush on;
    }

    # CSS、JS：压缩 + 缓存
    location ~* \.(css|js)$ {
        root /var/www/static;
        gzip on;
        gzip_comp_level 5;
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    # ============================================
    # API 动态请求：转发给后端
    # ============================================

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时控制
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # ============================================
    # 默认请求：SPA 应用路由
    # ============================================

    location / {
        try_files $uri $uri/ /index.html;
    }

    # ============================================
    # 错误页面
    # ============================================

    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    location = /404.html {
        root /var/www/errors;
    }

    location = /50x.html {
        root /var/www/errors;
    }
}
```
### 5.2 动静分离请求流程示例
以用户访问 `https://example.com` 为例：

| 用户请求 | Nginx 匹配规则 | 处理方式 | 实际文件/目标 |
|----------|---------------|----------|---------------|
| `/index.html` | `location /` | `try_files` 查找 | 返回 `/var/www/html/index.html` |
| `/static/css/style.css` | `~ \.(css\|js)$` | Nginx 直接返回 | 读取 `/var/www/static/css/style.css` |
| `/images/logo.png` | `~ \.(jpg\|png\|...)$` | Nginx 直接返回 | 读取 `/var/www/static/images/logo.png` |
| `/api/users` | `/api/` | 转发给后端 | `http://127.0.0.1:8080/api` |
| `/about` | `location /` | `try_files` 查找 | 不存在则返回 `/index.html`(SPA 路由) |

## 六、测试与验证
### 6.1 检查配置文件语法
```
nginx -t
```
输出 `test is successful` 表示配置正确。
### 6.2 验证静态资源是否由 Nginx 直接处理
```
# 查看响应头，确认是否包含 Nginx 的缓存头
curl -I http://example.com/static/css/style.css
```
**预期结果**：响应头中应包含 Cache-Control: public 和 Expires 字段。
### 6.3 验证动态请求是否转发到后端
```
# 查看响应头，确认是否包含后端服务的特征
curl -I http://example.com/api/health
```

预期结果：响应应来自后端服务(如 Java/Go 应用)。
### 6.4 实时查看访问日志
```
# 查看访问日志，确认静态资源请求是否被记录(如果开启了 access_log)
tail -f /var/log/nginx/access.log
```
### 6.5 检查 Nginx 错误日志
```
# 如果静态资源返回 404，检查错误日志
tail -f /var/log/nginx/error.log
```
**总结**：动静分离是 Nginx 性能优化的核心手段—通过 location 规则将静态资源与动态请求分离，让 Nginx 直接处理静态资源、转发动态请求给后端服务，从而大幅提升网站响应速度、减轻后端压力，并为缓存和 CDN 加速奠定基础。