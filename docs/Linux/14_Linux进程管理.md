进程管理是理解系统运行、排查问题、优化性能的关键一步。在 Linux 中，一切运行中的程序都是“进程”(Process)，包括你打开的终端、Web 服务器、数据库等。
下面我将用清晰的结构 + 通俗语言 + 大量实用命令，带你从零彻底掌握 Linux 进程管理。

## 一、进程基础概念
1. 进程 = 正在运行的程序实例,比如：你运行 `firefox`，就启动了一个 Firefox 进程。
2. 每个进程有唯一 PID(Process ID)，由系统分配(1～65535)。
3. 进程有状态：运行(R)、睡眠(S)、僵尸(Z)、停止(T)等。
4. 进程有父子关系：父进程创建子进程(如 shell 启动 `ls`，shell 是父，`ls` 是子)。
备注说明: init/systemd 是所有进程的“祖先”(PID=1)。

## 二、查看进程
### 2.1 ps—快照式查看当前进程
```
# 查看当前终端的进程
ps

# 查看所有进程(BSD 风格，推荐)
ps aux
# a = 所有终端的进程
# u = 显示用户和资源使用
# x = 包括无控制终端的进程

# 查看进程树(显示父子关系)
ps axjf

# 只看某个用户的进程
ps -u yourname
```

输出字段含义：
- `USER`：进程所有者
- `PID`：进程 ID
- `%CPU` / `%MEM`：CPU 和内存占用
- `VSZ`：虚拟内存大小(KB)
- `RSS`：物理内存占用(KB)
- `TTY`：终端设备
- `STAT`：进程状态(S=sleep, R=running, Z=zombie)
- `COMMAND`：启动命令
### 2.2 top/ htop—实时动态监控
```
top
```
- 实时刷新，按 `q` 退出
- 按 `P` 按 CPU 排序，`M` 按内存排序
- 第一行：系统负载(load average)
- 第二行：进程总数、运行/睡眠/僵尸数
- 第三行：CPU 使用情况(us=user, sy=system, id=idle)
安装 htop(更友好)
```
sudo dnf install htop    # CentOS/Rocky/openEuler
sudo apt install htop    # Ubuntu/Debian
htop  # 彩色界面，支持鼠标操作！
```
### 2.3 pstree—以树状图显示进程关系
```
sudo dnf install psmisc
pstree
# 输出示例：
# systemd─┬─NetworkManager───2*[{NetworkManager}]
#         ├─sshd───sshd───bash───pstree
#         └─zabbix_agentd───4*[{zabbix_agentd}]
```


## 三、控制进程

### 3.1 启动进程(前台 vs 后台)

前台运行(阻塞终端)：

```
sleep 100   # 终端被占用，直到结束
```

后台运行(不阻塞终端)：

```
sleep 100 &   # 加 & 放入后台
# 输出：[1] 12345 (12345 是 PID)
```

- 将前台进程转后台：

1. 按 `Ctrl+Z` → 暂停进程(进入 stopped 状态)
2. 输入 `bg` → 让它在后台继续运行

- 查看后台任务

```
jobs
# 输出：[1]+ Running sleep 100 &
```

将后台任务调回前台：

```
fg %1   # %1 表示 jobs 编号
```

### 3.2 终止进程: kill/killall/pkill

方法 1：用 `kill` + PID(最精确)

```
# 先找到 PID
ps aux | grep nginx

# 发送终止信号(默认 SIGTERM，优雅退出)
kill 12345

# 强制杀死(SIGKILL，立即终止，慎用！)
kill -9 12345
```

⚠️ 不要滥用 `kill -9`！应先尝试普通 `kill`，给程序机会清理资源。

方法 2：用 `killall` + 进程名

```
killall firefox      # 终止所有 firefox 进程
killall -9 nginx     # 强制终止所有 nginx
```

方法 3：用 `pkill`(支持模糊匹配)

```
pkill -f "python myscript.py"   # 根据完整命令行杀进程
```

### 3.3 暂停与恢复进程

```
# 暂停进程(发送 SIGSTOP)
kill -STOP 12345

# 恢复进程(发送 SIGCONT)
kill -CONT 12345
```

这常用于调试或临时冻结高负载进程。

## 四、进程状态详解(STAT 列)

| 状态  | 含义            | 说明                           |
| --- | ------------- | ---------------------------- |
| `R` | Running       | 正在运行或可运行(在 CPU 队列中)          |
| `S` | Sleep         | 睡眠中(等待事件，如 I/O)✅ 最常见         |
| `D` | Disk Sleep    | 不可中断睡眠(通常在等磁盘 I/O)⚠️ 不能 kill |
| `T` | Stopped       | 被暂停(如 Ctrl+Z 或调试)            |
| `Z` | Zombie        | 僵尸进程(已结束但父进程未回收)             |
| `<` | High Priority | 高优先级进程                       |
| `N` | Low Priority  | 低优先级(nice 值高)                |

僵尸进程(Z)：不是病毒！只是残留条目，通常由父进程 bug 导致。重启父进程可清除。

## 五、服务(Service)与 systemd

现代 Linux(CentOS 7+、Ubuntu 16.04+)使用 systemd 管理系统服务(长期运行的进程)。

常用命令：

```
# 启动服务
sudo systemctl start nginx

# 停止服务
sudo systemctl stop nginx

# 重启服务
sudo systemctl restart nginx

# 查看服务状态
sudo systemctl status nginx

# 设置开机自启
sudo systemctl enable nginx

# 查看所有服务
systemctl list-units --type=service
```

服务 vs 普通进程：服务由 systemd 管理，可自动重启、记录日志、依赖控制。

## 六、排查问题实战

### 场景 1：CPU 占用 100%？

```
top          # 按 P 查看高 CPU 进程
ps aux --sort=-%cpu | head -n 10   # 直接列出前10高 CPU 进程
```
### 场景 2：内存不足？

```
free -h      # 查看内存使用
top          # 按 M 查看高内存进程
```
### 场景 3：进程卡死无法 kill？

- 如果是 `D` 状态(不可中断睡眠)，通常只能等待 I/O 完成或重启系统。
- 检查磁盘、网络是否故障。
### 场景 4：如何防止进程意外退出？

- 使用 `systemd` 管理为服务(设置 `Restart=always`)
- 或用 `nohup` / `screen` / `tmux` 启动：
```
nohup python app.py > app.log 2>&1 &
```

## 七、速查表

| 操作       | 命令                           |
| -------- | ---------------------------- |
| 查看所有进程   | `ps aux`                     |
| 实时监控     | `top` 或 `htop`               |
| 按 CPU 排序 | `top` → 按 `P`                |
| 按内存排序    | `top` → 按 `M`                |
| 终止进程     | `kill PID`                   |
| 强制终止     | `kill -9 PID`                |
| 终止同名进程   | `killall process_name`       |
| 后台运行     | `command &`                  |
| 查看后台任务   | `jobs`                       |
| 启动服务     | `sudo systemctl start name`  |
| 查看服务状态   | `sudo systemctl status name` |

## 八、总结与建议
1. 日常监控用 `top` / `htop`，快速定位高负载进程。
2. 终止进程优先用 `kill PID`，而不是 `kill -9`。
3. 长期运行的服务交给 `systemctl` 管理，不要手动后台运行。
4. 僵尸进程不用怕，但大量出现说明程序有 bug。
5. 不要随意 kill PID < 100 的进程(通常是系统关键进程)。
安全提醒：`kill -9` 是“终极武器”，用前请确认！