在配置文件目录下，Nginx 默认的主配置文件是 nginx.conf，这也是 Nginx 唯一的默认配置入口。以 1.24 版本为例
1. 包管理器安装的目录是/etc/nginx/nginx.conf
2. 源码编译安装的目录是/usr/local/nginx/conf/nginx.conf

## 一、名词定义

### 1.1 配置指令
在配置文件中，由 Nginx 约定的内部固定字符串，Nginx 官方文档中的英文单词为 directive，本教程中则统一称为配置指令，简称指令。**指令是 Nginx 中功能配置的最基本元素**，Nginx 的每个功能配置都是通过多个不同的指令组合来实现的。
### 1.2 配置指令值
每个配置指令都有对应的内容来表示该指令的控制参数，本教程中约定其对应的内容为配置指令值，简称指令值。指令值可以是字符串、数字或变量等多种类型。
### 1.3 配置指令语句
指令与指令值组合构成指令语句。一条指令语句可以包含多个配置指令值，在 Nginx 配置文件中，每条指令语句都要用 `;` 作为语句结束的标识符。
### 1.4 配置指令域 
配置指令值有时会是由 `{ }` 括起来的指令语句集合，本教程中约定 `{ }` 括起来的部分为配置指令域，简称指令域。指令域既可以包含多个指令语句，也可以包含多个指令域。
### 1.5 配置全局域
配置文件 nginx.conf 中上层没有其他指令域的区域被称为配置全局域，简称全局域。

## 二、文件目录
### 2.1 目录
```
/etc/nginx/
├── conf.d/                    # 用户自定义配置目录
├── fastcgi_params             # FastCGI 参数模板，已被fastcgi.conf替代
├── mime.types                 # MIME 类型映射
├── modules -> ../../usr/lib64/nginx/modules 		# 动态模块目录(软链接)
├── nginx.conf                 # 主配置文件
├── scgi_params                # SCGI 参数模板(已过时)
├── uwsgi_params               # uWSGI 参数模板(用于 Python 应用，如 Django、Flask)
```

### 2.2 目录解析
1. **conf.d/**：用户自定义配置目录。Nginx 主配置文件通过 `include /etc/nginx/conf.d/*.conf;` 自动加载该目录下所有 `.conf` 文件，每个站点可独立成一个配置文件，便于管理和维护。
2. **fastcgi_params**：FastCGI 参数模板文件。Nginx 通过 FastCGI 协议与 PHP-FPM 等后端通信时，引用此文件向 FastCGI 服务器传递 CGI 环境变量(如 `SCRIPT_FILENAME`、`QUERY_STRING` 等)。部分发行版提供了 `fastcgi.conf`(比 `fastcgi_params` 多一行 `SCRIPT_FILENAME` 定义)，两者功能相似，选其一即可。
3. **mime.types**：MIME 类型映射表。Nginx 会根据服务端文件后缀名在映射关系中获取对应的文件类型，并将文件类型添加到 HTTP 响应头的 `Content-Type` 字段中，告诉浏览器如何解析该文件。
4. **modules**：动态模块目录(软链接)，指向 `/usr/lib64/nginx/modules`。存放可动态加载的 Nginx 模块(如 `ngx_http_image_filter_module.so`)，通过 `load_module` 指令加载。
5. **nginx.conf**：Nginx 默认的配置入口文件。包含全局配置(`worker_processes`、`worker_connections` 等)和 `http` 块内的通用配置，并通过 `include` 指令加载其他配置文件。
6. **scgi_params**：SCGI 参数模板文件。Nginx 在配置 SCGI 代理服务时，根据此文件向 SCGI 服务器传递变量。SCGI 是一种类似 FastCGI 的简单协议，现已基本过时，现代项目中极少使用。
7. **uwsgi_params**：uWSGI 参数模板文件。Nginx 在配置 uWSGI 代理服务时，根据此文件向 uWSGI 服务器传递变量，常用于 Python Web 应用(如 Django、Flask)的部署。
**说明：** 
对于绝大多数常规使用场景(比如跑 PHP、Python、静态网站、反向代理)，确实只需要关心 `nginx.conf` 和 `conf.d/` 下的站点配置，其他文件保持默认即可

## 三、指令域
### 3.1 常见指令域

| 域名称 | 域类型 | 域说明 |
|--------|--------|--------|
| `main` | 全局域 | Nginx 的根级别指令区域。该区域的配置指令是全局有效的，该指令名为隐性显示，`nginx.conf` 的整个文件内容都写在该指令域中 |
| `events` | 指令域 | Nginx 事件驱动相关的配置指令域 |
| `http` | 指令域 | Nginx HTTP 核心配置指令域，包含客户端完整 HTTP 请求过程中每个过程的处理方法的配置指令 |
| `upstream` | 指令域 | 用于定义被代理服务器组的指令区域，也称"上游服务器" |
| `server` | 指令域 | Nginx 用来定义服务 IP、绑定端口及服务相关的指令区域 |
| `location` | 指令域 | 对用户 URI 进行访问路由处理的指令区域 |
| `stream` | 指令域 | Nginx 对 TCP 协议实现代理的配置指令域 |
| `types` | 指令域 | 定义被请求文件扩展名与 MIME 类型映射表的指令区域 |
| `if` | 指令域 | 按照选择条件判断为真时使用的配置指令域 |

**正确的顶层结构**
```
# ============================================
# main 域(全局，隐式存在，不需要写花括号)
# ============================================

user nginx;
worker_processes auto;

# ============================================
# events 域：与 http 并列，不能放入 http 内部
# ============================================

events {
    # 事件驱动模型配置
}


# ============================================
# http 域：与 events 并列，不能放入 events 内部
# ============================================

http {
    # 日志格式、MIME 类型、性能调优等通用配置
    # include /etc/nginx/mime.types;     # MIME 类型推荐用 include 引入


    # ============================================
    # upstream 域：只能在 http 或 stream 内部
    # ============================================

    upstream backend {
        # 后端服务器组定义
    }


    # ============================================
    # server 域：只能在 http 内部
    # ============================================

    server {
        # listen、server_name、root、index 等


        # ============================================
        # location 域：只能在 server 内部(或嵌套 location)
        # ============================================

        location / {
            # URL 路由匹配规则
        }

        location /api/ {
            # 反向代理配置
        }

        # ============================================
        # if 域(官方不推荐滥用，仅在必要时使用)
        # ============================================

        if ($request_method = POST) {
            # 条件判断
        }
    }


    # ============================================
    # 第二个 server(HTTPS 示例)
    # ============================================

    server {
        # listen 443 ssl http2;
        # ssl_certificate /path/to/cert.pem;
    }
}


# ============================================
# stream 域：与 http 并列，需编译时启用 --with-stream
# 处理 TCP/UDP 四层代理
# ============================================

stream {
    upstream tcp_backend {
        # TCP 后端服务器组
    }

    server {
        # 四层代理虚拟主机
    }
}
```
### 3.2 指令域关系图
```
main (顶级)                           # 配置文件最外层，隐式存在
├── events (顶级)                     # 事件驱动模型配置
├── http (顶级)                       # HTTP/HTTPS 协议配置
│   ├── upstream (二级)               # 后端服务器组定义
│   ├── server (二级)                 # 虚拟主机
│   │   ├── listen 80;               # 监听端口(普通指令)
│   │   ├── server_name example.com; # 域名(普通指令)
│   │   ├── root /var/www/html;      # 根目录(普通指令)
│   │   ├── location (三级)          # URL 路由匹配
│   │   │   ├── root /var/www/static; # 覆盖上级
│   │   │   ├── index index.html;     # 默认首页
│   │   │   └── try_files $uri $uri/ =404;
│   │   ├── location (三级)          # 可多个 location
│   │   │   └── proxy_pass http://backend;
│   │   ├── if (三级)               # 条件判断(官方不推荐滥用)
│   │   └── types (三级)            # MIME 类型(可在各级定义，不推荐)
│   └── include mime.types;          # 常规做法：引入外部文件
└── stream (顶级)           # TCP/UDP 代理配置(编译时启用--with-stream模块)
    └── server (二级)                # 四层代理虚拟主机
        └── listen 80;               # 监听端口
```

| 指令域 | 允许出现的位置 | 说明 |
|--------|----------------|------|
| `events` | 只能位于 `main`(全局) | **不能**放在 `http`、`server`、`location` 内部 |
| `http` | 只能位于 `main`(全局) | **不能**放在 `events`、`server`、`location` 内部 |
| `stream` | 只能位于 `main`(全局) | 与 `http` 平级 |
| `server` | 只能位于 `http` 或 `stream` 内部 | 不能直接放在 `main` 或 `events` 或 `location` 内部 |
| `location` | 只能位于 `server` 内部，或另一个 `location` 内部(嵌套) | |
| `upstream` | 只能位于 `http` 内部 | |
| `types` | 只能位于 `http`、`server` 或 `location` 内部 | 通常放在 `http` 内 |

- **顶级块**(`main` 下直接写)：`events`、`http`、`stream`、`mail` 等，它们**互相并列，不能嵌套**。
- **二级块**：`server`(在 `http` 或 `stream` 内)、`upstream`(在 `http` 内)。
- **三级块**：`location`(在 `server` 内)。

### 3.3 nginx.conf 解析
```
user nginx;                        # main 域：指定 Nginx worker 进程运行的操作系统用户
worker_processes auto;             # main 域：worker 进程数量，auto 表示自动匹配 CPU 核心数
error_log /var/log/nginx/error.log; # main 域：全局错误日志路径
pid /run/nginx.pid;                # main 域：Nginx 主进程的 PID 文件位置

# Load dynamic modules. See /usr/share/doc/nginx/README.dynamic. 
include /usr/share/nginx/modules/*.conf; # main 域：引入动态模块配置(如第三方模块)

# events 域：事件驱动相关配置
events {                         
    worker_connections 1024; #  每个 worker 进程最大并发连接数
}

# http 域：HTTP 协议相关的核心配置
http {
    # 定义访问日志格式，名为 main
    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';
    
    access_log  /var/log/nginx/access.log  main;  # 使用 main 格式记录访问日志

    sendfile            on;            # 启用高效文件传输(直接在内核态拷贝)
    tcp_nopush          on;            # 在 sendfile 开启时，优化网络包发送(合并包)
    tcp_nodelay         on;            # 禁用 Nagle 算法，小数据包实时发送
    keepalive_timeout   65;            # 客户端 keep-alive 连接超时时间(秒)
    types_hash_max_size 2048;          # MIME 类型哈希表的最大大小
    
    # 引入 mime.types 文件(扩展名→MIME 映射)
    include             /etc/nginx/mime.types;  
    # 默认 MIME 类型(未知类型当作二进制流)
    default_type        application/octet-stream;

    # 引入 /etc/nginx/conf.d/ 下所有 .conf 文件(用户自定义站点配置)
    include /etc/nginx/conf.d/*.conf;
    
    
    # server 域：定义一个虚拟主机
    server {
        listen       80 default_server;   # 监听 IPv4 的 80 端口，作为默认服务器
        listen       [::]:80 default_server;   # 监听 IPv6 的 80 端口
        server_name  _;                   # 匹配所有未明确指定的域名(_ 是非法域名的占位符)
        root         /usr/share/nginx/html;    # 网站根目录

        # Load configuration files for the default server block.
        include /etc/nginx/default.d/*.conf; # 引入默认站点的额外配置片段

        # location 域：处理根路径 `/` 的请求
        # 空块，无额外指令，直接返回 root 下的 index 文件(默认 index.html)
        location / {
        }
        
        # 自定义 404 错误页面
        error_page 404 /404.html;
            location = /40x.html {   # 精确匹配 /40x.html 的 location
        }
        
        # 自定义 5xx 错误页面
        error_page 500 502 503 504 /50x.html;
            location = /50x.html {
        }
    }

}
```

## 四、指令
### 4.1 listen 指令
| 名称   | 端口监听指令               |
| - | -- |
| 指令   | listen               |
| 作用域  | server               |
| 默认值  | listen*:80 或 *:8000  |
| 指令说明 | 服务监听端口、绑定 IP、监听方式的配置 |
```
http{
server{
    listen 80 default_server;   # 监听 IPv4 的 80 端口，作为默认服务器
    listen [::]:80 default_server;   # 监听 IPv6 的 80 端口
  }
}

```
### 4.2 server_name 指令
Nginx 中的 server_name 指令主要用于配置基于名称的虚拟主机，其说明如下表所示:

| 名称 | 主机名指令 |
|------|------------|
| 指令 | `server_name` |
| 作用域 | `server` |
| 默认值 | -- |
| 指令说明 | 设定所在 server 指令域的主机名 |
```
http{
  server{
    server_name fmc.com www.fmc.com;
  }
}
```
### 4.3 root 指令
用户请求的最终结果是要返回数据，当响应文件在 Nginx 服务器本地时，需要进行本地文件位置、读或写、返回执行结果的操作。Nginx 中的 root 指令可以设定请求 URL 的本地文件根目录，如下表所示。

| 名称   | 根目录指令                  |
| - | - |
| 指令   | root                   |
| 作用域  | http, server, location |
| 默认值  | on                     |
| 指令说明 | 设定请求 URL 的本地文件根目录      |
```
http{
  server{
   root         /usr/share/nginx/html;    # 网站根目录
  }
}
```
### 4.4 try_files 指令
try_files 指令是在 Nginx0.7.27 版本中开始加入的，它可以按顺序检查文件是否存在，并返回第一个找到的文件，如果未找到任何文件，则会调用最后一个参数进行内部重定向，如下表所示:

| 名称 | 文件判断指令 |
|------|--------------|
| 指令 | `try_files` |
| 作用域 | `server`、`location` |
| 默认值 | -- |
| 指令说明 | 用于顺序检查指定文件是否存在，如果不存在，则按照最后一个指定 URI 做内部跳转 |
```
http{
  server{
    location / {
        try_files $uri  /index.php?$args;
    }
  }
}
```
**说明:**
- 检查顺序：
    1. `$uri` 对应的文件是否存在(如 `/about` 这个文件)
    2. 如果不存在，直接落到 `/index.php?$args`(内部重写到 index.php，带上原始查询参数)
- 不检查 URI 是否为目录(例如 `/about/` 或有无 index 文件)
```
http{
  server{
    location / {
        try_files $uri $uri/ /index.php?$args;
    }
  }
}
```
- 检查顺序：
    1. `$uri` 对应的文件是否存在
    2. `$uri/` 对应的**目录**是否存在(且需要与 `index` 指令配合，才会查找目录内的 index 文件)
    3. 如果前两者都不存在，落到 `/index.php?$args`
### 4.5 expires 指令
Nginx 缓存的设置可以提高网站性能，对于网站的图片，尤其是新闻网站，图片一旦发布，改动的可能是非常小的，为了减小对服务器请求的压力，提高用户浏览速度，我们可以通过设置 Nginx 中的 expires 指令，让用户访问一次后，将图片缓存在用户的浏览器中。
```
location ~* \.(?:jpg|jpeg|gif|bmp|ico|png|css|js|svg|mjs|woff|woff2|ttf|eot|otf|ogg|mp4|webm|wav|mp3)$ {
        try_files $uri /index.php?$args;   # 不存在时交给 index.php 处理(动态主题)
        access_log off;    #
        expires 30d;       #30天缓存
        add_header Cache-Control "public, immutable";
    }
```
**解释说明:**
1. location ~* \.(........)$
- **`~*`**：表示**正则匹配**，且 **不区分大小写**(`*` 表示 case-insensitive)。
- **正则内容**：匹配 URI 以括号内列出的文件扩展名**结尾**。`(?: ... )` 是非捕获分组，用于列出扩展名，避免影响性能或变量捕获。常见的静态资源类型都涵盖了：
    - 图片：`jpg`, `jpeg`, `gif`, `bmp`, `ico`, `png`, `svg`
    - 脚本/样式：`css`, `js`, `mjs` (ES module)
    - 字体：`woff`, `woff2`, `ttf`, `eot`, `otf`
    - 音视频：`ogg`, `mp4`, `webm`, `wav`, `mp3`
- **`$`**：确保扩展名是 URI 的结尾(后面没有额外字符，除了查询参数)。
 **作用**：拦截所有对这些静态资源文件的请求。
 
 2. try_files $uri /index.php?$ args;
- 尝试直接返回 `$uri` 对应的文件(物理磁盘上的文件)。
- 如果文件不存在，**内部重定向**到 `/index.php?$args`(保留原始查询参数)。
- **为什么这样做**：某些系统(如 WordPress 或某些 PHP 框架)可能动态生成静态资源(例如动态主题中的 CSS/JS 文件，或通过 PHP 实时调整图片尺寸)。这样配置可以保证：如果文件存在就直接服务(最高性能)；不存在就交给 PHP 后端动态处理。

3. access_log off;
- 关闭该 `location` 的访问日志记录。
- **原因**：静态资源请求量通常巨大，记录日志会严重消耗磁盘 I/O 和空间，且对分析价值不大。关闭日志可以显著提升性能。

4. expires 30d;
- 设置响应头 `Expires` 和 `Cache-Control: max-age=2592000`(30 天，单位秒)。
- 告诉浏览器(和 CDN)：在 30 天内可以直接使用本地缓存，**不需要向服务器发起请求**(强缓存)。

5. add_header Cache-Control "public, immutable";
- **覆盖/补充** `Cache-Control` 头(因为 `expires` 已经设置了 `max-age`，这里添加额外的指令)。
    - `public`：允许任何中间缓存(CDN、代理)存储该响应。
    - `immutable`：**告知浏览器该资源“永远不会改变”**。即使刷新页面，浏览器也不应发起重新验证请求，直接使用缓存即可。这样可以避免强制刷新时的额外请求，进一步提高性能。
- **注意**：`immutable` 已受主流浏览器支持(Chrome、Firefox、Edge、Safari 较新版本)，但并非所有旧浏览器都识别，但不会产生副作用。
### 4.6 gzip 指令
为提高用户获取响应数据的速度，Nginx 服务器可以将响应数据进行 gzip 压缩，在减小响应数据的大小后再发送给用户端浏览器，相对于使用户浏览 Web 页面，上述方式显示速度更快。
**官方配置**
```
gzip_static always;                  # 始终发送静态的gzip压缩数据
gunzip on;                           # 若客户端浏览器不支持gzip压缩数据，则解压后发送
gunzip_buffers 16 8k;                                         # 解压缓冲区大小为128KB
gzip_proxied expired no-cache no-store private auth;    # 当被代理的服务器符合条件时，
                                                        # 对响应数据启用gzip压缩

gzip on;                             # 启用动态gzip压缩功能
gzip_min_length  1k;                 # 响应数据超过1KB时启用gzip压缩
gzip_buffers     4 16k;              # 动态压缩的缓冲区大小是64KB
gzip_comp_level 3;                   # 压缩级别为3
gzip_types       text/plain application/x-javascript
                text/css application/xml text/javascript
                application/x-httpd-php image/jpeg
                image/gif image/png; # 对指定的MIME类型数据启用动态压缩
gzip_vary on;                        # 向前端代理或缓存服务器发送添加"Vary: Accept-
                                     # Encoding"的响应数据
```
**自己配置**
```
http{
  gzip_static on;   # 优先使用 .gz 文件，建议仅放在静态资源的 location 块中
  gunzip on;        # 可选：兼容不支持gzip的客户端，建议仅放在静态资源的 location 块中
  
  server{
    gzip on;
    gzip_vary on;
    gzip_comp_level 4;
    gzip_min_length 1k;
    gzip_buffers 16 8k;                    # 显式设置缓冲区
    gzip_http_version 1.0;                 # 兼容 HTTP/1.0
    gzip_disable "msie6";                  # 屏蔽 IE6
    gzip_proxied expired no-cache no-store private no_last_modified no_etag auth;
    gzip_types application/atom+xml application/javascript application/json application/ld+json application/manifest+json application/rss+xml application/vnd.geo+json application/vnd.ms-fontobject application/x-font-ttf application/x-web-app-manifest+json application/xhtml+xml application/xml font/opentype image/bmp image/svg+xml image/x-icon text/cache-manifest text/css text/plain text/vcard text/vnd.rim.location.xloc text/vtt text/x-component text/x-cross-domain-policy;
  }   
}    
```
**使用建议：**
- **普通静态站点**：只需 `gzip on; gzip_types ...; gzip_min_length 1k; gzip_comp_level 5;` 即可。
- **高流量生产环境(CPU 敏感)**：推荐使用 `gzip_static always;` + 预先生成 `.gz` 文件(通过构建工具)，避免实时压缩消耗 CPU。
- **反向代理场景**：合理设置 `gzip_proxied`，避免代理大文件压缩浪费资源，或对已压缩的后端响应(如图片)二次压缩。
- **兼容老旧浏览器**：`gzip_vary on` 必须开启；`gunzip on` 可解决极少数客户端不识别 gzip 的问题(但会增加 CPU 解压负担)。
- `gzip_static on;` + `gunzip on;` 放在 `http` 块全局生效
### 4.7 alias 指令
Nginx 中想要配置虚拟目录可以使用 alias 指令，该指令的介绍如下表所示:

| 名 称  | 访问路径别名指令                                                             |
| - | -- |
| 指令   | alias                                                                |
| 作用域  | location                                                             |
| 默认值  | --(少用)                                                               |
| 指令说明 | 默认情况下，本地文件的路径是 root 指令设定根目录的相对路径，通过 alias 指令可以将匹配的访问路径重新指定为新定义的文件路径。 |
```
http{
  server{
    listen 8080;
    server_name www.fmc.com;
    root /opt/nginx-web/www;
    location /flv/ {
      alias /opt/nginx-web/flv/;
	}
	location /js {
      alias /opt/nginx-web/js;
    }
  }
}
```
### 4.8 include 指令
| 名称   | 配置文件包含指令                              |
| - | - |
| 指令   | `include`                             |
| 作用域  | 任何位置(全局、`http`、`server`、`location` 等) |
| 默认值  | —                                     |
| 指令说明 | 将外部配置文件的内容合并到当前配置中。支持通配符 `*`。         |
```
# 在 http 块中引入所有 conf.d 下的 .conf 文件
http {
    include /etc/nginx/conf.d/*.conf;
}

# 在 server 块中引入额外配置片段
server {
    include /etc/nginx/snippets/ssl.conf;
}

# 也可以直接包含单个文件
include /etc/nginx/mime.types;
```
**说明**：`include` 是 Nginx 配置模块化的核心，可以极大提高可维护性。
### 4.9 return 指令
| 名称   | 快速返回指令                              |
| - | -- |
| 指令   | `return`                            |
| 作用域  | `server`、`location`、`if`            |
| 默认值  | —                                   |
| 指令说明 | 立即返回指定的 HTTP 状态码(并可附带响应内容或重定向 URL)。 |
```
server {
    listen 80;
    # 直接返回 403 并显示自定义文本
    location /secret/ {
        return 403 "Access forbidden\n";
    }

    # 临时重定向(302)
    location /old {
        return 302 /new;
    }

    # 永久重定向(301)
    location /old-home {
        return 301 http://$host/new-home;
    }

    # 返回 404 且不输出任何内容
    location /missing {
        return 404;
    }
}
```
**说明**：`return` 比 `rewrite` 更简单高效，适合不需要复杂正则的场景。
### 4.10 rewrite 指令
访问重写 rewrite 是 Nginx HTTP 请求处理过程中的一个重要功能，它是以模块的形式存在于代码中的，其功能是对用户请求的 URI 进行 PCRE 正则重写，然后返回 30× 重定向跳转或按条件执行

| 名称 | URL 重写指令 |
|------|-------------|
| 指令 | `rewrite` |
| 作用域 | `server`、`location`、`if` |
| 默认值 | — |
| 指令说明 | 根据正则表达式修改请求 URI，并可选择重定向或内部跳转。 |

**语法：** `rewrite regex replacement [flag];`
**常用 flag：**
- `last` – 完成重写后，停止当前 `location/rewrite` 阶段，重新搜索匹配的 `location`
- `break` – 完成重写后，不再继续后续 `rewrite` 规则，直接执行当前 `location` 内其余指令
- `redirect` – 返回 302 临时重定向
- `permanent` – 返回 301 永久重定向
```
server {
    listen 80;
    # 将旧的 URL /about-us 永久重定向到 /about
    rewrite ^/about-us$ /about permanent;

    # 为所有不带尾部斜杠的目录请求添加斜杠(内部跳转，不再匹配其他 rewrite)
    rewrite ^/([^.?]+[^/])$ /$1/ break;

    # 将带 .htm 的请求转为 .html
    rewrite ^/(.*)\.htm$ /$1.html last;
}
``` 
**注意**：`rewrite` 会改变 URI，但不会影响客户端的地址栏，除非使用 `redirect` 或 `permanent`。
### 4.11 proxy_pass 指令

| 名称 | 反向代理指令 |
|------|-------------|
| 指令 | `proxy_pass` |
| 作用域 | `location`、`if`(在 location 内) |
| 默认值 | — |
| 指令说明 | 将请求转发到指定的后端服务器(HTTP 或 HTTPS 地址)。 |
```
http {
    upstream backend {
        server 192.168.1.10:8080;
        server 192.168.1.11:8080;
    }
    server {
        listen 80;
        location / {
            proxy_pass http://backend;   # 转发到 upstream 定义的服务器组
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        location /api/ {
            proxy_pass http://127.0.0.1:3000/;   # 转发到指定地址，注意尾部斜杠
        }
    }
}
```
**说明**：
- `proxy_pass` 后若带 URI(如 `http://server/api/`)，则原始请求的 URI 会被替换；
- 若不带 URI(如 `http://server`)，则完整 URI 原样转发。
### 4.12 fastcgi_pass 指令
| 名称 | FastCGI 服务转交指令 |
|------|---------------------|
| 指令 | `fastcgi_pass` |
| 作用域 | `location`、`if`(在 location 内) |
| 默认值 | — |
| 指令说明 | 将请求转发给 FastCGI 服务器(如 PHP‑FPM、Python 等)，通常与 `include fastcgi.conf` 或 `include fastcgi_params` 配合使用。 |
```
http {
    server {
        listen 80;
        root /var/www/html;
        index index.php;

        # 将 PHP 请求交给 PHP‑FPM 处理
        location ~ \.php$ {
            # 引入 FastCGI 参数(推荐 fastcgi.conf，已包含 SCRIPT_FILENAME)
            include fastcgi.conf;

            # 转发到 PHP‑FPM 监听的地址(Unix socket 或 TCP 端口)
            fastcgi_pass unix:/run/php/php8.1-fpm.sock;
            # 或使用 TCP：fastcgi_pass 127.0.0.1:9000;
        }

        # 将特定路径的请求转发到 Python FastCGI 后端
        location /python/ {
            include fastcgi_params;
            fastcgi_param SCRIPT_FILENAME /var/www/python$fastcgi_script_name;
            fastcgi_pass 127.0.0.1:8001;
        }
    }
}
```
**说明**：
- `fastcgi_pass` 后面可以跟 **Unix socket**(`unix:/path/to/sock`)或 **IP:端口**(`127.0.0.1:9000`)。
- 必须配合 `fastcgi_param` 或 `include` 文件来传递必要的参数(如 `SCRIPT_FILENAME`)。
- 推荐使用 `include fastcgi.conf;`，它比 `fastcgi_params` 多定义了 `SCRIPT_FILENAME`，可避免 404 错误。
- 与 `proxy_pass` 不同：`fastcgi_pass` 用于 FastCGI 协议(PHP‑FPM、Python‑FastCGI 等)，而 `proxy_pass` 用于普通 HTTP 协议。
### 4.13 error_page 指令
| 名称   | 错误页面重定向指令                                 |
| - | -- |
| 指令   | `error_page`                              |
| 作用域  | `http`、`server`、`location`                |
| 默认值  | —                                         |
| 指令说明 | 为指定的 HTTP 状态码定义自定义错误页面(可以是本地 URI 或外部 URL) |
```
http {
    # 通用错误页面
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    # 通过命名 location 做内部跳转
    error_page 403 /forbidden.html;
    location = /forbidden.html {
        root /usr/share/nginx/html;
        internal;   # 仅内部访问
    }

    # 重定向到外部 URL
    error_page 401 = @login;
    location @login {
        return 302 /login?redirect=$request_uri;
    }

    server {
        error_page 404 =200 /not_found_fake.html;   # 返回 404 时，实际响应 200
    }
}
```
**注意**：`error_page` 可指定“=code”来改变最终返回的状态码。


## 五、模块
### 5.1 IP 访问控制模块
Nginx 中 IP 访问控制模块名称为 ngx_http_access_module，该模块可以对客户端的源 IP 地址进行允许或拒绝访问控制。该模块的内置配置指令如下面表格中所示。
```
location / {
deny  192.168.1.1;          # 禁止192.168.1.1
allow 192.168.0.0/24;       # 允许192.168.0.0/24的IP访问
allow 10.1.1.0/16;          # 允许10.1.1.0/16的IP访问
deny  all;
}
```
### 5.2 并发连接数限制模块
Nginx 中的并发连接数限制模块(ngx_http_limit_conn_module)能够对访问连接中含有指定变量且变量值相同的连接进行计数，指定的变量可以是客户端 IP 地址或请求的主机名等。
当计数值达到 limit_conn 指令设定的值时，将会对超出并发连接数的连接请求返回指定的响应状态码(默认状态码为 503)。
```
http {
    # 定义共享内存区域 zone
    # $binary_remote_addr 用于跟踪客户端IP，比 $remote_addr 占用更少内存[reference:5]
    # 为整个虚拟主机定义一个区域
    limit_conn_zone $server_name zone=perserver:10m;
    # 为单个客户端IP定义一个区域
    limit_conn_zone $binary_remote_addr zone=perip:10m;

    server {
        listen 80;
        server_name localhost;

        # 全局限制：此虚拟主机最大并发 100 个连接[reference:100]
        limit_conn perserver 100;

        location /download/ {
            # 针对此 location 单独限制每个客户端IP的连接数[reference:1]
            limit_conn perip 1;
            # 此处可继续添加其他配置，如限速 limit_rate
        }
    }
}
```
**说明：**
1. limit_conn_zone $server_name zone=perserver:10 m;
- 极小配置(1~2个站点)：1m
- 常规(几十个站点)：10m 绰绰有余

2. limit_conn_zone $binary_remote_addr zone=perip:10 m;
- 小型站点(日活 IP < 1万)：`1m` ～ `5m`
- 中型站点(日活 IP 1万～15万)：`10m` ～ `20m`
- 大型站点(日活 IP > 15万)：按 `预计 IP 数 × 64字节` 计算，例如 50万 IP 需要约 `32m`

3. limit_conn perip 数值选择
 - 普通网站浏览(HTML/图片)：1 或 2
 - 下载服务或流媒体：5～10
- API 接口：3 ～ 10
- 严格防攻击：1

4. limit_conn perserver 数值选择
- 低配服务器(1 核 2 G)：200 ～ 500
- 中等服务器(2-4 核 4 G)：500 ～ 2000
- 高性能服务器(8 核 16 G 以上)：2000～ 10000或更高
### 5.3 首页处理模块
HTTP 请求经过一系列的请求流程处理后，最终将读取数据并把数据内容返回给用户。当用户请求没有明确指定请求的文件名称时，Nginx 会根据设定返回默认数据，实现这一功能包含 ngx_http_index_module、ngx_http_random_index_module、ngx_http_autoindex_module 这 3 个模块。在日常配置中，`index` 指令经常与 `try_files` 配合使用。
```
location / {
    index index.html;
    try_files $uri $uri/ =404;
}
```
这个配置的效果是：当请求的 URI 是 `/`(或某个目录)且 `index.html` **不存在**时，最终会返回 **404** 状态码。
### 5.4 请求频率限制模块
Nginx 的请求频率限制模块(ngx_http_limit_req_module)会对指定变量的请求次数进行计数，当该变量在单位时间内的请求次数超过设定的数值时，后续请求会被延时处理，当被延时处理的请求数超过指定的队列数时，将返回指定的状态码(默认状态码为 503)
通常该模块被用于限定同一 IP 客户端单位时间内请求的次数。该模块通过共享内存存储计数状态以实现多个工作进程间的同一变量计数状态的共享。
既是高并发场景下保护服务的“标准工具”，也是日常安全运维中抵御恶意请求的“第一道防线”-
```
http {
    # 1. 定义一个共享内存区域(规则区)
    #    perip   = 区域名称
    #    10m     = 区域占用的共享内存大小，用于存储key(这里是$binary_remote_addr)
    #    rate=10r/s = 限制的请求速率，这里是每秒10个请求
    limit_req_zone $binary_remote_addr zone=perip:10m rate=10r/s;

    server {
        location /api/ {
            # 2. 在 location 中引用这个规则区
            #    zone=perip burst=20 nodelay
            #    burst=20 = 允许一个最多20个请求的突发队列
            #    nodelay   = 对burst队列中的请求不进行延迟等待，立即处理
            limit_req zone=perip burst=20 nodelay;
            proxy_pass http://your_backend;
        }
    }
}
```
**参数说明:**
- `rate=10r/s`：基础速率，即正常情况下每秒处理 10 个请求。
- `burst=20`：在超过 `rate` 时，创建一个最多容纳 20 个请求的队列。超过队列的请求将被拒绝。
- `nodelay`：**与 `burst` 配合使用**，表示 `burst` 队列中的请求不会排队等待，而是立刻处理。这主要用于处理瞬间的突发流量。
- 其中对于低频率场景，可用 `r/m`(每分钟请求数)来定义，如限制每秒 0.5 个请求可写为 `rate=30r/m`。

| **对比维度** | **`limit_req` (请求频率限制)**             | **`limit_conn` (并发连接限制)**              |
| :- | :-- | :- |
| **核心逻辑** | 限制“**速率**”，即一个IP**在单位时间内**能发起多少次请求-。 | 限制“**并发**”，即一个IP**同时保持**着多少个活跃的TCP连接-。 |
| **算法**   | 基于“**漏桶算法**”，平滑处理请求-。                | 基于“**计数器**”，超过设定值直接拒绝。                 |
| **应用场景** | 防止CC攻击、暴力破解、API滥用、保障秒杀系统稳定-。         | 防止单一IP耗尽服务器连接资源，适合下载、流媒体等长连接场景-。       |
| **用户体验** | 可能导致**延迟增加**(请求被排队等待处理)。             | 直接**拒绝新连接**(用户立即看到错误页面)。               |
**组合使用策略**：建议两者配合使用。例如，可以用 `limit_conn` 限制一个 IP 最多建立 3 个并发连接，同时用 `limit_req` 限制这个 IP 的请求速率不超过 10 请求/秒，这样能让防护更全面。
