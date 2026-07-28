## 一、什么是 main 域
### 1.1 main 域的概念
main 域(也称为全局配置或顶级上下文)是 Nginx 配置文件 nginx.conf 的最外层作用域。
简单来说，整个配置文件本身就是 main 域，它不需要用花括号 {} 包裹，所有写在配置文件最外层的指令都属于 main 域。
### 1.2 main 域的特点
1. **隐式存在**：main 域不需要像 http { } 或 events { } 那样显式地写出来，配置文件的最外层天然就是 main 域。
2. **全局生效**：main 域中的配置会影响整个 Nginx 服务器的运行行为，如进程数量、运行用户、日志路径等。
3. **优先级最高**：main 域是所有配置的顶层，其他域(如 http、events、stream)都必须在 main 域内部定义。
### 1.3 main 域的位置
```
# ============================================
# main 域从这里开始(配置文件的第一行)
# 不需要写花括号，整个文件最外层就是 main 域
# ============================================

user nginx;                      # main 域指令
worker_processes auto;           # main 域指令
error_log /var/log/nginx/error.log warn;

# ============================================
# events 域：与 http 并列，同属于 main 域
# ============================================

events {
    worker_connections 1024;
}

# ============================================
# http 域：与 events 并列，同属于 main 域
# ============================================

http {
    # http 域内部配置
    server {
        # server 域内部配置
    }
}

# ============================================
# stream 域：与 http 并列，同属于 main 域
# ============================================

stream {
    # stream 域内部配置
}

# ============================================
# main 域到这里结束(配置文件的最后一行)
# ============================================
```
关键理解：events、http、stream 这三个顶级块都是 main 域的"子级"，它们共同构成了 Nginx 的完整配置。

## 二、main 域的核心指令
### 2.1 user — 指定运行用户

**语法**：`user 用户名 [用户组];`

**作用**：指定 Nginx 工作进程(Worker 进程)运行的操作系统用户和用户组。出于安全考虑，**通常不使用 `root` 用户**，而是创建一个专用的低权限用户(如 `nginx` 或 `www-data`)来运行。

**示例**：
```
user nginx;
# 或指定用户组
user nginx nginx;
```
### 2.2 worker_processes — 工作进程数

**语法**：`worker_processes 数字 | auto;`

**作用**：设置 Nginx 启动时创建的 Worker 进程数量。每个 Worker 进程负责处理实际的客户端请求。

**推荐值**：
- `worker_processes auto;`  **推荐生产环境使用**，Nginx 会自动检测 CPU 核心数并创建相同数量的 Worker 进程。
- 也可以手动指定，如 `worker_processes 4;`(服务器有 4 核 CPU 时)。

**为什么这样设置**：Worker 进程数通常与 CPU 核心数一致，可以最大化利用 CPU 资源，避免过多的进程切换开销。
### 2.3 worker_rlimit_nofile — 文件句柄限制
**语法**：`worker_rlimit_nofile 数字;`

**作用**：设置每个 Worker 进程能打开的最大文件描述符(文件句柄)数量。Nginx 在处理高并发请求时需要大量文件句柄(每个连接至少占用一个句柄)，默认值通常不够用。

**推荐值**：通常设置为 `65535` 或更高。

**注意事项**：此值不能超过系统内核参数 `fs.file-max` 的限制，且需要同时调整系统的 `ulimit -n` 值。
### 2.4 error_log — 错误日志
**语法**：`error_log 路径 日志级别;`

**作用**：指定 Nginx 错误日志的存放路径和记录的日志级别。错误日志是排查 Nginx 问题的最重要手段。

**日志级别**(从低到高)：

| 级别 | 说明 |
|------|------|
| `debug` | 调试信息，最详细(仅编译时启用 `--with-debug` 才支持) |
| `info` | 普通信息 |
| `notice` | 需注意的一般信息 |
| `warn` | 警告信息(**生产环境推荐**) |
| `error` | 错误信息 |
| `crit` | 严重错误 |
| `alert` | 需立即处理的错误 |
| `emerg` | 系统不可用，紧急状态 |

**示例**：
```
error_log /var/log/nginx/error.log warn;   # 生产环境推荐
error_log /var/log/nginx/error.log info;   # 调试时使用
```

**注意**：级别越高，记录的日志越少。生产环境设置为 `warn` 可避免日志过多占用磁盘。
### 2.5 pid — PID 文件路径
**语法**：`pid 文件路径;`

**作用**：指定 Nginx 主进程(Master 进程)的 PID(进程 ID)文件存放路径。systemd 或其他进程管理工具通过读取此文件来管理 Nginx 进程。

**示例**：
```
pid /var/run/nginx.pid;
# 或源码编译安装时的默认路径
pid /usr/local/nginx/logs/nginx.pid;
```
### 2.6 worker_priority — 进程优先级
**语法**：`worker_priority 数字;`

**作用**：设置 Worker 进程的调度优先级(nice 值)。nice 值范围是 -20 到 19，数值越低优先级越高。

**推荐值**：
- 默认不设置(nice 值为 0)
- 对延迟敏感的场景可设置为 `-5` 或 `-10`(提高优先级)
- 不建议低于 -10，以免影响系统其他进程

**示例**：
```
worker_priority -5;   # 提高 Worker 进程优先级
```
### 2.7 worker_cpu_affinity — CPU 亲和性
**语法**：`worker_cpu_affinity CPU掩码;`

**作用**：将 Worker 进程绑定到指定的 CPU 核心上运行，减少 CPU 缓存失效和进程迁移带来的性能开销。在高并发场景下，CPU 亲和性可以提升性能。

**示例**：
```
# 4 核 CPU：绑定到所有核
worker_cpu_affinity 0001 0010 0100 1000;

# 或使用 auto(Nginx 1.9.10+ 支持)
worker_cpu_affinity auto;
```

**注意**：`worker_processes` 数量必须与 `worker_cpu_affinity` 的掩码数量一致。
### 2.8 worker_shutdown_timeout — 优雅关闭超时
**语法**：`worker_shutdown_timeout 时间;`

**作用**：在关闭 Worker 进程时，允许其继续处理已有请求的最大等待时间。超过此时间后，Worker 进程会被强制终止。

**示例**：
```
worker_shutdown_timeout 30s;   # 最多等待 30 秒
```
### 2.9 daemon — 守护进程模式
**语法**：`daemon on | off;`

**作用**：控制 Nginx 是否以守护进程(后台服务)方式运行。

**说明**：
- `daemon on;`：默认值，Nginx 以守护进程方式在后台运行。
- `daemon off;`：前台运行，Docker 容器部署时必须设置为 `off` ，否则容器启动后会立即退出。

**示例：**
```
daemon off;   # Docker 容器中使用
```
### 2.10 load_module — 动态加载模块
**语法**：`load_module 模块文件路径;`

**作用**：动态加载 Nginx 模块(`.so` 文件)，无需重新编译 Nginx。从 Nginx 1.9.11 开始支持。

**示例**：
```
load_module modules/ngx_http_image_filter_module.so;
load_module modules/ngx_stream_module.so;
```
### 2.11 env — 设置环境变量

**语法**：`env 变量名[=值];`

**作用**：为 Nginx 进程设置环境变量，可使 Nginx 在运行时访问指定的环境变量。

**示例**：
```
env TZ=Asia/Shanghai;          # 设置时区
env MY_CUSTOM_VAR=some_value;
```

## 三、main 域与其他域的关系
### 3.1 main 域与 events 域的关系
events 块是 main 域的直接子级，两者平级关系中的”父子“体现在层级上。
```
# main 域开始
events {                       # events 域在 main 域内部
    worker_connections 1024;   # events 域的配置
}
# main 域继续
http { ... }
```

**注意**：events 块不能放在 http 或 server 块内部，它必须直接位于 main 域中。
### 3.2 main 域与 http 域的关系
http 块同样是 main 域的直接子级，它与 events 是”并列“关系，都直接挂在 main 域下。
```
# main 域
http {                         # http 域在 main 域内部
    server { ... }             # server 域在 http 域内部
}
```
### 3.3 main 域与 stream 域的关系
stream 块是 Nginx 用于 TCP/UDP 四层代理的顶级块，与 http 平级，同样直接挂在 main 域下。
```
# main 域
stream {                       # stream 域在 main 域内部(需编译时启用)
    server { ... }             # 四层代理配置
}
```
### 3.4 层级关系图
```
main(顶级域，隐式存在，不需要写花括号)
│
├── user nginx;                              ← main 域指令
├── worker_processes auto;                   ← main 域指令
├── error_log /var/log/nginx/error.log warn; ← main 域指令
├── pid /var/run/nginx.pid;                  ← main 域指令
│
├── events { ... }                           ← events 顶级块
│
├── http {                                   ← http 顶级块
│   ├── upstream { ... }                     ← http 内的子块
│   ├── server {                             ← http 内的子块
│   │   ├── listen 80;                       ← server 内的指令
│   │   ├── location / { ... }               ← server 内的子块
│   │   └── location /api/ { ... }
│   └── server { ... }                       ← 可多个 server
│   }
│
└── stream { ... }                           ← stream 顶级块
```
### 3.5 关键规则总结
| 块/指令 | 可放置位置 | 说明 |
|---------|------------|------|
| `events` | `main` 域(顶级) | 不能放入 `http`、`server` 或 `location` 内部 |
| `http` | `main` 域(顶级) | 不能放入 `events`、`server` 或 `location` 内部 |
| `stream` | `main` 域(顶级) | 需编译时启用 `--with-stream`，与 `http` 并列 |
| `server` | `http` 域或 `stream` 域内部 | 不能直接放在 `main` 域(需要先有 `http` 或 `stream`) |
| `upstream` | `http` 域或 `stream` 域内部 | 定义后端服务器组 |
| `location` | `server` 内部或嵌套在 `location` 内 | 不能直接放在 `http` 域 |
| `main` 域指令 | `main` 域(最外层) | 如 `user`、`worker_processes`、`error_log` |

**重要提醒:**
顶级块(events、http、stream)全局只能各有一个，且必须直接写在 nginx.conf 最外层，绝对不能在 conf.d/ 等子目录中重复定义。 conf.d/ 只能放这些顶级块内部的子配置(如 server、upstream)。

## 四、main 域常见配置示例
### 4.1 生产环境完整示例
```
# ============================================
# main 域：全局配置
# ============================================

# 运行用户(安全考虑，不使用 root)
user nginx;

# 工作进程数(自动匹配 CPU 核心数)
worker_processes auto;

# 每个 Worker 进程的最大文件句柄数
worker_rlimit_nofile 65535;

# 错误日志路径和级别(生产环境推荐 warn)
error_log /var/log/nginx/error.log warn;

# PID 文件路径
pid /var/run/nginx.pid;

# Worker 进程优先级(-20 到 19，负数优先级更高)
worker_priority -5;

# CPU 亲和性(将进程绑定到特定 CPU 核心)
worker_cpu_affinity auto;

# 优雅关闭超时时间(最长等待 30 秒)
worker_shutdown_timeout 30s;

# ============================================
# events 域：网络连接配置
# ============================================

events {
    use epoll;                      # Linux 下使用 epoll
    worker_connections 10240;       # 单进程最大连接数
    multi_accept on;                # 一次性接受所有新连接
}

# ============================================
# http 域：HTTP/HTTPS 配置
# ============================================

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    # ... 更多 http 配置
}
```
### 4.2 Docker 容器环境示例
```
# ============================================
# main 域：Docker 容器专用配置
# ============================================

user nginx;
worker_processes auto;
error_log /dev/stdout warn;          # 日志输出到标准输出(Docker 日志驱动)
pid /var/run/nginx.pid;

# Docker 容器必须前台运行
daemon off;                          # 关键配置！

events {
    worker_connections 1024;
}

http {
    # ... http 配置
}
```
### 4.3 开发调试环境示例
```
# ============================================
# main 域：开发调试配置
# ============================================

user nginx;
worker_processes 1;                  # 单进程便于调试
error_log /var/log/nginx/error.log debug;  # debug 级别(需编译时启用)

events {
    worker_connections 1024;
}

http {
    # ... http 配置
}
```

## 五、注意事项
 1. user 指令需要目标用户存在：指定的用户(如 nginx)必须在系统中已经创建，否则 Nginx 启动时会报错。
2.  workerrlimitnofile 受系统限制：不能超过内核参数 fs.file-max 和用户 ulimit -n 的限制。
3.  error_log 路径需要有写入权限：Nginx 用户需要对日志目录有写入权限。
4.  daemon off; 仅用于 Docker/调试：生产环境常规部署保持默认 on。
5. 顶级块(events、http、stream)全局只能各有一个，且必须直接写在 nginx.conf 最外层，绝对不能在 conf.d/ 等子目录中重复定义。 conf.d/ 只能放这些顶级块内部的子配置(如 server、upstream)。

**总结**：main 域是 Nginx 配置的“总指挥”，它定义了 Nginx 进程如何运行、在哪里记录日志、如何利用 CPU 资源，是所有其他配置(events、http、stream)的“根”。理解 main 域是掌握 Nginx 配置的第一步。