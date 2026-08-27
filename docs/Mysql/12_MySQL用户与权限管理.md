## 一、用户与权限体系概述
### 1.1 用户与权限管理的重要性
MySQL 的用户与权限管理体系是数据库安全的核心防线。其设计目标是在保障数据安全的前提下，实现灵活的访问控制，确保不同角色只能访问其工作所需的数据资源。
通过用户与权限管理可以实现以下安全目标：
1. 身份认证：确保只有经过授权的用户才能连接数据库
2. 访问控制：限制用户只能访问特定的数据库、表或列
3. 操作限制：控制用户能执行的操作类型(读、写、改、删)
4. 来源限制：限制用户只能从特定的 IP 或主机连接
5. 审计追溯：通过独立的用户账号追溯操作来源
### 1.2 MySQL 权限体系的核心原则
MySQL 的权限管理遵循最小权限原则(Principle of Least Privilege) ：
1. 最小权限，只授予用户完成其任务所必需的最小权限集合
2. 分权管理，不同角色使用独立的数据库账号
3. 来源限制，严格控制用户的登录来源 IP
4. 权限分层，全局、数据库、表、列四个层级的精细控制

## 二、用户账号管理
### 2.1 用户账号的组成
MySQL 的用户账号由用户名和主机名两部分组成：
```
'用户名'@'主机名'
```
主机名指定了该用户可以从哪些主机连接到 MySQL 服务器。
主机名格式示例：

|主机名格式|含义|安全性|
|---|---|---|
| 'localhost' |只能从数据库服务器本机连接|最安全|
| '127.0.0.1' |只能从本机的 IPv 4 地址连接|安全|
| '192.168.1.100' |只能从指定 IP 连接|安全|
| '192.168.1.%' |可以从 192.168.1.x 整个网段连接|较安全|
| '10.0.%.%' |可以从 10.0.x.x 整个 B 段连接|中等|
| '%' |可以从任意主机连接|不安全，生产环境禁用|

⚠️ 重要：'app'@'%' 和 'app'@'localhost' 在 MySQL 中是两个完全不同的用户账号，拥有各自独立的权限。这一点是权限管理中最容易出问题的地方。

### 2.2 查看现有用户
```
-- 查看所有用户
SELECT User, Host FROM mysql.user;

-- 查看用户详细信息
SELECT User, Host, plugin, password_expired, account_locked 
FROM mysql.user;
```
### 2.3 创建用户(CREATE USER)
基本语法：
```
CREATE USER [IF NOT EXISTS] '用户名'@'主机名' IDENTIFIED BY '密码';
```
实际应用示例：
```
-- 1. 创建只能从本地连接的用户
CREATE USER 'app_user'@'localhost' IDENTIFIED BY 'App@Pass123!';

-- 2. 创建可以从 10.0.x.x 网段连接的应用用户
CREATE USER 'app'@'10.0.%.%' IDENTIFIED BY 'App@Pass123!';

-- 3. 创建可以从 192.168.1.x 网段连接的 DBA 用户
CREATE USER 'dba'@'192.168.1.%' IDENTIFIED BY 'Dba@Pass456!';

-- 4. 创建可以从指定单个 IP 连接的用户
CREATE USER 'report'@'192.168.1.50' IDENTIFIED BY 'Report@Pass789!';

-- 5. 如果用户已存在则跳过
CREATE USER IF NOT EXISTS 'app'@'10.0.%.%' IDENTIFIED BY 'App@Pass123!';
```
各权限用户的创建策略：

| 用户类型   | 建议用户名    | 建议来源                   | 说明            |
| ------ | -------- | ---------------------- | ------------- |
| 应用用户   | app      | 10.0.%.% 或 192.168.1.% | 允许应用服务器所在网段访问 |
| 只读用户   | readonly | 10.0.%.%               | 用于报表查询        |
| DBA 用户 | dba      | 192.168.1.%            | 限制在管理网段，严格限制  |
| root   | root     | localhost              | 仅限本地，禁止远程     |
### 2.4 修改用户(ALTER USER)
#### 2.4.1 修改密码
```
-- 修改普通用户密码
ALTER USER 'app'@'10.0.%.%' IDENTIFIED BY 'NewApp@Pass456!';

-- 让 MySQL 生成随机密码(MySQL 8.0+)
ALTER USER 'app'@'10.0.%.%' IDENTIFIED BY RANDOM PASSWORD;
```
#### 2.4.2 锁定/解锁用户
```
-- 锁定用户(禁止登录)
ALTER USER 'app'@'10.0.%.%' ACCOUNT LOCK;

-- 解锁用户(允许登录)
ALTER USER 'app'@'10.0.%.%' ACCOUNT UNLOCK;
```
#### 2.4.3 密码过期管理
```
-- 密码立即过期
ALTER USER 'app'@'10.0.%.%' PASSWORD EXPIRE;

-- 密码永不过期
ALTER USER 'app'@'10.0.%.%' PASSWORD EXPIRE NEVER;

-- 每 90 天过期
ALTER USER 'app'@'10.0.%.%' PASSWORD EXPIRE INTERVAL 90 DAY;
```
### 2.5 删除用户(DROP USER)
```
-- 删除用户
DROP USER 'app'@'10.0.%.%';

-- 存在则删除，不存在也不报错
DROP USER IF EXISTS 'app'@'10.0.%.%';
```

## 三、权限体系
### 3.1 权限层级
MySQL 的权限分为四个层级：

| 层级    | 范围         | 表示方式                         | 示例             |
| ----- | ---------- | ---------------------------- | -------------- |
| 全局权限  | 所有数据库的所有对象 | `*.*`                        | 管理整个 MySQL 服务器 |
| 数据库权限 | 某个数据库的所有对象 | `dbname.*`                   | 管理某个库的所有表      |
| 表权限   | 某张表        | dbname.tablename             | 管理某张表          |
| 列权限   | 某张表的某些列    | dbname.table_name(col1,col2) | 只能查看/修改某些列     |
### 3.2 常用权限列表

| 限                | 作用                         | 适用层级     |
| ---------------- | -------------------------- | -------- |
| ALL [PRIVILEGES] | 指定层级的所有权限(不含 GRANT OPTION) | 全局/库/表   |
| SELECT           | 读取数据                       | 全局/库/表/列 |
| INSERT           | 插入数据                       | 全局/库/表/列 |
| UPDATE           | 更新数据                       | 全局/库/表/列 |
| DELETE           | 删除数据                       | 全局/库/表   |
| CREATE           | 创建数据库或表                    | 全局/库/表   |
| DROP             | 删除数据库或表                    | 全局/库/表   |
| ALTER            | 修改表结构                      | 全局/库/表   |
| INDEX            | 创建或删除索引                    | 全局/库/表   |
| CREATE USER      | 创建/删除/修改用户                 | 全局       |
| RELOAD           | 执行 FLUSH 操作                | 全局       |
| PROCESS          | 查看所有进程(SHOW PROCESSLIST)   | 全局       |
| SUPER            | 执行管理操作(KILL、CHANGE MASTER) | 全局       |
| GRANT OPTION     | 将自己的权限授予他人                 | 全局/库/表   |
### 3.3 权限存储位置
MySQL 将权限信息存储在 `mysql` 系统库的授权表中：

|表名|存储内容|
|---|---|
| user |全局权限(.)|
| db |数据库级权限(dbname.*)|
| tablespriv |表级权限(dbname.tablename)|
| columns_priv |列级权限|

## 四、权限管理
### 4.1 授予权限(GRANT)
基本语法：
```
GRANT 权限列表 ON 权限层级 TO '用户名'@'主机名' [WITH GRANT OPTION];
```
#### 4.1.1 数据库级权限授权
```
-- 应用用户：仅授予 CRUD 权限(最小权限原则)
GRANT SELECT, INSERT, UPDATE, DELETE ON app_db.* TO 'app'@'10.0.%.%';

-- 只读用户：仅授予查询权限
GRANT SELECT ON app_db.* TO 'readonly'@'10.0.%.%';

-- 报表用户：授予查询和导出权限
GRANT SELECT ON app_db.* TO 'report'@'192.168.1.%';

-- DBA：授予数据库内所有权限(不包括 GRANT OPTION)
GRANT ALL ON app_db.* TO 'dba'@'192.168.1.%';
```
⚠️ 应用用户只给 CRUD 权限，不给 DDL 权限(CREATE、DROP、ALTER)，防止应用故障或 SQL 注入导致表结构被破坏。
#### 4.1.2 全局权限授权
```
-- DBA 管理权限(不包含数据操作)
GRANT RELOAD, PROCESS, SUPER ON *.* TO 'dba'@'192.168.1.%';

-- 用户管理员权限
GRANT CREATE USER ON *.* TO 'user_admin'@'localhost';
```
#### 4.1.3 表级权限授权
```
GRANT SELECT, INSERT, UPDATE ON app_db.orders TO 'app'@'10.0.%.%';
```
### 4.2 权限授权检查清单
在授予权限前，确认以下事项：
```
☐ 用户是应用用户还是 DBA 用户？
☐ 用户需要操作哪些数据库/表？
☐ 用户需要哪些操作权限？
    应用用户 → SELECT, INSERT, UPDATE, DELETE
    只读用户 → SELECT
    报表用户 → SELECT
    DBA 用户 → ALL ON db.*(不含 GRANT OPTION)
    管理员 → RELOAD, PROCESS, SUPER, CREATE USER
☐ 用户的来源 IP 是否已限制？
☐ 是否遵循了最小权限原则？
```
### 4.3 查看权限(SHOW GRANTS)
```
-- 查看当前用户权限
SHOW GRANTS;

-- 查看指定用户权限
SHOW GRANTS FOR 'app'@'10.0.%.%';

-- 查看用户的所有权限和角色(8.0+)
SHOW GRANTS FOR 'app'@'10.0.%.%' USING ALL;
```
输出示例：
```
+------------------------------------------------------------+
| Grants for app@10.0.%.%                                     |
+------------------------------------------------------------+
| GRANT USAGE ON *.* TO 'app'@'10.0.%.%'                     |
| GRANT SELECT, INSERT, UPDATE, DELETE ON app_db.* TO ...    |
+------------------------------------------------------------+
```
GRANT USAGE ON *.* 表示用户没有全局权限，只能登录，权限仅限于具体的数据库。
### 4.4 回收权限(REVOKE)
```
-- 回收 DELETE 权限
REVOKE DELETE ON app_db.* FROM 'app'@'10.0.%.%';

-- 回收 INSERT 和 UPDATE 权限
REVOKE INSERT, UPDATE ON app_db.* FROM 'app'@'10.0.%.%';

-- 回收指定数据库的所有权限
REVOKE ALL PRIVILEGES ON app_db.* FROM 'app'@'10.0.%.%';
```
### 4.5 刷新权限(FLUSH PRIVILEGES)
```
FLUSH PRIVILEGES;
```
作用：让 MySQL 重新加载授权表，使权限变更立即生效。
- 使用 GRANT、REVOKE 等命令时，MySQL 会自动重新加载权限表，不需要手动执行 FLUSH PRIVILEGES
- 但是！如果在 mysql.user 表中直接执行 INSERT、UPDATE 或 DELETE 修改授权信息(强烈不推荐)，则需要手动执行 FLUSH PRIVILEGES，否则修改不会生效

正确做法：始终使用 CREATE USER、GRANT、REVOKE、DROP USER 等专用命令，无需关心 FLUSH PRIVILEGES。

## 五、`%` 和 `localhost` 的区别
### 5.1 核心概念
在 MySQL 中，'app'@'%' 和 'app'@'localhost' 是两个完全不同的用户账号，拥有各自独立、互不影响的权限。

它们在 mysql.user 表中是两条独立的记录，MySQL 在处理连接请求时，会优先匹配 localhost 记录。

### 5.2 连接匹配规则
当客户端尝试连接 MySQL 时，MySQL 按照以下规则匹配用户记录：
1. 根据客户端提供的用户名和来源主机名(或 IP 地址)进行匹配
2. 如果存在完全匹配的记录(如 'app'@'192.168.1.100')，使用该记录
3. 如果没有完全匹配，再尝试通配符匹配(如 'app'@'%')
4. 重要：从本地连接时，'app'@'localhost' 优先于 'app'@'%'
### 5.3 典型陷阱场景
场景：
管理员执行以下操作：
```
CREATE USER 'app'@'%' IDENTIFIED BY 'Pass123!';
GRANT SELECT ON app_db.* TO 'app'@'%';
```
应用服务器远程连接正常。但在数据库本机使用 mysql -u app -p 连接时，会报错：
```
ERROR 1045 (28000): Access denied for user 'app'@'localhost'
```
原因分析：
- 从本机连接时，MySQL 优先匹配 'app'@'localhost' 这条记录
- 管理员只创建了 'app'@'%'，没有创建 'app'@'localhost'
- 匹配失败，连接被拒绝
### 5.4 正确做法
```
-- 同时创建多个主机名记录
CREATE USER 'app'@'localhost' IDENTIFIED BY 'Pass123!';
CREATE USER 'app'@'10.0.%.%' IDENTIFIED BY 'Pass123!';
CREATE USER 'app'@'192.168.1.%' IDENTIFIED BY 'Pass123!';

-- 分别授予权限
GRANT SELECT, INSERT, UPDATE, DELETE ON app_db.* TO 'app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON app_db.* TO 'app'@'10.0.%.%';
GRANT SELECT, INSERT, UPDATE, DELETE ON app_db.* TO 'app'@'192.168.1.%';
```
### 5.5 主机名配置检查清单
```
☐ 应用运行在哪些服务器上？
☐ 是否需要从数据库本机连接？(备份脚本、定时任务等)
☐ 是否已创建 localhost 对应的用户记录？
☐ 所有来源 IP 段是否都已覆盖？
```

## 六、角色管理(MySQL 8.0)
### 6.1 角色(Role)概述
角色是 MySQL 8.0 引入的权限管理特性，是一个命名的权限集合。
主要优势：
- 提高效率：一次配置权限，批量分配给多个用户
- 降低错误率：避免对每个用户重复授权
- 便于维护：权限变更只需修改角色，无需逐个调整用户
### 6.2 角色操作命令
```
-- 创建角色
CREATE ROLE 'app_read_role', 'app_write_role';

-- 给角色授予权限
GRANT SELECT ON app_db.* TO 'app_read_role';
GRANT SELECT, INSERT, UPDATE, DELETE ON app_db.* TO 'app_write_role';

-- 将角色分配给用户
GRANT 'app_read_role' TO 'readonly'@'10.0.%.%';
GRANT 'app_write_role' TO 'app'@'10.0.%.%';

-- 设置默认角色(登录时自动激活)
SET DEFAULT ROLE 'app_write_role' TO 'app'@'10.0.%.%';

-- 查看用户角色
SHOW GRANTS FOR 'app'@'10.0.%.%';
```

## 七、生产环境最佳实践
### 7.1 最小权限原则实施规范

| 用户类型    | 推荐权限                           | 禁止权限                | 说明            |
| ------- | ------------------------------ | ------------------- | ------------- |
| 应用用户    | SELECT, INSERT, UPDATE, DELETE | CREATE, DROP, ALTER | 仅 CRUD，不给 DDL |
| 只读用户    | SELECT                         | 所有写入权限              | 用于报表和展示       |
| DBA 用户  | RELOAD, PROCESS, SUPER         | 数据库数据操作             | 只管理服务器，不碰业务数据 |
| 数据库管理员  | ALL ON db.                     | 全局 . 权限             | 只管理自己的数据库     |
| root 用户 | 全部                             | —                   | 仅限本地紧急维护**    |
### 7.2 root 账号管理
```
-- 禁止 root 远程登录
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');

-- 验证
SELECT User, Host FROM mysql.user WHERE User='root';
-- 应只显示 'root'@'localhost'
```

```
-- 创建专用的数据库管理员账号
CREATE USER 'dba'@'192.168.1.%' IDENTIFIED BY 'Dba@Pass456!';
GRANT RELOAD, PROCESS, SUPER ON *.* TO 'dba'@'192.168.1.%';
```

```
-- 创建专用的应用账号(应用服务器网段)
CREATE USER 'app'@'10.0.%.%' IDENTIFIED BY 'App@Pass123!';
GRANT SELECT, INSERT, UPDATE, DELETE ON app_db.* TO 'app'@'10.0.%.%';
```
### 7.3 权限审计与维护
#### 7.3.1 日常审查
```
-- 审查所有用户
SELECT User, Host FROM mysql.user;

-- 审查特定用户的权限
SHOW GRANTS FOR 'app'@'10.0.%.%';

-- 审查哪些用户拥有全局权限(安全敏感)
SELECT User, Host FROM mysql.user WHERE Select_priv='Y' OR Insert_priv='Y' OR Update_priv='Y' OR Delete_priv='Y';

-- 审查哪些用户拥有 DDL 权限
SELECT User, Host FROM mysql.user WHERE Create_priv='Y' OR Drop_priv='Y' OR Alter_priv='Y';
```
#### 7.3.2 定期操作
```
-- 删除无用账号
DROP USER 'old_user'@'localhost';

-- 锁定离职员工账号
ALTER USER 'ex_employee'@'192.168.1.%' ACCOUNT LOCK;

-- 强制离职员工密码过期
ALTER USER 'ex_employee'@'192.168.1.%' PASSWORD EXPIRE;
```