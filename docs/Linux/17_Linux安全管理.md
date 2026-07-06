
## 一、概述

Linux 安全管理不是单一工具的配置，而是一个 多层次、持续演进的过程。其核心围绕 CIA 三要素：

1. Confidentiality(机密性)：防止未授权访问敏感数据
2. Integrity(完整性)：确保系统与数据不被篡改
3. Availability(可用性)：保障服务持续可用，抵御 DoS

安全原则：

1. 最小权限原则(Least Privilege)
2. 默认拒绝(Default Deny)
3. 审计可追溯(Audit Everything)
4. 自动化加固(Automate Hardening)

## 二、安全架构分层模型

```
┌───────────────────────┐
│ 7. 应用安全            │ ← Web/App 漏洞防护
├───────────────────────┤
│ 6. 日志与监控          │ ← 集中日志、入侵检测
├───────────────────────┤
│ 5. 主机安全            │ ← SELinux、文件完整性
├───────────────────────┤
│ 4. 网络安全            │ ← 防火墙、网络隔离
├───────────────────────┤
│ 3. 身份与访问控制       │ ← 用户、sudo、SSH
├───────────────────────┤
│ 2. 系统加固            │ ← 内核参数、服务精简
├───────────────────────┤
│ 1. 物理/启动安全        │ ← BIOS 密码、Secure Boot
└───────────────────────┘
```

## 三、核心安全实践

### 3.1 身份与访问控制

#### 3.1.1 用户账户管理

```
# 禁用无用账户
sudo usermod -L games    # 锁定账户
sudo userdel -r news     # 删除账户及家目录

# 设置密码策略(/etc/login.defs)
PASS_MAX_DAYS   90       # 密码有效期
PASS_MIN_DAYS   1        # 修改间隔
PASS_MIN_LEN    12       # 最小长度
PASS_WARN_AGE   7        # 过期前警告

# 使用 PAM 强化(/etc/pam.d/common-password)
password requisite pam_pwquality.so retry=3 minlen=12 difok=3
```

#### 3.1.2 SSH 安全加固

```
# /etc/ssh/sshd_config
PermitRootLogin no                # 禁止 root 登录
PasswordAuthentication no         # 禁用密码，仅用密钥
PubkeyAuthentication yes
AllowUsers alice bob@192.168.1.*  # 限制用户/IP
MaxAuthTries 3                    # 最大尝试次数
ClientAliveInterval 300           # 自动断开空闲连接
```

```
sudo systemctl reload sshd
```

#### 3.1.3 sudo 权限最小化

```
# /etc/sudoers(使用 visudo 编辑)
alice ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx
%webadmin ALL=(root) /bin/systemctl status *, /bin/journalctl -u nginx
```

避免 `NOPASSWD: ALL`！  

### 3.2 系统服务与内核加固

#### 3.2.1 禁用非必要服务

```
# 查看运行服务
systemctl list-units --type=service --state=running

# 禁用蓝牙、打印等
sudo systemctl disable bluetooth cups avahi-daemon
```

#### 3.2.2 内核参数安全(/etc/sysctl.d/99-security.conf)

```
# 网络防护
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1

# 内存与进程安全
kernel.randomize_va_space = 2      # ASLR
kernel.yama.ptrace_scope = 2       # 限制调试
fs.suid_dumpable = 0               # 禁止 core dump

# 信息泄露防护
kernel.dmesg_restrict = 1          # 普通用户不可读 dmesg
```

```
sudo sysctl -p /etc/sysctl.d/99-security.conf
```

#### 3.2.3 文件系统挂载加固(/etc/fstab)

```
/tmp     tmpfs defaults,noexec,nosuid,nodev 0 0
/var/tmp tmpfs defaults,noexec,nosuid,nodev 0 0
/home    ext4  defaults,nodev 0 2
```

### 3.3 网络安全(防火墙)

```
# 设置默认 zone 为 drop(最严格)
sudo firewall-cmd --set-default-zone=drop

# 仅开放必要服务
sudo firewall-cmd --permanent --zone=drop --add-service=ssh
sudo firewall-cmd --permanent --zone=drop --add-port=443/tcp

# 允许内网管理
sudo firewall-cmd --permanent --zone=trusted --add-source=10.0.0.0/8

sudo firewall-cmd --reload
```

策略建议：

- 外网接口：`drop` 或 `block`
- 内网接口：`internal` 或自定义 `trusted`

### 3.4 强制访问控制(SELinux / AppArmor)

```
# 永久启用 enforcing 模式
sudo sed -i 's/^SELINUX=.*/SELINUX=enforcing/' /etc/selinux/config
sudo setenforce 1
```

### 3.5 日志审计与监控

#### 3.5.1 启用 auditd 监控关键行为

```
# /etc/audit/rules.d/audit.rules
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-a always,exit -F arch=b64 -S execve -C uid!=euid -k priv_esc
-w /usr/bin/sudo -p x -k privilege
```

```
sudo systemctl enable --now auditd
```

#### 3.5.2 集中日志(rsyslog 示例)

```
# 客户端：/etc/rsyslog.d/remote.conf
*.* @@logserver.example.com:514

# 服务端：/etc/rsyslog.conf
module(load="imtcp")
input(type="imtcp" port="514")
template(name="RemoteHost" type="string" string="/var/log/remote/%HOSTNAME%/%PROGRAMNAME%.log")
*.* ?RemoteHost
```

#### 3.5.3 入侵检测(Fail 2 ban)

```
sudo yum install fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
# 编辑 jail.local，启用 [sshd]
sudo systemctl enable --now fail2ban
```

### 3.6 漏洞管理与合规基线

#### 3.6.1 定期扫描漏洞

```
# 使用 lynis(综合安全审计)
curl -O https://packages.cisofy.com/keys/cisofy-software-public.key
sudo apt-key add cisofy-software-public.key
echo "deb https://packages.cisofy.com/community/lynis/deb/ stable main" | sudo tee /etc/apt/sources.list.d/cisofy-lynis.list
sudo apt update && sudo apt install lynis
sudo lynis audit system
```

#### 3.6.2 应用 CIS 基线

- 下载官方 Benchmark：[https://www.cisecurity.org/cis-benchmarks/](https://www.cisecurity.org/cis-benchmarks/)
- 使用自动化工具：

- OpenSCAP(RHEL 官方支持)
- Ansible Hardening Roles(如 `dev-sec.os-hardening`)

#### 3.6.3 内核与软件更新

```
# 自动安全更新(Ubuntu)
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# RHEL/CentOS(使用 dnf-automatic)
sudo dnf install dnf-automatic
sudo systemctl enable --now dnf-automatic-install.timer
```

## 四、应急响应准备

| 场景       | 应对措施                                                                    |
| -------- | ----------------------------------------------------------------------- |
| 疑似入侵     | 1. 断网隔离  <br>2. 保留内存镜像(`/proc/kcore`)  <br>3. 收集日志(audit.log, auth.log) |
| 勒索软件     | 1. 立即断电  <br>2. 从离线备份恢复  <br>3. 分析攻击入口(SSH? Web?)                       |
| 0 day 漏洞 | 1. 启用 WAF/IPS 临时拦截  <br>2. 限制服务暴露面  <br>3. 等待补丁 + Live Patch            |

## 五、安全加固检查清单

### 5.1 账户与认证

- root 无法 SSH 登录
- 密码复杂度 ≥12 位
- 闲置账户已禁用

### 5.2 网络与服务

- 防火墙默认 deny
- 仅开放必要端口
- 无用服务已禁用

### 5.3 主机安全

- SELinux/AppArmor 启用
- /tmp 挂载 noexec
- 内核参数已加固

### 5.4 审计与监控

- auditd 监控关键文件
- 日志集中收集
- Fail 2 ban 防暴力破解

### 5.5 维护机制

- 自动安全更新开启
- 每月执行 lynis 扫描
- 备份策略已验证

## 六、常用安全工具速查

| 工具         | 用途         | 安装命令                              |
| ---------- | ---------- | --------------------------------- |
| lynis      | 系统安全审计     | `apt install lynis`               |
| fail 2 ban | 暴力破解防护     | `yum install fail2ban`            |
| auditd     | 行为审计       | `dnf install audit`               |
| rkhunter   | Rootkit 检测 | `apt install rkhunter`            |
| chkrootkit | Rootkit 扫描 | `yum install chkrootkit`          |
| OpenSCAP   | CIS 合规扫描   | `dnf install scap-security-guide` |

终极建议：  
“安全不是功能，而是过程；不是一次配置，而是持续运营。”  
通过 自动化加固 + 实时监控 + 定期审计，构建可信赖的 Linux 安全基座。