
## 一、Fail 2 ban 简介

### 1.1 核心概念

Fail 2 ban 是一个开源的入侵防御软件框架，它通过监控系统日志文件(如 `/var/log/auth.log`)，自动检测恶意行为(如暴力破解 SSH 密码)，并利用防火墙(如 iptables)临时封禁攻击者的 IP 地址。

简单来说，Fail 2 ban 就是一个 “自动保安”：

- 眼睛：读取日志文件。
- 大脑：分析日志，识别攻击模式。
- 手：调用防火墙命令，把坏人“关在门外”。

### 1.2 它能做什么

- 防止 SSH 暴力破解：这是最常见的用途。当有人多次尝试错误密码登录你的服务器，Fail 2 ban 会自动将其 IP 加入黑名单。
- 防止 Web 登录爆破：可以监控 Nginx/Apache 日志，封禁反复尝试错误用户名/密码的 IP。
- 防止邮件服务器滥用：监控 Postfix/Dovecot 日志，阻止垃圾邮件发送者。
- 自定义防护：通过编写规则，可以防护任何产生日志的服务。

### 1.3 它不能做什么

- 不能替代防火墙：它是在防火墙之上的一层智能策略，本身不处理网络包。
- 不能防御 0 day 漏洞或复杂攻击：它主要针对基于日志的、可预测的重复性攻击(如暴力破解)。
- 不能实时拦截第一波攻击：攻击必须先发生并被记录到日志中，Fail 2 ban 才能响应。

## 二、安装与基础配置

### 2.1 安装 Fail 2 ban

Fail 2 ban 在主流 Linux 发行版的官方仓库中都有提供。

#### 2.1.1 在 Ubuntu/Debian 上安装

```
二、安装与基础配置
2.1 安装 Fail2ban
Fail2ban 在主流 Linux 发行版的官方仓库中都有提供。
2.1.1 在 Ubuntu/Debian 上安装
```

#### 2.1.2 在 CentOS/RHEL/Rocky Linux 上安装

```
# 启用 EPEL 仓库 (如果尚未启用)
sudo dnf install epel-release

# 安装 Fail2ban
sudo dnf install fail2ban
```

说明：安装完成后，Fail 2 ban 服务默认不会自动启动，需要手动启用。

### 2.2 启动与管理服务

安装后，你需要启动服务并设置开机自启。

```
# 启动 Fail2ban 服务
sudo systemctl start fail2ban

# 设置开机自启
sudo systemctl enable fail2ban

# 查看服务状态
sudo systemctl status fail2ban
```

命令解释：

- `systemctl start`：立即启动服务。
- `systemctl enable`：将服务加入系统启动项。
- `systemctl status`：检查服务是否正在运行，以及最近的日志。

### 2.3 配置文件结构

Fail 2 ban 的配置文件采用分层设计，强烈建议不要直接修改主配置文件，而是通过创建覆盖文件来定制。

- 主配置文件：`/etc/fail2ban/jail.conf`

- 警告：此文件由软件包管理，升级时会被覆盖。

- 本地自定义配置：`/etc/fail2ban/jail.local`

- 最佳实践：所有自定义配置都应写在此文件中，它会覆盖 `jail.conf` 中的同名设置。

- 过滤器规则目录：`/etc/fail2ban/filter.d/`

- 存放用于匹配日志的正则表达式规则文件(如 `sshd.conf`)。

- 动作脚本目录：`/etc/fail2ban/action.d/`

- 存放执行封禁/解封操作的脚本(如 `iptables-multiport.conf`)。

## 三、核心配置详解

### 3.1 创建自定义配置文件

首先，创建 `jail.local` 文件作为我们的配置入口。

```
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
```

说明：复制一份主配置作为模板，然后编辑 `jail.local`。

### 3.2 全局默认设置 (`[DEFAULT]` 节)

在 `jail.local` 文件顶部的 `[DEFAULT]` 节中，可以定义全局参数。

```
[DEFAULT]
# 封禁后持续的时间(秒)，-1 表示永久
bantime = 1h

# 在多长时间内(秒)达到最大重试次数即触发封禁
findtime = 10m

# 最大重试次数
maxretry = 5

# 封禁使用的“动作”，通常为 iptables 或 firewalld
banaction = iptables-multiport

# 发送邮件通知(可选)
# action = %(action_mwl)s
```

参数解释：

- `bantime = 1h`：封禁 1 小时。可以用 `s` (秒), `m` (分), `h` (时), `d` (天) 作为单位。
- `findtime = 10m`：在 10 分钟内。
- `maxretry = 5`：如果失败 5 次，就封禁。
- 组合起来的意思是：“10 分钟内失败 5 次，就封禁 1 小时”。

### 3.3 启用和配置具体防护项(Jail)

每个需要防护的服务称为一个 “Jail”(监狱)。常见的 Jail 如 `[sshd]`, `[nginx-http-auth]`。

#### 3.3.1 防护 SSH 服务 (`[sshd]`)

这是最重要的 Jail，通常默认已启用。

```
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 1d
```

参数解释：

- `enabled = true`：启用此 Jail。
- `port = ssh`：要封禁的端口，`ssh` 是 `/etc/services` 中定义的别名，等同于 `22`。
- `filter = sshd`：使用 `/etc/fail2ban/filter.d/sshd.conf` 中定义的规则来匹配日志。
- `logpath = /var/log/auth.log`：SSH 登录日志的位置(Ubuntu/Debian)。在 CentOS 上通常是 `/var/log/secure`。
- `maxretry = 3`：覆盖全局设置，更严格，只允许失败 3 次。
- `bantime = 1d`：封禁 1 天。

#### 3.3.2 防护 Nginx 基础认证 (`[nginx-http-auth]`)

如果你的网站使用了 `.htpasswd` 进行基础认证，可以防护爆破。

```
[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
```

注意：确保 Nginx 的错误日志路径正确，并且有权限读取。

## 四、常用管理命令

Fail 2 ban 提供了一个强大的客户端工具 `fail2ban-client` 来管理运行中的实例。

### 4.1 查看状态

```
# 查看所有 Jail 的总体状态
sudo fail2ban-client status

# 查看特定 Jail (如 sshd) 的详细状态
sudo fail2ban-client status sshd
```

输出示例：

```
Status for the jail: sshd
|- Filter
|  |- Currently failed: 2
|  `- Total failed:     15
`- Actions
   |- Currently banned: 1
   |  `- IP list:       203.0.113.5
   `- Total banned:     3
```

这表示 `sshd` Jail 当前有 2 个失败尝试，总共失败 15 次；当前封禁了 1 个 IP(203.0.113.5)，历史上总共封禁过 3 个 IP。

### 4.2 手动封禁与解封

在紧急情况下，可以手动操作。

```
# 手动封禁一个 IP (例如 192.168.1.100)
sudo fail2ban-client set sshd banip 192.168.1.100

# 手动解封一个 IP
sudo fail2ban-client set sshd unbanip 192.168.1.100
```

说明：`sshd` 是 Jail 的名称，`banip` / `unbanip` 是操作指令。

### 4.3 重新加载配置

修改 `jail.local` 后，无需重启整个服务，只需重载即可。

```
# 重新加载配置
sudo fail2ban-client reload
```

优点：此操作不会中断现有的封禁规则，平滑生效。

## 五、故障排查与日志

### 5.1 Fail 2 ban 自身日志

Fail 2 ban 的日志对于诊断问题至关重要。

- 日志位置：`/var/log/fail2ban.log`
- 查看实时日志：

```
sudo tail -f /var/log/fail2ban.log
```

### 5.2 常见问题排查

#### 5.2.1 Fail 2 ban 没有封禁 IP

1. 检查 Jail 是否启用：确认 `jail.local` 中对应 Jail 的 `enabled = true`。
2. 检查日志路径：确认 `logpath` 指向的日志文件存在且有内容。
3. 测试过滤器：使用 `fail2ban-regex` 工具测试日志是否能被正确匹配。

```
# 测试 auth.log 中的内容是否能被 sshd 过滤器匹配
sudo fail2ban-regex /var/log/auth.log /etc/fail2ban/filter.d/sshd.conf
```

如果输出中 `Summary` 显示 `Matched: 0`，说明过滤器规则可能不匹配你的日志格式。

#### 5.2.2 被自己 IP 误封

如果不小心把自己封了，可以通过以下方式解决：

- 从其他 IP 登录，然后执行 `unbanip` 命令。
- 在本地控制台(如云服务器的 VNC 控制台)登录，然后解封。
- 预防措施：可以在 `[DEFAULT]` 节中设置 `ignoreip`，永远不封禁这些 IP。

```
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 192.168.1.0/24 203.0.113.10
```

说明：`ignoreip` 列出了白名单 IP，用空格分隔。包括了本地回环、内网网段和你自己的固定公网 IP。

## 六、总结与最佳实践

### 6.1 关键要点回顾

- Fail 2 ban 是通过分析日志来自动封禁恶意 IP 的工具。
- 永远在 `jail.local` 中进行配置，而不是 `jail.conf`。
- SSH 防护是重中之重，务必启用并设置严格的 `maxretry`。
- 使用 `fail2ban-client` 命令可以方便地查看状态和管理 IP。

### 6.2 运维最佳实践

1. 上线即部署：新服务器初始化时，应将安装和配置 Fail 2 ban 作为标准流程。
2. 设置 IP 白名单：通过 `ignoreip` 保护自己的管理 IP，避免被锁。
3. 定期审查：偶尔检查 `/var/log/fail2ban.log` 和 `fail2ban-client status`，了解服务器的安全状况。
4. 组合防御：Fail 2 ban 是重要的一环，但不是全部。应结合强密码/密钥登录、最小化开放端口、使用 WAF 等多种手段构建纵深防御体系。
