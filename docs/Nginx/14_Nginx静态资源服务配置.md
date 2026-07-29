## 一、什么是静态资源服务
### 1.1 静态资源的概念
静态资源指的是在服务器端存储的、内容不会频繁变化的文件。这些文件在服务器端被写入后，除非进行人为修改，否则一般不会发生变化。
常见的静态资源包括：

| 类型      | 文件格式                      | 说明       |
| - | - | -- |
| HTML 文档 | .html、.htm                | 网页的结构和内容 |
| 样式文件    | .css                      | 网页的样式和布局 |
| 脚本文件    | .js                       | 网页的交互逻辑  |
| 图片文件    | .jpg、.png、.gif、.svg、.webp | 网页的视觉元素  |
| 字体文件    | .woff、.woff2、.ttf         | 网页的自定义字体 |
| 视频/音频   | .mp4、.webm、.mp3           | 多媒体内容    |
### 1.2 Nginx做静态资源服务作用
Nginx 凭借其轻量级、高性能和灵活配置的特性，已成为静态资源托管的首选工具。相比传统 Web 服务器(如 Apache)，Nginx 采用异步事件驱动架构，在处理高并发静态资源请求时，可降低 30%~50% 的内存占用。

**Nginx 处理静态资源的优势**：
1. 极快的响应速度：通过零拷贝(sendfile)技术，直接从内核空间传输文件
2. 极高的并发能力：事件驱动模型可同时处理数万连接
3. 灵活的缓存控制：通过 expires 和 Cache-Control 精准控制浏览器缓存
4. 传输体积优化：内置 Gzip 压缩模块，压缩率可达 60%~80%
5. 配置简单：几行配置即可完成静态资源服务搭建

## 二、基础配置
### 2.1 最简静态资源服务器配置
在 /etc/nginx/conf.d/ 目录下创建一个配置文件(如 static.conf)，写入以下内容：
```
server {
    listen 80;
    server_name static.example.com;

    # 静态资源根目录
    root /var/www/static;

    # 默认首页文件
    index index.html index.htm;

    # 请求处理
    location / {
        try_files $uri $uri/ =404;
    }
}
```
**配置逐行解释**：
1. listen 80，监听 80 端口(HTTP 默认端口)
2. server_name static.example.com; 绑定域名，只有访问该域名的请求才会匹配此配置
3. root /var/www/static;  指定静态资源的根目录。当请求 /images/logo.png 时，Nginx 会在 /var/www/static/images/logo.png 查找文件
4. index index.html index.htm; 当请求的是一个目录(如 / 或 /about/)时，按顺序查找默认首页文件
5. try_files $uri $ uri/ =404; 按顺序尝试：先找文件($ uri)，再找目录($uri/)，都不存在则返回 404
### 2.2 验证配置
配置完成后，执行以下命令验证并生效：
```
# 检查配置文件语法
nginx -t

# 重载配置(不中断服务)
systemctl reload nginx
```
**命令解释**：
nginx -t：检查配置文件语法是否正确，输出 test is successful 即为正常
systemctl reload nginx：平滑重载配置，无需重启 Nginx
### 2.3 root 与 alias 的区别
在静态资源配置中，root 和 alias 是两个容易混淆的指令：

| 指令 | 行为 | 示例 |
|------|------|------|
| `root` | 将 URI 拼接到 root 路径后面 | `root /var/www;` + `/images/1.jpg` → `/var/www/images/1.jpg` |
| `alias` | 用 alias 路径替换 URI 中匹配的部分 | `alias /var/www/static/;` + `/images/1.jpg` → `/var/www/static/1.jpg` |

**使用建议**：
```
# root：适用于整个站点或大部分路径共用同一根目录
location / {
    root /var/www/html;
}

# alias：适用于将特定 URL 路径映射到不同的物理目录
location /images/ {
    alias /data/pictures/;
    # 请求 /images/logo.png → 读取 /data/pictures/logo.png
}
```
⚠️ **注意**：alias 的路径结尾斜杠需要与 location 的匹配规则对应，否则容易出现路径拼接错误。

## 三、性能优化
### 3.1 开启零拷贝传输(sendfile)
sendfile 是 Nginx 静态资源传输的核心优化指令，它通过调用系统内核的 sendfile 函数，避免了文件从内核缓冲区到用户缓冲区的多次拷贝，同时减少了用户态和内核态之间的切换。

**传统传输方式**：
```
磁盘 → 内核缓冲区 → 用户缓冲区(Nginx)→ 内核缓冲区(网卡)→ 网卡
                          ↑ 多次拷贝，CPU 介入
```
**开启 sendfile 后**：
```
磁盘 → 内核缓冲区 → 网卡
         ↑ 零拷贝，直接传输
```
**配置方法：**
```
http {
    # 开启零拷贝传输
    sendfile on;

    # 其他配置...
}
```
sendfile 可以在 http、server、location 三个层级配置。
### 3.2 优化网络数据包发送(tcp_nopush)
tcp_nopush 仅在 sendfile on; 时生效，它的作用是告诉操作系统：在数据包达到最大长度之前不要发送，从而减少网络小包的数量，提升网络利用率。

**配置方法：**
```
http {
    sendfile on;
    tcp_nopush on;   # 配合 sendfile 使用
}
```
### 3.3 降低延迟(tcp_nodelay)
tcp_nodelay 用于禁用 Nagle 算法，在有实时性要求的场景下(如动态 API、实时通信)，立即发送数据，不等待缓冲区填满。
```
http {
    tcp_nodelay on;   # 默认已开启
}
```
### 3.4 性能优化指令汇总
| 指令 | 作用 | 推荐值 | 说明 |
|------|------|--------|------|
| `sendfile` | 零拷贝传输 | `on` | 静态资源服务器必须开启 |
| `tcp_nopush` | 优化数据包发送 | `on` | 配合 `sendfile` 使用 |
| `tcp_nodelay` | 禁用 Nagle 算法 | `on` | 默认已开启，保持即可 |

## 四、缓存策略
### 4.1 为什么需要缓存
静态资源具有 “不变性” 和 “高频访问” 的特性。通过合理配置缓存，可以：
1. 减少重复请求，降低服务器负载
2. 加快用户二次访问速度
3. 节省带宽成本
### 4.2 expires — 设置缓存过期时间
expires 指令用于设置 HTTP 响应头中的 Expires 和 Cache-Control: max-age 字段，告诉浏览器和 CDN 该资源可以缓存多久。

**配置示例：**
```
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
    expires 30d;
    add_header Cache-Control "public";
}
```
### 4.3 Cache-Control 指令详解
通过 add_header Cache-Control 可以精确控制缓存行为：

| 指令值 | 含义 | 适用场景 |
|--------|------|----------|
| `public` | 允许任何中间节点(CDN、代理)缓存 | 公开的静态资源 |
| `private` | 仅浏览器可缓存，CDN 不缓存 | 用户私有数据 |
| `immutable` | 资源永不改变，跳过缓存验证 | 带哈希的文件名(如 `app.a1b2c3.js`) |
| `no-cache` | 每次需向服务器验证 | 动态内容 |
| `no-store` | 完全禁止缓存 | 敏感数据 |
### 4.4 不同资源的差异化缓存策略
```
server {
    root /var/www/html;

    # HTML 文件：短期缓存(1 小时)
    location ~* \.html$ {
        expires 1h;
        add_header Cache-Control "public";
    }

    # CSS/JS：长期缓存(1 年)，适合带哈希的文件名
    location ~* \.(css|js)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 图片：长期缓存(30 天)
    location ~* \.(jpg|jpeg|png|gif|ico|svg|webp)$ {
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    # 字体文件：长期缓存(1 年)
    location ~* \.(woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public";
    }
}
```

## 五、Gzip 压缩
### 5.1 什么是 Gzip 压缩
Gzip 是 Nginx 内置的压缩模块(ngx_http_gzip_module)，它可以在传输前将文本类资源压缩，通常压缩率可达 60%~80%。
压缩效果示例：
1. 原始 CSS 文件：100KB
2. Gzip 压缩后：约 25KB
3. 节省 75% 的带宽
### 5.2 Gzip 基础配置
```
http {
    # 开启 Gzip 压缩
    gzip on;

    # 指定需要压缩的 MIME 类型[reference:42]
    gzip_types text/plain text/css text/xml
               application/json application/javascript
               application/xml application/xml+rss
               text/javascript;

    # 最小压缩文件大小(小于 1KB 不压缩，避免 CPU 浪费)
    gzip_min_length 1024;

    # 压缩级别(1-9，5 为速度与压缩率的平衡点)
    gzip_comp_level 5;

    # 启用 Vary: Accept-Encoding 响应头
    gzip_vary on;

    # 禁用 IE6 的 Gzip(兼容性问题)
    gzip_disable "msie6";
}
```
### 5.3 Gzip 参数详解
| 参数 | 默认值 | 说明 |
|------|--------|------|
| `gzip on/off` | `off` | 开启或关闭 Gzip 压缩 |
| `gzip_types` | `text/html` | 指定需要压缩的 MIME 类型 |
| `gzip_min_length` | `20` | 最小压缩文件大小(字节)，小于此值不压缩 |
| `gzip_comp_level` | `1` | 压缩级别 1-9，级别越高压缩率越高但 CPU 消耗越大 |
| `gzip_vary` | `off` | 是否添加 `Vary: Accept-Encoding` 响应头 |
| `gzip_disable` | — | 针对特定浏览器禁用 Gzip |
| `gzip_http_version` | `1.1` | 指定启用压缩的最低 HTTP 版本 |

⚠️ **注意**：图片(JPEG、PNG 等)本身已是压缩格式，再开启 Gzip 压缩效果不明显且浪费 CPU，建议不压缩图片类资源。

## 六、日志管理
### 6.1 为什么要单独处理静态资源日志
静态资源(图片、CSS、JS)的访问量通常远大于动态请求。如果所有请求都记录在同一份日志中，会导致：
1. 日志文件过大，占用大量磁盘空间
2. 影响排查效率，动态请求的日志被淹没在大量静态请求中
3. 增加磁盘 I/O，影响服务器性能
### 6.2 关闭静态资源访问日志
对于高流量的静态资源，可以直接关闭访问日志：
```
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
    root /var/www/static;
    expires 30d;
    access_log off;   # 关闭访问日志，减少磁盘 I/O
}
```
### 6.3 静态资源独立日志
如果需要保留静态资源日志用于分析，可以单独配置：
```
server {
    # 动态请求日志(保留详细格式)
    access_log /var/log/nginx/access.log main;

    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        root /var/www/static;
        # 静态资源使用精简格式，单独存放
        access_log /var/log/nginx/static-access.log static_format;
    }
}
```
### 6.4 日志缓冲优化
```
# 启用日志缓冲，减少磁盘 I/O
access_log /var/log/nginx/access.log main buffer=32k flush=5m;
```

## 七、安全加固
### 7.1 禁用目录列表
默认情况下，如果用户访问一个没有默认首页的目录，Nginx 会尝试显示该目录下的文件列表，这可能会暴露敏感文件结构。
```
location / {
    root /var/www/static;
    autoindex off;   # 禁用目录列表(默认已禁用，显式声明更安全)
}
```
### 7.2 限制访问方法
静态资源服务器通常只需要支持 GET 和 HEAD 方法：
```
location / {
    root /var/www/static;

    # 只允许 GET 和 HEAD 方法
    if ($request_method !~ ^(GET|HEAD)$ ) {
        return 405;
    }
}
```
⚠️ **注意**：在 Nginx 中过度使用 if 可能导致性能问题，但在简单的请求方法检查场景下影响可接受。
### 7.3 隐藏 Nginx 版本号
```
http {
    server_tokens off;   # 隐藏 Nginx 版本信息
}
```

配置后，错误页面和 HTTP 响应头中的 Server 字段将不再显示具体版本号。
### 7.4 文件与目录权限
```
# 网站根目录权限
chown -R nginx:nginx /var/www/static
chmod 755 /var/www/static

# 文件权限
find /var/www/static -type f -exec chmod 644 {} \;

# 目录权限
find /var/www/static -type d -exec chmod 755 {} \;
```

## 八、综合配置示例
以下是一个生产级别的静态资源服务器完整配置：
```
# ============================================
# /etc/nginx/conf.d/static.conf
# 静态资源服务器完整配置
# ============================================

server {
    listen 80;
    server_name static.example.com;

    # 字符集
    charset utf-8;

    # 静态资源根目录
    root /var/www/static;
    index index.html index.htm;

    # ============================================
    # 性能优化
    # ============================================

    sendfile on;
    tcp_nopush on;

    # ============================================
    # Gzip 压缩
    # ============================================

    gzip on;
    gzip_types text/plain text/css text/xml
               application/json application/javascript
               application/xml application/xml+rss;
    gzip_min_length 1024;
    gzip_comp_level 5;
    gzip_vary on;

    # ============================================
    # 静态资源缓存(长期)
    # ============================================

    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    # ============================================
    # HTML 缓存(短期)
    # ============================================

    location ~* \.html$ {
        expires 1h;
        add_header Cache-Control "public";
    }

    # ============================================
    # 默认请求处理
    # ============================================

    location / {
        try_files $uri $uri/ =404;
    }

    # ============================================
    # 安全配置
    # ============================================

    # 禁用目录列表
    autoindex off;

    # 隐藏 Nginx 版本
    server_tokens off;

    # ============================================
    # 错误页面
    # ============================================

    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    location = /404.html {
        root /var/www/static/errors;
    }

    location = /50x.html {
        root /var/www/static/errors;
    }
}
```
**总结：** 将 Nginx 配置为静态资源服务器，核心是做好 “快速传输(sendfile+ tcp_nopush + Gzip)+ 合理缓存(expires + Cache-Control)+ 安全加固(禁用目录列表 + 隐藏版本号)” 三件事，让静态资源访问达到极速体验。