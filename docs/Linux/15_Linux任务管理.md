
## 一、概述

Linux 任务管理是系统资源调度与自动化运维的基石。其核心围绕三大维度展开:

| 管控对象          | 本质                 | 生命周期         | 典型场景            |
| ------------- | ------------------ | ------------ | --------------- |
| 进程(Process)   | 正在运行的程序实例          | 从启动到终止       | Web 服务、数据库、脚本执行 |
| 后台任务(Job)     | 当前 Shell 会话中的可控制任务 | Shell 会话存在期间 | 临时调试、交互式长任务     |
| 定时任务(Cron/At) | 按计划自动触发的任务         | 系统级长期存在      | 日志轮转、数据备份、监控告警  |
|               |                    |              |                 |

三者关系:
- 进程是底层运行实体；
- 后台任务是对当前 Shell 中进程的“作业控制”；
- 定时任务是系统级自动创建进程的机制。

## 二、进程管理(Process Management)

### 2.1 查看进程

#### 2.1.1 ps :静态快照
```
# 查看所有进程(BSD 风格)
ps aux

# 查看完整格式(System V 风格)
ps -ef

# 按用户查看
ps -u nginx

# 按 CPU 使用率排序(需配合 sort)
ps aux --sort=-%cpu | head -n 10
```
#### 2.1.2 top/htop:动态监控
```
top          # 内置工具
htop         # 增强版(需安装:yum install htop)
```
- 交互操作:
- `P` → 按 CPU 排序
- `M` → 按内存排序
- `k` → 输入 PID 终止进程
- `1` → 显示各 CPU 核心使用率
#### 2.1.3 `pstree`:进程树视图
```
pstree -p    # 显示 PID
pstree -u    # 显示用户
```
### 2.2 控制进程
#### 2.2.1 终止进程
```
# 优雅终止(发送 SIGTERM，允许清理)
kill 1234

# 强制终止(发送 SIGKILL，立即杀死)
kill -9 1234

# 按名称批量终止
pkill firefox
killall nginx
```
最佳实践:优先使用 `kill`，仅在无响应时用 `kill -9`。
#### 2.2.2 调整优先级
```
# 启动时设置 nice 值(-20～19，值越小优先级越高)
nice -n 10 ./heavy_task.sh &

# 修改运行中进程的优先级
renice 5 -p 1234
```
### 2.3 进程诊断
```
# 查看进程打开的文件
lsof -p 1234

# 查看进程工作目录
pwdx 1234

# 实时跟踪系统调用(高级调试)
strace -p 1234

# 查看进程环境变量
cat /proc/1234/environ | tr '\0' '\n'
```

## 三、后台任务管理
注意:作业控制仅作用于 当前 Shell 会话，关闭终端后任务将终止(除非使用 `nohup` 或终端复用工具)。
### 3.1 基础操作

| 操作     | 命令/快捷键      | 说明           |
| ------ | ----------- | ------------ |
| 启动后台任务 | `command &` | 任务在后台运行      |
| 挂起前台任务 | `Ctrl + Z`  | 暂停当前任务       |
| 查看作业列表 | `jobs`      | 显示 [编号] + 状态 |
| 切回前台   | `fg %1`     | `%1`表示作业编号 1 |
| 放入后台继续 | `bg %1`     | 恢复运行但不占终端    |

```
$ sleep 1000
^Z                          # 按 Ctrl+Z
[1]+  Stopped               sleep 1000

$ jobs
[1]+ Stopped                sleep 1000

$ bg %1
[1]+ sleep 1000 &

$ fg %1                     # 切回前台(可再次 Ctrl+Z)
```
### 3.2 长期后台运行
#### 3.2.1 `nohup`:忽略挂断信号

```
nohup ./my_script.sh > output.log 2>&1 &
```

输出重定向至文件，避免终端关闭后丢失日志

#### 3.2.2 `screen` / `tmux`:终端会话持久化

```
# 使用 screen
screen -S mytask      # 创建会话
# 运行命令后按 Ctrl+A, D 脱离
screen -r mytask      # 重新连接

# 使用 tmux(更现代)
tmux new -s mytask
# 脱离:Ctrl+B, D
tmux attach -t mytask
```

生产建议:长期服务应封装为 `systemd service`，而非依赖作业控制。  

## 四、定时任务管理
### 4.1 `cron`:周期性任务

#### 4.1.1 用户级定时任务

```
# 编辑当前用户 cron 任务
crontab -e

# 查看任务列表
crontab -l

# 删除所有任务
crontab -r
```

#### 4.1.2 时间格式

```
# 分 时 日 月 周 命令
  *  *  *  *  *  command
```

```
# 每天凌晨 2:30 执行备份
30 2 * * * /backup.sh >> /var/log/backup.log 2>&1

# 每 5 分钟检查服务
*/5 * * * * systemctl is-active myapp || systemctl restart myapp
```

#### 4.1.2 系统级 cron

1. `/etc/crontab`:全局配置(需指定用户)
2. `/etc/cron.d/`:独立任务文件(推荐用于部署)

### 4.2 `at`:一次性延迟任务

```
# 安装 at(部分系统默认未装)
yum install at    # RHEL/CentOS
apt install at    # Debian/Ubuntu

# 提交任务
echo "reboot" | at now + 30 minutes

# 查看队列
atq

# 删除任务
atrm <job_id>
```

注意:`at` 服务需启用:`systemctl enable --now atd`

### 4.3 `systemd timer`

适用于需要日志集成、依赖管理的场景:

```
# /etc/systemd/system/mytask.timer
[Unit]
Description=Run mytask daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

```
# /etc/systemd/system/mytask.service
[Service]
ExecStart=/path/to/script.sh
```

```
systemctl enable --now mytask.timer
```

优势:与 journal 日志集成、支持依赖、更精确的时间控制。

## 五、典型问题排查

| 问题现象       | 诊断命令                      | 解决方案                    |
| ---------- | ------------------------- | ----------------------- |
| 系统卡顿       | `top` → 查高 CPU/MEM 进程     | `kill` 异常进程             |
| 磁盘 I/O 高   | `iotop`(需安装)              | 优化 I/O 密集型任务            |
| 定时任务未执行    | `grep CRON /var/log/cron` | 检查路径、权限、输出重定向           |
| 后台任务消失     | `jobs` 无输出                | 已脱离当前 Shell，改用 `screen` |
| 僵尸进程(Z 状态) | `ps aux \| awk '$8=="Z"'` | 重启父进程或系统                |

## 六、最佳实践总结

### 6.1 进程管理

- 用 `htop` 替代 `top`
- 终止进程先 `kill`，再 `kill -9`
- 关键服务通过 `systemd` 管理

### 6.2 后台任务

- 仅用于临时调试
- 长期任务用 `nohup`、`screen` 或 `systemd service`

### 6.3 定时任务

- 所有 cron 任务必须重定向日志
- 避免在 cron 中使用相对路径
- 敏感任务使用 `systemd timer` 替代 cron

## 七、速查命令表

| 功能     | 命令                              |
| ------ | ------------------------------- |
| 查看所有进程 | `ps aux`                        |
| 实时监控   | `htop`                          |
| 终止进程   | `kill PID`                      |
| 查看作业   | `jobs`                          |
| 后台运行   | `command &`                     |
| 挂起任务   | `Ctrl+Z`                        |
| 编辑定时任务 | `crontab -e`                    |
| 一次性任务  | `echo "cmd" \| at now + 1 hour` |
| 持久会话   | `screen -S name`                |

说明:  
“进程是运行的实体，作业是 Shell 的视角，定时是系统的计划。”  
掌握这三者，你就掌握了 Linux 任务管理的核心脉络。