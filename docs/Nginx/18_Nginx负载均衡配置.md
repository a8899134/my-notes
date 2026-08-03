## 一、什么是负载均衡
### 1.1 负载均衡的概念
负载均衡(Load Balancing)是指将客户端请求分发到多台后端服务器上处理的技术，目的是避免单台服务器过载，提升系统的整体处理能力和可用性。
在没有负载均衡的情况下，所有请求都打到同一台服务器上。当访问量增长时，这台服务器的 CPU、内存、连接数等资源会被耗尽，导致响应变慢甚至服务不可用。负载均衡通过在多个服务器之间分摊流量，解决了这个单点瓶颈问题。
### 1.2 负载均衡的核心作用
| 作用 | 说明 |
|------|------|
| 流量分发 | 将用户请求均匀分配到多台后端服务器，避免单台服务器过载 |
| 故障容错 | 当某台服务器宕机时，自动将流量切换至健康节点，保证服务不中断 |
| 水平扩展 | 当流量增长时，只需增加后端服务器即可提升整体处理能力 |
| 性能优化 | 通过合理的调度策略，提升用户体验 |

### 1.3 Nginx 负载均衡优势
Nginx 凭借其轻量级、高并发、低延迟的特性，成为负载均衡领域的首选方案：
- 异步非阻塞架构：单进程可处理数万并发连接，资源占用极低
- 配置灵活：通过 upstream 模块轻松实现多种负载均衡策略
- 成本优势：相比硬件负载均衡器(如 F5)，Nginx 的软件实现大幅降低了部署成本
- 健康检查机制：自动检测并剔除故障节点

## 二、负载均衡的核心配置
### 2.1 upstream 块 — 定义后端服务器组
Nginx 的负载均衡功能通过 upstream 模块实现。upstream 块用于定义一组后端服务器，这组服务器被称为“上游服务器组”(Upstream Server Group)。

**基础语法**：
```
http {
    upstream 服务器组名称 {
        server 后端服务器1的地址;
        server 后端服务器2的地址;
        server 后端服务器3的地址;
    }

    server {
        listen 80;
        location / {
            proxy_pass http://服务器组名称;
        }
    }
}
```
### 2.2 一个最简单的负载均衡配置
假设你有三台后端服务器，IP 分别为 192.168.1.10、192.168.1.11、192.168.1.12，都运行着相同的 Web 应用(如 Java/Go/PHP 服务)。
```
http {
    # ============================================
    # 定义后端服务器组
    # ============================================

    upstream backend {
        server 192.168.1.10:8080;
        server 192.168.1.11:8080;
        server 192.168.1.12:8080;
    }

    # ============================================
    # 虚拟主机配置
    # ============================================

    server {
        listen 80;
        server_name api.example.com;

        location / {
            # 将请求转发给 backend 服务器组
            proxy_pass http://backend;

            # 透传客户端信息
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
}
```
效果：用户访问 `http://api.example.com` 时，Nginx 会按照轮询算法(默认)，将请求依次分配给三台后端服务器。
### 2.3 proxy_pass 与 upstream 的配合
proxy_pass 是 Nginx 反向代理的核心指令，用于将请求转发给后端服务器或服务器组。当 proxy_pass 指向 upstream 定义的服务器组时，就实现了负载均衡。
```
# 方式一：转发到单台服务器(无负载均衡)
proxy_pass http://127.0.0.1:8080;

# 方式二：转发到服务器组(有负载均衡)
proxy_pass http://backend;
```

## 三、负载均衡算法
Nginx 提供了多种负载均衡算法，适用于不同的业务场景。
### 3.1 轮询(Round Robin)— 默认算法
原理：按顺序将请求依次分配给每台后端服务器。第一台 → 第二台 → 第三台 → 第一台……

**配置示例**：
```
upstream backend {
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}
# 请求分配顺序：10 → 11 → 12 → 10 → 11 → 12 ...
```
适用场景：后端服务器性能一致且无状态服务的场景。
### 3.2 加权轮询(Weighted Round Robin)
原理：为服务器分配权重(weight)，权重高的服务器承担更多流量。Nginx 采用“平滑加权轮询”算法，避免长时间把请求都打到高权重节点。

**配置示例**：
```
upstream backend {
    server 192.168.1.10:8080 weight=3;   # 承担 60% 流量
    server 192.168.1.11:8080 weight=2;   # 承担 40% 流量
    server 192.168.1.12:8080 weight=1;   # 承担 20% 流量
}
# 每 6 个请求中：3 个给 10，2 个给 11，1 个给 12
```
⚠️ 注意：权重值是相对比例。当某台服务器宕机后，剩余服务器会按比例重新分配所有流量，不会丢失请求。

**适用场景：** 后端服务器性能存在差异时(如 CPU 核心数不同)。

### 3.3 最少连接(Least Connections)
原理：优先将请求分配给当前活跃连接数最少的服务器。

**配置示例**：
```
upstream backend {
    least_conn;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}
```
**适用场景：** 请求处理时长差异大或长连接较多的场景。

- 数据库连接池代理
- WebSocket 长连接
- 混合了简单查询和复杂报表的 API 服务
### 3.4 IP 哈希(IP Hash)
**原理**：根据客户端 IP 计算哈希值，确保同一 IP 始终访问同一台后端服务器。

**配置示例**：
```
upstream backend {
    ip_hash;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}
```
**适用场景** ：需要会话保持(Session Sticky) 的场景，如用户登录状态存储在本地内存中。

注意事项：
- 后端服务器数量变化时，哈希映射会重新计算，可能导致部分用户会话中断
- 不适合动态扩容场景
- 在 NAT/代理环境下可能出现负载不均

### 3.5 通用哈希(Generic Hash)
原理：基于自定义键(如用户 ID、请求 URI、Cookie)计算哈希值。

**配置示例**：
```
upstream backend {
    # 基于请求 URI 哈希，相同 URI 始终去同一台服务器
    hash $request_uri consistent;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}
```

**优势：** 结合 consistent 参数(一致性哈希)，在后端服务器扩容时，仅少量键需要重新映射。这比 ip_hash 更灵活、更可控。

**适用场景**：
- 缓存服务器集群(相同 URI 的请求始终去同一台缓存服务器)
- 基于 Cookie 的会话保持

### 3.6 算法选择速查表

| 算法 | 配置指令 | 适用场景 | 特点 |
|------|----------|----------|------|
| 轮询 | 无(默认) | 服务器性能相近、无状态服务 | 均匀分配，实现简单 |
| 加权轮询 | `weight=数字` | 服务器性能不均 | 按权重比例分配流量 |
| 最少连接 | `least_conn;` | 长连接、请求耗时差异大 | 动态平衡，防止某台过载 |
| IP 哈希 | `ip_hash;` | 需要会话保持 | 同一 IP 始终访问同一后端 |
| 通用哈希 | `hash 键 consistent;` | 缓存集群、灵活会话保持 | 支持一致性哈希，扩容影响小 |

### 3.7 服务类型选择
| 服务类型 | 推荐算法 | 核心原因 |
|----------|----------|----------|
| MySQL/PostgreSQL | `least_conn;` | 长连接场景，动态均衡，避免连接堆积 |
| Redis (缓存) | `hash ... consistent;` | 充分利用缓存，一致性哈希减少扩缩容影响 |
| 应用服务器 (无状态) | `least_conn;` | 实时负载均衡，处理效率高 |
| 应用服务器 (有状态) | `ip_hash;` 或 `hash` | 保证会话粘性，维持用户状态 |
| 通用兜底 | `weight` (加权轮询) | 服务器性能不均时的基础流量控制 |

## 四、后端服务器参数详解
在 upstream 块中，每个 server 指令都可以携带多个参数，用于控制服务器的行为和健康检查。
### 4.1 weight — 权重
**语法**：`weight=数字`  
**默认值**：`1`
设置服务器的权重，权重越高，分配的请求越多。
```
server 192.168.1.10:8080 weight=3;   # 高性能机器，权重 3
server 192.168.1.11:8080 weight=2;   # 中等性能，权重 2
server 192.168.1.12:8080 weight=1;   # 低性能，权重 1
```
### 4.2 max_fails — 最大失败次数
**语法**：`max_fails=数字`  
**默认值**：`1`

设置在 fail_timeout 时间内，允许的最大通信失败次数。超过该次数后，服务器被标记为不可用。
```
server 192.168.1.10:8080 max_fails=3;
# 连续失败 3 次后标记为不可用
```
**说明**：
- 设置为 0 表示关闭失败检测
- 如果 upstream 组中只有一台服务器，max_fails 和 fail_timeout 参数会被忽略，该服务器永远不会被标记为不可用
### 4.3 fail_timeout — 失败超时与恢复等待
**语法**：`fail_timeout=时间`  
**默认值**：`10` 秒

两个作用：
1. 指定 max_fails 次失败的统计时间窗口
2. 指定服务器被标记为不可用后的暂停时间(恢复等待时间)
```
server 192.168.1.10:8080 max_fails=3 fail_timeout=30s;
# 在 30 秒内失败 3 次 → 标记为不可用 → 暂停 30 秒后再尝试恢复
```
**工作机制**：
```
正常 → 第1次失败 → 第2次失败 → 第3次失败(在 fail_timeout 内)
                                    ↓
                              标记为不可用
                                    ↓
                          暂停 fail_timeout 时间
                                    ↓
                              重新尝试连接
                                    ↓
                   成功 → 恢复可用     失败 → 继续暂停
```
### 4.4 backup — 备用服务器
**语法**：`backup`
将该服务器标记为备用服务器。仅当所有非 backup 的主服务器都不可用时，才会将请求转发给备用服务器。
```
upstream backend {
    server 192.168.1.10:8080;      # 主服务器
    server 192.168.1.11:8080;      # 主服务器
    server 192.168.1.12:8080 backup;   # 备用服务器
}
```
**适用场景**：异地灾备、资源有限的冷备节点。
### 4.5 down — 永久下线
**语法**：`down`
将该服务器标记为永久不可用，Nginx 不会向其转发任何请求。
```
upstream backend {
    server 192.168.1.10:8080;          # 正常
    server 192.168.1.11:8080 down;     # 永久下线(维护中)
    server 192.168.1.12:8080;          # 正常
}
```
**适用场景**：服务器维护、退役时，临时将其从负载均衡池中移除，无需删除配置行。
### 4.6 参数组合示例
```
upstream backend {
    # 高性能主服务器：权重 3，30 秒内失败 3 次则标记为不可用，暂停 30 秒
    server 192.168.1.10:8080 weight=3 max_fails=3 fail_timeout=30s;

    # 中等性能主服务器：权重 2
    server 192.168.1.11:8080 weight=2 max_fails=3 fail_timeout=30s;

    # 备用服务器：仅当主服务器全挂时启用
    server 192.168.1.12:8080 backup;
}
```

## 五、健康检查
### 5.1 被动健康检查
**原理**：Nginx 在转发请求时，如果与后端服务器通信失败，会记录失败次数。当失败次数达到 max_fails 阈值时，该服务器被标记为不可用，在 fail_timeout 时间内不再接收请求。
这是被动检查—只有请求到达时才会触发检查，无法提前发现故障。
```
upstream backend {
    server 192.168.1.10:8080 max_fails=3 fail_timeout=30s;
    server 192.168.1.11:8080 max_fails=3 fail_timeout=30s;
    server 192.168.1.12:8080 max_fails=3 fail_timeout=30s;
}
```
### 5.2 主动健康检查
**原理**：Nginx 定期主动向后端服务器发送探测请求，验证其健康状态，无需等待真实请求.

**配置示例**(Nginx Plus)：
```
upstream backend {
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}

server {
    location / {
        proxy_pass http://backend;
        health_check;   # 启用主动健康检查
    }
}
```

## 六、高级配置
### 6.1 长连接优化(keepalive)
Nginx 与后端服务器之间默认使用短连接(HTTP/1.0)，每次请求都需要重新建立 TCP 连接，产生三次握手开销。
通过 keepalive 指令，可以让 Nginx 复用与后端服务器的 TCP 连接，大幅降低连接建立的开销。

**配置示例**：
```
upstream backend {
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;

    # 每个 Worker 进程保持 32 个空闲长连接
    keepalive 32;
}

server {
    location / {
        proxy_pass http://backend;

        # 必须升级到 HTTP/1.1
        proxy_http_version 1.1;

        # 清空 Connection 头，启用长连接
        proxy_set_header Connection "";
    }
}
```
**配置解释**：
- keepalive 32;每个 Worker 进程与后端服务器保持的空闲长连接数
- proxy_http_version 1.1;必须升级到 HTTP/1.1，因为长连接需要 HTTP/1.1 支持
- proxy_set_header Connection "";清空默认的 Connection: close 头，启用长连接

**注意事项**：
- keepalive 值过小会导致频繁重建连接，过大会占用内存
- 实测数据显示，合理设置 keepalive 可使 QPS 提升 25%-35%
- 仅配置 keepalive 32; 是不够的，还必须在 location 块中明确设置 proxy_http_version 1.1; 和 proxy_set_header Connection "";，否则 Nginx 仍会使用短连接访问后端。

**参考值:**

| 场景 | 推荐值 | 理由 |
|------|--------|------|
| 低并发(< 100 QPS) | `keepalive 16;` | 够用，减少内存占用 |
| 中等并发(100-1000 QPS) | `keepalive 32;` | 平衡性能和资源 |
| 高并发(> 1000 QPS) | `keepalive 64;` 或 `128;` | 充分利用连接复用 |

**计算依据**：如果后端有 10 台服务器，keepalive 32; 意味着每个 Worker 与每台后端服务器之间保持 32 个空闲连接。

### 6.2 会话保持(Session Sticky)
对于需要保持用户状态的场景(如购物车、登录态)，需要确保同一用户的请求始终落在同一台后端服务器上。

1. IP 哈希
```
upstream backend {
    ip_hash;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}
```
缺点：后端服务器增减时，哈希表需要重建，可能导致部分会话中断。

2. Cookie 插入(推荐)
```
upstream backend {
    # 基于 Cookie 中的 sessionid 做哈希
    hash $cookie_sessionid consistent;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}
```
优势：使用一致性哈希，服务器扩容时影响最小。

### 6.3 故障转移(proxy_next_upstream)
当配置了多个后端服务器时，proxy_next_upstream 决定在什么情况下将请求转发给下一个服务器。
```
upstream backend {
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}

location / {
    proxy_pass http://backend;

    # 遇到以下错误时，尝试转发给下一个服务器
    proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
}
```
**可选参数**：

| 参数 | 说明 |
|------|------|
| `error` | 与后端建立连接、发送请求或读取响应时发生错误 |
| `timeout` | 与后端的操作超时 |
| `http_500` | 后端返回 500 错误 |
| `http_502` | 后端返回 502 错误 |
| `http_503` | 后端返回 503 错误 |
| `http_504` | 后端返回 504 错误 |

## 七、完整配置示例
### 7.1 生产级负载均衡完整配置
```
# ============================================
# /etc/nginx/conf.d/loadbalance.conf
# 生产级负载均衡完整配置
# ============================================

http {
    # ============================================
    # 定义后端服务器组
    # ============================================

    upstream app_backend {
        # 最少连接算法(适合长连接/请求耗时差异大的场景)
        least_conn;

        # 主服务器
        server 192.168.1.10:8080 weight=3 max_fails=3 fail_timeout=30s;
        server 192.168.1.11:8080 weight=2 max_fails=3 fail_timeout=30s;

        # 备用服务器(仅当主服务器全挂时启用)
        server 192.168.1.12:8080 backup;

        # 长连接优化
        keepalive 32;
    }

    # ============================================
    # 虚拟主机配置
    # ============================================

    server {
        listen 80;
        server_name api.example.com;

        # 访问日志
        access_log /var/log/nginx/api_access.log;
        error_log /var/log/nginx/api_error.log;

        # ============================================
        # 根路径：负载均衡到后端
        # ============================================

        location / {
            proxy_pass http://app_backend;

            # -- 透传客户端信息 --
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # -- 超时控制 --
            proxy_connect_timeout 5s;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;

            # -- 长连接 --
            proxy_http_version 1.1;
            proxy_set_header Connection "";

            # -- 故障转移 --
            proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
        }

        # ============================================
        # 健康检查端点(不代理，直接返回)
        # ============================================

        location = /health {
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }
    }
}
```
### 7.2 请求流程示意
以你的环境为例：用户访问 `https://api.example.com`，Nginx 作为负载均衡器，将请求分发到多台后端服务器。
```
用户(203.0.113.5)
    │
    │ 1. 访问 https://api.example.com
    ▼
Nginx 负载均衡器(203.0.222.5)
    │
    │ 2. 根据 least_conn 算法，选择当前连接数最少的后端
    ▼
后端服务器 A(192.168.1.10:8080)← 权重 3，性能最高
后端服务器 B(192.168.1.11:8080)← 权重 2，性能中等
后端服务器 C(192.168.1.12:8080)← 备用，仅当 A、B 都挂时启用
```
**总结**：负载均衡是 Nginx 反向代理的核心能力—通过 upstream 模块定义后端服务器组，配合多种负载均衡算法、健康检查和长连接优化，将请求智能地分发到多台后端服务器，从而提升系统的吞吐量、可用性和可扩展性。掌握了负载均衡，就掌握了 Nginx 应对高并发流量的核心武器。