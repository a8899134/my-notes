## 一、什么是 upstream 域
### 1.1 upstream 域的概念
upstream 域(后端服务器组配置块)是 Nginx 中用于定义一组后端服务器的配置单元，是实现反向代理和负载均衡的核心模块。
简单来说，upstream 块就是一份“服务器通讯录”—它告诉 Nginx：“当你需要转发请求时，可以从这个列表里选一台服务器来处理。”
如果把 Nginx 比作一家公司的前台接待：
1. upstream 域：前台手里的“各部门通讯录”(列出了所有可用的后端服务器)
2. server 域(upstream 内部)：通讯录里的具体部门和分机号(每台后端服务器的地址)
3. proxy_pass：前台拨号转接的动作(把请求转发给选中的服务器)
### 1.2 upstream 域的位置
upstream 块必须写在 http 块或 stream 块内部，不能直接写在 main 域，也不能放在 server 或 location 块内部。
```
http {
    # ============================================
    # upstream 在 http 内部：七层(HTTP)负载均衡
    # ============================================

    upstream app_backend {
        server 192.168.1.10:8080;
        server 192.168.1.11:8080;
    }

    server {
        listen 80;
        location / {
            proxy_pass http://app_backend;   # 引用 upstream
        }
    }
}

stream {
    # ============================================
    # upstream 在 stream 内部：四层(TCP/UDP)负载均衡
    # ============================================

    upstream mysql_backend {
        server 192.168.1.10:3306;
        server 192.168.1.11:3306;
    }

    server {
        listen 3306;
        proxy_pass mysql_backend;            # 引用 upstream
    }
}
```
### 1.3 upstream 的核心作用
| 作用   | 说明                                  |
| - | -- |
| 负载均衡 | 将请求分发到多台后端服务器，避免单点过载                |
| 故障转移 | 当某台服务器宕机时，自动将流量切换到健康节点              |
| 横向扩容 | 需要增加处理能力时，只需在 upstream 中添加服务器即可     |
| 解耦   | 后端服务器 IP 变化时，只需修改 upstream 配置，应用无感知 |

## 二、upstream 的核心指令
### 2.1 upstream — 定义服务器组
**语法**：`upstream 名称 { ... }`

**默认值**：无

**使用环境**：`http` 或 `stream`

**作用**：定义一个后端服务器组，并为其命名。后续通过 proxy_pass 引用该名称来使用这组服务器。

**示例**：
```
http {
    # 定义一个名为 backend 的服务器组
    upstream backend {
        server 192.168.1.10:8080;
        server 192.168.1.11:8080;
    }

    server {
        location / {
            proxy_pass http://backend;   # 引用 upstream
        }
    }
}
```
**命名规则**：
- 名称只能包含字母、数字、下划线(`_`)和连字符(`-`)
- 名称区分大小写
- 建议使用有意义的名称，如 appbackend、mysqlcluster、api_servers
### 2.2 server — 定义后端服务器
**语法**：`server 地址 [参数];`

**默认值**：无

**使用环境**：`upstream` 块内部

**作用**：在 upstream 组中添加一台后端服务器，指定其地址和可选参数。

**地址格式**：

| 格式 | 示例 | 说明 |
|------|------|------|
| IP + 端口 | `server 192.168.1.10:8080;` | 最常用 |
| 域名 + 端口 | `server app.example.com:8080;` | 支持 DNS 解析 |
| 仅 IP(默认 80 端口) | `server 192.168.1.10;` | 端口默认为 80 |
| Unix 域 socket | `server unix:/var/run/app.sock;` | 高性能本地通信 |

**示例**
```
upstream backend {
    server 192.168.1.10:8080;              # IP + 端口
    server app.example.com:8080;           # 域名 + 端口
    server 192.168.1.11;                   # 默认 80 端口
    server unix:/var/run/app.sock;         # Unix socket
}
```
### 2.3 server 参数详解
#### 2.3.1 weight — 权重
**语法**：`weight=数字`

**默认值**：`1`

**作用**：设置服务器的权重，权重越高，分配的请求越多。

**示例**：
```
upstream backend {
    server 192.168.1.10:8080 weight=3;   # 高性能机器，承担 50% 流量
    server 192.168.1.11:8080 weight=2;   # 中等性能，承担 33% 流量
    server 192.168.1.12:8080 weight=1;   # 低性能，承担 17% 流量
}
```
**计算方式**：总权重 = 3 + 2 + 1 = 6，各服务器流量占比分别为 3/6、2/6、1/6。
#### 2.3.2 max_fails — 最大失败次数
**语法**：`max_fails=数字`

**默认值**：`1`

**作用**：设置在 fail_timeout 时间内，允许的最大通信失败次数。超过该次数后，服务器被标记为不可用。

**示例**：
```
upstream backend {
    server 192.168.1.10:8080 max_fails=3;   # 连续失败 3 次后标记为不可用
}
```
**说明**：
- 设置为 0 表示关闭失败检测
- 失败依据由 proxy_next_upstream 指令定义
#### 2.3.3 fail_timeout — 失败超时
**语法**：`fail_timeout=时间`

**默认值**：`10s`

**作用**：两个作用：
1. 指定 max_fails 次失败的统计时间窗口
2. 指定服务器被标记为不可用后的暂停时间(恢复等待时间)

**示例**：
```
upstream backend {
    # 在 30 秒内失败 3 次则标记为不可用，暂停 30 秒后再尝试恢复
    server 192.168.1.10:8080 max_fails=3 fail_timeout=30s;
}
```
**工作机制：**
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
#### 2.3.4 backup — 备用服务器
**语法**：`backup`

**默认值**：无

**作用**：将该服务器标记为备用服务器。仅当所有非 backup 的主服务器都不可用时，才会将请求转发给备用服务器。

**示例**：
```
upstream backend {
    server 192.168.1.10:8080;      # 主服务器
    server 192.168.1.11:8080;      # 主服务器
    server 192.168.1.12:8080 backup;   # 备用服务器(仅当 10 和 11 都挂时才启用)
}
```
**适用场景**：异地灾备、资源有限的冷备节点。
#### 2.3.5 down — 永久下线
**语法**：`down`

**默认值**：无

**作用**：将该服务器标记为永久不可用，Nginx 不会向其转发任何请求。

**示例**：
```
upstream backend {
    server 192.168.1.10:8080;          # 正常
    server 192.168.1.11:8080 down;     # 永久下线(维护中)
    server 192.168.1.12:8080;          # 正常
}
```
**适用场景**：服务器维护、退役时，临时将其从负载均衡池中移除，无需删除配置行。
#### 2.3.6 max_conns — 最大连接数
**语法**：`max_conns=数字`

**默认值**：`0`(无限制)

**作用**：限制该服务器同时处理的最大连接数。

**示例**：
```
upstream backend {
    server 192.168.1.10:8080 max_conns=1000;   # 最多同时处理 1000 个连接
    server 192.168.1.11:8080 max_conns=500;
}
```
**适用场景**：保护性能较弱的服务器不被过度压垮。
### 2.4 参数组合示例
```
upstream backend {
    # 高性能主服务器：权重 5，最多 2000 连接
    server 192.168.1.10:8080 weight=5 max_conns=2000 max_fails=3 fail_timeout=30s;

    # 中等性能主服务器：权重 3
    server 192.168.1.11:8080 weight=3 max_fails=3 fail_timeout=30s;

    # 备用服务器：仅当主服务器全挂时启用
    server 192.168.1.12:8080 backup;
}
```

## 三、负载均衡算法
Nginx 的 upstream 模块支持多种负载均衡算法，通过不同的指令来控制请求的分发方式。
### 3.1 轮询(Round Robin)
**指令**：无(默认)

**原理**：按顺序将请求依次分配给每台后端服务器。

**示例**：
```
upstream backend {
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}
# 请求分配顺序：10 → 11 → 12 → 10 → 11 → 12 ...
```
**适用场景**：后端服务器性能一致、无状态服务。
### 3.2 加权轮询(Weighted Round Robin)
**指令**：通过 `weight` 参数实现

**原理**：按权重比例分配请求，权重高的服务器承担更多流量。

**示例**：
```
upstream backend {
    server 192.168.1.10:8080 weight=3;   # 承担 60% 流量
    server 192.168.1.11:8080 weight=2;   # 承担 40% 流量
}
# 每 5 个请求中：3 个给 10，2 个给 11
```
**适用场景**：后端服务器性能存在差异时(如 CPU 核心数不同)。
### 3.3 最少连接(Least Connections)
**指令**：`least_conn;`

**原理**：优先将请求分配给当前活跃连接数最少的服务器。

**示例**：
```
upstream backend {
    least_conn;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}
```
**适用场景**：**长连接场景**(如 WebSocket、数据库连接池)，避免某台服务器因连接堆积导致响应变慢。
### 3.4 IP 哈希(IP Hash)
**指令**：`ip_hash;`

**原理**：根据客户端 IP 计算哈希值，同一 IP 始终分配到同一台服务器。

**示例**：
```
upstream backend {
    ip_hash;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}
```
**适用场景**：需要会话保持(Session Sticky) 的场景，如用户登录状态存储在本地内存中。

**注意事项**：
- 后端服务器数量变化时，哈希映射会重新计算，可能导致部分用户会话中断
- 不适合动态扩容场景
### 3.5 通用哈希(Hash)
**指令**：`hash 键 [consistent];`

**原理**：基于自定义键(如用户 ID、请求参数)计算哈希值。

**示例**：
```
upstream backend {
    # 基于用户 ID 哈希，确保同一用户始终访问同一服务器
    hash $cookie_userid consistent;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}
```
**优势**：结合 consistent 参数(一致性哈希)，在服务器扩容时最小化重分配的流量。

## 四、健康检查
### 4.1 被动健康检查(开源版支持)
**原理**：Nginx 在转发请求时，如果与后端服务器通信失败，会记录失败次数。当失败次数达到 max_fails 阈值时，该服务器被标记为不可用，在 fail_timeout 时间内不再接收请求。

**配置示例：**
```
upstream backend {
    server 192.168.1.10:8080 max_fails=3 fail_timeout=30s;
    server 192.168.1.11:8080 max_fails=3 fail_timeout=30s;
}
```

### 4.2 主动健康检查(Nginx Plus 商业版支持)
**原理**：Nginx 定期主动向后端服务器发送探测请求，验证其健康状态，无需等待真实请求。

**配置示例**：
```
upstream backend {
    zone backend 64k;                    # 需要共享内存区域
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}

server {
    location / {
        proxy_pass http://backend;
        health_check;                    # 启用主动健康检查
    }
}
```

## 五、完整配置示例
### 5.1 七层(HTTP)负载均衡
```
http {
    # ============================================
    # 定义后端服务器组
    # ============================================

    upstream app_backend {
        # 最少连接算法(适合长连接场景)
        least_conn;

        # 主服务器
        server 192.168.1.10:8080 weight=3 max_fails=3 fail_timeout=30s;
        server 192.168.1.11:8080 weight=2 max_fails=3 fail_timeout=30s;

        # 备用服务器(仅当主服务器全挂时启用)
        server 192.168.1.12:8080 backup;
    }

    # ============================================
    # 虚拟主机
    # ============================================

    server {
        listen 80;
        server_name api.example.com;

        location / {
            proxy_pass http://app_backend;

            # 透传客户端信息
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

            # 连接超时设置
            proxy_connect_timeout 5s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;

            # 启用长连接
            proxy_http_version 1.1;
            proxy_set_header Connection "";
        }
    }
}
```
### 5.2 四层(TCP)负载均衡(MySQL 代理)
```
stream {
    # ============================================
    # 定义 MySQL 后端服务器组
    # ============================================

    upstream mysql_backend {
        # 最少连接算法
        least_conn;

        server 192.168.1.10:3306 weight=3 max_fails=3 fail_timeout=30s;
        server 192.168.1.11:3306 weight=2 max_fails=3 fail_timeout=30s;
        server 192.168.1.12:3306 backup;
    }

    # ============================================
    # 四层代理服务
    # ============================================

    server {
        listen 3306;
        proxy_pass mysql_backend;
        proxy_connect_timeout 5s;
        proxy_timeout 60s;
        proxy_limit_conn 1000;
    }
}
```
### 5.3 动静分离 + 负载均衡
```
http {
    upstream app_backend {
        server 192.168.1.10:8080 weight=3;
        server 192.168.1.11:8080 weight=2;
    }

    upstream static_backend {
        server 192.168.1.20:80;
        server 192.168.1.21:80;
    }

    server {
        listen 80;
        server_name www.example.com;

        # 静态资源 → static_backend
        location ~* \.(jpg|png|css|js|ico)$ {
            proxy_pass http://static_backend;
            expires 30d;
        }

        # 动态请求 → app_backend
        location / {
            proxy_pass http://app_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

## 六、总结
upstream 域是 Nginx 实现负载均衡和高可用的核心配置单元—它定义了一组后端服务器，通过灵活的算法和健康检查机制，将请求智能地分发到健康的服务器上，从而提升系统的吞吐量、可用性和可扩展性。掌握了 upstream，就掌握了 Nginx 负载均衡的核心能力。