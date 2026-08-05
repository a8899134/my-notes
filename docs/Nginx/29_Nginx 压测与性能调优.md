## 一、为什么要做性能测试与调优
### 1.1 性能测试的核心目标
性能测试不是“测个数字就完事”，而是为了解决实际问题：

| 目标 | 说明 |
|------|------|
| 验证上限 | 确认 Nginx 在当前配置下能支撑多少并发(如"单台 Nginx 能扛 1 万并发连接吗？") |
| 定位瓶颈 | 发现性能短板在哪—是 CPU 满了、内存不够、还是磁盘 I/O 跟不上 |
| 验证优化效果 | 用数据证明配置调整有效(如"开启 Gzip 后 QPS 提升了 20%") |
| 容量规划 | 提前判断应对大促峰值需要部署几台 Nginx |
### 1.2 性能调优的正确思路
性能调优不是“一次性配完就完事”，而是一个持续迭代的过程：
```
① 建立基线 → ② 压测观察 → ③ 分析瓶颈 → ④ 调整参数 → ⑤ 再次压测验证 → ⑥ 回到②
```

 **关键原则**：每次调参后都需回归压测验证效果。没有数据支撑的调优都是“凭感觉”，有了数据才是“科学优化”。

## 二、压测工具安装与使用

### 2.1 工具对比与选型
 
| 工具 | 特点 | 适用场景 | 并发上限 |
|------|------|----------|----------|
| ab(Apache Bench) | 轻量级、安装简单、命令直观 | 快速入门、基础压测 | 约 1 万并发 |
| wrk | 多线程、高性能、支持 Lua 脚本 | 高并发场景、复杂测试 | 数万并发 |
| JMeter | 功能全面、支持图形界面 | 复杂业务场景、分布式压测 | 取决于部署规模 |

### 2.2 安装压测工具

**安装 ab(Apache Bench)：**
```
# RockyLinux / CentOS
yum install -y httpd-tools

# Ubuntu / Debian
apt install -y apache2-utils

# 验证安装
ab -V
# 输出：This is ApacheBench, Version 2.3 <$Revision: 1430300 $>
```

**安装 wrk：**
```
# RockyLinux / CentOS
yum install -y wrk

# Ubuntu / Debian
apt install -y wrk

# 验证安装
wrk --version
```
### 2.3 使用 ab 进行基础压测

#### 核心参数说明
| 参数 | 含义 | 示例 |
|------|------|------|
| `-c` | 并发数：模拟多少用户同时访问 | `-c 100` |
| `-n` | 总请求数：总共发送多少请求 | `-n 10000` |
| `-t` | 测试持续时间(秒) | `-t 30` |
| `-k` | 启用 HTTP Keep-Alive(长连接) | `-k` |
| `-H` | 添加请求头 | `-H "Host: example.com"` |

1. 场景一：测试基础并发能力
```
# 模拟 100 个用户并发访问，总共发送 1000 个请求
ab -c 100 -n 1000 http://192.168.1.100/index.html
```

**命令拆解**：
- `-c 100`：100 个客户端同时发起请求
- `-n 1000`：总计发送 1000 个请求
- `http://192.168.1.100/index.html`：测试目标 URL

2. 场景二：测试静态资源性能(带长连接)
```
# 500 并发，共 5 万个请求，启用长连接
ab -k -c 500 -n 50000 http://192.168.1.100/static/style.css
```

**命令拆解**：
- `-k`：启用 Keep-Alive，复用 TCP 连接，减少三次握手开销
- 适合测试静态资源服务的吞吐能力

3. 场景三：测试 HTTPS 性能
```
ab -c 100 -n 1000 https://example.com/
```

4. 场景四：测试动态内容(PHP-FPM)
```
ab -c 50 -n 1000 http://192.168.1.100/info.php[reference:19]
```

### 2.4 解读 ab 测试结果
运行 ab 后，重点关注以下几行输出：
```
# 1. 确认测试参数是否正确
Server Software:        nginx/1.24.0
Server Hostname:        192.168.1.100
Server Port:            80

# 2. 最关键指标：每秒请求数(QPS/RPS)
Requests per second:    1245.67 [#/sec] (mean)
# ↑ 这个数值越高，代表 Nginx 吞吐能力越强

# 3. 平均响应时间(越低越好)
Time per request:       80.234 [ms] (mean)
# ↑ 每个请求的平均耗时
# 4. 失败请求数(必须为 0)
Failed requests:        0
# ↑ 如果有失败，需查看 error.log 定位问题

# 5. 传输数据量
Transfer rate:          1234.56 [Kbytes/sec] received
```

**快速判断标准**：
- `Requests per second` 越高 → 吞吐能力越强
- `Time per request` 越低 → 响应越快
- `Failed requests` > 0 → 系统有问题，需排查日志

### 2.5 使用 wrk 进行高并发压测
当并发数超过 1 万时，ab 自身可能成为瓶颈。此时应使用 wrk 进行压测。

1. 核心参数说明

| 参数 | 含义 | 示例 |
|------|------|------|
| `-t` | 线程数 | `-t 12` |
| `-c` | 并发连接数 | `-c 400` |
| `-d` | 测试持续时间 | `-d 30s` |

2. 基础用法
```
# 12 个线程、400 个并发连接、持续测试 30 秒
wrk -t12 -c400 -d30s http://192.168.1.100/index.html
```
3. 测试 HTTPS
```
wrk -t12 -c400 -d30s https://example.com/[reference:31]
```
4. 解读 wrk 测试结果
```
Running 30s test @ http://192.168.1.100/index.html
  12 threads and 400 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency    12.34ms   5.67ms  89.12ms   75.23%
    Req/Sec   345.67    89.12   512.34    68.45%
  124567 requests in 30.01s, 234.56MB read
Requests/sec:   4149.23
Transfer/sec:    7.82MB
```

**关键指标解读**：

| 指标 | 含义 | 数值越高/越低越好 |
|------|------|------------------|
| Latency | 请求延迟(平均/最大/标准差) | 越低越好 |
| Req/Sec | 每线程每秒请求数 | 越高越好 |
| Requests/sec | 总 QPS(最关键指标) | 越高越好 |
| Transfer/sec | 传输速率 | 越高越好 |

## 三、Nginx 核心性能参数调优
### 3.1 工作进程管理(Worker 进程)
1. worker_processes — 工作进程数

作用：决定 Nginx 启动多少个 Worker 进程来处理请求。每个 Worker 进程独立处理连接和请求。

**配置建议**：
```
# 自动匹配 CPU 核心数(推荐)
worker_processes auto;

# 或手动指定(如 4 核 CPU)
worker_processes 4;
```

原理：进程数过多会导致上下文切换开销，过少则无法充分利用 CPU 资源。auto 是最稳妥的选择。

2. worker_cpu_affinity — CPU 亲和性

作用：将 Worker 进程绑定到指定的 CPU 核心上运行，减少进程迁移导致的缓存失效。

配置示例(4 核 CPU)：
```
worker_processes auto;
worker_cpu_affinity 0001 0010 0100 1000;
```
### 3.2 连接优化
1. worker_connections — 单 Worker 最大连接数

作用：每个 Worker 进程能同时处理的连接数。

**计算公式**：理论最大并发连接数 = worker_processes × worker_connections

**配置示例**：
```
events {
    worker_connections 10240;   # 默认 512，高并发建议调至万级
}
```

**实际建议值**：
```
worker_connections ≤ (ulimit -n) / worker_processes - 32
```

2. use — 事件模型选择

作用：选择处理网络事件的内核机制。

**配置示例**：
```
events {
    use epoll;   # Linux 下首选
}
```

原理：epoll 采用事件驱动机制，避免轮询开销；select/poll 在连接数超过 1024 时性能急剧下降。

3. multi_accept — 批量接受连接

作用：控制 Worker 是否一次接受多个新连接。
```
events {
    multi_accept on;   # 高并发场景推荐开启
}
```

效果：在高并发连接涌入时，减少 accept() 系统调用的频次，提升吞吐量。

4. backlog — 连接队列深度
作用：设置 TCP 连接的等待队列长度。
```
server {
    listen 80 backlog=8192;   
}
```

**配套内核参数调整**：
```
sysctl -w net.core.somaxconn=8192
```

验证方法：ss -lnt | grep :80 查看 Listen 队列状态

### 3.3 请求处理效率
1.sendfile — 零拷贝传输

作用：启用后，Nginx 直接通过内核空间传输文件，避免用户态与内核态的数据拷贝。
```
http {
    sendfile on;   # 静态文件服务必备
}
```

效果：可降低 CPU 占用率 30% 以上
2. tcp_nopush 与 tcp_nodelay — TCP 协议优化
```
http {
    sendfile on;
    tcp_nopush on;   # 数据缓存至满一包再发送
    tcp_nodelay on;  # 禁用 Nagle 算法，降低延迟
}
```

### 3.4 缓冲区优化
```
http {
    # 请求头缓冲区[reference:64]
    client_header_buffer_size 16k;
    large_client_header_buffers 4 32k;   # 大请求头处理

    # 请求体缓冲区
    client_body_buffer_size 128k;

    # 输出缓冲区
    output_buffers 32 32k;
}
```
### 3.5 Keep-Alive 长连接优化
```
http {
    keepalive_timeout 75s;      # 保持连接存活时间
    keepalive_requests 1000;    # 单个连接最大请求数
```

**优化逻辑：** 延长 keepalive_timeout 可减少 TCP 三次握手开销，但会占用服务器资源；增大 keepalive_requests 适合静态资源服务，动态 API 建议保持默认。
### 3.6 日志优化(减少磁盘 I/O)
```
http {
    # 关闭静态资源访问日志
    location ~* \.(jpg|png|css|js)$ {
        access_log off;
    }

    # 启用日志缓冲[reference:69]
    access_log /var/log/nginx/access.log main buffer=32k flush=5s;
}
```

效果：buffer=32k flush=5s 可显著减少磁盘写入频率，降低 I/O 负载。

## 四、系统级调优
### 4.1 文件描述符限制(ulimit)
Nginx 的 worker_connections 受系统文件描述符限制。

**查看当前限制**：
```
ulimit -n
```
**临时调整**：
```
ulimit -n 65535
```
**永久调整**(`/etc/security/limits.conf`)：
```
* soft nofile 65535
* hard nofile 65535
```
**Nginx 配置同步**：
```
worker_rlimit_nofile 65535;   # 单进程最大文件描述符数[
```
### 4.2 网络内核参数优化
```
# /etc/sysctl.conf

# TCP 连接队列
net.core.somaxconn = 8192

# TIME_WAIT 复用
net.ipv4.tcp_tw_reuse = 1

# 本地端口范围
net.ipv4.ip_local_port_range = 1024 65535
```
**生效命令**：`sysctl -p`
### 4.3 压测时的系统资源监控

压测过程中，需同时监控系统资源，判断瓶颈所在：
```
# CPU 和内存
top -c

# 网络连接状态
ss -tlnp | grep nginx

# 查看 Nginx 状态页(需启用 stub_status)
curl http://127.0.0.1/nginx_status
```
**监控要点** 关注 Active connections、waiting 等关键指标，判断是连接建立、文件 I/O 还是后端处理成为瓶颈。

## 五、完整调优实战案例
### 5.1 调优前(默认配置)
**压测命令**：
```
ab -c 500 -n 50000 http://192.168.1.100/index.html
```
**调优前结果**：
- QPS ≈ 3,200
- 平均响应时间 ≈ 156 ms
- 错误率：2.3%
### 5.2 执行调优
1. 步骤一：调整 Nginx 核心参数
```
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    use epoll;
    worker_connections 10240;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 75s;
    keepalive_requests 1000;
    access_log /var/log/nginx/access.log main buffer=32k flush=5s;
}
```
2. 步骤二：调整系统限制
```
ulimit -n 65535
sysctl -w net.core.somaxconn=8192
```
3. 步骤三：重载配置并压测
```
nginx -t && systemctl reload nginx
ab -c 500 -n 50000 http://192.168.1.100/index.html
```
### 5.3 调优后结果对比
| 指标 | 调优前 | 调优后 | 提升 |
|------|--------|--------|------|
| QPS | 3,200 | 5,800 | +81% |
| 平均响应时间 | 156ms | 86ms | -45% |
| 错误率 | 2.3% | 0% | -100% |

实际优化效果因硬件和业务场景而异。有案例显示，系统级和应用级优化后 QPS 可提升 233%，延迟降低 67%。

**总结**：Nginx 性能调优不是“一次性配完”，而是 “压测 → 分析 → 调整 → 再压测” 的持续迭代过程。用数据驱动配置优化，比“凭感觉调参”靠谱得多。先装好 ab 或 wrk 做一次基线压测，再根据结果逐一调整参数，你就能让 Nginx 的性能提升数倍。