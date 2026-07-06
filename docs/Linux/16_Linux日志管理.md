
## 一、概述

Linux 日志是系统运行状态、服务行为和安全事件的“黑匣子”。有效的日志管理可实现：

1. 故障快速定位
2. 安全入侵检测
3. 合规审计(如等保、ISO 27001)
4. 性能趋势分析

现代 Linux 日志体系主要由 rsyslog / syslog-ng(传统) 和 systemd-journald(现代) 双引擎驱动，并支持向 ELK、Loki、Graylog 等平台集中化。

## 二、日志分类与存储位置

### 2.1 按来源分类

| **日志类型** | **说明**               | **典型路径**                                                                 |
| -------- | -------------------- | ------------------------------------------------------------------------ |
| **系统日志** | 内核、守护进程、系统事件         | `/var/log/messages` (RHEL/CentOS)  <br>`/var/log/syslog` (Debian/Ubuntu) |
| **认证日志** | 登录、sudo、SSH 认证       | `/var/log/secure` (RHEL)  <br>`/var/log/auth.log` (Debian)               |
| **内核日志** | 硬件、驱动、OOM 等          | `dmesg` 命令 或 `/var/log/kern.log`                                         |
| **应用日志** | Nginx、MySQL、Docker 等 | 各自配置(如 `/var/log/nginx/access.log`)                                      |
| **审计日志** | 文件访问、命令执行(需 auditd)  | `/var/log/audit/audit.log`                                               |

### 2.2 关键日志文件速查

| **文件**              | **作用**                 | **系统**        |
| ------------------- | ---------------------- | ------------- |
| `/var/log/messages` | 通用系统日志                 | RHEL/CentOS   |
| `/var/log/syslog`   | 通用系统日志                 | Debian/Ubuntu |
| `/var/log/secure`   | SSH、sudo、用户登录          | RHEL/CentOS   |
| `/var/log/auth.log` | 认证相关日志                 | Debian/Ubuntu |
| `/var/log/cron`     | 定时任务执行记录               | 所有            |
| `/var/log/maillog`  | 邮件服务日志                 | RHEL          |
| `/var/log/dmesg`    | 内核环缓冲日志(启动信息)          | 所有            |
| `/var/log/journal/` | systemd-journald 二进制日志 | systemd 系统    |
- `secure`  ：负责“出入登记”(登录/提权)。
- `messages`  ：负责“日常运营”(系统通用消息)。
- `audit` ：负责“监控录像”(具体行为记录)。

## 三、日志查看与分析

### 3.1 基础查看命令

| **场景**     | **命令**                                          |
| ---------- | ----------------------------------------------- |
| 实时跟踪日志     | `tail -f /var/log/messages`                     |
| 查看最后 100 行 | `tail -n 100 /var/log/secure`                   |
| 搜索关键词      | `grep "Failed" /var/log/secure`                 |
| 分页查看       | `less /var/log/syslog`(按 `G` 到末尾，`/keyword` 搜索) |
| 统计错误次数     | `grep -c "error" /var/log/nginx/error.log`      |

### 3.2 使用 `journalctl`

```
# 查看所有日志
journalctl

# 实时跟踪
journalctl -f

# 查看某服务日志
journalctl -u nginx

# 查看本次启动日志
journalctl -b

# 查看内核日志
journalctl -k

# 按时间范围查询
journalctl --since "2026-01-12" --until "2026-01-13"

# 持久化日志(默认仅内存，重启丢失)
mkdir -p /var/log/journal
systemctl restart systemd-journald
```

**优势**：结构化日志、支持元数据过滤(如 `_PID=1234`)
### 3.3 日志持久化配置
默认情况下，日志只保存在内存中(`/run/log/journal/`)，服务器一重启，所有日志就没了，这对于排查问题的生产环境来说，是一个很大的风险。
因此，持久化 `journalctl` 日志是生产环境的**标准最佳实践**
- **方法一：创建目录(最直接)**  
    手动创建 `/var/log/journal/` 目录。只要这个目录存在，`systemd-journald` 服务就会自动将日志保存到磁盘上。
- **方法二：修改配置文件(更明确)**  
    编辑 `/etc/systemd/journald.conf` 文件，设置 `Storage=persistent`。这能更明确地指定日志存储策略。
**补充说明**：如果使用方法一，`Storage` 参数为默认的 `auto` 即可生效；如果使用方法二，系统会自动创建所需的目录。
### 3.4 模板设置
打开/etc/systemd/journald.conf,配置以下信息，达到日志优化
```
[Journal]
# 存储方式：persistent(持久化到 /var/log/journal/)
# 即使重启，日志也不会丢失
Storage=persistent

# 压缩旧日志，节省磁盘空间
Compress=yes

# 日志总大小上限(推荐 2G~5G，根据磁盘容量调整)
# 达到上限后，系统会自动删除最旧的日志
SystemMaxUse=2G

# 为系统保留的可用空间(默认 15%，通常保持默认即可)
# 确保日志不会占满整个磁盘
SystemKeepFree=15%

# 单个日志文件大小上限(默认无限制，建议设置防止单文件过大)
SystemMaxFileSize=500M

# 最多保留的日志文件个数(默认 100，足够使用)
SystemMaxFiles=100

# 日志最长保留时间(默认无限制，建议设置防止日志无限堆积)
# 超过 1 个月的日志会被自动清理(即使未达到大小上限)
MaxRetentionSec=1month

# 限流保护：30 秒内最多允许 10000 条日志
# 防止某个服务疯狂刷日志拖垮磁盘 I/O
RateLimitIntervalSec=30s
RateLimitBurst=10000

# 同步间隔：5 分钟将日志同步到磁盘
# 可根据业务对数据丢失的容忍度调整(越短越安全，但 I/O 开销越大)
SyncIntervalSec=5m

# 转发到 rsyslog(使 /var/log/messages 有日志)
# 如果你习惯用 tail -f /var/log/messages 排查问题，建议开启
ForwardToSyslog=yes

# 不转发到控制台(避免终端被日志刷屏)
ForwardToConsole=no

# 日志级别：存储所有级别(debug 及以上全部记录)
MaxLevelStore=debug

# 转发给 rsyslog 的最低级别(debug 表示全量转发)
MaxLevelSyslog=debug
```
**配置后生效步骤**
```
# 1. 创建持久化目录(如果尚未创建)
sudo mkdir -p /var/log/journal

# 2. 修改文件权限(确保 systemd-journald 可写)
sudo chown root:systemd-journal /var/log/journal
sudo chmod 2755 /var/log/journal

# 3. 重启 systemd-journald 服务
sudo systemctl restart systemd-journald

# 4. 将内存中的日志刷新到磁盘(保留已有日志)
sudo journalctl --flush

# 5. 验证配置是否生效
sudo journalctl --verify
```


## 四、日志轮转(Log Rotation)

防止日志无限增长导致磁盘占满。

### 4.1 `logrotate` 机制

配置文件：

- 主配置：`/etc/logrotate.conf`
- 应用配置：`/etc/logrotate.d/`(每个服务一个文件)

示例：Nginx 日志轮转(`/etc/logrotate.d/nginx`)

```
/var/log/nginx/*.log {
    daily
    missingok
    rotate 52          # 保留52份(约1年)
    compress           # 压缩旧日志(.gz)
    delaycompress      # 延迟压缩(保留最近1份未压缩)
    notifempty         # 空文件不轮转
    create 0640 nginx adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
```

### 4.2 手动触发轮转

```
# 测试配置
logrotate -d /etc/logrotate.conf

# 强制立即轮转
logrotate -f /etc/logrotate.d/nginx
```

确保应用支持日志重新打开(如 Nginx 的 `USR1` 信号)。

## 五、日志集中管理(Centralized Logging)

适用于多服务器环境。

### 5.1 架构模式

```
[Server1] → rsyslog → [Log Server] → ELK/Loki/Grafana
[Server2] → filebeat → [Log Server]
```

### 5.2 配置 rsyslog 客户端(发送日志)

编辑 `/etc/rsyslog.conf` 或新建 `/etc/rsyslog.d/remote.conf`

```
# 发送所有日志到 192.168.1.100:514 (UDP)
*.* @192.168.1.100:514

# 或使用 TCP(更可靠)
*.* @@192.168.1.100:514
```

```
systemctl restart rsyslog
```

### 5.3 配置 rsyslog 服务端(接收日志)

在日志服务器上启用 UDP/TCP 接收：

```
# /etc/rsyslog.conf
module(load="imudp")
input(type="imudp" port="514")

module(load="imtcp")
input(type="imtcp" port="514")
```

按主机名分类存储：

```
# 将不同主机日志存到不同文件
$template RemoteHost,"/var/log/remote/%HOSTNAME%/%PROGRAMNAME%.log"
*.* ?RemoteHost
```

## 六、安全与审计日志

### 6.1 启用 auditd(高级审计)

```
yum install audit audit-libs   # RHEL
apt install auditd             # Debian

systemctl enable --now auditd
```

```
auditctl -w /etc/passwd -p wa -k passwd_change
```

```
ausearch -k passwd_change
```

### 6.2 SSH 暴力破解检测

```
# 查找失败登录
grep "Failed password" /var/log/secure | awk '{print $11}' | sort | uniq -c | sort -nr

# 自动封禁(配合 fail2ban)
yum install fail2ban
systemctl enable --now fail2ban
```

## 七、常见问题排查

| **问题**          | **诊断方法**                                          |
| --------------- | ------------------------------------------------- |
| 日志不写入           | 检查磁盘空间(`df -h`)、权限(`ls -l /var/log`)、rsyslog 是否运行 |
| journal 日志重启后丢失 | 未创建 `/var/log/journal` 目录                         |
| cron 任务无日志      | 检查 `/var/log/cron`，确认任务输出是否重定向                    |
| 应用日志乱码          | 检查应用编码设置(如 Java 的 `-Dfile.encoding=UTF-8`)        |
| 日志轮转后应用仍写旧文件    | 应用未 reload(需发送信号或重启)                              |

## 八、最佳实践总结

### 1. 8.1 日志保留策略

1. 系统日志：保留 30～90 天
2. 安全日志：保留 180 天以上(满足合规)
3. 应用日志：按业务需求 + 磁盘容量平衡

### 2. 8.2 安全加固

4. 限制 `/var/log` 目录权限(`chmod 750 /var/log`)
5. 敏感日志(如 auth.log)仅 root 可读
6. 启用 auditd 监控关键文件

### 3. 8.3 集中化

7. 超过 3 台服务器 → 部署集中日志系统
8. 使用 Filebeat + ELK 或 Promtail + Loki

### 4. 8.4 监控告警

9. 对 “Failed login”、“Out of memory” 等关键词设置告警
10. 监控日志目录磁盘使用率

## 九、速查命令表

| **功能**    | **命令**                                  |
| --------- | --------------------------------------- |
| 实时查看日志    | `tail -f /var/log/messages`             |
| 查看系统日志    | `journalctl -u service_name`            |
| 搜索错误      | `grep -i "error\|fail" /var/log/syslog` |
| 手动轮转      | `logrotate -f /etc/logrotate.d/app`     |
| 查看内核消息    | `dmesg -T \| tail -20`                  |
| 查看登录历史    | `last` 或 `lastb`(失败登录)                  |
| 清空日志(谨慎！) | `> /var/log/file.log`                   |

**记住**：  
**“日志不是垃圾，而是系统的记忆。”**  
规范的日志管理 = 更快的故障恢复 + 更强的安全防线 + 更稳的合规保障。