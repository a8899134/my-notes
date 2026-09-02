## 一、审计概述
### 1.1 数据库审计概念
数据库审计是指记录数据库中发生的所有关键操作，包括“谁、在什么时间、从什么地方、执行了什么操作”。

通俗理解：审计就像数据库的“监控摄像头”—它不阻止你做什么，但会把你的每一个动作都录下来。等保合规、安全审计、事后追溯，都依赖这套“录像”。

### 1.2 审计作用
|场景|说明|
|---|---|
|等保/合规要求|网络安全等级保护、GDPR、SOX 等法规要求记录数据库操作日志|
|安全事件追溯|数据泄露后，需要知道是谁、什么时候、做了什么|
|内部审计|定期审查权限使用情况，发现异常操作|
|问题排查|定位误操作或恶意操作的源头|
### 1.3 审计的核心记录内容
| 记录项    | 说明                                |
| ------ | --------------------------------- |
| 时间     | 操作发生的精确时间                         |
| 用户     | 执行操作的用户名和来源 IP                    |
| 操作类型   | SELECT、INSERT、UPDATE、DELETE、DDL 等 |
| 操作对象   | 访问了哪个数据库、哪个表                      |
| SQL 语句 | 具体执行的 SQL 内容                      |
| 执行结果   | 成功或失败                             |

## 二、审计方案对比
在 MySQL 中实现审计功能，主要有以下几种方案：

|方案|适用版本|性能影响|功能特点|推荐场景|
|---|---|---|---|---|
|general_log|所有版本|⚠️ 极大(5-15%性能下降)|记录所有 SQL，无法过滤|临时排查，不建议生产长期开启|
|MariaDB Audit Plugin|社区版/企业版|较小|支持过滤、多种输出格式|社区版生产环境推荐|
|Percona Audit Log Plugin|社区版/Percona Server|较小|支持JSON格式日志|社区版生产环境备选|
|MySQL Enterprise Audit|企业版|较小|功能最全面、官方支持|企业版官方推荐|

核心结论：

生产环境禁止长期开启 general_log，它会记录所有SQL语句，日志量巨大且严重影响性能。

社区版推荐使用 MariaDB Audit Plugin 或 Percona Audit Log Plugin，两者都是开源且经过生产验证的审计方案。

## 三、general_log
### 3.1  general_log 概念
general_log 是 MySQL 自带的通用查询日志，开启后会记录所有到达 MySQL 服务器的 SQL 语句。**简单慎用**。
### 3.2 缺点

|问题|说明|
|---|---|
|性能影响巨大|高并发下开启 general_log 会导致吞吐量降低约 13%，响应时间增加约 17%|
|日志量爆炸|所有查询都被记录，日志文件膨胀速度惊人|
|无法过滤|无法只记录特定用户、特定操作类型|
|磁盘 I/O 瓶颈|每次查询都被强加一次磁盘写操作|

适用场景：仅用于非生产环境的短时 Debug，定位到具体问题后立即关闭。
### 3.3 开启方法
(仅限临时使用)
```sql
-- 查看当前状态
SHOW VARIABLES LIKE 'general_log%';

-- 临时开启(全局，重启后失效)
SET GLOBAL general_log = ON;

-- 设置日志文件路径
SET GLOBAL general_log_file = '/tmp/mysql_general.log';

-- 使用完后立即关闭
SET GLOBAL general_log = OFF;
```
配置文件永久开启(不推荐生产) ：
```ini
[mysqld]
general_log = ON
general_log_file = /var/log/mysql/general.log
```
### 3.4 查看日志内容
```bash
# 实时查看
sudo tail -f /var/log/mysql/general.log

# 查看最后100行
sudo tail -100 /var/log/mysql/general.log
```

## 四、MariaDB Audit Plugin
### 4.1 插件简介
MariaDB Audit Plugin 是一款功能强大的审计插件，最初由 MariaDB 开发，但可以用于 MySQL 社区版和企业版，社区版推荐。

核心特点：

| 特点   | 说明               |
| ---- | ---------------- |
| 支持记录 | 连接、查询、表访问等操作     |
| 输出方式 | 支持文件或 syslog     |
| 过滤功能 | 可过滤特定用户、数据库或表的操作 |
| 高性能  | 对数据库性能影响较小       |
### 4.2 下载与安装
重要提示：MariaDB Audit Plugin 集成在 MariaDB 中，没有单独提供包。需要从 MariaDB 安装包中提取插件文件。
1. 步骤一：下载 MariaDB 并提取插件
```bash
# 下载 MariaDB 安装包(版本需与 MySQL 兼容)
cd /usr/local/src
wget https://downloads.mariadb.com/MariaDB/mariadb-10.5.XX/.../mariadb-10.5.XX.tar.gz

# 解压并提取 server_audit.so
tar -xzf mariadb-10.5.XX.tar.gz
find . -name "server_audit.so"
cp ./path/to/server_audit.so /usr/lib64/mysql/plugin/
```
💡 简化方案：也可以通过 MariaDB 的 YUM 仓库安装后提取插件文件。

2. 步骤二：确认插件目录
```sql
SHOW GLOBAL VARIABLES LIKE 'plugin_dir';
```
2. 步骤三：安装插件
```sql
INSTALL PLUGIN server_audit SONAME 'server_audit.so';
```
### 4.3 配置参数
在 MySQL 配置文件 /etc/my.cnf 中添加：
```ini
[mysqld]
# 启用审计插件
server_audit_logging = ON

# 日志输出方式：FILE 或 SYSLOG
server_audit_output_type = FILE

# 日志文件路径
server_audit_file_path = /var/log/mysql/audit.log

# 记录的事件类型[reference:29]
# CONNECT：连接事件
# QUERY：查询事件
# TABLE：表访问事件
# QUERY_DDL：DDL操作
# QUERY_DML：DML操作
server_audit_events = CONNECT,QUERY_DDL,QUERY_DML

# 是否记录所有查询(谨慎开启)
# server_audit_log_queries = ON

# 排除特定用户(不记录该用户的操作)
# server_audit_excl_users = root

# 只记录特定用户的操作
# server_audit_incl_users = app_user

# 日志文件轮转大小(MB)
server_audit_file_rotate_size = 100

# 日志文件轮转数量
server_audit_file_rotations = 10

```
### 4.4 运行时动态配置
```sql
-- 启用审计
SET GLOBAL server_audit_logging = ON;

-- 设置记录的事件类型
SET GLOBAL server_audit_events = 'CONNECT,QUERY_DDL,QUERY_DML';

-- 查看当前配置
SHOW VARIABLES LIKE 'server_audit%';
```
### 4.5 查看审计日志
```bash
# 查看审计日志
sudo tail -f /var/log/mysql/audit.log

# 日志格式示例
# 2026-07-27 10:30:00, user@host, CONNECT, 0, 0, 0, 0
# 2026-07-27 10:30:01, user@host, QUERY, 0, 0, 0, "SELECT * FROM users"
```

## 五、Percona Audit Log Plugin
### 5.1 插件简介
Percona Audit Log Plugin 是 Percona 提供的审计插件，适用于 Percona Server 和 MySQL 社区版，开源替代。

核心特点：

|特点|说明|
|---|---|
|记录内容|所有 SQL 查询和连接信息|
|日志格式|支持 JSON 格式输出，便于后续分析|
|过滤功能|可过滤特定用户或数据库的操作|
### 5.2 版本兼容性说明
重要：早期 Percona 官方表示审计插件未对 Oracle MySQL 做兼容适配。但 2024 年起，Percona 社区已验证插件支持 MySQL 8.0 版本。
### 5.3 下载与安装
1. 步骤一：获取插件文件
从 Percona Server 安装包中提取 audit_log.so 文件：
```bash
# 下载 Percona Server 包
cd /usr/local/src
wget https://www.percona.com/downloads/Percona-Server-8.0/Percona-Server-8.0.XX/.../Percona-Server-8.0.XX-Linux.x86_64.glibc2.17.tar.gz

# 解压并提取 audit_log.so
tar -xvf Percona-Server-8.0.XX-Linux.x86_64.glibc2.17.tar.gz --wildcards --no-anchored '*audit_log.so*'

# 复制到 MySQL 插件目录
cp Percona-Server-8.0.XX/lib/plugin/audit_log.so /usr/lib64/mysql/plugin/
```
2. 步骤二：确认插件目录
```sql
SHOW GLOBAL VARIABLES LIKE 'plugin_dir';
```
3. 步骤三：安装插件
```sql
INSTALL PLUGIN audit_log SONAME 'audit_log.so';
```
验证安装：
```sql
SELECT PLUGIN_NAME, PLUGIN_STATUS, PLUGIN_TYPE 
FROM information_schema.PLUGINS 
WHERE PLUGIN_NAME = 'audit_log';
```
### 5.4 配置参数
```sql
-- 启用审计，记录所有操作
SET GLOBAL audit_log_policy = ALL;

-- 设置日志格式为 JSON
SET GLOBAL audit_log_format = JSON;

-- 设置日志文件路径
SET GLOBAL audit_log_file = '/var/log/mysql/audit.log';
```
在 /etc/my.cnf 中永久配置：
```ini
[mysqld]
# 启用审计日志
audit_log_policy = ALL

# 日志格式：JSON
audit_log_format = JSON

# 日志文件路径
audit_log_file = /var/log/mysql/audit.log
```
### 5.5 查看审计日志
```bash
# 查看 JSON 格式审计日志
sudo tail -f /var/log/mysql/audit.log

# JSON 格式示例
# {"timestamp":"2026-07-27T10:30:00Z","user":"app_user","host":"192.168.1.100","command":"QUERY","sql":"SELECT * FROM users","database":"mydb"}
```

## 六、MySQL Enterprise Audit
### 6.1 插件简介
MySQL Enterprise Audit 是 MySQL 企业版内置的审计插件，使用 audit_log 插件实现。

核心特点：

|特点|说明|
|---|---|
|官方支持|Oracle 官方提供，与 MySQL 版本同步更新|
|标准化审计|满足 Oracle 审计规范|
|完整记录|记录连接、断开、访问的数据库和表|
|过滤功能|支持基于策略的审计过滤|
|持久化存储|使用 mysql 系统库存储过滤器和用户账户数据|
### 6.2 安装方法
前提：已安装 MySQL 企业版。
1. 步骤一：确认插件目录
```sql
SHOW GLOBAL VARIABLES LIKE 'plugin_dir';
```
2. 步骤二：安装插件
```bash
# 在 MySQL 安装的 share 目录中找到安装脚本
mysql -u root -p < /path/to/mysql/share/audit_log_filter_linux_install.sql
```
3. 步骤三：验证安装
```sql
SELECT PLUGIN_NAME, PLUGIN_STATUS FROM information_schema.PLUGINS 
WHERE PLUGIN_NAME LIKE 'audit_log%';
```
### 6.3 配置参数
```ini
[mysqld]
# 启用审计日志
audit_log = ON

# 日志文件路径(默认在数据目录)
audit_log_file = /var/log/mysql/audit.log

# 日志格式：XML(默认)或 JSON
audit_log_format = JSON

# 强制加载插件，防止运行时被卸载
# --audit-log
```
### 6.4 日志轮转
```sqk
-- 手动轮转审计日志[reference:52]
SELECT audit_log_rotate();
```
该命令会重命名当前审计日志文件并创建新文件。

## 七、审计日志管理(存储与轮转)
### 7.1 日志存储位置

|插件|默认路径|可配置参数|
|---|---|---|
|MariaDB Audit Plugin|可配置| serverauditfilepath |
|Percona Audit Log Plugin|可配置| auditlogfile |
|MySQL Enterprise Audit|数据目录 audit.log| auditlog_file |
### 7.2 日志轮转配置
#### 7.2.1 按大小轮转(MariaDB Audit Plugin)
```ini
[mysqld]
# 单个日志文件大小达到 100MB 时轮转
server_audit_file_rotate_size = 100

# 保留 10 个轮转文件
server_audit_file_rotations = 10
```
#### 7.2.2 按大小轮转(Percona Audit Log Plugin)
```sql
-- 设置日志文件大小阈值(字节)
SET GLOBAL audit_log_rotate_on_size = 104857600;  -- 100MB
```
#### 7.2.3 手动轮转(MySQL Enterprise Audit)
```sql
SELECT audit_log_rotate();
```
### 7.3 日志清理策略

|策略|说明|实现方式|
|---|---|---|
|按大小轮转|日志达到设定大小后自动轮转|配置 rotateonsize 参数|
|按时间轮转|按天/周生成新的日志文件|配合 logrotate 工具|
|定期清理|删除过期日志文件|Cron 定时任务|
### 7.4 使用 logrotate 管理审计日志
创建 /etc/logrotate.d/mysql-audit：
```bash
/var/log/mysql/audit.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 640 mysql mysql
    sharedscripts
    postrotate
        # 重载 MySQL 或触发日志轮转
        mysql -e "SELECT audit_log_rotate();" 2>/dev/null || true
    endscript
}
```
### 7.5 磁盘空间监控
⚠️ 审计日志是磁盘空间的“隐形杀手”。在高并发场景下，审计日志可能每天增长数 GB。

|监控项|建议阈值|说明|
|---|---|---|
|审计日志大小|< 10 GB|超过需检查轮转策略|
|审计日志增长率|稳定可预测|突增可能表示异常流量|
|磁盘剩余空间|> 20%|审计日志写满磁盘会导致数据库不可用|

## 八、最佳实践
### 8.1 方案选择建议

|场景|推荐方案|理由|
|---|---|---|
|MySQL 企业版|MySQL Enterprise Audit|官方支持，功能最全面|
|MySQL 社区版(生产环境)|MariaDB Audit Plugin|功能成熟，性能影响小，经过大量生产验证|
|MySQL 社区版(备选)|Percona Audit Log Plugin|支持 JSON 格式，便于日志分析|
|临时调试|general_log|仅限短时间使用，用完立即关闭|
### 8.2 审计配置检查清单
```text
☐ 确认 MySQL 版本(社区版/企业版)
☐ 选择合适的审计方案
☐ 在测试环境验证插件兼容性
☐ 配置审计日志存储路径(独立磁盘分区)
☐ 配置日志轮转策略(按大小或按时间)
☐ 配置日志清理策略(保留周期)
☐ 设置磁盘空间监控告警
☐ 验证审计日志是否正常写入
☐ 确认审计日志包含合规要求的字段
☐ 定期检查审计日志是否完整
```
### 8.3 审计日志存储建议

|建议|说明|
|---|---|
|独立磁盘分区|审计日志与数据文件分开存储，避免日志写满影响数据库|
|定期归档|将历史审计日志压缩归档到异地存储|
|加密存储|审计日志包含敏感信息，建议加密存储|
|访问控制|审计日志文件权限设置为 640，仅 mysql 用户和 DBA 可读|
### 8.4 总结
生产环境禁止长期开启 general_log，社区版推荐 MariaDB Audit Plugin 或 Percona Audit Log Plugin，企业版使用 MySQL Enterprise Audit。

审计日志必须配置轮转和清理策略，否则磁盘会被写满。审计的目的是“记录谁在什么时候做了什么”，满足合规要求的同时，也为事后追溯提供依据。
