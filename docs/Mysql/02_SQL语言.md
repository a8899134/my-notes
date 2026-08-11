## 一、什么是 SQL
SQL(Structured Query Language) 是操作关系型数据库的标准语言。  
你可以用它：

- 查找用户信息 → `SELECT`
- 添加新订单 → `INSERT`
- 修改商品价格 → `UPDATE`
- 删除过期日志 → `DELETE`
- 创建新表 → `CREATE TABLE`
- 给应用分配专用账号 → `CREATE USER` + `GRANT`

💡 就像“普通话”之于中国人，SQL 是数据库世界的通用语言。

## 二、创建数据库和表

### 1.1 创建数据库(指定字符集)

#### 1.1.1 MySQL 创建数据库

```
CREATE DATABASE school
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;
```

**解释：**
- `CHARACTER SET utf8mb4`：使用完整的 UTF-8 编码，支持中文、表情符号等。
- `COLLATE utf8mb4_general_ci`：排序时不区分大小写(如 "A" 和 "a" 算一样)。
如果不指定，可能默认用 `latin1` 或旧版 `utf8`，导致中文乱码！

#### 1.1.2 PostgreSQL 创建数据库

```
CREATE DATABASE school;
```

- 解释：PostgreSQL 的字符集在安装时就定好了(通常是 UTF 8)，所以这里不用写。
- 怎么确认是 UTF 8？  连接数据库后执行：

```
SHOW SERVER_ENCODING;
```

如果返回 `UTF8`，就说明没问题。

### 1.2 创建数据表

#### 1.2.1 MySQL 建表示例

```
USE school;

CREATE TABLE students (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    age INT,
    email VARCHAR(100)
) ENGINE=InnoDB
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;
```

解释：
- `PRIMARY KEY`：主键，每条记录的唯一编号。
- `AUTO_INCREMENT`：自动加 1(1, 2, 3...)。
- `NOT NULL`：这个字段不能留空。
- `ENGINE=InnoDB`：使用支持事务的存储引擎(推荐)。

#### 1.2.2 PostgreSQL 建表示例

```
\c school

CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    age INT,
    email VARCHAR(100)
);
```

解释：
- `SERIAL`：自动增长的整数(类似 MySQL 的 `AUTO_INCREMENT`)。
- 不用写字符集，因为整个数据库已经是 UTF 8。

## 二、常用数据操作

### 2.1 查询数据(SELECT)

#### 2.1.1 基本查询

```
SELECT 字段列表 FROM 表名 WHERE 条件 ORDER BY 排序 LIMIT 行数;
```

```
-- 查所有学生
SELECT * FROM students;

-- 只查姓名和年龄
SELECT name, age FROM students;
```

- 说明：`*` 表示“所有字段”。

#### 2.1.2 带条件查询

```
-- 查年龄大于 18 的学生
SELECT * FROM students WHERE age > 18;

-- 查名字是“张三”的人
SELECT * FROM students WHERE name = '张三';
```

- 注意：文字要用单引号 `' '`，不能用双引号。

### 2.2 插入数据(INSERT)

```
INSERT INTO 表名 (字段1, 字段2, ...) VALUES (值1, 值2, ...);
```

```
INSERT INTO students (name, age, email)
VALUES ('李四', 17, 'lisi@example.com');
```

说明：
- 字段名写在括号里，值也按顺序写在 `VALUES` 后面。
- `id` 是自动增长的，不用写。

### 2.3 修改数据(UPDATE)

```
UPDATE 表名 SET 字段 = 新值 WHERE 条件;
```

```
UPDATE students
SET age = 18
WHERE name = '李四';
```

❗ 极其重要：
- 永远不要忘记写 WHERE！
- 否则会修改整张表的所有记录！

### 2.4 删除数据(DELETE)

```
DELETE FROM 表名 WHERE 条件;
```

```
DELETE FROM students
WHERE name = '李四';
```

- 说明：删除名字是“李四”的记录。
- 重要警告：  一定要写 `WHERE`,不写就会清空整张表！

## 三、用户与权限管理
应用程序不能用 root 或 postgres 超级用户连接数据库！  
必须创建专用账号，并只给必要的权限。
### 3.1 MySQL 用户与权限

#### 3.1.1 创建用户

```
CREATE USER 'app_user'@'192.168.1.%'
IDENTIFIED BY 'MyPass123!';
```

解释
- `'app_user'@'192.168.1.%'`：用户名是 `app_user`，只能从 `192.168.1.x` 这个网段登录。
- 密码是 `MyPass123!` (建议更复杂)。

#### 3.1.2 授予权限

```
GRANT SELECT, INSERT, UPDATE, DELETE
ON school.*
TO 'app_user'@'192.168.1.%';
```

解释
- 给 `app_user` 四个基本权限：查、增、改、删。
- `school.*` 表示 `school` 数据库里的所有表。

- **不要给的权限**：`DROP` (删表)、`ALTER` (改表结构)、`GRANT OPTION` (给别人授权)。

#### 3.1.3 刷新权限 & 验证

```
-- 让权限立即生效
FLUSH PRIVILEGES;

-- 查看用户权限
SHOW GRANTS FOR 'app_user'@'192.168.1.%';
```

#### 3.1.4 删除用户

```
DROP USER 'app_user'@'192.168.1.%';
```

### 3.2 PostgreSQL 用户与权限

#### 3.2.1 创建用户

```
CREATE USER app_user WITH PASSWORD 'MyPass123!';
```

- **说明**：`CREATE USER` 实际是 `CREATE ROLE ... LOGIN` 的简写。

#### 3.2.2 授予权限(分三步)

```
-- 第1步：允许连接数据库
GRANT CONNECT ON DATABASE school TO app_user;

-- 第2步：允许使用 public 模式(默认模式)
GRANT USAGE ON SCHEMA public TO app_user;

-- 第3步：给表的操作权限
GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO app_user;

-- 第4步：给序列权限(主键自增需要！)
GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
TO app_user;
```

- **为什么需要序列权限**？  
    PostgreSQL 的 `SERIAL` 主键靠“序列”生成数字，没权限就插不了数据！

#### 3.2.3 设置未来新建表的默认权限(推荐)

```
-- 以后新建的表，自动给 app_user 权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO app_user;
```

#### 3.2.4 查看权限 & 删除用户

```
-- 在 psql 命令行中查看
\du app_user      -- 查用户信息
\dp students      -- 查 students 表的权限

-- 删除用户(先清理它拥有的对象)
DROP OWNED BY app_user;
DROP USER app_user;
```

## 四、安全常识

### 4.1 字符集

- MySQL 必须用 `**utf8mb4**`，不是 `utf8`！
- PostgreSQL 安装时就要选好 UTF 8，后面改不了。

### 4.2 用户权限

- 应用账号只给SELECT、INSERT、UPDATE、DELETE。
- 禁止用超级用户(root / postgres)跑应用！
- 限制登录 IP，不要用 `'%'` 或 `0.0.0.0/0` (除非测试)。

### 4.3 操作习惯

- `UPDATE` 和 `DELETE` **一定要写 WHERE**！
- 上线前先在测试库试一遍。
- 重要操作前先备份！

## 五、附录：常用命令速记

| 操作 | MySQL | PostgreSQL |
|------|-------|------------|
| 连数据库 | `mysql -u root -p` | `psql -U postgres` |
| 建库 | `CREATE DATABASE db CHARACTER SET utf8mb4;` | `CREATE DATABASE db;` |
| 建用户 | `CREATE USER 'u'@'h' IDENTIFIED BY 'p';` | `CREATE USER u WITH PASSWORD 'p';` |
| 授权 | `GRANT SELECT ON db.* TO 'u'@'h';` | `GRANT SELECT ON TABLE t TO u;` |
| 查权限 | `SHOW GRANTS FOR 'u'@'h';` | `\du u`（在 psql 中） |
| 删用户 | `DROP USER 'u'@'h';` | `DROP USER u;` |