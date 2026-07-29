## 一、什么是 stream 域
### 1.1 stream 域的概念
stream 域(四层代理配置块)是 Nginx 配置文件中与 http、events 并列的顶级配置块，专门用于处理 TCP(传输控制协议) 和 UDP(用户数据报协议) 的代理与负载均衡。
简单来说， stream 域让 Nginx 不仅能代理 HTTP/HTTPS 请求(七层)，还能代理数据库、Redis、SSH、DNS 等任何基于 TCP/UDP 协议的服务(四层)。
### 1.2 stream 域与 http 域的区别
| 对比维度 | `http` 域(七层代理) | `stream` 域(四层代理) |
|----------|---------------------|----------------------|
| **工作层级** | OSI 第七层(应用层) | OSI 第四层(传输层) |
| **处理协议** | HTTP/HTTPS | TCP/UDP |
| **能否"看懂"内容** | ✅ 能解析 URL、Header、Cookie 等 | ❌ 不解析内容，只转发原始数据包 |
| **典型应用** | Web 服务器、API 网关 | 数据库代理、Redis 代理、DNS 转发 |
| **性能** | 相对较慢(有拆包解析开销) | 更快(纯转发，延迟更低) |
| **配置复杂度** | 较复杂(`location`、`rewrite` 等) | 较简单(无复杂路由规则) |

**说明:**
- 配置的是 Web 服务器、API 网关、静态资源 等与 HTTP 相关的内容，就去 http 域。
- 配置的是 数据库、Redis、SSH、DNS 等 TCP/UDP 服务的代理，就去 stream 域。
### 1.3 stream 域的位置
stream 块必须直接写在 main 域(配置文件最外层)中，与 http 块平级并列，不能放在 http、server 或 location 内部。
```
# ============================================
# main 域(配置文件最外层)
# ============================================

user nginx;
worker_processes auto;

# ============================================
# events 域：与 http 平级
# ============================================

events {
    worker_connections 1024;
}

# ============================================
# http 域：七层代理(与 stream 平级)
# ============================================

http {
    # HTTP 相关配置
}

# ============================================
# stream 域：四层代理(与 http 平级)
# ============================================

stream {
    # TCP/UDP 代理配置
}
```

## 二、启用 stream 模块
### 2.1 检查是否已启用
stream 模块默认不编译进 Nginx，需要额外启用。
检查当前 Nginx 是否支持 stream：
```
nginx -V 2>&1 | grep -- "--with-stream"
```
**命令解释**：
- nginx -V：显示 Nginx 版本和所有编译参数
- 2>&1：将错误输出重定向到标准输出(因为 -V 输出到 stderr)
- grep -- "--with-stream"：筛选是否包含 --with-stream 参数，
有输出(如 --with-stream)→ 已支持，无输出 → 未支持，需要安装或重新编译。

### 2.2 安装 stream 模块
#### 2.2.1 YUM 安装
如果使用 YUM/DNF 安装的 Nginx，可以单独安装 stream 模块：
```
# RockyLinux / CentOS
dnf install -y nginx-mod-stream

# Ubuntu / Debian
apt install -y nginx-mod-stream

```
安装后，在 `nginx.conf` 顶部加载模块：
```
load_module modules/ngx_stream_module.so;
```
#### 2.2.2 源码编译添加 stream 模块
如果需要重新编译 Nginx，在 `./configure` 时添加 `--with-stream` 参数：
```
./configure \
    --prefix=/usr/local/nginx \
    --with-http_ssl_module \
    --with-stream \              # 启用 stream 模块
    --with-stream_ssl_module     # (可选)支持 stream 的 SSL/TLS
make -j$(nproc) && make install
```

## 三、stream 域的配置结构
### 3.1 层级结构
```
stream(顶级，与 http 并列)
├── upstream(二级)              # 后端服务器组定义
│   └── server(三级)            # 具体的后端服务器
├── server(二级)                # 四层代理虚拟服务器
│   ├── listen(三级指令)        # 监听端口和协议
│   ├── proxy_pass(三级指令)    # 转发目标
│   ├── proxy_timeout(三级指令) # 超时控制
│   └── ...                       # 其他 proxy_* 指令
└── access_log(二级指令)        # 访问日志(1.11.4+)
```
### 3.2 基础配置模板
```
stream {
    # ============================================
    # upstream 块：定义后端服务器组
    # ============================================

    upstream mysql_backend {
        server 192.168.1.10:3306 weight=3;
        server 192.168.1.11:3306;
        server 192.168.1.12:3306 backup;
    }

    upstream dns_servers {
        server 192.168.1.20:53;
        server 192.168.1.21:53;
    }

    # ============================================
    # server 块：定义监听和转发规则
    # ============================================

    # TCP 代理示例(MySQL)
    server {
        listen 3306;                          # 监听 3306 端口
        proxy_pass mysql_backend;             # 转发到 upstream 组
        proxy_connect_timeout 5s;             # 连接后端超时
        proxy_timeout 60s;                    # 会话超时
    }

    # UDP 代理示例(DNS)
    server {
        listen 53 udp;                        # 监听 UDP 53 端口
        proxy_pass dns_servers;               # 转发到 DNS 服务器组
        proxy_timeout 1s;                     # UDP 超时时间
        proxy_responses 1;                    # 期望的响应数量
    }

    # 直接指定后端地址(不使用 upstream)
    server {
        listen 2222;
        proxy_pass 192.168.1.30:22;           # 转发到指定 SSH 服务
    }
}
```

## 四、stream 域的核心指令
### 4.1 listen — 监听端口
**语法**：`listen 地址:端口 [参数];`

**作用**：指定 `stream` 服务器监听的 IP 地址和端口。

**常用参数**：

| 参数 | 说明 |
|------|------|
| `udp` | 监听 UDP 协议(默认是 TCP) |
| `ssl` | 启用 SSL/TLS 加密 |
| `reuseport` | 多个 Worker 共享同一端口，提升性能 |
| `backlog=数字` | 设置连接等待队列的最大长度 |
| `proxy_protocol` | 启用 PROXY 协议(获取客户端真实 IP) |

**示例**：
```
stream {
    server {
        listen 3306;                         # TCP，默认
        # 或
        listen 53 udp;                       # UDP
        # 或
        listen 443 ssl;                      # SSL/TLS
        # 或
        listen 127.0.0.1:3306;               # 仅本地监听
        # 或
        listen [::]:3306;                    # IPv6
        # 或
        listen unix:/var/run/mysql.sock;     # Unix 域 socket
    }
}
```
### 4.2 proxy_pass — 转发目标
**语法**：`proxy_pass 地址;`

**作用**：指定将接收到的 TCP/UDP 连接转发到哪个后端服务器或服务器组。

**示例**：
```
stream {
    upstream backend {
        server 192.168.1.10:8080;
    }

    server {
        listen 12345;
        proxy_pass backend;                  # 转发到 upstream 组
        # 或
        proxy_pass 192.168.1.20:3306;        # 直接转发到指定地址
        # 或
        proxy_pass unix:/tmp/socket;         # 转发到 Unix 域 socket
    }
}
```
### 4.3 proxy_timeout — 会话超时
**语法**：`proxy_timeout 时间;`

**默认值**：`10m`(10 分钟)

**作用**：设置在客户端与后端服务器之间没有数据传输时，连接可以保持空闲的最长时间。超时后，Nginx 会关闭连接。

**示例**：
```
stream {
    server {
        listen 3306;
        proxy_pass mysql_backend;
        proxy_timeout 60s;    # 空闲 60 秒后关闭连接
    }
}
```
### 4.4 proxy_connect_timeout — 连接后端超时
**语法**：`proxy_connect_timeout 时间;`

**默认值**：`60s`

**作用**：设置 Nginx 与后端服务器建立连接的最大等待时间。如果后端无响应超过此时间，Nginx 会返回错误。

**示例**：
```
stream {
    server {
        listen 3306;
        proxy_pass mysql_backend;
        proxy_connect_timeout 5s;    # 5 秒内连不上后端则报错
    }
}
```
### 4.5 upstream — 后端服务器组
**语法**：`upstream 名称 { server 地址 [参数]; ... }`

**作用**：定义一组后端服务器，供 `proxy_pass` 引用，实现负载均衡。

**server 参数**：

| 参数 | 说明 |
|------|------|
| `weight=数字` | 权重，值越大分配越多请求 |
| `backup` | 备用服务器，仅当主服务器都不可用时才使用 |
| `max_fails=数字` | 最大失败次数，超过后标记为不可用 |
| `fail_timeout=时间` | 失败后的恢复等待时间 |

**负载均衡算法**：
| 算法 | 说明 |
|------|------|
| 轮询(默认) | 按顺序轮流分配 |
| 加权轮询 | 按 `weight` 比例分配 |
| 最少连接(`least_conn;`) | 分配给当前连接数最少的服务器 |
| IP 哈希(`hash $remote_addr consistent;`) | 同一 IP 始终分配到同一服务器 |

**示例**：
```
stream {
    upstream backend {
        # 默认轮询
        server 192.168.1.10:8080;
        server 192.168.1.11:8080;
    }

    upstream weighted_backend {
        # 加权轮询：10 收到 3 倍于 11 的流量
        server 192.168.1.10:8080 weight=3;
        server 192.168.1.11:8080 weight=1;
    }

    upstream leastconn_backend {
        # 最少连接
        least_conn;
        server 192.168.1.10:8080;
        server 192.168.1.11:8080;
    }

    upstream hash_backend {
        # IP 哈希(保持会话粘性)
        hash $remote_addr consistent;
        server 192.168.1.10:8080;
        server 192.168.1.11:8080;
    }
}
```
### 4.6 access_log — 访问日志
**语法**：`access_log 路径 格式;`

**作用**：记录 stream 代理的访问日志，用于监控和排查。

**示例**：
```
stream {
    log_format basic '$remote_addr [$time_local] $protocol $status $bytes_sent $bytes_received $session_time';
    access_log /var/log/nginx/stream-access.log basic;
}
```
### 4.7 proxy_bind — 绑定源 IP
**语法**：`proxy_bind 地址;`

**作用**：指定 Nginx 连接后端服务器时使用的源 IP 地址。当后端服务器限制了只允许特定 IP 访问时，此指令非常有用。

**示例**：
```
stream {
    server {
        listen 3306;
        proxy_pass 192.168.1.10:3306;
        proxy_bind 192.168.1.100;    # 使用 192.168.1.100 作为源 IP 连接后端
    }
}
```
### 4.8 proxy_download_rate / proxy_upload_rate — 限速
**语法**：`proxy_download_rate 速率;` / `proxy_upload_rate 速率;`

**作用**：限制从后端下载(proxy_download_rate)或向客户端上传(proxy_upload_rate)的速度。单位是字节/秒，0 表示不限速。

**示例**：
```
stream {
    server {
        listen 3306;
        proxy_pass mysql_backend;
        proxy_download_rate 1024k;   # 下载限速 1MB/s
        proxy_upload_rate 512k;      # 上传限速 512KB/s
    }
}
```

## 五、典型应用场景
### 5.1 MySQL 负载均衡
将 MySQL 数据库请求分发到多个数据库实例。
```
stream {
    upstream mysql_cluster {
        server 192.168.1.10:3306 weight=3;
        server 192.168.1.11:3306 weight=2;
        server 192.168.1.12:3306 backup;
    }

    server {
        listen 3306;
        proxy_pass mysql_cluster;
        proxy_connect_timeout 5s;
        proxy_timeout 60s;
    }
}
```
### 5.2 Redis 代理与负载均衡
将 Redis 请求分发到多个 Redis 实例。
```
stream {
    upstream redis_cluster {
        server 127.0.0.1:6379;
        server 127.0.0.1:6380;
        server 127.0.0.1:6381;
    }

    server {
        listen 6379;
        proxy_pass redis_cluster;
        proxy_timeout 30s;
    }
}
```
客户端连接 Nginx 的 6379 端口，Nginx 会将请求轮询转发到三个 Redis 实例之一。
### 5.3 SSH 端口转发
将 SSH 连接转发到内网服务器。
```
stream {
    server {
        listen 2222;
        proxy_pass 192.168.1.100:22;
        proxy_timeout 300s;    # SSH 长连接，超时设长一些
    }
}
```
用户通过 `ssh -p 2222 user@nginx-server` 即可连接到内网的 `192.168.1.100`。
### 5.4 DNS 负载均衡(UDP)
将 DNS 查询分发到多个 DNS 服务器。
```
stream {
    upstream dns_servers {
        server 8.8.8.8:53;
        server 1.1.1.1:53;
    }

    server {
        listen 53 udp reuseport;
        proxy_pass dns_servers;
        proxy_timeout 1s;
        proxy_responses 1;
    }
}
```
### 5.5 多端口范围监听
Nginx 1.15.10 开始支持端口范围监听：
```
stream {
    server {
        listen 10000-10099;    # 监听 10000 到 10099 共 100 个端口
        proxy_pass backend;
    }
}
```

## 六、综合配置示例
以下是一个完整的 stream 域配置，涵盖 TCP/UDP 代理、负载均衡、日志记录等。
```
# ============================================
# 完整 Nginx 配置模板(含 main / events / stream)
# 适用场景：MySQL / Redis / DNS / SSH 四层代理
# 环境：RockyLinux 8 / Nginx 1.24+
# ============================================


# ============================================
# main 域：全局配置
# ============================================

# 运行用户(安全考虑，不使用 root)
user nginx;

# 工作进程数(自动匹配 CPU 核心数)
worker_processes auto;

# 每个 Worker 进程的最大文件句柄数(需配合系统 ulimit -n)
worker_rlimit_nofile 65535;

# 错误日志路径和级别(生产环境推荐 warn)
error_log /var/log/nginx/error.log warn;

# PID 文件路径
pid /var/run/nginx.pid;


# ============================================
# events 域：网络连接模型
# ============================================

events {
    # Linux 下使用 epoll(Nginx 默认自动选择，此行为可选)
    use epoll;

    # 单 Worker 进程最大连接数
    worker_connections 10240;

    # 一次性接受所有新连接(高并发场景推荐开启)
    multi_accept on;
}


# ============================================
# stream 域：四层代理(TCP/UDP)
# ============================================

stream {
    # - 全局日志格式 -
    log_format stream_main '$remote_addr [$time_local] $protocol $status '
                           '$bytes_sent $bytes_received $session_time '
                           '"$upstream_addr" "$upstream_bytes_sent" "$upstream_bytes_received"';

    # 访问日志(按服务拆分便于排查)
    access_log /var/log/nginx/stream-access.log stream_main;
    error_log  /var/log/nginx/stream-error.log warn;


    # ============================================
    # 服务1：MySQL 读写分离 + 负载均衡
    # ============================================

    upstream mysql_backend {
        # 最少连接算法(长连接场景最优)
        least_conn;

        # 主库(高性能机器，权重 3)
        server 192.168.1.10:3306 weight=3 max_fails=2 fail_timeout=30s;

        # 从库1(中等性能，权重 2)
        server 192.168.1.11:3306 weight=2 max_fails=2 fail_timeout=30s;

        # 冷备节点(仅当所有主节点全挂时激活)
        server 192.168.1.12:3306 backup;
    }

    server {
        listen 3306;
        proxy_pass mysql_backend;

        # 连接后端超时(5秒内连不上则报错)
        proxy_connect_timeout 5s;

        # 会话空闲超时(60秒无数据交互则断开)
        proxy_timeout 60s;

        # 限流：防止数据库连接池被瞬间打满
        proxy_limit_conn 1000;

        # ===== 安全防护：只允许内网应用服务器访问 =====
        # 注意：stream 块中的 allow/deny 需要 Nginx 1.19.10+
        allow 192.168.1.0/24;   # 允许整个内网网段
        deny all;               # 拒绝其他所有来源
    }


    # ============================================
    # 服务2：Redis 集群(IP Hash 保持会话粘性)
    # ============================================

    upstream redis_backend {
        # IP 哈希：同一客户端 IP 始终路由到同一台 Redis
        hash $remote_addr consistent;

        server 127.0.0.1:6379 max_fails=2 fail_timeout=30s;
        server 127.0.0.1:6380 max_fails=2 fail_timeout=30s;
        server 127.0.0.1:6381 max_fails=2 fail_timeout=30s;
    }

    server {
        listen 6379;
        proxy_pass redis_backend;

        # Redis 连接超时设置
        proxy_connect_timeout 1s;
        proxy_timeout 30s;

        # 限流
        proxy_limit_conn 500;

        # 安全防护
        allow 192.168.1.0/24;
        deny all;
    }


    # ============================================
    # 服务3：DNS 转发(UDP 协议)
    # ============================================

    upstream dns_servers {
        # DNS 服务器列表(公共 DNS)
        server 8.8.8.8:53;
        server 1.1.1.1:53;
        server 114.114.114.114:53;
    }

    server {
        # UDP 监听，reuseport 提升多 Worker 性能
        listen 53 udp reuseport;

        proxy_pass dns_servers;

        # DNS 查询超时(1秒)
        proxy_timeout 1s;

        # 期望的响应数量(UDP 场景)
        proxy_responses 1;

        # 限流(DNS 查询通常很短，连接数可设大一些)
        proxy_limit_conn 2000;

        # 安全防护(仅允许内网 DNS 查询)
        allow 192.168.1.0/24;
        deny all;
    }


    # ============================================
    # 服务4：SSH 端口转发(内网跳板机)
    # ============================================

    server {
        listen 2222;

        # 直接转发到内网 SSH 服务器
        proxy_pass 192.168.1.100:22;

        # SSH 长连接，超时设长一些
        proxy_connect_timeout 10s;
        proxy_timeout 300s;   # 5 分钟无数据则断开

        # 限流
        proxy_limit_conn 50;

        # 安全防护：只允许内网应用服务器访问(仅允许运维网段)
        allow 10.0.0.0/8;     # 运维网段
        deny all;
    }


    # ============================================
    # 服务5：MySQL 管理端口(只读，仅运维可用)
    # ============================================

    server {
        listen 3307;

        # 直连主库管理端口，不做负载均衡
        proxy_pass 192.168.1.10:3306;
        proxy_connect_timeout 5s;
        proxy_timeout 60s;

        # 严格限制访问来源(仅运维人员)
        allow 10.0.0.10/32;   # 运维堡垒机 IP
        deny all;
    }
}
```

## 七、注意事项

1. 模块需单独启用，stream 模块默认不编译，需 --with-stream 或单独安装模块包.
2. stream 块只能有一个与 http 一样，全局只能有一个 stream 块.
3. UDP 需显式声明 ,listen 必须加 udp 参数才是 UDP 代理
4. 日志记录有延迟，stream 日志在会话结束时才写入，长时间连接日志会有延迟
5. 不支持 HTTP 特有功能	没有 location、rewrite、proxy_set_header 等指令

**总结**：stream 域让 Nginx 从“Web 服务器”升级为“全能网络代理”—不仅能处理 HTTP 请求，还能代理任何 TCP/UDP 服务(数据库、缓存、DNS、SSH 等)。它配置简单、性能极高，是构建微服务、数据库集群、内部网络基础设施的利器