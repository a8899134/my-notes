Nginx 的运行原理、整体架构和数据流，是掌握 Web 服务器、反向代理、负载均衡乃至现代云原生网关(如 Ingress)的基础。

![](/images/01_Nginx运行原理简述-20260602165320457.png)

## 一、Nginx 的核心设计哲学

“高性能、高并发、低资源”  
通过 事件驱动(Event-Driven) + 异步非阻塞(Async Non-blocking) + 多进程模型 实现。
与 Apache 的 “一个连接一个线程” 模型不同，Nginx 能用 极少数进程处理数万并发连接。

## 二、Nginx 整体架构

```
                      +---------------------+
                      |     User Request    |
                      +----------+----------+
                                 |
                                 ▼
                 +-------------------------------+
                 |        Master Process         | ← 管理进程(不处理请求)
                 | - 读取配置                      |
                 | - 启动/停止 Worker              |
                 | - 平滑 reload(SIGHUP)          |
                 +--------------+----------------+
                                |
          +---------------------+----------------------+
          |                     |                      |
   +------+------+      +-------+------+       +-------+------+
   |  Worker 1   |      |  Worker 2    |       |  Worker N    | ← 工作进程
   | - 处理请求   |      | - 处理请求    |       | - 处理请求    |
   | - 事件循环   |      | - 事件循环    |       | - 事件循环    |
   +-------------+      +--------------+       +--------------+
          ▲                     ▲                      ▲
          |                     |                      |
   +------+------+      +-------+------+       +-------+------+
   |  Connection |      |  Connection  |       |  Connection  |
   |    (fd)     |      |     (fd)     |       |     (fd)     |
   +-------------+      +--------------+       +--------------+
```

### 2.1 关键特点

| 组件        | 作用        | 特性                                       |
| --------- | --------- | ---------------------------------------- |
| Master 进程 | 管理 Worker | root 权限启动，绑定 80/443 端口后降权                |
| Worker 进程 | 处理客户端请求   | 数量通常 = CPU 核心数(worker_processes auto) |
| 每个 Worker | 独立处理多路连接  | 使用 epoll(Linux)/ kqueue(BSD) 实现 I/O 多路复用 |

优势：
- 单个 Worker 崩溃不影响其他 Worker
- 平滑 reload：Master 启动新 Worker → 旧 Worker 处理完现有连接后退出

## 三、Nginx 数据流

当用户访问 `http://example.com/api/user`，Nginx 内部发生什么？

### 3.1 接收连接(Accept)

- 所有 Worker 进程同时监听同一个 socket(通过 `SO_REUSEPORT` 或共享 listen socket)
- 内核将新连接分发给其中一个 Worker(避免“惊群”问题)

### 3.2 解析请求(Parse)

- 读取 HTTP 请求头
- 匹配 `server {}` 块(基于 `Host` 头或 IP:Port)
- 匹配 `location {}` 块(基于 URI 路径)

### 3.3 执行指令(Execute Phases)

Nginx 将请求处理分为 11 个阶段(Phases)，模块按阶段注册处理函数：

| 阶段               | 典型模块                                  | 作用                |
| ---------------- | ------------------------------------- | ----------------- |
| SERVER_REWRITE | rewrite                             | server 级 URL 重写   |
| FIND_CONFIG    | —                                     | 匹配 location       |
| REWRITE        | rewrite                             | location 级 URL 重写 |
| POST_REWRITE   | —                                     | 重定向检查             |
| PREACCESS      | limit_conn, limit_req             | 访问控制前检查           |
| ACCESS         | auth_basic, allow/deny            | 权限验证              |
| POST_ACCESS    | —                                     | 错误页跳转             |
| TRY_FILES      | try_files                           | 尝试静态文件            |
| CONTENT        | proxy_pass, fastcgi_pass, index | 生成响应内容(核心)       |
| LOG            | access_log                          | 记录日志              |

关键：`proxy_pass`(反向代理)、`fastcgi_pass`(PHP)、`root`(静态文件)都在 `CONTENT` 阶段执行。

### 3.4 发送响应(Send)

- 将响应头 + 响应体通过 socket 发回客户端
- 支持 零拷贝(sendfile) 加速静态文件传输

### 3.5 关闭连接 or Keep-Alive

- 如果 `Connection: keep-alive`，则保持连接复用

## 四、核心机制详解

### 4.1 事件驱动(Event Loop)

每个 Worker 进程内部是一个无限循环：

```
for (;;) {
    // 1. 等待 I/O 事件(epoll_wait)
    events = epoll_wait(epoll_fd, ...);

    // 2. 遍历就绪事件
    for (event in events) {
        if (event.is_read) {
            // 读取请求数据
            read_request(event.fd);
        } else if (event.is_write) {
            // 发送响应数据
            send_response(event.fd);
        }
    }
}
```

非阻塞：读/写操作立即返回，不等待完成。

### 4.2 模块化架构

Nginx 功能由模块实现，编译时决定(动态模块需 `--add-dynamic-module`)：

| 模块类型                      | 举例                         | 作用         |
| ------------------------- | -------------------------- | ---------- |
| Core                      | ngx_core_module          | 基础功能       |
| HTTP                      | ngx_http_proxy_module    | 反向代理       |
| ngx_http_fastcgi_module | PHP-FPM 通信                 |            |
| ngx_http_rewrite_module | URL 重写                     |            |
| Event                     | ngx_epoll_module         | Linux 事件驱动 |
| Upstream                  | ngx_http_upstream_module | 负载均衡       |

你写的 proxy_pass 实际由 ngx_http_proxy_module 处理。

### 4.3 内存池(Memory Pool)

1. 每个请求分配一个内存池
2. 请求结束时一次性释放所有内存，避免碎片
3. 提升性能，减少 malloc/free 开销

## 五、典型应用场景数据流
![](/images/01_Nginx运行原理简述-20260602165120495.jpg)
### 5.1 静态文件服务

```
Client → Nginx (Worker)
          │
          ├─ 读取 /usr/share/nginx/html/index.html
          └─ 用 sendfile() 直接从磁盘→网卡(零拷贝)
```

### 5.2 反向代理(到后端 App)

```
Client → Nginx (Worker)
          │
          ├─ 解析 location /api
          ├─ proxy_pass http://backend;
          │
          ▼
     [Backend App: Flask/Django/Zabbix]
          │
          ▲
          └─ Nginx 转发响应给 Client
```

### 5.3 PHP-FPM(FastCGI)

```
Client → Nginx
          │
          ├─ location ～ \.php$
          ├─ fastcgi_pass unix:/run/php-fpm/www.sock;
          │
          ▼
       [PHP-FPM Pool]
          │
          ▲
          └─ Nginx 返回 PHP 输出
```

## 六、性能关键配置

| 配置项                        | 说明                 |
| -------------------------- | ------------------ |
| worker_processes auto;   | Worker 数 = CPU 核心数 |
| worker_connections 1024; | 每个 Worker 最大连接数    |
| use epoll;               | 使用高效事件模型(Linux)    |
| sendfile on;             | 静态文件零拷贝            |
| keepalive_timeout 65;    | 长连接复用              |

理论最大并发 = `worker_processes × worker_connections`

## 七、总结：nginx 为什么快？

| 特性                | 效果        |
| ----------------- | --------- |
| Master-Worker 多进程 | 利用多核，隔离故障 |
| 事件驱动 + 非阻塞 I/O    | 单线程处理数千连接 |
| 内存池               | 减少内存分配开销  |
| 模块化               | 按需加载，无冗余  |
| 零拷贝(sendfile)     | 静态文件极速传输  |
