## 一、什么是 CDN
CDN(Content Delivery Network，内容分发网络)是一组分布在各个地区的服务器，这些服务器存储着数据的副本，能够根据用户的地理位置就近响应请求。

简单来说，CDN 就是一张遍布全球的“智能快递网络”—把数据提前运到离用户最近的地方，让用户就近取货，不用每次都去总仓库(源站)。

CDN 的核心思想是 “分布式存储，就近访问” 。当用户访问一个使用 CDN 加速的网站时，请求会被引导到距离他最近的 CDN 节点，而非直接访问源站服务器。
### 1.2 为什么需要 CDN
在没有 CDN 的情况下，所有用户都直接从源站服务器获取数据：

| 问题 | 说明 |
|------|------|
| 访问慢 | 西北用户访问福建服务器，数据跨越数千公里，加载速度慢 |
| 带宽压力大 | 所有请求都压在你的源站服务器上，流量突增时服务器扛不住 |
| 单点故障 | 源站一旦宕机，所有用户都无法访问 |

CDN 的核心价值体现在三个方面：

| 价值 | 说明 |
|------|------|
| 性能优化 | 全球节点覆盖使静态资源加载速度提升 50%-80%，尤其适合跨地域访问 |
| 带宽成本控制 | 通过边缘缓存减少源站带宽压力，降低 30%-60% 的流量成本 |
| 高可用性保障 | 多节点冗余设计确保单点故障不影响服务，可用性达 99.9% 以上 |

### 1.3 CDN 与 Nginx 的关系
CDN 和 Nginx 是协同工作的关系，而不是替代关系：
```
用户 → CDN 边缘节点 →(缓存未命中时回源)→ Nginx 源站 → 后端应用
```
- CDN：负责“挡在前面”，处理海量静态资源请求，就近响应用户
- Nginx：作为源站，接收 CDN 的回源请求，提供原始内容

一个形象的比喻：Nginx 是你的“总仓库”(源站)，CDN 是遍布全国的“前置分仓”(边缘节点)。用户从最近的分仓取货(缓存命中)，分仓没货时再去总仓调货(回源)。

## 二、CDN 的工作原理
### 2.1 CDN 的三层架构
现代 CDN 通常采用三级缓存架构：

| 层级 | 说明 | 特点 |
|------|------|------|
| 边缘节点(Edge Node) | 部署在全球各地的 POP 点，直接面向用户请求 | 数量最多、离用户最近、缓存空间相对较小 |
| 区域缓存(Regional Cache) | 按地理区域划分的中间层，存储区域性热门内容 | 规模更大，减少跨洋传输 |
| 中心源站(Origin Server) | 最终的数据源头，存储全量内容 | 你的 Nginx 服务器 |

“边缘优先、逐级回源” 是 CDN 缓存体系的核心设计原则：
```
用户请求 → 边缘节点(L1)
    ├── 命中 → 直接返回(最快)
    └── 未命中 → 区域节点(L2)
            ├── 命中 → 返回并缓存到 L1
            └── 未命中 → 中心源站(Origin)
                    └── 返回并逐级缓存
```

以某电商平台的图片分发为例：边缘节点命中率约 85%，区域节点命中率约 12%，最终只有约 3% 的请求回到中心源站。这种分层设计使平均响应时间从 300ms 降至 50ms。
### 2.2 用户访问的完整流程
当用户访问一个使用 CDN 加速的网站时，整个过程分为以下步骤：

**步骤一：DNS 解析与智能调度**

用户访问 `https://www.example.com` 时，本地 DNS 向 CDN 的 GSLB(全局负载均衡系统)发起查询。

**接入 CDN 前后 DNS 解析的变化：**

| 接入阶段 | DNS 记录类型 | 指向 | 效果 |
|----------|-------------|------|------|
| 无 CDN | A 记录 | Nginx 服务器公网 IP | 用户直接访问源站 |
| 接入 CDN 后 | CNAME 记录 | CDN 服务商提供的域名(如 `www.example.com.cdn.cloudflare.com`) | 用户请求先经过 CDN 网络，享受加速和防护 |

**为什么不能把 A 记录直接指向 Nginx IP？**

| 做法 | 结果 |
|------|------|
| A 记录指向 Nginx IP | ❌ 流量绕过了 CDN，CDN 的加速、防护、缓存功能全部失效 |
| CNAME 指向 CDN 域名 | ✅ 正确做法，流量经过 CDN 网络，实现加速和防护 |

**重要提示**：接入 CDN 后，你需要在 DNS 服务商处将域名的 A 记录改为 CNAME 记录，指向 CDN 提供的域名。同时需在 CDN 控制台配置回源地址(你的 Nginx 公网 IP 或域名)，否则 CDN 不知道去哪里获取内容。

**GSLB 根据以下因素选择最优边缘节点：**

| 因素 | 说明 |
|------|------|
| 地理位置 | 优先返回离用户最近的节点(如广东用户 → 广州节点) |
| 节点负载 | 避开高负载节点，避免拥塞 |
| 链路质量 | 通过探测选择最低延迟节点 |

GSLB 最终返回边缘节点的 CNAME(如 cdn-edge-123.example.com)，用户访问该节点。

**步骤二：边缘节点缓存检查**

请求到达边缘节点后，CDN 检查本地是否有缓存：
- 缓存命中(Cache Hit)：直接返回缓存内容，响应时间 < 50ms
- 缓存未命中(Cache Miss)：向源站回源获取内容，响应时间取决于回源链路质量(通常 200-500ms)

**步骤三：缓存与返回**

边缘节点获取内容后，会按照缓存策略存储一份副本，供后续请求使用。

## 三、回源配置
### 3.1 什么是回源
回源(Origin Pull / Back to Origin)是指当 CDN 边缘节点没有缓存用户请求的内容，或者缓存已过期时，向源站(你的 Nginx 服务器)请求数据的过程。
通俗理解：分仓没货了，派车去总仓库拉货。
### 3.2 回源的触发条件
触发回源的典型场景包括：

| 场景 | 说明 |
|------|------|
| 缓存过期 | TTL 到期后的首次请求 |
| 强制刷新 | 用户按 Ctrl+F5 或程序发送 `Cache-Control: no-cache` |
| PURGE 请求 | 通过 API 主动清除缓存 |
| 不一致检测 | CDN 节点定期校验源站内容变更 |

### 3.3 回源配置的关键参数
在 CDN 控制台中，需要配置以下回源参数：

| 参数 | 说明 | 建议值 |
|------|------|--------|
| 回源协议 | HTTP 或 HTTPS | 生产环境建议 HTTPS |
| 回源 HOST | 回源时请求头中的 `Host` 字段 | 必须与 Nginx 的 `server_name` 一致 |
| 回源超时时间 | CDN 等待源站响应的最长时间 | 3-10 秒 |
| 回源重试 | 源站无响应时的重试策略 | 根据业务需求配置 |

⚠️ **关键配置**：回源 HOST 必须与 Nginx 的 server_name 保持一致，否则 CDN 回源时 Nginx 无法正确匹配站点配置。

### 3.4 回源重试机制
当回源失败时，CDN 会按以下逻辑进行重试：
1. CDN 基于权重选择一个主源站进行访问
2. 如果回源失败，重试另一个主源站
3. 如果依然失败，尝试备用源站(如果配置了)
4. 如果当前源站是域名且可解析到多个 IP，会轮询尝试不同 IP.
### 3.5 源站保护机制
为防止源站被大量回源流量冲垮，CDN 提供了以下保护机制：

| 机制 | 说明 |
|------|------|
| 回源限速 | 按节点或区域设置 QPS 上限(如单个节点不超过 500 QPS) |
| IP 黑名单 | 阻止异常回源 IP |
| 预热功能 | 新内容发布前主动推送至 CDN 节点，避免发布瞬间回源风暴 |

## 四、缓存策略
### 4.1 什么是缓存策略
缓存策略决定了哪些内容可以在 CDN 节点上缓存、缓存多长时间、以及如何判断缓存是否有效。合理的缓存策略是 CDN 性能优化的核心。
### 4.2 TTL(Time To Live)
TTL 是缓存内容在 CDN 节点上的存活时间。TTL 到期后，缓存内容被视为过期，下次请求会触发回源。

**TTL 设置原则**：根据资源的更新频率设定。

| 资源类型 | 推荐 TTL | 原因 |
|----------|----------|------|
| 图片、字体、视频 | 30 天 ~ 1 年 | 内容极少变化，适合长期缓存 |
| CSS、JS(带哈希) | 1 年 | 文件名变化代表内容变化 |
| CSS、JS(不带哈希) | 7 ~ 30 天 | 可能更新，不宜过长 |
| HTML | 1 小时 ~ 1 天 | 内容可能频繁变化 |
| API 接口 | 1 ~ 5 分钟 | 需要实时数据，或 `no-cache` |

### 4.3 缓存控制的两种方式
**方式一：通过 Cache-Control 响应头控制**

源站(Nginx)返回的 Cache-Control 头是 CDN 判断缓存策略的主要依据：
```
Cache-Control: max-age=3600           # 缓存 1 小时
Cache-Control: public, max-age=86400  # 缓存 1 天，允许 CDN 缓存
Cache-Control: no-cache               # 每次需向源站验证
Cache-Control: no-store               # 完全禁止缓存
```
 **注意**：CDN 只读取源站在 HTTP 响应头中返回的 Cache-Control 和 Expires 字段。HTML <meta> 标签中的 http-equiv="Cache-Control" 仅对浏览器生效，CDN 不会解析。

 **方式二：在 CDN 控制台配置缓存规则**

 大多数 CDN 服务商允许在控制台按文件类型或路径配置缓存规则：

| 规则类型 | 示例 | 说明 |
|----------|------|------|
| 按文件后缀 | `*.jpg`、`*.png` → 缓存 30 天 | 图片资源 |
| 按路径 | `/static/*` → 缓存 7 天 | 静态资源目录 |
| 按路径 | `/api/*` → 不缓存 | 动态 API |
| 按状态码 | `200` → 缓存 10 分钟 | 正常响应 |

### 4.4 缓存刷新
缓存刷新是指当源站内容更新后，主动通知 CDN 节点删除旧缓存。

**两种刷新方式**：

| 方式 | 说明 | 适用场景 |
|------|------|----------|
| URL 刷新 | 删除单个资源的缓存，用户再次请求时回源拉取最新内容 | 少量文件更新、紧急修复 |
| 目录刷新 | 删除整个目录下所有资源的缓存 | 批量更新 |

刷新会降低缓存命中率，应谨慎使用。

### 4.5 缓存预热
缓存预热是指在大流量到来之前，提前将热门资源主动推送到 CDN 边缘节点。

**适用场景**：
- 大促活动前预热活动页面资源
- 新版本发布前预热核心 JS/CSS 文件
- 热点事件爆发前预置热门内容

**预热 vs 刷新**：

| 对比维度 | 缓存刷新 | 缓存预热 |
|----------|----------|----------|
| 目的 | 删除旧缓存，更新内容 | 提前填充缓存，避免回源 |
| 方向 | 从 CDN 节点删除 | 从源站推送到 CDN 节点 |
| 对命中率的影响 | 降低 | 提升 |
| 适用时机 | 内容更新后 | 大流量到来前 |

## 五、CDN 与 Nginx 的协同配置
### 5.1 协同原理
当网站接入 CDN 后，请求链路变为：
```
用户请求 → CDN 边缘节点 →(未命中)→ Nginx 源站 → 返回内容 → CDN 缓存 → 返回用户
```
Nginx 作为源站，需要通过配置告诉 CDN“哪些内容可以缓存、缓存多久”。
### 5.2 回源地址的配置
在 CDN 控制台配置回源地址时，有两种方式：

| 方式 | 配置 | 说明 |
|------|------|------|
| IP 回源 | 填写 Nginx 服务器的公网 IP | 简单直接，但如果源站 IP 变更需手动修改 |
| 域名回源 | 填写一个域名(如 `origin.example.com`) | 灵活性更高，可通过 DNS 解析调整源站 IP |

推荐使用域名回源，后续源站 IP 变更时只需修改 DNS 解析，CDN 配置无需改动。

### 5.3 Nginx 配置静态资源缓存头
在 Nginx 中配置 expires 和 Cache-Control，让 CDN 知道资源的缓存策略：
```
location ~* \.(jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot)$ {
    root /var/www/static;
    # 缓存 1 年，明确允许 CDN 缓存
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
}

location ~* \.(css|js)$ {
    root /var/www/static;
    expires 30d;
    add_header Cache-Control "public";
    access_log off;
}
```
**关键指令解释**：
1. expires 1y;设置资源过期时间为 1 年，CDN 和浏览器会缓存该资源直到过期
2. add_header Cache-Control "public"; 明确允许 CDN(公共缓存)存储资源
3. add_header Cache-Control "immutable"; 告诉浏览器“这个文件永远不会变”，可以直接使用缓存
### 5.4 确保回源 HOST 匹配 Nginx server_name
DN 回源时，请求头中的 Host 字段由 回源 HOST 配置决定。Nginx 通过 server_name 来匹配这个值，以决定由哪个 server 块处理请求。

**在 CDN 控制台配置回源 HOST**：
- 必须与 Nginx 中对应站点的 server_name 保持一致
- 如果填写的是加速域名(如 `www.example.com`)，Nginx 的 server_name 也要包含该域名

**Nginx 配置示例**：
```
# 源站配置：server_name 必须与 CDN 回源 HOST 一致
server {
    listen 80;
    server_name origin.example.com;   # ← 回源 HOST 必须填这个
    root /var/www/html;
    # ... 其他配置
}
```
如果回源 HOST 与 `server_name` 不匹配，Nginx 会返回**默认站点**的内容，甚至直接拒绝访问。
### 5.5 获取客户端真实 IP
接入 CDN 后，Nginx 的访问日志默认记录的是 CDN 节点的 IP，而不是用户的真实 IP。需要配置 real_ip 模块来提取真实 IP。

**配置方法**：
```
http {
    # 信任 CDN 节点的 IP(生产环境建议替换为 CDN 服务商的具体 IP 段)
    set_real_ip_from 0.0.0.0/0;
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;

    server {
        listen 80;
        server_name example.com;
        # ... 其他配置
    }
}
```
**指令解释**：
1. set_real_ip_from，告诉 Nginx 哪些 IP 是可信的代理(CDN 节点)
2. real_ip_header，指定真实 IP 在哪个请求头中(CDN 通常用 X-Forwarded-For)
3. real_ip_recursive，从 X-Forwarded-For 的最右侧开始提取第一个可信 IP
### 5.6 限制仅允许 CDN 回源(可选)
为防止源站被直接攻击，可以配置 Nginx 只允许 CDN 节点的 IP 访问：
```
location / {
    # 仅允许 CDN 服务商的 IP 段访问(需要替换为实际的 CDN IP 段)
    allow 192.0.2.0/24;   # 示例：CDN 服务商 IP 段
    deny all;
    # ... 其他配置
}
```
### 5.7 完整的 Nginx 源站配置示例
```
server {
    listen 80;
    server_name origin.example.com;   # 回源 HOST 必须匹配

    root /var/www/html;
    index index.html;

    # -- --- 获取真实 IP -- ---
    set_real_ip_from 0.0.0.0/0;       # 生产环境建议替换为 CDN 具体 IP 段
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;

    # -- --- 静态资源：长期缓存，允许 CDN 缓存 -- ---
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

    # -- --- HTML：短缓存 -- ---
    location ~* \.html$ {
        expires 1h;
        add_header Cache-Control "public";
    }

    # -- --- 动态 API：不缓存 -- ---
    location /api/ {
        add_header Cache-Control "no-cache";
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # -- --- 其他请求 -- ---
    location / {
        try_files $uri $uri/ =404;
    }
}
```

## 六、接入 CDN 的操作步骤总结
1. 在 CDN 控制台添加加速域名，填写你要加速的域名(如 ` www.example.com`)
2. 配置回源地址，填写你的 Nginx 源站 IP 或域名
3. 配置回源 HOST，必须与 Nginx 的 server_name 一致
4. 配置缓存规则，按文件类型设置不同的缓存时间
5. 在 DNS 服务商处修改解析记录，将 A 记录改为 CNAME 记录，指向 CDN 提供的域名
6. 配置 Nginx 源站，添加 expires/Cache-Control 头、配置 real_ip_header

**总结：** CDN 是遍布全球的“智能快递网络”—源站(你的 Nginx)是“总仓库”，边缘节点是“前置分仓”。用户从最近的分仓取货(缓存命中)，分仓没货时再去总仓调货(回源)。通过合理的回源配置和缓存策略，可以让用户“就近取货”，大幅提升访问速度(50%-80%)，同时减轻源站压力(降低 30%-60% 的带宽成本)。