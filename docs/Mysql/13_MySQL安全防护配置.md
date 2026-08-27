## 一、账号与密码安全
数据库的第一道防线，就是“谁能够进来”。如果账号密码形同虚设，后面的所有防护都白搭。
### 1.1 为所有账号设置密码
MySQL 安装完成后，默认只创建了一个 'root'@'localhost' 超级管理员账号。但很多初学者在安装时跳过设置密码，这是极其危险的—任何人都可以在没有密码的情况下以 root 身份连接。

所有 MySQL 账号都必须有密码。因为任何人都可以用 mysql -u 任意用户名 的方式尝试连接，如果那个账号没有密码，就能直接登录成功。

检查哪些账号没有密码：
```
SELECT user, host, authentication_string FROM mysql.user WHERE authentication_string = '';
```
为空账号设置密码：
```
ALTER USER '用户名'@'主机' IDENTIFIED BY '你的强密码';
```
### 1.2 设置 root 密码
安装后第一件事，设置 root 密码，必须立刻补上。
1. 方法一：使用安全初始化脚本(强烈推荐)
这是 MySQL 官方提供的交互式安全配置工具，会一步步引导你完成安全设置：
```
mysql_secure_installation
```
运行后按提示操作：
- 设置 root 密码
- 移除匿名用户
- 禁止 root 远程登录
- 删除 test 数据库
- 重新加载权限表
2. 方法二：手动修改 root 密码
```
ALTER USER 'root'@'localhost' IDENTIFIED BY '新密码';
FLUSH PRIVILEGES;
```
FLUSH PRIVILEGES 的作用是重新加载权限表，让密码修改立即生效。
### 1.3 强制密码复杂度
光有密码还不够，密码必须是“强密码”。MySQL 提供了 validate_password 组件(MySQL 8.0+)或插件(MySQL 5.7)来强制密码复杂度。

安装密码验证组件(MySQL 8.0+)：
```
INSTALL COMPONENT 'file://component_validate_password';
```
安装密码验证插件(MySQL 5.7)：
```
INSTALL PLUGIN validate_password SONAME 'validate_password.so';
```
配置密码策略参数：
```
-- 策略级别：MEDIUM(要求大小写字母+数字+特殊字符)
SET GLOBAL validate_password.policy = MEDIUM;

-- 最小密码长度：12位
SET GLOBAL validate_password.length = 12;

-- 密码与用户名不能相同
SET GLOBAL validate_password.check_user_name = ON;
```
策略级别说明：
- LOW：只检查密码长度
- MEDIUM：检查长度 + 大小写字母 + 数字 + 特殊字符
- STRONG：在 MEDIUM 基础上增加字典文件检查

注意：MySQL 5.7 使用 validate_password 插件，MySQL 8.0 使用 validate_password 组件，安装方式不同。安装后需重启 MySQL 服务使配置生效。
### 1.4 设置密码有效期和防复用
密码不能永久有效，应定期更换。同时要防止用户把旧密码改回来。
```
-- 密码90天后过期
SET GLOBAL default_password_lifetime = 90;

-- 不能使用最近5次用过的密码
SET GLOBAL password_history = 5;

-- 密码修改后至少1天内不能再次修改
SET GLOBAL password_reuse_interval = 1;
```
对单个用户设置密码过期：
```
ALTER USER '用户名'@'主机' PASSWORD EXPIRE INTERVAL 90 DAY;
```
### 1.5 删除匿名用户
MySQL 安装时默认会创建一个匿名用户(用户名为空)，任何人都可以用空用户名登录。必须删除。
查找匿名用户：
```
SELECT user, host FROM mysql.user WHERE user = '';
```
删除匿名用户：
```
DELETE FROM mysql.user WHERE User = '';
FLUSH PRIVILEGES;
```
### 1.6 禁止 root 远程登录
root 是最高权限账号，只应允许从本地(localhost)登录，绝对不能让 root 从远程连接。
检查 root 的登录主机：
```
SELECT user, host FROM mysql.user WHERE user = 'root';
```
如果 root 允许从远程登录，修改为仅限本地：
```
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1');
FLUSH PRIVILEGES;
```
日常管理应使用普通账号，需要管理员操作时先 SSH 到服务器，再用普通账号配合 sudo 提权。
### 1.7 遵循最小权限原则
最小权限原则是指：只给用户恰好够用的权限，绝不多给。不要图省事直接给 ALL PRIVILEGES。

创建专用账号并授予最小权限：
```
-- 创建一个只能从指定IP段连接的应用账号
CREATE USER 'app_user'@'192.168.1.%' IDENTIFIED BY '强密码';

-- 只授予查询权限
GRANT SELECT ON 数据库名.* TO 'app_user'@'192.168.1.%';

-- 如果需要增删改，再加对应权限
GRANT SELECT, INSERT, UPDATE, DELETE ON 数据库名.* TO 'app_user'@'192.168.1.%';

FLUSH PRIVILEGES;
```
定期审查用户权限：
```
-- 查看某个用户有哪些权限
SHOW GRANTS FOR '用户名'@'主机';

-- 回收不必要的权限
REVOKE 权限名 ON 数据库名.* FROM '用户名'@'主机';
```
重要提醒：绝不要向所有主机(%)授予权限。生产环境中应限制为具体的 IP 或 IP 段。

## 二、网络与连接安全
账号密码再强，如果数据库在网络中裸奔，数据依然危险。
### 2.1 修改默认端口(3306)
MySQL 默认使用 3306 端口，攻击者会用自动化工具扫描这个端口。改为非标准端口能有效降低被扫描到的概率。

修改配置文件(Linux：/etc/my.cnf 或 /etc/mysql/mysql.conf.d/mysqld.cnf)：
```
[mysqld]
port = 3307
```
修改后重启 MySQL：
```
systemctl restart mysql
```
### 2.2 绑定监听地址(bind-address)
MySQL 默认监听 0.0.0.0(所有网卡)，这意味着任何人都能尝试连接。生产环境应只监听内网 IP。

查看当前监听地址：
```
SHOW VARIABLES LIKE 'bind_address';
```
修改配置文件：
```
[mysqld]
bind-address = 你的内网IP地址
```
如果数据库只供本机使用(比如开发环境)，可以设置为 127.0.0.1。如果完全不需要远程连接，可以用 skip-networking 直接禁止所有网络连接。
### 2.3 启用 SSL/TLS 加密传输
MySQL 客户端和服务器之间的数据默认是明文传输的。如果网络不可信(比如通过公网连接)，密码和 SQL 语句都可能被截获。启用 SSL/TLS 可以加密传输通道。
1. 第一步：生成证书和密钥
```
# 生成服务器私钥
openssl req -newkey rsa:2048 -days 365 -nodes -keyout server-key.pem -out server-req.pem

# 生成服务器证书
openssl rsa -in server-key.pem -out server-key.pem
openssl x509 -req -in server-req.pem -days 365 -signkey server-key.pem -out server-cert.pem
```
2. 第二步：在 MySQL 配置文件中启用 SSL
```
[mysqld]
ssl-ca = /path/to/ca-cert.pem
ssl-cert = /path/to/server-cert.pem
ssl-key = /path/to/server-key.pem
```
3. 第三步：强制所有连接使用加密：
```
SET GLOBAL require_secure_transport = ON;
```
4. 第四步：验证 SSL 是否启用：
```
SHOW STATUS LIKE 'Ssl_cipher';
```
如果返回结果不为空，说明 SSL 加密连接已生效。
客户端连接时指定使用 SSL：
```
mysql --ssl-mode=REQUIRED -u 用户名 -p -h 服务器IP
```
### 2.4 防火墙与网络隔离
防火墙是数据库的最后一道网络防线。即使 MySQL 配置有漏洞，防火墙也能阻止未经授权的 IP 访问。

只允许应用服务器的 IP 访问 MySQL 端口(以 iptables 为例)：
```
# 只允许 192.168.1.100 访问 3306 端口
iptables -A INPUT -p tcp -s 192.168.1.100 --dport 3306 -j ACCEPT

# 拒绝其他所有 IP 访问 3306 端口
iptables -A INPUT -p tcp --dport 3306 -j DROP
```
检查端口是否暴露在公网：
```
nmap -p 3306 你的服务器公网IP
```
如果这个命令能从外部扫描到 3306 端口开放，说明防火墙配置有问题。

## 三、文件与数据安全
### 3.1 数据目录权限控制
MySQL 的数据目录包含所有数据库文件、数据字典和系统表，其中存储了用户、权限等敏感信息。数据目录的权限必须严格管控。

数据目录的所有权应只属于运行 mysqld 的用户(通常是 mysql)：
```
chown -R mysql:mysql /var/lib/mysql
chmod 750 /var/lib/mysql
```
chmod 750 的含义：所有者(mysql)可读写执行，所属组可读执行，其他人没有任何权限。
### 3.2 禁止以 root 用户运行 MySQL
绝不要以 Unix root 用户运行 MySQL。如果 MySQL 以 root 运行，拥有 FILE 权限的攻击者可以在系统任意位置创建文件(例如 ~root/.bashrc)，极其危险。

MySQL 默认拒绝以 root 运行，除非显式指定 --user=root 参数。

确保 MySQL 以专用用户运行：

在配置文件 /etc/my.cnf 中指定：
```
[mysqld]
user = mysql
```
检查当前运行用户：
```
ps aux | grep mysqld
```
### 3.3 限制文件导入导出目录(secure_file_priv)
LOAD DATA INFILE 和 SELECT ... INTO OUTFILE 可以从文件系统读取或写入文件。如果不加限制，攻击者可能利用这些功能读取服务器上的敏感文件。

secure_file_priv 参数用于限制这些操作只能在特定目录中进行。

查看当前设置：
```
SHOW VARIABLES LIKE 'secure_file_priv';
```
在配置文件中设置安全目录：
```
[mysqld]
secure_file_priv = /var/lib/mysql-files
```
三种设置方式：
- 设置为具体目录路径：只允许该目录下的文件导入导出
- 设置为 NULL：完全禁止导入导出操作
- 不设置或为空：不做任何限制(不安全，生产环境禁止)
### 3.4 数据库文件加密(表空间加密)
对于存储敏感信息(如用户密码、身份证号、银行卡号)的表，可以对表空间进行加密。
MySQL 5.7+ 支持表空间加密：
```
CREATE TABLE 敏感数据表 (
    id INT,
    secret VARCHAR(100)
) ENCRYPTION='Y';
```

## 四、日志与审计
出事之后没有日志，连问题出在哪都不知道。日志是追溯安全事件的唯一依据。
### 4.1 错误日志(Error Log)
记录 MySQL 启动、运行、停止过程中的错误与告警信息，是故障排查的第一手资料。错误日志默认开启。
查看错误日志位置：
```
SHOW VARIABLES LIKE 'log_error';
```
配置错误日志(如有需要)：
```
[mysqld]
log-error = /var/log/mysql/mysql-error.log
```
### 4.2 二进制日志(Binary Log / Binlog)
二进制日志以二进制格式记录了所有对数据进行修改的操作(INSERT、UPDATE、DELETE 等)。它是数据恢复和主从复制的基础，也是追溯数据变更的重要依据。
启用二进制日志：
```
[mysqld]
log-bin = /var/log/mysql/mysql-bin
expire_logs_days = 7
max_binlog_size = 100M
```
expire_logs_days = 7：日志保留7天后自动删除，避免占满磁盘。
查看二进制日志是否开启：
```
SHOW VARIABLES LIKE 'log_bin';
```
### 4.3 通用查询日志(General Query Log)
记录客户端发送给服务器的所有 SQL 语句。这是最详细的审计日志，但生产环境慎用，因为记录量巨大，会严重影响性能。
```
[mysqld]
general_log = 1
general_log_file = /var/log/mysql/mysql-general.log
```
如果必须启用，建议在排查问题时临时开启，用完立刻关闭。
### 4.4 慢查询日志(Slow Query Log)
记录执行时间超过设定阈值的查询。虽然主要用于性能优化，但也能帮助发现异常的慢查询(可能是攻击行为)。
```
[mysqld]
slow_query_log = 1
slow_query_log_file = /var/log/mysql/mysql-slow.log
long_query_time = 2
```
long_query_time = 2：执行超过 2 秒的查询会被记录。
### 4.5 审计插件(企业级审计)
如果需要更专业的操作审计能力，MySQL 企业版提供了 audit_log 插件。社区版可以使用 MariaDB 的审计插件替代。
安装审计插件：
```
INSTALL PLUGIN audit_log SONAME 'audit_log.so';
SET GLOBAL audit_log_policy = 'ALL';
```
性能敏感场景只记录关键操作：
```
SET GLOBAL audit_log_policy = 'DDL';  -- 只记录结构变更
```

## 五、防攻击与日常维护
### 5.1 防 SQL 注入
SQL 注入是最常见的数据库攻击手段。防护的核心是：永远不要把用户输入直接拼接到 SQL 语句中。
错误做法(有注入风险)：
```
# 危险！用户输入被直接拼接到 SQL 中
cursor.execute("SELECT * FROM users WHERE name = '" + user_input + "'")
```
正确做法：使用参数化查询(预处理语句)：
```
# 安全！参数与 SQL 语句分离
cursor.execute("SELECT * FROM users WHERE name = %s", (user_input,))
```
### 5.2 限制最大连接数(防 DoS 攻击)
攻击者可能通过大量连接耗尽数据库资源，导致服务不可用。
```
-- 查看当前最大连接数
SHOW VARIABLES LIKE 'max_connections';

-- 设置合理的最大连接数
SET GLOBAL max_connections = 200;
```
### 5.3 定期更新与打补丁
始终运行受支持的最新稳定版本，及时修补已知漏洞。
```
# 查看当前 MySQL 版本
mysql --version

# Ubuntu/Debian 更新
sudo apt update && sudo apt upgrade mysql-server

# CentOS/RHEL 更新
sudo yum update mysql-server
```
### 5.4 定期备份并测试恢复
数据安全不仅是防攻击，还要防丢失。定期备份并测试恢复，确保备份文件可用。
```
# 备份所有数据库
mysqldump -u root -p --all-databases > /backup/mysql_all_$(date +%Y%m%d).sql

# 恢复
mysql -u root -p < /backup/mysql_all_20260101.sql
```
### 5.5 安全基线自查清单
建议定期(每月一次)对照以下清单检查 MySQL 安全配置：

|检查项|检查命令|期望结果|
|---|---|---|
|是否有空密码账号| `SELECT user,host FROM mysql.user WHERE authentication_string='';` |无返回结果|
|是否有匿名用户| `SELECT user,host FROM mysql.user WHERE user='';` |无返回结果|
|root 是否只允许本地| `SELECT user,host FROM mysql.user WHERE user='root';` |只有 localhost 或 127.0.0.1|
|密码策略是否启用| `SHOW VARIABLES LIKE 'validate_password%';` |有配置值返回|
|是否限制导入导出目录| `SHOW VARIABLES LIKE 'secure_file_priv';` |显示具体目录或 NULL|
|是否启用 SSL| `SHOW STATUS LIKE 'Ssl_cipher';` |有值返回|
|端口是否暴露公网| `nmap -p 3306 公网IP` |3306 端口不可从外部访问|

**总结：**
MySQL 安全防护不是做一两个配置就万事大吉，而是需要层层设防：

1. 账号密码是入口—强密码 + 密码策略 + 最小权限
2. 网络连接是通道—改端口 + 绑定内网 + SSL 加密 + 防火墙
3. 文件数据是核心—目录权限 + 非 root 运行 + 限制导入导出
4. 日志审计是眼睛—开启必要日志，出了问题能追溯
5. 日常维护是保障—定期更新、备份、自查