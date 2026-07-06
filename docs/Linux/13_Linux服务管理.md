服务(Service) 是指那些在后台持续运行、提供特定功能的程序(如 Web 服务器、数据库、SSH 登录等)。现代 Linux 发行版(如 CentOS 7+、Ubuntu 16.04+、Debian 8+)几乎都使用 `systemd` 作为初始化系统和服务管理器。
掌握 Linux 服务管理，是你部署应用、维护系统、排查故障的核心能力。

## 一、什么是 systemd
systemd 是 Linux 的“一号进程”(PID=1)，负责：
1. 启动系统
2. 管理服务(启动/停止/重启/开机自启)
3. 记录日志(通过 `journalctl`)
4. 管理挂载点、定时任务、套接字等
取代了旧的 SysV init 和 Upstart，成为事实标准。

## 二、查看服务状态

### 2.1 查看某个服务的状态

```
sudo systemctl status nginx
```

输出包含：

- 是否正在运行(active: active (running))
- 主进程 PID
- 最近日志片段
- 是否开机自启(Loaded: enabled)

即使服务未安装，也可以运行此命令(会提示 not found)。

### 2.2 列出所有服务

```
# 查看所有已加载的服务(包括 inactive)
systemctl list-units --type=service

# 只看正在运行的服务
systemctl list-units --type=service --state=running

# 查看所有服务(含未加载的)
systemctl list-unit-files --type=service
```

## 三、控制服务：启动、停止、重启

| 操作          | 命令                             |
| ----------- | ------------------------------ |
| 启动服务        | `sudo systemctl start nginx`   |
| 停止服务        | `sudo systemctl stop nginx`    |
| 重启服务        | `sudo systemctl restart nginx` |
| 重载配置(不中断服务) | `sudo systemctl reload nginx`  |

`reload` vs `restart`：

- `reload`：仅重新读取配置文件(如 Nginx、Apache 支持)
- `restart`：完全停止再启动(会中断连接)

## 四、设置开机自启

很多新手部署完服务后，发现重启系统服务就没了——就是因为没设开机自启！

```
# 设置开机自启
sudo systemctl enable nginx

# 取消开机自启
sudo systemctl disable nginx

# 查看是否已启用
systemctl is-enabled nginx
# 输出：enabled / disabled
```

`enable` 并不会立即启动服务，只是创建一个软链接到 `/etc/systemd/system/multi-user.target.wants/`。

## 五、查看服务日志

systemd 集成了日志系统 journald，无需直接查 `/var/log/` 文件。

```
# 查看某个服务的实时日志
sudo journalctl -u nginx -f

# 查看最近 100 行
sudo journalctl -u nginx -n 100

# 查看本次启动以来的日志
sudo journalctl -u nginx -b

# 按时间过滤(今天)
sudo journalctl -u nginx --since today
```

## 六、创建自定义服务

假设你有一个 Python 脚本 `/opt/myapp/app.py`，想让它作为服务运行。

### 6.1 创建服务单元文件

```
sudo vi /etc/systemd/system/myapp.service
```

内容如下：

```
[Unit]
Description=My Custom Application
After=network.target

[Service]
Type=simple
User=myuser
WorkingDirectory=/opt/myapp
ExecStart=/usr/bin/python3 /opt/myapp/app.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```
**参数说明**
1. Description   服务的描述。`systemctl status` 时显示。
2. After  指定在哪些服务之后启动。例如 `network.target`。
3. Type  进程类型。`simple` 表示进程在前台运行(Python/Node.js 常用)。
4. User  指定运行服务的用户(不要用 root)。
5. WorkingDirectory 工作目录。相当于先 `cd` 到这里再启动程序。
6. ExecStart 完整的启动命令(用绝对路径)。
7. Restart 自动重启策略。`always` 表示不管什么原因退出都重启。
8. RestartSec 重启前等待的秒数，防止因瞬时故障疯狂重启。
9. WantedBy 固定填 `multi-user.target`，表示进入多用户模式时自动启动。
### 6.2 重载 systemd 配置

```
sudo systemctl daemon-reexec
sudo systemctl daemon-reload
```

### 6.3 启动并设为开机自启

```
sudo systemctl start myapp
sudo systemctl enable myapp
```

### 6.4 验证

```
systemctl status myapp
journalctl -u myapp -f
```

关键字段说明：

- `Type=simple`：主进程就是 ExecStart 启动的进程
- `Restart=always`：崩溃自动重启
- `User=`：以普通用户运行(安全！不要用 root)

## 七、常见问题与避坑指南

### 7.1 `Failed to start xxx.service: Unit not found`

- 原因：服务名错误，或服务未安装。
- 解决：

```
# 查找可用服务
systemctl list-unit-files | grep xxx
```

### 7.2 服务启动失败，状态为 `failed`

解决：立即查日志！

```
sudo journalctl -u your-service --no-pager
```

常见原因：

- 配置文件语法错误
- 端口被占用
- 权限不足(如无法写日志目录)
- 依赖服务未启动(如数据)

### 7.3 修改了服务文件，但没生效

必须重载：

```
sudo systemctl daemon-reload
sudo systemctl restart your-service
```

### 7.4 如何让服务在特定用户下运行？

在 `[Service]` 中指定：

```
User=www-data
Group=www-data
```

## 八、systemd 服务类型简表

| Type      | 适用场景                                 |
| --------- | ------------------------------------ |
| `simple`  | 主进程就是服务本身(如 Nginx、自定义脚本)✅ 最常用        |
| `forking` | 服务会 fork 子进程后退出父进程(如传统守护进程)          |
| `oneshot` | 只运行一次就退出(如初始化脚本)                     |
| `notify`  | 服务会通过 sd_notify() 通知 systemd 已就绪(高级) |

## 九、速查表

| 操作      | 命令                                    |
| ------- | ------------------------------------- |
| 查看服务状态  | `sudo systemctl status name`          |
| 启动服务    | `sudo systemctl start name`           |
| 停止服务    | `sudo systemctl stop name`            |
| 重启服务    | `sudo systemctl restart name`         |
| 重载配置    | `sudo systemctl reload name`          |
| 开机自启    | `sudo systemctl enable name`          |
| 取消自启    | `sudo systemctl disable name`         |
| 查看日志    | `sudo journalctl -u name -f`          |
| 创建自定义服务 | 编辑 `/etc/systemd/system/name.service` |

## 十、总结与建议

1. 所有长期运行的程序都应做成 systemd 服务，而不是简单 `nohup &`。
2. 部署服务后，务必执行 `enable`，否则重启就没了！
3. 排错第一反应：`journalctl -u 服务名`。
4. 自定义服务要指定 `User`，避免用 root 运行应用(安全最佳实践)。
5. 修改服务文件后，必须 `daemon-reload`。

安全提醒：不要随意 `enable` 不信任的服务，它会在开机时自动运行！