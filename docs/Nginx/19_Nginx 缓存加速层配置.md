## 一、什么是 Nginx 缓存加速
### 1.1 缓存加速的概念
Nginx 缓存加速是指将后端服务器(如 Java、PHP、Node.js 应用)返回的响应内容临时存储在 Nginx 的本地磁盘或内存中。当后续有相同的请求到达时，Nginx 可以直接从缓存中返回结果，而无需再次向后端服务器发起请求。
简单来说，Nginx 缓存就像是一个“智能便签本”—第一次问后端要数据时，顺手记下来；下次有人再问同样的问题，直接翻便签本回答，不用再去打扰后端了。
### 1.2 缓存加速作用
在没有缓存的情况下，每一个用户请求都会穿透到后端服务器，后端需要执行代码、查询数据库、渲染页面后才能返回响应。这不仅消耗大量服务器资源，还会导致响应变慢。
Nginx 缓存加速的核心价值在于：

| 价值       | 说明                        |
| -- | - |
| 大幅提升响应速度 | 缓存响应直接从磁盘返回，无需经过后端应用的处理链路 |
| 显著减轻后端压力 | 缓存命中时，后端服务器完全不需要处理请求      |
| 降低数据库负载  | 减少对数据库的查询次数               |
| 提高系统稳定性  | 即使后端短暂故障，Nginx 仍可返回缓存的旧内容 |
| 节省带宽成本   | 减少重复数据传输                  |
### 1.3 Nginx 缓存的工作原理
```
用户请求到达 Nginx
    │
    ▼
检查缓存中是否有该请求的缓存
    │
    ├── 有(缓存命中 HIT)→ 直接返回缓存内容(后端无感知)
    │
    └── 无(缓存未命中 MISS)→ 向后端服务器发起请求
            │
            ▼
        后端返回响应
            │
            ▼
        Nginx 将响应存入缓存
            │
            ▼
        返回给用户
```
Nginx 缓存的关键在于 proxy_cache 模块。它通过将后端响应存储在磁盘上，并在后续请求中直接返回缓存内容，从而实现加速效果。

## 二、核心配置指令
### 2.1 proxy_cache_path — 定义缓存区域
proxy_cache_path 是启用缓存最核心的指令，用于定义缓存的存储路径、目录结构、缓存区域名称和大小等参数。该指令必须写在 http 块中。

**基本语法**：
```
http {
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=60m use_temp_path=off;
}
```
**参数详解**：
1. /var/cache/nginx，缓存文件的存储路径，需要确保 Nginx 进程对该目录有写入权限。
2. levels=1:2 ，缓存目录的层级结构，避免单个目录下文件过多导致 I/O 性能下降
3. keys_zone=my_cache:10 m，定义共享内存区域的名称(my_cache)和大小(10MB)，用于存储缓存项的元数据(key 和元信息)。
4. max_size=10 g，缓存最大容量，超过后 Nginx 会自动清理最久未使用的缓存(LRU 算法)
5. inactive=60 m，缓存项在 60 分钟内未被访问则被标记为过期并清理
6. use_temp_path=off，关闭临时文件路径，缓存直接写入目标目录，提升 I/O 性能。
keys_zone 的内存大小参考：10MB 的共享内存大约可以存储 8 万个 缓存项的元数据，可根据实际业务量适当调整。

**`levels` 参数说明**：
levels=1:2 表示缓存目录采用两级结构：
```
/var/cache/nginx/
    └── a/                    ← 第一级(1 个字符)
        └── bc/               ← 第二级(2 个字符)
            └── 缓存文件
```
这种分级结构可以有效避免单个目录下文件数量过多导致的文件系统性能问题。
### 2.2 proxy_cache — 启用缓存
在 server 或 location 块中，通过 proxy_cache 指令启用缓存，并指定使用的缓存区域名称。

**语法**：
```
location / {
    proxy_cache my_cache;   # 使用名为 my_cache 的缓存区域
    proxy_pass http://backend;
}
```
proxy_cache 指令的值必须与 proxy_cache_path 中 keys_zone 定义的缓存区域名称一致。
### 2.3 proxy_cache_valid — 设置缓存有效期
proxy_cache_valid 用于为不同的 HTTP 状态码设置缓存有效期。

**语法**：
```
proxy_cache_valid 200 302 10m;    # 200 和 302 状态码缓存 10 分钟，单位s/秒,m/分钟,h/小时
proxy_cache_valid 404 1m;         # 404 状态码缓存 1 分钟
proxy_cache_valid any 5m;         # 其他状态码缓存 5 分钟
```
**配置建议**：

| 状态码 | 推荐缓存时间 | 说明 |
|--------|-------------|------|
| `200`、`302` | 根据内容更新频率，1 h ~ 30 d | 正常响应，可按需设置 |
| `404` | 1 m ~ 5 m | 避免频繁请求不存在的资源 |
| `301`、`302` | 1 h ~ 24 h | 重定向响应，可适当缓存 |

### 2.4 proxy_cache_key — 自定义缓存键
proxy_cache_key 用于定义缓存的唯一标识键。默认情况下，Nginx 使用 `$scheme$ proxy_host$request_uri` 作为缓存键。

**自定义缓存键示例**：
```
proxy_cache_key "$host$request_uri";                        # 域名 + URI
proxy_cache_key "$scheme$host$request_uri";                # 协议 + 域名 + URI(默认)
proxy_cache_key "$cookie_sessionid$request_uri";           # 会话 ID + URI
```
关键原则：缓存键中包含过多动态参数(如时间戳、会话 ID)会导致大量无效缓存，降低命中率。应尽量保持缓存键的稳定性。
### 2.5 proxy_cache_use_stale — 使用过期缓存
proxy_cache_use_stale 定义当后端服务器出现故障时，Nginx 可以使用过期的缓存内容来响应用户。

**语法**：
```
proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
```
1. error ，与后端通信出错时
2. timeout， 与后端通信超时时
3. updating，缓存正在更新时，先返回旧缓存
4. http_500/502/503/504，后端返回 5 xx 错误时
这是提升系统可用性的重要配置—即使后端短暂故障，用户依然能看到内容(虽然是旧的)。
### 2.6 proxy_cache_lock — 防止缓存击穿
proxy_cache_lock 用于防止缓存击穿(多个请求同时请求同一个未缓存的资源，导致所有请求都穿透到后端)。

**语法**：
```
proxy_cache_lock on;
proxy_cache_lock_timeout 5s;
```
- proxy_cache_lock on;：启用缓存锁，同一个资源只有一个请求会去后端获取，其他请求等待缓存生成
- proxy_cache_lock_timeout 5s;：等待锁的超时时间，超时后直接穿透到后端

## 三、基础配置示例
### 3.1 最简单的缓存配置
```
http {
    # 定义缓存区域
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=60m;

    server {
        listen 80;
        server_name example.com;

        location / {
            proxy_pass http://127.0.0.1:8080;

            # 启用缓存
            proxy_cache my_cache;

            # 设置缓存有效期
            proxy_cache_valid 200 302 10m;
            proxy_cache_valid 404 1m;
        }
    }
}
```
**配置解释**：
1. proxy_cache_path 在 http 块中定义缓存区域
2. proxy_cache my_cache 在 location 中启用缓存
3. proxy_cache_valid 设置不同状态码的缓存时间
### 3.2 生产环境推荐配置
```
http {
    # ============================================
    # 定义缓存区域
    # ============================================

    proxy_cache_path /var/cache/nginx
        levels=1:2
        keys_zone=api_cache:50m
        max_size=20g
        inactive=60m
        use_temp_path=off;

    # ============================================
    # 后端服务器组
    # ============================================

    upstream backend {
        server 192.168.1.10:8080 weight=3;
        server 192.168.1.11:8080 weight=2;
    }

    # ============================================
    # 虚拟主机配置
    # ============================================

    server {
        listen 80;
        server_name api.example.com;

        location / {
            proxy_pass http://backend;

            # -- 启用缓存 --
            proxy_cache api_cache;

            # -- 缓存有效期 --
            proxy_cache_valid 200 302 10m;
            proxy_cache_valid 404 1m;
            proxy_cache_valid 301 302 1h;

            # -- 缓存键 --
            proxy_cache_key "$scheme$host$request_uri";

            # -- 防止缓存击穿 --
            proxy_cache_lock on;
            proxy_cache_lock_timeout 5s;

            # -- 后端故障时使用过期缓存 --
            proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;

            # -- 透传客户端信息 --
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
}
```

## 四、差异化缓存策略
### 4.1 静态资源缓存
静态资源(图片、CSS、JS、字体等)访问频率高、内容变化少，应配置长期缓存。
```
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
    proxy_pass http://backend;
    proxy_cache api_cache;
    proxy_cache_valid 200 302 30d;      # 缓存 30 天
    proxy_cache_valid 404 1m;

    # 通过 expires 设置浏览器缓存头
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```
### 4.2 动态内容缓存
动态内容(如 API、用户个性化页面)需平衡缓存性能与数据实时性。
```
location /api/ {
    proxy_pass http://backend;
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;           # 缓存 5 分钟
    proxy_cache_valid 404 1m;
    proxy_cache_use_stale error timeout updating;
}
```
### 4.3 排除不需要缓存的内容
登录页、购物车等动态内容应跳过缓存。
```
location /api/login/ {
    proxy_pass http://backend;
    proxy_cache_bypass 1;               # 跳过缓存
    proxy_no_cache 1;                   # 不存储缓存
}
```
使用 proxy_no_cache 可以根据请求条件动态决定是否缓存：
```
# 当请求包含 sessionid cookie 时不缓存
proxy_no_cache $cookie_sessionid;
```

## 五、监控与调试
### 5.1 查看缓存命中状态
通过在响应头中添加 `X-Cache-Status`，可以直观地看到缓存是否命中。
```
location / {
    proxy_pass http://backend;
    proxy_cache api_cache;
    add_header X-Cache-Status $upstream_cache_status;
}
```
**`$upstream_cache_status` 的可能值**：

| 值        | 含义                           |
| -- | - |
| HIT      | 缓存命中，直接从缓存返回                 |
| MISS     | 缓存未命中，请求穿透到后端                |
| EXPIRED  | 缓存已过期，正在向后端请求更新              |
| UPDATING | 缓存正在更新中                      |
| BYPASS   | 缓存被跳过(如配置了 proxycachebypass) |
### 5.2 使用 curl 验证缓存
```
# 第一次请求(缓存未命中)
curl -I http://api.example.com/test
# 响应头: X-Cache-Status: MISS

# 第二次请求(缓存命中)
curl -I http://api.example.com/test
# 响应头: X-Cache-Status: HIT
```
### 5.3 查看缓存命中率
通过分析 Nginx 访问日志中的 $upstream_cache_status，可以统计缓存命中率。
```
# 统计缓存命中次数
grep "HIT" /var/log/nginx/access.log | wc -l

# 统计总请求数
cat /var/log/nginx/access.log | wc -l

# 计算命中率
```
### 5.4 缓存效果验证对比
| 配置项   | 未优化  | 优化后        |
| -- | - | - |
| 响应延迟  | 较高   | 降低 50%~80% |
| 后端请求数 | 100% | 降低 60%~90% |
| 服务器负载 | 高    | 显著降低       |

## 六、缓存清理方法
### 6.1 修改缓存键版本号
在资源 URL 中添加版本号或哈希值，强制生成新的缓存。
```
<!-- 旧版本 -->
<link rel="stylesheet" href="/css/style.css">

<!-- 新版本(强制更新缓存) -->
<link rel="stylesheet" href="/css/style.css?v=2">
```
### 6.2 直接删除缓存文件
```
# 停止 Nginx
systemctl stop nginx

# 删除缓存目录
rm -rf /var/cache/nginx/*

# 启动 Nginx
systemctl start nginx
```
### 6.3 使用 proxy_cache_purge 模块(需额外安装)

通过 ngx_cache_purge 模块可以精准清理特定 URL 的缓存。
```
location ~ /purge(/.*) {
    allow 127.0.0.1;          # 仅允许本地访问
    allow 192.168.1.0/24;     # 或内网网段
    deny all;
    proxy_cache_purge api_cache $host$1;
}
```
清理缓存：
```
curl http://127.0.0.1/purge/api/test
```
**总结：** Nginx 缓存加速层通过 proxy_cache 模块将后端响应存储在本地磁盘，后续相同请求直接从缓存返回，从而大幅提升响应速度(可降低 50%~80% 的响应延迟)、显著减轻后端压力(可减少 60%~90% 的后端请求)，是现代 Web 架构中性价比最高的性能优化手段之一。