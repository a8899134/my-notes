## 一、读写分离概述
### 1.1 读写分离概念
读写分离是将数据库的读操作和写操作分散到不同的数据库服务器上处理的一种架构模式。
- 写操作(INSERT、UPDATE、DELETE) → 路由到主库(Master)
- 读操作(SELECT) → 路由到从库(Slave)
通俗理解：主库是“收银台”(只负责收钱/写数据)，从库是“查询台”(只负责查账/读数据)。顾客(应用)根据操作类型选择去哪个柜台。
### 1.2 读写分离作用
| 优势     | 说明                            |
| ------ | ----------------------------- |
| 分担主库压力 | 将查询请求分散到从库，减少主库的 CPU 和 I/O 负载 |
| 提升读性能  | 多台从库并行处理查询，读能力成倍提升            |
| 提高可用性  | 主库故障时，从库可快速切换为主库              |
| 保障写性能  | 主库专注处理写入，写入延迟降低               |
### 1.3 读写分离条件
读写分离依赖于主从复制。必须先配置好主从复制，才能实现读写分离。
架构关系：
```
主从复制(数据同步) → 读写分离(流量分发)
        ↓                      ↓
   保持数据一致          将请求路由到正确节点
```


## 二、读写分离架构方案
### 2.1 架构方案对比

| 方案     | 实现方式                   | 优点          | 缺点              | 适用场景       |
| ------ | ---------------------- | ----------- | --------------- | ---------- |
| 应用层实现  | 在代码中判断 SQL 类型，路由到不同数据源 | 灵活可控，无需额外组件 | 代码侵入性强，多语言维护成本高 | 小型项目、开发测试  |
| 数据库中间件 | 使用 ProxySQL、MyCat 等中间件 | 对应用透明，功能强大  | 增加运维复杂度         | 生产环境、中大型项目 |
| 云服务商方案 | 云 RDS 自带的读写分离功能        | 无需运维，开箱即用   | 依赖特定云厂商         | 云上业务       |
### 2.2 推荐方案

| 场景        | 推荐方案                       |
| --------- | -------------------------- |
| 小型项目、开发环境 | 应用层实现(代码中配置多个数据源)          |
| 生产环境(推荐)  | ProxySQL(MySQL 官方推荐的开源中间件) |
| 云上业务      | 云厂商 RDS 自带的读写分离功能          |

本文重点讲解 ProxySQL，因其专业性强、功能完善，是目前 MySQL 读写分离最主流的开源中间件。

## 三、环境准备
### 3.1 架构规划
本手册采用以下架构：
```
                     ┌─────────────────┐
                     │    应用服务器    │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │   ProxySQL      │  ← 端口 6033(应用连接端口)
                     │  (读写分离)      │  ← 端口 6032(管理端口)
                     └────────┬────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
     ┌──────▼──────┐  ┌───────▼────────┐  ┌───▼──────────┐
     │  主库 Master │ │  从库 Slave 1  │  │ 从库 Slave 2 │
     │  (写入)      │ │ (读取)         │  │  (读取)      │
     │  192.168.1.10│ │  192.168.1.11 │  │  192.168.1.12│
     └─────────────┘  └────────────────┘  └──────────────┘
```
### 3.2 环境清单
| 节点       | IP 地址        | 角色  | server-id | 说明     |
| -------- | ------------ | --- | --------- | ------ |
| Master   | 192.168.1.10 | 主库  | 1         | 处理写入   |
| Slave1   | 192.168.1.11 | 从库  | 2         | 处理读取   |
| Slave2   | 192.168.1.12 | 从库  | 3         | 处理读取   |
| ProxySQL | 192.168.1.20 | 中间件 | -         | 读写分离路由 |
### 3.3 前置条件

| 条件         | 说明                      | 验证命令                                                                     |
| ---------- | ----------------------- | ------------------------------------------------------------------------ |
| 主从复制已配置    | 从库与主库数据一致               | `SHOW SLAVE STATUS\G` → `Slave_IO_Running: Yes`，`Slave_SQL_Running: Yes` |
| 复制用户已创建    | 用于 ProxySQL 监控节点状态      | 在主库执行 `SHOW GRANTS FOR 'repl'@'%';`                                      |
| 网络互通       | ProxySQL 能访问所有 MySQL 节点 | `telnet 192.168.1.10 3306`                                               |
| MySQL 版本兼容 | ProxySQL 支持当前 MySQL 版本  | `mysql --version`                                                        |

## 四、应用层读写分离
### 4.1 方案说明
适用场景：小型项目、开发测试环境、不希望引入额外中间件组件时。
核心思路：在应用层通过代码判断 SQL 类型，将 SELECT 查询路由到从库连接，将 INSERT/UPDATE/DELETE 路由到主库连接。
1. 优点：无需额外组件，架构简单，灵活可控
2. 缺点：代码侵入性强，多语言维护成本高，需手动处理事务、延迟等问题
### 4.2 示例
架构 Spring Boot + MyBatis
```
@Configuration
public class DataSourceConfig {

    @Bean
    @Primary
    @ConfigurationProperties(prefix = "spring.datasource.master")
    public DataSource masterDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    @ConfigurationProperties(prefix = "spring.datasource.slave")
    public DataSource slaveDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    public DataSource routingDataSource() {
        Map<Object, Object> targetDataSources = new HashMap<>();
        targetDataSources.put(DataSourceType.MASTER, masterDataSource());
        targetDataSources.put(DataSourceType.SLAVE, slaveDataSource());

        RoutingDataSource routingDataSource = new RoutingDataSource();
        routingDataSource.setDefaultTargetDataSource(masterDataSource());
        routingDataSource.setTargetDataSources(targetDataSources);
        return routingDataSource;
    }
}

@Component
public class DataSourceContextHolder {
    private static final ThreadLocal<DataSourceType> CONTEXT = new ThreadLocal<>();

    public static void setDataSource(DataSourceType type) {
        CONTEXT.set(type);
    }

    public static DataSourceType getDataSource() {
        return CONTEXT.get();
    }

    public static void clear() {
        CONTEXT.remove();
    }
}

@Aspect
@Component
public class DataSourceAspect {

    @Around("@annotation(transactional) || execution(* com.example.service.*.*(..))")
    public Object determineDataSource(ProceedingJoinPoint joinPoint, Transactional transactional) throws Throwable {
        String methodName = joinPoint.getSignature().getName();
        boolean isReadOnly = methodName.startsWith("get") || 
                            methodName.startsWith("find") || 
                            methodName.startsWith("query") ||
                            methodName.startsWith("list") ||
                            methodName.startsWith("select");

        if (isReadOnly) {
            DataSourceContextHolder.setDataSource(DataSourceType.SLAVE);
        } else {
            DataSourceContextHolder.setDataSource(DataSourceType.MASTER);
        }

        try {
            return joinPoint.proceed();
        } finally {
            DataSourceContextHolder.clear();
        }
    }
}
```
配置文件(application.yml)：
```
spring:
  datasource:
    master:
      jdbc-url: jdbc:mysql://192.168.1.10:3306/mydb?useSSL=false
      username: root
      password: Master@Pass123
    slave:
      jdbc-url: jdbc:mysql://192.168.1.11:3306/mydb?useSSL=false
      username: root
      password: Slave@Pass123
```

## 五、中间件读写分离
### 5.1 ProxySQL 简介
ProxySQL 是一款由 Percona 维护的高性能 MySQL 代理中间件，是目前 MySQL 读写分离最主流的开源方案。
核心特性：

| 特性     | 说明                     |
| ------ | ---------------------- |
| 对应用透明  | 应用只需连接 ProxySQL，无需修改代码 |
| 高性能    | 纯 C++ 实现，单节点可处理数万 QPS  |
| 多种路由策略 | 支持权重、正则匹配、用户匹配等路由规则    |
| 内置监控   | 自动监控后端节点健康状态           |
| 热配置    | 支持运行时动态修改路由规则，无需重启     |
### 5.2 ProxySQL 端口说明
|端口|用途|说明|
|---|---|---|
|6032|管理端口|用于配置和管理 ProxySQL|
|6033|应用连接端口|应用通过此端口连接数据库|
### 5.3 安装顺序
```
1. 安装 ProxySQL
      ↓
2. 登录管理接口(6032)
      ↓
3. 添加 MySQL 节点(主库 + 从库)
      ↓
4. 设置主从分组映射
      ↓
5. 创建监控用户并配置
      ↓
6. 验证监控状态
      ↓
7. 配置路由规则
      ↓
8. 创建应用用户并配置
      ↓
9. 验证读写分离
```
### 5.4 安装 ProxySQL
#### 5.4.1 下载与安装
```
# 下载 ProxySQL(以 2.5.0 为例)
cd /usr/local/src
sudo wget https://github.com/sysown/proxysql/releases/download/v2.5.0/proxysql-2.5.0-1-centos8.x86_64.rpm

# 安装
sudo rpm -ivh proxysql-2.5.0-1-centos8.x86_64.rpm

# 启动服务
sudo systemctl start proxysql
sudo systemctl enable proxysql

# 查看状态
sudo systemctl status proxysql
```
💡 更多安装包可访问：https://github.com/sysown/proxysql/releases
#### 5.4.2 登录管理接口
```
# 默认用户名 admin，密码 admin
mysql -u admin -padmin -h 127.0.0.1 -P 6032
```
### 5.5 配置主从节点
#### 5.5.1 添加 MySQL 节点
```
-- 登录 ProxySQL 管理接口
mysql -u admin -padmin -h 127.0.0.1 -P 6032

-- 添加主库
INSERT INTO mysql_servers(hostgroup_id, hostname, port, weight) 
VALUES (0, '192.168.1.10', 3306, 100);

-- 添加从库(hostgroup_id = 1)
INSERT INTO mysql_servers(hostgroup_id, hostname, port, weight) 
VALUES (1, '192.168.1.11', 3306, 100);
INSERT INTO mysql_servers(hostgroup_id, hostname, port, weight) 
VALUES (1, '192.168.1.12', 3306, 100);

-- 查看已添加的节点
SELECT * FROM mysql_servers;

-- 加载配置
LOAD MYSQL SERVERS TO RUNTIME;
SAVE MYSQL SERVERS TO DISK;
```
参数说明：

|参数|说明|
|---|---|
| hostgroup_id |主机组 ID：0 = 主库组，1 = 从库组|
| hostname |MySQL 节点 IP 地址|
| port |MySQL 端口(默认 3306)|
| weight |权重，用于负载均衡，权重越高被选中概率越大|
#### 5.5.2 设置主从分组映射
```sql
-- 设置写组和读组的映射关系
INSERT INTO mysql_replication_hostgroups (writer_hostgroup, reader_hostgroup, check_type, comment) 
VALUES (0, 1, 'read_only', '主从复制组');

-- 加载并保存
LOAD MYSQL SERVERS TO RUNTIME;
SAVE MYSQL SERVERS TO DISK;
```
配置此映射后，ProxySQL 会自动监控从库的 read_only 状态，并将只读节点分配到读组。
#### 5.5.3 配置监控用户
在主库上创建监控用户：
```sql
-- 在主库执行(复制会自动同步到从库)
CREATE USER 'monitor'@'%' IDENTIFIED BY 'Monitor@Pass123!';

-- 授予监控所需权限
GRANT REPLICATION CLIENT ON *.* TO 'monitor'@'%';
GRANT SELECT ON performance_schema.* TO 'monitor'@'%';
GRANT PROCESS ON *.* TO 'monitor'@'%';

FLUSH PRIVILEGES;
```
在 ProxySQL 中配置监控：
```
-- 登录 ProxySQL 管理接口
mysql -u admin -padmin -h 127.0.0.1 -P 6032

-- 配置监控用户名和密码
UPDATE global_variables SET variable_value='monitor' 
WHERE variable_name='mysql-monitor_username';
UPDATE global_variables SET variable_value='Monitor@Pass123!' 
WHERE variable_name='mysql-monitor_password';
-- 启用监控
SET mysql-monitor_enabled = 'true';
-- 加载并保存
LOAD MYSQL VARIABLES TO RUNTIME;
SAVE MYSQL VARIABLES TO DISK;
```
#### 5.5.4 验证监控状态
```
-- 查看连接日志(确认能连上)
SELECT * FROM monitor.mysql_server_connect_log ORDER BY time_start_us DESC LIMIT 10;

-- 查看 ping 日志(确认网络通)
SELECT * FROM monitor.mysql_server_ping_log ORDER BY time_start_us DESC LIMIT 10;

-- 查看 read_only 日志(确认主从角色识别)
SELECT * FROM monitor.mysql_server_read_only_log ORDER BY time_start_us DESC LIMIT 10;
```
预期结果：
- connect_log：两个节点都有记录，connect_error 为空
- ping_log：两个节点都有记录，ping_error 为空
- read_only_log：主库 read_only=0，从库 read_only=1

⚠️ 注意：ProxySQL 2.6.x 版本中，监控表名为 mysql_server_read_only_log(带 log 后缀)，而非 mysql_server_read_only。不同版本可能存在差异，可用 SHOW TABLES FROM monitor; 确认实际表名。
### 5.5 配置路由规则
在 ProxySQL 管理接口(6032)中执行：
```sql
-- 清空旧规则(如有)
DELETE FROM mysql_query_rules;

-- 规则1：SELECT 语句路由到读组(hostgroup_id = 1)
INSERT INTO mysql_query_rules(rule_id, active, match_pattern, destination_hostgroup, apply) 
VALUES (1, 1, '^SELECT.*', 1, 1);

-- 规则2：SELECT ... FOR UPDATE 路由到写组(需要实时锁定)
INSERT INTO mysql_query_rules(rule_id, active, match_pattern, destination_hostgroup, apply) 
VALUES (2, 1, '^SELECT.*FOR UPDATE.*', 0, 1);

-- 规则3：SELECT ... NOW() 路由到写组(需要实时时间)
INSERT INTO mysql_query_rules(rule_id, active, match_pattern, destination_hostgroup, apply) 
VALUES (3, 1, '^SELECT.*NOW().*', 0, 1);

-- 规则4：写操作路由到写组(hostgroup_id = 0)
INSERT INTO mysql_query_rules(rule_id, active, match_pattern, destination_hostgroup, apply) 
VALUES (4, 1, '^(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|TRUNCATE).*', 0, 1);

-- 查看所有规则
SELECT * FROM mysql_query_rules\G

-- 加载并保存
LOAD MYSQL QUERY RULES TO RUNTIME;
SAVE MYSQL QUERY RULES TO DISK;
```
参数说明：

|参数|说明|
|---|---|
|`rule_id`|规则 ID，数字越小优先级越高|
|`active`|是否激活(1=激活，0=禁用)|
|`match_pattern`|正则表达式，匹配 SQL 语句|
|`destination_hostgroup`|目标主机组(0=写组，1=读组)|
|`apply`|是否立即应用该规则|
### 5.6 配置用户映射
#### 5.6.1 在 MySQL 中创建应用用户
在主库执行：
```sql
-- 创建读写用户
CREATE USER 'app_user'@'%' IDENTIFIED WITH mysql_native_password BY 'App@Pass123!';
GRANT SELECT, INSERT, UPDATE, DELETE ON app_db.* TO 'app_user'@'%';

-- 创建只读用户(可选)
CREATE USER 'readonly_user'@'%' IDENTIFIED WITH mysql_native_password BY 'Read@Pass123!';
GRANT SELECT ON app_db.* TO 'readonly_user'@'%';

FLUSH PRIVILEGES;

-- 加载配置
LOAD MYSQL USERS TO RUNTIME;
SAVE MYSQL USERS TO DISK;
```
⚠️ 建议使用 mysql_native_password 认证插件，避免 caching_sha2_password 的兼容性问题。
#### 5.6.2 在 ProxySQL 中添加用户映射
在 ProxySQL 管理接口(6032)中执行：
```sql
-- 添加应用用户(default_hostgroup=0，默认走写组)
INSERT INTO mysql_users(username, password, default_hostgroup, active) 
VALUES ('app_user', 'App@Pass123!', 0, 1);

-- 添加只读用户(可选，default_hostgroup=1，默认走读组)
INSERT INTO mysql_users(username, password, default_hostgroup, active) 
VALUES ('readonly_user', 'Read@Pass123!', 1, 1);

-- 查看用户
SELECT * FROM mysql_users;

-- 加载并保存
LOAD MYSQL USERS TO RUNTIME;
SAVE MYSQL USERS TO DISK;
```
### 5.7 验证读写分离
#### 5.7.1 通过 ProxySQL 应用端口连接
```bash
# 通过 ProxySQL 连接数据库
mysql -u app_user -p'App@Pass123!' -h ProxySQL_IP -P 6033
```
#### 5.7.2 执行测试 SQL
```sql
-- 测试查询
SELECT 1;

-- 测试业务查询(应走从库)
SELECT * FROM test_db.test_table;

-- 测试写入(应走主库)
INSERT INTO test_db.test_table (name) VALUES ('test');

-- 测试事务内查询
START TRANSACTION;
SELECT * FROM test_db.test_table WHERE id = 1;
UPDATE test_db.test_table SET name = 'updated' WHERE id = 1;
COMMIT;
```
#### 5.7.3 查看路由统计
在 ProxySQL 管理接口(6032)中执行：
```sql
SELECT hostgroup, digest_text, count_star FROM stats_mysql_query_digest ORDER BY count_star DESC LIMIT 20;
```
预期结果：

| SQL 类型                         | hostgroup | 说明       |
| ------------------------------ | --------- | -------- |
| `SELECT` / `SELECT * FROM ...` | 1         | 读请求走从库 ✅ |
| `INSERT` / `UPDATE` / `DELETE` | 0         | 写请求走主库 ✅ |
#### 5.7.4 查看当前连接池分布
```sql
SELECT hostgroup, hostname, status, connections FROM stats_mysql_connection_pool;
```
#### 5.7.5 实时查看正在执行的查询
```sql
SELECT * FROM stats_mysql_processlist;
```

## 六、读写分离的注意事项
### 6.1 复制延迟问题
问题：主库写入后，从库由于复制延迟还未同步，此时读取从库会读到旧数据。

解决方案：

|方案|说明|适用场景|
|---|---|---|
|强制读主库|对实时性要求高的查询路由到主库|关键业务查询|
|延迟容忍|设置延迟阈值，超过阈值将查询路由到主库|大多数业务可接受秒级延迟|
|缓存补偿|写入后更新缓存，读取优先查缓存|读多写少场景|

ProxySQL 延迟监控配置：
```sql
-- 设置从库延迟阈值(秒)
UPDATE mysql_servers SET max_replication_lag = 10 WHERE hostgroup_id = 1;
LOAD MYSQL SERVERS TO RUNTIME;
```
### 6.2 事务处理
问题：事务中的查询应当使用主库，否则可能读到事务执行过程中的不一致数据。

解决方案：
```sql
-- 在 ProxySQL 中配置事务路由
-- 以 BEGIN 开头的事务强制路由到主库
INSERT INTO mysql_query_rules(rule_id, active, match_pattern, destination_hostgroup, apply) 
VALUES (10, 1, '^BEGIN.*', 0, 1);
INSERT INTO mysql_query_rules(rule_id, active, match_pattern, destination_hostgroup, apply) 
VALUES (11, 1, '^START TRANSACTION.*', 0, 1);
```
### 6.3 从库故障处理
问题：从库宕机后，查询请求会失败。

解决方案：
```sql
-- ProxySQL 自动检测从库健康状态
SELECT * FROM monitor.mysql_server_connectivity;

-- 手动下线故障从库
UPDATE mysql_servers SET active = 0 WHERE hostname = '192.168.1.11';
LOAD MYSQL SERVERS TO RUNTIME;
```
### 6.4 读写分离的适用场景限制
|场景|是否适合读写分离|原因|
|---|---|---|
|读多写少(电商查询、内容展示)|✅ 非常适合|从库分散读压力，效果明显|
|写多读少(日志收集、数据采集)|❌ 效果有限|读写分离主要优化读性能，写多场景收益低|
|强一致性要求(金融交易、库存扣减)|⚠️ 需要特殊处理|需配合强制读主库或延迟容忍策略|
|数据量极大(亿级以上)|⚠️ 需要分库分表配合|读写分离解决的是连接数问题，不解决数据量问题|

## 七、常见问题与处理
### 7.1 应用连接报错
现象：应用连接 ProxySQL 时被拒绝。

排查步骤：
```sql
-- 1. 检查 ProxySQL 是否运行
sudo systemctl status proxysql

-- 2. 检查 6033 端口是否监听
sudo netstat -tlnp | grep 6033

-- 3. 检查用户配置
SELECT * FROM mysql_users WHERE active = 1;
-- 确认用户已配置且 active = 1

-- 4. 检查 MySQL 中是否存在该用户
-- 在 MySQL 主库执行
SELECT User, Host FROM mysql.user WHERE User = 'app_user';
```
### 7.2 SELECT 查询没有走从库
现象：所有查询都路由到了主库。

排查步骤：
```sql
-- 1. 检查从库是否被识别为只读
SELECT * FROM monitor.mysql_server_read_only;

-- 2. 检查规则优先级
SELECT rule_id, match_pattern, destination_hostgroup, active 
FROM mysql_query_rules ORDER BY rule_id;

-- 3. 查看查询路由统计
SELECT * FROM stats_mysql_query_digest ORDER BY count_star DESC LIMIT 10;
```
### 7.3 复制延迟导致数据不一致
现象：查询到的数据不是最新版本。

解决方案：
```sql
-- 设置最大复制延迟(秒)
UPDATE mysql_servers SET max_replication_lag = 10 WHERE hostgroup_id = 1;
LOAD MYSQL SERVERS TO RUNTIME;

-- 对实时性要求高的查询强制走主库
INSERT INTO mysql_query_rules(rule_id, active, match_pattern, destination_hostgroup, apply) 
VALUES (20, 1, '^SELECT.*important.*', 0, 1);
```

## 八、附录
### 8.1 常用命令速查
| 操作          | 命令                                                                   |
| ----------- | -------------------------------------------------------------------- |
| 启动 ProxySQL | `sudo systemctl start proxysql`                                      |
| 停止 ProxySQL | `sudo systemctl stop proxysql`                                       |
| 重启 ProxySQL | `sudo systemctl restart proxysql`                                    |
| 查看状态        | `sudo systemctl status proxysql`                                     |
| 登录管理端       | `mysql -u admin -padmin -h 127.0.0.1 -P 6032`                        |
| 查看节点列表      | `SELECT * FROM mysql_servers;`                                       |
| 查看规则列表      | `SELECT * FROM mysql_query_rules;`                                   |
| 查看用户列表      | `SELECT * FROM mysql_users;`                                         |
| 查看查询统计      | `SELECT * FROM stats_mysql_query_digest;`                            |
| 查看从库延迟      | `SELECT * FROM monitor.mysql_server_connectivity;`                   |
| 加载服务器配置     | `LOAD MYSQL SERVERS TO RUNTIME; SAVE MYSQL SERVERS TO DISK;`         |
| 加载规则配置      | `LOAD MYSQL QUERY RULES TO RUNTIME; SAVE MYSQL QUERY RULES TO DISK;` |
| 加载用户配置      | `LOAD MYSQL USERS TO RUNTIME; SAVE MYSQL USERS TO DISK;`             |
### 8.2 关键文件路径
|文件|路径|
|---|---|
|ProxySQL 配置文件|`/etc/proxysql.cnf`|
|ProxySQL 数据目录|`/var/lib/proxysql/`|
|ProxySQL 日志|`/var/log/proxysql.log`|
### 8.3 常用监控 SQL
```sql
-- 查看各节点连接数
SELECT hostname, port, status, connections 
FROM stats_mysql_connection_pool;

-- 查看查询命中率
SELECT * FROM stats_mysql_global;

-- 查看慢查询
SELECT * FROM stats_mysql_query_digest WHERE avg_time > 1000;

-- 查看从库延迟状态
SELECT * FROM monitor.mysql_server_replication_lag;
```
### 8.4 读写分离架构最佳实践

| 实践     | 说明                          |
| ------ | --------------------------- |
| 从库数量   | 建议 2 台以上，避免单点故障             |
| 监控报警   | 监控复制延迟、从库健康状态、ProxySQL 运行状态 |
| 连接池配置  | 应用连接池大小适当，避免连接数打满           |
| 读写分离粒度 | 可按表、按用户、按 SQL 类型等多维度路由      |
| 定期演练   | 定期进行从库故障切换演练                |
