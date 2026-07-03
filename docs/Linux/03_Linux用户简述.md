## 一、用户种类
#### 1.1 管理员用户
- **UID**：固定为 **0**。
- **用途**：系统管理、紧急维护
- **权限**：拥有系统最高权限，可以绕过所有文件、进程、网络的权限检查，执行任何操作（通常称为"超级用户"）。
- **登录**：技术上可以登录，但在生产环境中**严禁直接使用 `root` 登录**，以防止误操作或安全风险。
- **例如**：`root`
#### 1.2 普通用户
- **UID**：从 **1000** 开始（不同发行版可能有细微差异，如 Rocky Linux 从 1000 开始）。
- **用途**：日常操作、远程管理
- **权限**：默认只能管理自己的文件（`/home/用户名/`）和自己启动的进程。通过 `sudo` 机制，可以临时获得经过授权的,受限的管理员权限（这一过程会被记录在 `/var/log/secure` 中，便于审计）。    
- **登录**：是日常运维和开发工作的主要登录账号，可通过 SSH 或本地终端登录。
- **例如**：`zhangsan`、`lisi`、
#### 1.3 系统用户
- **UID**：通常在 **1 到 999** 之间（系统保留范围）。
- **用途**：运行守护进程（Nginx、MySQL）。
- **登录限制**：`/etc/passwd` 中的登录 Shell 被设置为 `/sbin/nologin` 或 `/bin/false`，直接拒绝任何交互式登录（包括 SSH 和本地终端）。
- **特点**：通常没有家目录（或家目录设置在 `/var/lib/` 下，如 `/var/lib/nginx`），仅用于运行守护进程（Web 服务器、数据库、定时任务等），遵循最小权限原则。
- **例如**：`nginx`、`mysql`、`redis`、`systemd-network`
## 二、增加用户
### 2.1 用户增加
```
# 创建 test1，使用 /bin/bash 作为登录 Shell
sudo useradd -m -s /bin/bash test1
如果你只是想创建用户而不指定特殊 Shell，可以省略 `-s`，系统会使用默认的 `/bin/bash`：
sudo useradd -m test1
#添加账号
adduser 用户名  #执行后会一步步引导你设置用户信息
#设置密码(系统会提示你输入新密码两次，之后用户就能登录了)
sudo passwd test1
```
## 三、删除用户
### 3.1 仅删除用户
说明:（保留家目录）
```
userdel 用户名
```
### 3.2 删除用户和目录
说明:（彻底清理）
```
userdel -r 用户名
```
## 四、实战示例
### 4.1 创建普通用户
```
说明：（带家目录，默认 shell）
# 创建用户 testuser，自动创建家目录 /home/testuser
useradd -m testuser
# 给用户设置密码（必须执行，否则无法登录）
passwd testuser
# 执行后按提示输入密码（输入时不显示，确认密码需一致）
```
### 4.2 创建管理员权限用户
```
说明:（加入 wheel 组，可 sudo）
CentOS 中 wheel 组是默认的管理员组，加入后可通过 sudo 执行 root 命令：
# 创建用户 admin，主组为 wheel，自动建家目录
useradd -m -g wheel admin
# 设置密码
passwd admin
# 验证：切换到 admin，测试 sudo 权限（如查看系统日志）
su - admin
sudo cat /var/log/messages
```
### 4.3 创建禁用登录用户
```
说明:（用于服务运行，如 nginx）
# 创建用户 nginx，无家目录，禁用登录shell
useradd -s /sbin/nologin -M nginx
# 验证：无法登录（su 切换也会提示无shell）
su - nginx # 输出：This account is currently not available.
```
### 4.4 自定义家目录和备注
```
# 创建用户 dev，家目录 /data/dev，备注"开发人员"
useradd -m -d /data/dev -c "开发人员" dev
passwd dev
```
## 五、命令提示符介绍
用户登录后，可以看到如下文字与光标。
```
{root@centos~}#
```
root 是当前有效用户。
centos 是主机名的简写。FQDN 的第一段。
~：波浪线，表示当前目录，又称为工作目录。每个用户进入系统中后，都处于一目录中，当前所处的目录，即工作目录。此处显示表示基名。
prompt：命令提示符。此处显示的#号。即在命令提示符后可以输入命令。
对于管理员，命令提示符为 # 。
对于普通用户，命令提示符为 $ 。
## 六、友好交互版
说明: adduser（适合新手，自动引导）
adduser 是 useradd 的简化交互版，执行后会一步步引导你设置用户信息（密码、备注、电话等），无需记复杂选项：
```
# 直接执行 adduser + 用户名，后续按提示操作
adduser testuser2
# 执行后会提示：
# 1. 输入密码（两次确认）
# 2. 可选填写用户全名、房间号、电话等（直接回车跳过即可）
# 3. 最后确认信息，输入 Y 完成创建
```
## 七、用户信息查询与修改
### 7.1 查看用户是否创建成功
方法 1：查看 /etc/passwd 文件（所有用户信息）
```
cat /etc/passwd | grep 用户名
```
方法 2：查看用户 ID、组 ID 等详情
```
id 用户名 # 如 id testuser，输出 uid、gid、附加组等
```
### 7.2 查看可以远程的用户
```
awk -F: '$7 !~ /(nologin|false)$/ {print $1, $7}' /etc/passwd
```
当前所有用户
```
cat /etc/passwd
```
### 7.3 查看用户所属组
```
id 用户名
```
- `id` 的输出格式一般为：`uid=1000(fmc) gid=1000(fmc) groups=1000(fmc),10(wheel),1001(docker)`
    - `gid=...` 代表用户的**主要组**（Primary Group）-。
    - `groups=...` 后面列出的所有组（包括主要组）。
如果只关心组名，可以使用更简洁的参数：`id -Gn fmc`。
当前所有组的用户
```
cat /etc/group
```
## 八、注意事项
### 8.1 权限要求
添加 / 修改 / 删除用户必须用 root 身份，或普通用户加 sudo（如 sudo useradd testuser）。
### 8.2 密码规则
CentOS 密码默认要求至少 8 位，包含大小写字母、数字或特殊字符（可通 vi/etc/pam.d/system-auth 调整规则）。
### 8.3 组管理
创建用户时默认生成同名组，若需指定现有组，需先确认组存在（cat /etc/group | grep 组名）。