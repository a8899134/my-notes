## 一、什么是 location 域
### 1.1 location 域的概念
location 域(URL 路由匹配块)是 Nginx 配置中最常用、最核心的配置单元之一，用于根据请求的 URI(URL 路径)匹配不同的处理规则。

简单来说，location 块就是 Nginx 的“交通警察”—它告诉 Nginx：“当用户访问不同的路径时，应该去不同的地方找资源，或者转发给不同的后端服务。

如果把 Nginx 比作一家大型商场：
- server 域：商场的总入口(如 example.com)
- location 域：商场里的楼层导览(一楼是餐饮、二楼是服装、三楼是电影院—不同的 URL 路径去不同的地方)
- location 内部指令：每个楼层的具体店铺(如 root 指定文件目录、proxy_pass 转发到后端)
### 1.2 location 域的位置
location 块必须写在 server 块内部，也可以嵌套在其他 location 块内部(但通常不推荐过度嵌套)。
```
server {
    listen 80;
    server_name example.com;

    # ============================================
    # location 块在 server 内部
    # ============================================

    location / {
        # 根路径的处理规则
        root /var/www/html;
        index index.html;
    }

    location /images/ {
        # 图片路径的处理规则
        root /var/www/static;
        expires 30d;
    }

    location /api/ {
        # API 路径转发到后端
        proxy_pass http://backend;
    }
}
```
### 1.3 location 的核心作用
| 作用         | 说明                                  |
| - | -- |
| 静态资源服务     | 根据 URL 路径返回对应的静态文件(HTML、CSS、JS、图片等) |
| 反向代理       | 将特定路径的请求转发给后端应用服务器                  |
| URL 重写与重定向 | 对特定路径进行 URL 重写或跳转                   |
| 访问控制       | 对特定路径设置 IP 黑白名单、认证等                 |
| 缓存控制       | 对特定路径的静态资源设置浏览器缓存策略                 |
| 日志分离       | 为不同路径单独记录访问日志                       |

## 二、location 的语法与修饰符
### 2.1 基本语法
```
location [修饰符] URI {
    # 配置指令
}
```
- 修饰符(modifier) ：可选，决定 Nginx 如何匹配 URI
- URI：匹配的目标路径或模式
- { }：花括号内是匹配成功后执行的配置指令
### 2.2 修饰符(Modifier)详解
Nginx 的 location 支持五种匹配方式，通过不同的修饰符来指定。

| 修饰符 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `=` | 精确匹配 | URI 必须完全等于指定的路径 | `location = /` |
| `^~` | 前缀匹配(优先) | URI 以指定路径开头，且不再检查正则 | `location ^~ /static/` |
| `~` | 正则匹配(区分大小写) | URI 匹配指定的正则表达式 | `location ~ \.php$` |
| `~*` | 正则匹配(不区分大小写) | URI 匹配指定的正则表达式(忽略大小写) | `location ~* \.(jpg\|png)$` |
| 无修饰符 | 前缀匹配(普通) | URI 以指定路径开头，但可能被正则覆盖 | `location /images/` |

#### 2.2.1 精确匹配(`=`)
**语法**：`location = /精确路径 { ... }`

**作用：** 只有当请求的 URI 完全等于指定的路径时才会匹配。

**示例**：
```
location = / {
    # 只有访问 http://example.com/ 时才会匹配
    # 访问 http://example.com/index.html 不会匹配
    return 200 "这是首页";
}

location = /login {
    # 只有访问 http://example.com/login 时才会匹配
    # 访问 http://example.com/login/ 不会匹配
    return 200 "这是登录页";
}
```
**适用场景**：
- 网站首页(/)
- 特定精确路径(如 /login、/admin、/health)
#### 2.2.2 前缀匹配优先(`^~`)
**语法**：`location ^~ /前缀路径 { ... }`

**作用**：URI 以指定路径开头时匹配，且优先级高于正则表达式。一旦匹配成功，Nginx 不会再检查任何正则 location。

**示例**：
```
location ^~ /static/ {
    # 匹配 /static/css/style.css、/static/images/logo.png 等
    # 即使有 ~ \.css$ 的正则匹配，也不会执行
    root /var/www/static;
    expires 30d;
}

location ^~ /assets/ {
    # 匹配 /assets/fonts/、/assets/js/ 等
    root /var/www/assets;
}
```
**适用场景**：
- 静态资源目录(如 /static/、/assets/、/images/)
- 需要确保不被正则覆盖的路径
#### 2.2.3 正则匹配区分大小写(`~`)
**语法**：`location ~ 正则表达式 { ... }`

**作用**：URI 匹配指定的正则表达式，区分大小写。

**示例**：
```
location ~ \.php$ {
    # 匹配 .php 结尾的 URI(如 /index.php、/api.php)
    # 不匹配 .PHP(大写)
    fastcgi_pass 127.0.0.1:9000;
    include fastcgi_params;
}

location ~ ^/user/([0-9]+)$ {
    # 匹配 /user/123、/user/456
    # 捕获的数字可通过 $1 引用
    return 200 "用户ID: $1";
}
```
**适用场景**：
- 需要区分大小写的正则匹配
- 特定文件类型处理(如 PHP 动态请求)
#### 2.2.4 正则匹配不区分大小写(`~*`)
**语法**：`location ~* 正则表达式 { ... }`

**作用**：URI 匹配指定的正则表达式，不区分大小写。

**示例**：
```
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    # 匹配 .jpg、.JPG、.jPg、.css、.CSS 等
    # 不区分大小写
    root /var/www/static;
    expires 30d;
    access_log off;
}
```
**适用场景**：
- 静态资源文件(图片、CSS、JS 等)，忽略扩展名大小写
- 用户输入的 URL 大小写不确定的场景
#### 2.2.5 普通前缀匹配(无修饰符)
**语法**：`location /路径 { ... }`

**作用**：URI 以指定路径开头时匹配，但优先级低于正则匹配。

**示例**：
```
location /images/ {
    # 匹配 /images/logo.png、/images/photo.jpg 等
    # 但如果存在 ~ \.jpg$ 的正则，会优先执行正则
    root /var/www;
}

location /blog/ {
    # 匹配 /blog/post-1、/blog/category/tech 等
    root /var/www/blog;
}
```
**适用场景**：
常规路径匹配，不需要优先于正则的场景
作为兜底匹配(如 location /)

## 三、匹配规则与优先级
### 3.1 匹配优先级(从高到低)
当一个请求到达 Nginx 时，location 的匹配遵循以下严格顺序：
```
第1步：精确匹配(=)
   │
   ▼ 匹配成功 → 立即使用，停止搜索
   │ 匹配失败 ↓
   │
第2步：扫描所有前缀匹配(^~ 和无修饰符)，记录"最长匹配"
   │
   ▼
第3步：如果"最长匹配"是 ^~ 修饰的
   │ → 立即使用，跳过正则匹配
   │
   ▼ 如果不是 ^~ ↓
   │
第4步：按配置文件中的顺序检查正则匹配(~ 和 ~*)
   │ → 第一个匹配的正则立即使用
   │
   ▼ 没有正则匹配 ↓
   │
第5步：使用第2步记录的"最长前缀匹配"
```
### 3.2 优先级一览表
| 优先级 | 修饰符 | 类型 | 说明 |
|--------|--------|------|------|
| 1(最高) | `=` | 精确匹配 | 完全匹配立即使用，停止搜索 |
| 2 | `^~` | 前缀匹配(优先) | 最长匹配后，跳过正则 |
| 3 | `~` 或 `~*` | 正则匹配 | 按配置文件顺序，第一个匹配的生效 |
| 4(最低) | 无修饰符 | 前缀匹配(普通) | 正则都不匹配时，使用最长前缀匹配 |

### 3.3 关键规则详解
1. 规则一：精确匹配(`=`)优先级最高
无论配置文件中 `location = /` 写在什么位置，它都会最先被检查。一旦匹配成功，Nginx 立即停止搜索其他任何 `location`。
```
server {
    # 即使这个 location 写在最后，它仍然会最先被检查
    location = / {
        root /var/www/home;
    }

    location / {
        root /var/www/default;
    }
}
# 访问 / → 匹配 location = /(返回 home 目录)
# 访问 /about → 匹配 location /(返回 default 目录)
```
2. 规则二：`^~` 让前缀匹配“打败”正则
普通的无修饰符前缀匹配，会被正则匹配覆盖。但加上 ^~ 后，正则匹配无法覆盖它。
```
server {
    location ^~ /static/ {
        root /var/www/static;
    }

    location ~ \.css$ {
        # 通常匹配 .css 文件
        # 但如果 URI 是 /static/style.css，^~ 会优先，这个正则不会执行
        root /var/www/css;
    }
}
```
3. 规则三：正则匹配按配置文件顺序执行
对于正则匹配(~ 和 ~ * )，配置文件中先写的优先匹配。一旦匹配成功，后面的正则不会再检查。
```
server {
    # 先匹配这个
    location ~ \.php$ {
        fastcgi_pass php_backend;
    }

    # 如果上面的已经匹配，这个不会执行
    location ~ ^/api/.*\.php$ {
        fastcgi_pass api_backend;
    }
}
# 访问 /api/user.php → 匹配第一个 ~ \.php$(而不是更具体的第二个)
# 解决方案：将更具体的正则写在前面
```
4. 规则四：普通前缀匹配选“最长”的
对于无修饰符的前缀匹配，Nginx 会选择匹配路径最长的那个。
```
server {
    location /images/ {
        root /var/www;
    }

    location /images/avatars/ {
        root /var/www/avatars;
    }
}
# 访问 /images/logo.png → 匹配 /images/(长度 8)
# 访问 /images/avatars/user.jpg → 匹配 /images/avatars/(长度 17，更长)
```
### 3.4 匹配流程图
```
客户端请求 URI: /static/css/style.css
                │
                ▼
        ┌───────────────┐
        │ 1. 精确匹配 (=) │
        │ location = /static/css/style.css ?
        └───────────────┘
                │ 不匹配
                ▼
        ┌───────────────┐
        │ 2. 扫描所有前缀  │
        │ 记录"最长匹配"  │
        └───────────────┘
                │ 最长前缀: /static/
                ▼
        ┌───────────────┐
        │ 3. 最长匹配是 ^~ ?│
        └───────────────┘
                │ 是 → 直接使用，跳过正则
                │ 否 ↓
                ▼
        ┌───────────────┐
        │ 4. 按顺序检查正则 │
        │ ~ \.css$ 匹配吗 ?
        └───────────────┘
                │ 匹配 → 使用正则 location
                │ 不匹配 ↓
                ▼
        ┌───────────────┐
        │ 5. 使用第2步的  │
        │ 最长前缀匹配    │
        └───────────────┘
```

## 四、location 中的常用指令
### 4.1 root — 指定根目录
**语法**：`root 目录路径;`

**作用**：指定请求 URI 对应的文件系统根目录。Nginx 会将 root 路径与请求 URI 拼接，形成完整的文件路径。

**示例**：
```
location /images/ {
    root /var/www;
    # 请求 /images/logo.png → 读取 /var/www/images/logo.png
}
```
### 4.2 alias — 路径别名
**语法**：`alias 目录路径;`

**作用**：将请求 URI 替换为指定的路径，而不是拼接。

**示例**：
```
location /images/ {
    alias /var/www/static/pics/;
    # 请求 /images/logo.png → 读取 /var/www/static/pics/logo.png
    # 注意：/images/ 被替换为 /var/www/static/pics/
}
```
 `root` 与 `alias` 的区别：
 
| 对比 | `root` | `alias` |
|------|--------|---------|
| 路径拼接方式 | root路径 + URI | alias路径(替换 URI 匹配的部分) |
| 可配置位置 | `http`、`server`、`location` | 仅 `location` |
| URI 是否参与路径计算 | ✅ 参与 | ❌ 不参与 |
| 末尾斜杠要求 | 可有可无 | 必须与 location 的斜杠匹配 |

**⚠️ 重要注意事项**：

alias 与 try_files 一起使用时存在已知的副作用，可能导致意外行为。如果需要在 alias 路径下查找文件，建议用 if 或 rewrite 替代，或确保 try_files 的最后一个参数是 =404 而非内部重定向。
### 4.3 index — 默认首页
**语法**：`index 文件1 文件2 ...;`

**作用**：当请求的 URI 是一个目录时，按顺序查找默认首页文件。

**示例**：
```
location / {
    root /var/www/html;
    index index.html index.htm index.php;
    # 访问 / → 依次查找 /var/www/html/index.html → index.htm → index.php
}
```
**注意：** 使用 index 会触发内部重定向，请求可能被重新路由到其他 location 处理。
### 4.4 try_files — 按顺序尝试文件
**语法**：`try_files 文件1 文件2 ... 最后处理;`

**作用：** 按顺序检查文件是否存在，如果存在则直接返回；如果都不存在，执行最后的处理(如返回 404 或内部重定向)。

**示例**：
```
location / {
    try_files $uri $uri/ /index.html;
    # 1. 尝试直接访问 $uri(如 /about.html)
    # 2. 尝试访问 $uri/ 目录(如 /about/)
    # 3. 都不存在，内部重定向到 /index.html(SPA 应用常用)
}

location /files/ {
    try_files $uri =404;
    # 文件存在则返回，不存在直接返回 404
}
```
### 4.5 proxy_pass — 反向代理转发
**语法**：`proxy_pass http://后端地址;`

**作用**：将匹配的请求转发给后端服务器。

**示例**：
```
location /api/ {
    proxy_pass http://backend_server;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
### 4.6 expires — 浏览器缓存时间
**语法**：`expires 时间;`

**作用**：设置浏览器缓存静态资源的时间，减少重复请求。

**示例**：
```
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    root /var/www/static;
    expires 30d;           # 缓存 30 天
    access_log off;        # 不记录访问日志
    add_header Cache-Control "public";
}
```
### 4.7 return — 直接返回响应
**语法**：`return 状态码;`

**作用**：直接返回 HTTP 响应，不再进行后续处理。

**示例**：
```
location = /health {
    return 200 "OK\n";
    add_header Content-Type text/plain;
}

location = /old-page {
    return 301 https://example.com/new-page;
}
```

## 五、典型配置示例
### 5.1 静态网站(最简配置)
```
server {
    listen 80;
    server_name example.com;
    root /var/www/html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```
### 5.2 静态资源分离 + 缓存
```
server {
    listen 80;
    server_name example.com;
    root /var/www/html;

    # 图片、CSS、JS 等静态资源：30 天缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    # HTML 文件：短缓存
    location ~* \.html$ {
        expires 1h;
        add_header Cache-Control "public";
    }

    # 其他请求
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
### 5.3 反向代理 + API 网关
```
server {
    listen 80;
    server_name api.example.com;

    # 健康检查
    location = /health {
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }

    # API v1
    location /v1/ {
        proxy_pass http://backend_v1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }

    # API v2
    location /v2/ {
        proxy_pass http://backend_v2;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
### 5.4 动静分离(完整示例)
```
server {
    listen 80;
    server_name www.example.com;
    root /var/www/example;

    # 静态资源：直接由 Nginx 处理，缓存 30 天
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        root /var/www/static;
        expires 30d;
        access_log off;
    }

    # 图片上传目录(优先于正则匹配)
    location ^~ /uploads/ {
        root /var/www/uploads;
        expires 7d;
    }

    # PHP 动态请求：转发给 PHP-FPM
    location ~ \.php$ {
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # 其他请求：返回 index.html(SPA 应用)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 错误页面
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
}
```
完整流程图解
```
┌─────────────────────────────────────────────────────────────────┐
│ 第 1 步：请求 PHP 页面                                          │
└─────────────────────────────────────────────────────────────────┘

  浏览器                      Nginx                     PHP-FPM
    │                          │                          │
    │  GET /abc.php           │                          │
    │─────────────────────────>│                          │
    │                          │  转发请求到 PHP-FPM      │
    │                          │─────────────────────────>│
    │                          │                          │  执行 abc.php
    │                          │                          │  生成 HTML
    │                          │  返回 HTML(含图片链接)  │
    │                          │<─────────────────────────│
    │  返回 HTML(含图片链接)  │                          │
    │<─────────────────────────│                          │
    │                          │                          │


┌─────────────────────────────────────────────────────────────────┐
│ 第 2 步：浏览器解析 HTML，自动请求图片                         │
└─────────────────────────────────────────────────────────────────┘

  浏览器                      Nginx                     PHP-FPM
    │                          │                          │
    │  解析 HTML，发现图片链接  │                          │
    │  GET /images/logo.png   │                          │
    │─────────────────────────>│                          │
    │                          │  匹配 location ~* \.(png)$│
    │                          │  直接从 /var/www/static/ │
    │                          │  读取图片文件            │
    │                          │                          │
    │  返回图片文件            │                          │
    │<─────────────────────────│                          │
    │                          │                          │


(浏览器会为页面中的每一张图片、CSS、JS 文件单独重复第 2 步)
```
### 5.5 访问控制
```
server {
    listen 80;
    server_name admin.example.com;

    # 仅允许内网 IP 访问
    location /admin/ {
        allow 192.168.1.0/24;
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://admin_backend;
    }

    # 公开 API
    location /api/ {
        proxy_pass http://api_backend;
    }
}
```

## 六、注意事项
1. alias 与 try_files 慎用，两者一起使用存在已知副作用
2. 正则匹配注意顺序，更具体的正则应写在前面
3. index 会触发内部重定向，可能导致请求被重新路由到其他 location
4. root 和 alias 不要混淆，root 拼接路径，alias 替换路径
5. location 嵌套需谨慎，过度嵌套会降低配置可读性
6. 修改后需重载配置，nginx -t && systemctl reload nginx
**总结**  location 域是 Nginx 配置中最常用、最灵活的模块—它通过五种匹配方式和严格的优先级规则，将不同的 URL 请求精确地路由到不同的处理逻辑(静态文件、反向代理、重定向、访问控制等)。掌握了 location，就掌握了 Nginx 路由配置的 90% 能力。