版本适用：Nginx 1.20+ / Apache HTTP Server 2.4+

## 一、概述

| 项目   | Nginx                          | Apache               |
| ---- | ------------------------------ | -------------------- |
| 诞生时间 | 2004 年(Igor Sysoev)            | 1995 年(Apache 软件基金会) |
| 开源协议 | BSD-like                       | Apache License 2.0   |
| 定位   | 高性能反向代理 + Web 服务器              | 全能型 Web 服务器          |
| 市场份额 | 全球 Top 1000 网站中 >60% 使用(含 CDN) | 传统企业、共享主机广泛使用        |

💡 核心差异：
- Apache：以“功能丰富、模块灵活”著称，适合复杂动态站点
- Nginx：以“高并发、低资源”见长，擅长静态内容与反向代理

## 二、架构模型对比

### 2.1 Apache：进程/线程模型(Prefork / Worker / Event)

三种 MPM(Multi-Processing Module)：

| MPM 类型      | 工作方式             | 适用场景                      |
| ----------- | ---------------- | ------------------------- |
| Prefork     | 每个请求一个独立进程(阻塞式)  | 兼容性好，适合非线程安全模块(如 mod_php) |
| Worker      | 多进程 + 每进程多线程     | 内存效率高，但需线程安全模块            |
| Event(2.4+) | 异步事件驱动(类似 Nginx) | 高并发优化版，但仍基于线程             |

⚠️ 即使 Event MPM，Apache 本质仍是 “每个连接占用一个线程/进程”，在 10K+ 并发时内存压力大。

### 2.2 Nginx：异步事件驱动 + 非阻塞 I/O

- 单主进程 + 多工作进程(worker)
- 每个 worker 进程采用 epoll(Linux)/ kqueue(BSD) 事件循环
- 一个 worker 可同时处理数万连接，无需为每个连接创建线程
![](/images/02_Nginx与Apache对比详解-20260602165155323.png)
✅ 优势：
- 内存占用恒定(不随连接数线性增长)
- 无上下文切换开销
- 天然适合反向代理、负载均衡

## 三、性能与资源消耗

| 场景              | Nginx             | Apache                       |
| --------------- | ----------------- | ---------------------------- |
| 静态文件服务          | 极快，低 CPU/内存       | 较慢，每连接消耗更多内存                 |
| 高并发(>10,000 连接) | 稳定高效              | Prefork 模式崩溃，Event 模式勉强支撑    |
| 内存占用(空载)        | 1–2 MB per worker | ～10–20 MB per process/thread |
| CPU 利用率         | 低(事件驱动)           | 高(上下文切换频繁)                   |

📊 实测数据(10,000 并发静态请求)：

- Nginx：内存 ≈ 15 MB，QPS ≈ 25,000
- Apache (Prefork)：内存 ≈ 500 MB+，QPS ≈ 3,000(可能 OOM)

## 四、功能与模块支持

| 功能            | Nginx                   | Apache                                  |
| ------------- | ----------------------- | --------------------------------------- |
| .htaccess 支持  | 不支持                     | 原生支持(目录级配置)                             |
| 动态模块加载        | (1.9.11+)               | (DSO 模块)                                |
| PHP 支持        | 通过 FastCGI(如 PHP-FPM)   | 原生 mod_php(嵌入式)                         |
| URL 重写        | `rewrite`<br><br>指令(强大) | `mod_rewrite`<br><br>(更灵活，支持 .htaccess) |
| 反向代理          | 核心功能，性能极佳               | 支持(mod_proxy)，但性能一般                     |
| 负载均衡          | 内置(轮询、IP Hash、权重)       | 需 mod_proxy_balancer                    |
| HTTP/2 & QUIC | (需 OpenSSL 1.0.2+)      | (2.4.17+，需 mod_http2)                   |

💡 关键区别：

- Apache 的 `.htaccess` 适合共享主机(用户可自定义规则)
- Nginx 的 集中式配置 更安全、高效，但需管理员权限

## 五、配置语法与管理

### 5.1 Apache 配置示例(虚拟主机)

```
<VirtualHost *:80>
    ServerName example.com
    DocumentRoot /var/www/html
    <Directory /var/www/html>
        AllowOverride All   # 启用 .htaccess
        Require all granted
    </Directory>
</VirtualHost>
```

### 5.2 Nginx 配置示例(虚拟主机)

```
server {
    listen 80;
    server_name example.com;
    root /var/www/html;
    index index.html;

    location / {
        try_files  $ uri  $ uri/ =404;
    }

    location ～ \.php $  {
        fastcgi_pass 127.0.0.1:9000;
        include fastcgi_params;
    }
}
```

| 对比项  | Apache                        | Nginx                 |
| ---- | ----------------------------- | --------------------- |
| 配置结构 | 嵌套 `<Directory>`、`<Location>` | 扁平 `location` 块匹配     |
| 热重载  | `apachectl graceful`          | `nginx -s reload`(无缝) |
| 错误排查 | 日志详细，但配置复杂                    | 日志简洁，配置逻辑清晰           |

## 六、静态 vs 动态内容处理

### 6.1 静态内容(HTML/CSS/JS/图片)

- Nginx：直接由内核 `sendfile()` 零拷贝发送，性能碾压 Apache
- Apache：需读入内存再发送，额外 CPU 开销

### 6.2 动态内容(PHP/Python/Java)

| 方案     | Nginx                         | Apache              |
| ------ | ----------------------------- | ------------------- |
| PHP    | 通过 PHP-FPM(FastCGI)           | 嵌入式 mod_php(简单但内存高) |
| Python | uWSGI / Gunicorn + proxy_pass | mod_wsgi(嵌入式)       |
| 性能     | 进程隔离，稳定性高                     | 内存共享，易受脚本影响         |

✅ 现代实践：  
即使使用 Apache，也推荐 PHP-FPM + mod_proxy_fcgi 替代 mod_php，以提升稳定性。

## 七、高并发与负载能力

| 指标               | Nginx                     | Apache                    |
| ---------------- | ------------------------- | ------------------------- |
| C10K 问题          | 原生解决                      | Prefork 无法解决，Event 模式部分解决 |
| 连接保持(Keep-Alive) | 高效复用                      | 每连接占线程，资源浪费               |
| 反向代理延迟           | 微秒级                       | 毫秒级                       |
| SSL/TLS 性能       | 支持 TLS 会话缓存、OCSP Stapling | 功能全，但 CPU 开销高             |

🌐 典型架构：

```
用户 → [Nginx] → [Apache/PHP-FPM/Tomcat]  
         ↑  
     (Nginx 做 SSL 终止 + 静态缓存 + 负载均衡)
```

## 八、软件差异总结
### 8.1 相同点

| 相同点     | 说明                    |
| ------- | --------------------- |
| 开源免费    | 均为成熟开源项目              |
| 跨平台     | 支持 Linux/Unix/Windows |
| 虚拟主机    | 支持基于域名/IP 的多站点        |
| SSL/TLS | 支持 HTTPS、证书配置         |
| 日志系统    | 访问日志 + 错误日志           |
| 扩展性     | 通过模块支持新功能             |

### 8.2 不同点

| 维度   | Nginx            | Apache             |
| ---- | ---------------- | ------------------ |
| 架构   | 异步事件驱动           | 进程/线程模型            |
| 并发模型 | 单 worker 处理万级连接  | 每连接需线程/进程          |
| 内存效率 | 极高               | 较低(尤其 Prefork)     |
| 配置方式 | 集中式、无 .htaccess  | 支持 .htaccess(灵活但慢) |
| 动态内容 | 依赖外部处理器(FastCGI) | 可嵌入解释器(如 mod_php)  |
| 适用场景 | 高并发、反向代理、静态加速    | 传统 LAMP、共享主机、复杂重写  |

## 十、选型建议

### 10.1 选择 Nginx 如果：

- 需要处理 高并发请求(>1,000 QPS)
- 作为 反向代理 / 负载均衡器
- 服务大量 静态资源(图片、视频、JS/CSS)
- 构建 微服务网关 或 API 网关
- 追求 低资源消耗 和 高稳定性

### 10.2 选择 Apache 如果：

- 使用 共享主机(需 .htaccess)
- 依赖 复杂 mod_rewrite 规则
- 运行 传统 PHP 应用(且不愿改造成 PHP-FPM)
- 团队熟悉 Apache 配置，迁移成本高
- 需要 内置身份认证、LDAP 集成 等企业功能

### 10.3 最佳实践(混合架构)

Nginx + Apache 组合 是许多大型网站的选择：

- Nginx：处理 SSL、静态文件、负载均衡
- Apache：运行动态应用(如 WordPress、Drupal)

既发挥 Nginx 的高性能，又保留 Apache 的灵活性。

## 十一、结语

Nginx 不是 Apache 的替代品，而是互补者。  
在现代 Web 架构中，两者常协同工作：  
Nginx 负责“快”，Apache 负责“全”。

选择的关键不在于“谁更好”，而在于 “你的业务需要什么”。

📄 附：快速决策表

| 需求                  | 推荐                       |
| ------------------- | ------------------------ |
| 高并发 API 网关          | Nginx                    |
| WordPress 博客(小流量)   | Apache 或 Nginx + PHP-FPM |
| 企业内部系统(需 .htaccess) | Apache                   |
| 视频/图片 CDN 边缘节点      | Nginx                    |
| 微服务架构入口             | Nginx                    |
