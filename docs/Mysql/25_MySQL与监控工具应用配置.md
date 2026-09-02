## 一、监控概述
### 1.1 监控 MySQL 作用
数据库是业务系统的核心组件，其稳定性与性能直接影响用户体验与服务可用性。仅靠日志和人工巡检难以实现对 MySQL 实例的精细化、实时化监控。一套完善的监控体系可以做到：

|能力|说明|
|---|---|
|实时感知|QPS 突然掉底、连接数打满，立刻知道|
|故障预警|Buffer Pool 命中率下降、磁盘空间不足，提前扩容|
|排障加速|出问题时不用“我觉得慢了”，直接看指标定位|
|容量规划|根据历史趋势决定什么时候扩容|
### 1.2 监控工具选型对比
| 工具                   | 适用场景              | 优点                | 缺点                     |
| -------------------- | ----------------- | ----------------- | ---------------------- |
| Prometheus + Grafana | 云原生、容器化、需要灵活可视化   | 指标丰富、查询语言强大、可视化灵活 | 需要自行搭建和维护              |
| Zabbix               | 传统 IDC、全栈监控、多实例环境 | 功能全面、模板丰富、支持分布式   | 配置较复杂，可视化不如 Grafana 灵活 |

## 二、Prometheus 监控方案
Prometheus 是云原生时代主流的监控与告警工具，凭借其强大的指标采集、存储与查询能力，已成为基础设施监控的事实标准。mysqld_exporter 正是连接 MySQL 与 Prometheus 的桥梁。
### 2.1 mysqld_exporter 简介
mysqld_exporter 是 Prometheus 生态系统中专门用于从 MySQL 数据库收集监控指标并将其导出到 Prometheus 的组件。它通过查询 MySQL 的系统表和状态变量，收集诸如查询性能、连接数、InnoDB 缓冲池、慢查询等上百项关键指标。

支持版本：
- MySQL >= 5.6
- MariaDB >= 10.3
### 2.2 创建监控用户
在 MySQL 中创建专用的监控用户，并授予最小必要权限：
```sql
-- 创建监控用户(限制最大连接数为3，防止监控占用过多连接)
CREATE USER 'exporter'@'localhost' IDENTIFIED BY 'Exporter@Pass123!'
WITH MAX_USER_CONNECTIONS 3;

-- 授予监控所需权限
GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'localhost';

-- 刷新权限
FLUSH PRIVILEGES;
```
权限说明：
1. PROCESS，查看当前运行的线程和连接信息
2. REPLICATION CLIENT，获取主从复制状态信息
3. SELECT，查询 performance_schema 等系统表
### 2.3 安装与配置 mysqld_exporter
#### 2.3.1 下载与解压
```bash
# 进入下载目录
cd /usr/local/src

# 下载 mysqld_exporter(以 0.18.0 为例)
wget https://github.com/prometheus/mysqld_exporter/releases/download/v0.18.0/mysqld_exporter-0.18.0.linux-amd64.tar.gz

# 解压
tar -zxvf mysqld_exporter-0.18.0.linux-amd64.tar.gz

# 重命名并移动到系统路径
mv mysqld_exporter-0.18.0.linux-amd64 /usr/local/mysqld_exporter
```
#### 2.3.2 创建连接配置文件
```bash
# 创建配置文件目录
mkdir -p /usr/local/mysqld_exporter

# 创建连接配置文件
vi /usr/local/mysqld_exporter/my.cnf
```
写入以下内容：
```ini
[client]
user=exporter
password=Exporter@Pass123!
host=localhost
port=3306
```
#### 2.3.3 启动 mysqld_exporter
手动启动(测试用) ：
```bash
cd /usr/local/mysqld_exporter
./mysqld_exporter --config.my-cnf=/usr/local/mysqld_exporter/my.cnf
```
配置 systemd 服务(生产推荐) ：
```bash
vi /etc/systemd/system/mysqld_exporter.service
```
输入以下内容
```ini
[Unit]
Description=MySQL Exporter
After=network.target

[Service]
Type=simple
User=prometheus
ExecStart=/usr/local/mysqld_exporter/mysqld_exporter \
  --config.my-cnf=/usr/local/mysqld_exporter/my.cnf \
  --web.listen-address=":9104"
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
开启服务
```bash
# 启动服务
systemctl daemon-reload
systemctl start mysqld_exporter
systemctl enable mysqld_exporter

# 验证是否正常运行
curl http://localhost:9104/metrics
```
💡 默认情况下，mysqld_exporter 在 9104 端口 上暴露指标。如果端口冲突，可通过 --web.listen-address 参数更改。
### 2.4 配置 Prometheus 抓取
在 Prometheus 配置文件 /etc/prometheus/prometheus.yml 中添加抓取任务：
```yaml
scrape_configs:
  - job_name: 'mysql'
    scrape_interval: 10s
    static_configs:
      - targets: ['localhost:9104']
        labels:
          instance: 'mysql-master'
```

```bash
# 重启 Prometheus 使配置生效
systemctl restart prometheus

# 验证配置是否生效
# 在浏览器访问：http://prometheus_ip:9090/targets
# 检查 mysql job 状态是否为 UP
```
### 2.5 Grafana 可视化与告警
#### 2.5.1 添加数据源
1. 登录 Grafana Web 界面(默认端口 3000)
2. 点击 Configuration → Data Sources → Add data source
3. 选择 Prometheus
4. 填写 URL：`http://localhost:9090`
5. 点击 Save & Test
#### 2.5.2 导入 MySQL 监控仪表盘
Grafana 社区提供了成熟的 MySQL 监控仪表盘模板：
```text
推荐模板 ID：
- 7362：MySQL Overview(最常用)
- 11323：MySQL Dashboard
- 10685：MySQL InnoDB Metrics
```
导入步骤：
1. 点击 + → Import
2. 输入模板 ID(如 7362)
3. 选择 Prometheus 数据源
4. 点击 Import
#### 2.5.3 配置告警规则
在 Grafana 中配置告警规则：
```text
1. 点击 Alerting → Alert rules → New rule
2. 选择数据源和查询
3. 设置告警条件(如：连接数 > max_connections 的 80%)
4. 配置通知渠道(邮件、钉钉、企业微信等)
5. 保存规则
```
推荐告警规则示例：

|告警名称|表达式|阈值|
|-----|-----|-----|
|MySQL 连接数过高| mysqlglobalstatusthreadsconnected / mysqlglobalvariablesmaxconnections > 0.8 |> 80%|
|Buffer Pool 命中率低| (1 - mysqlglobalstatusinnodbbufferpoolreads / mysqlglobalstatusinnodbbufferpoolread_requests) < 0.95 | 60 秒|
|MySQL 服务不可用| up{job="mysql"} == 0 |持续 1 分钟|

## 三、Zabbix 监控方案
Zabbix 是一款企业级开源监控解决方案，适合传统 IDC 环境和需要统一监控多种设备的场景。通过 Zabbix 的模板和自定义监控项配置，可实现对 MySQL 性能指标的实时监控。
### 3.1 Zabbix 监控架构
Zabbix 监控 MySQL 主要有两种方式：

|方式|说明|适用场景|
|---|---|---|
|Zabbix Agent + 模板|通过 Agent 执行监控脚本采集指标|传统环境，Zabbix 4.0+|
|Zabbix Agent 2 + 官方模板|原生支持 MySQL 监控，无需外部脚本|Zabbix 5.0+ 推荐|
### 3.2 创建监控用户
在 MySQL 中创建 Zabbix 监控用户：
```sql
CREATE USER 'zbx_monitor'@'%' IDENTIFIED BY 'Zbx@Monitor123!';
GRANT REPLICATION CLIENT, PROCESS, SHOW DATABASES, SHOW VIEW ON *.* TO 'zbx_monitor'@'%';
FLUSH PRIVILEGES;
```
### 3.3 导入官方模板
Zabbix 官方提供了 Template DB MySQL by Zabbix agent 2 模板，支持 MySQL 5.7、8.0、Percona 8.0、MariaDB 10.4 等版本。
#### 3.3.1 模板获取方式
| 方式            | 说明                         |
| ------------- | -------------------------- |
| Zabbix 内置     | Zabbix 5.0+ 默认已包含 MySQL 模板 |
| Zabbix Git 仓库 | 从官方 Git 仓库获取最新模板           |
| Zabbix Share  | 从社区分享平台下载                  |
#### 3.3.2 导入模板(如需要)
如果 Zabbix 中没有 MySQL 模板，可以手动导入：
1. 登录 Zabbix Web 界面
2. 点击 Configuration → Templates
3. 点击 Import
4. 选择模板文件(XML 格式)
5. 点击 Import
### 3.4 关联模板与主机
#### 3.4.1 配置宏(Macros)
模板使用宏来传递连接信息：

|宏|说明|示例值|
|---|---|---|
| `{$MYSQL.DSN}` |MySQL 实例的连接字符串| tcp://localhost:3306 或 unix:/var/run/mysql.sock |
| `{$MYSQL.USER}` |MySQL 监控用户名| zbx_monitor |
| `{$MYSQL.PASSWORD}` |MySQL 监控用户密码| Zbx@Monitor123! |
#### 3.4.2 关联模板到主机
1. 点击 Configuration → Hosts
2. 选择要监控的 MySQL 主机
3. 在 Templates 选项卡中，点击 Add
4. 选择 Template DB MySQL by Zabbix agent 2
5. 在 Macros 选项卡中，设置 `{$MYSQL.DSN}、{$ MYSQL.USER}、{$MYSQL.PASSWORD}` 宏
6. 点击 Update
### 3.5 自定义监控项(UserParameter)
如果官方模板无法满足需求，可以通过 UserParameter 扩展监控。
在 Zabbix Agent 配置文件 /etc/zabbix/zabbix_agentd.d/mysql.conf 中添加：
```ini
# 监控慢查询数量
UserParameter=mysql.slow_queries,mysql -u zbx_monitor -p'Zbx@Monitor123!' -e "SHOW GLOBAL STATUS LIKE 'Slow_queries';" | awk '{print $2}'

# 监控 QPS(每秒查询数)
UserParameter=mysql.qps,mysql -u zbx_monitor -p'Zbx@Monitor123!' -e "SHOW GLOBAL STATUS LIKE 'Questions';" | awk '{print $2}'
```

```bash
# 重启 Zabbix Agent
systemctl restart zabbix-agent
```

## 四、核心监控指标解读
无论使用 Prometheus 还是 Zabbix，以下指标都是监控 MySQL 的核心维度。
### 4.1 连接与线程指标
|指标名称|Prometheus 指标|Zabbix 监控项|说明|
|-----|-----|-----|-----|
|当前连接数|`mysql_global_status_threads_connected`|`mysql.status|当前客户端连接数|
|最大连接数|`mysql_global_variables_max_connections`|—|配置的最大连接数|
|活跃线程数|`mysql_global_status_threads_running`|—|正在执行查询的线程数|
|连接使用率|计算值：`threads_connected / max_connections`|—|连接池使用情况|
### 4.2 查询性能指标
|指标名称|Prometheus 指标|说明|
|---|---|---|
|QPS|计算值：`rate(mysql_global_status_questions[5m])`|每秒查询数|
|慢查询数|`mysql_global_status_slow_queries`|执行超过阈值的查询总数|
|全表扫描数|`mysql_global_status_select_scan`|执行全表扫描的查询次数|
### 4.3 InnoDB 引擎指标
|指标名称|Prometheus 指标|说明|
|---|---|---|
|Buffer Pool 命中率|计算值|数据在内存中的命中比例(应 > 99%)|
|Buffer Pool 读取请求|`mysql_global_status_innodb_buffer_pool_read_requests`|从 Buffer Pool 读取的总请求数|
|Buffer Pool 磁盘读取|`mysql_global_status_innodb_buffer_pool_reads`|需要从磁盘读取的次数|
|行锁等待数|`mysql_global_status_innodb_row_lock_waits`|行锁等待总次数|
|行锁平均等待时间|`mysql_global_status_innodb_row_lock_time_avg`|平均锁等待时间(毫秒)|
### 4.4 主从复制指标
|指标名称|Prometheus 指标|说明|
|---|---|---|
|复制延迟|`mysql_slave_status_seconds_behind_master`|从库落后主库的秒数|
|IO 线程状态|`mysql_slave_status_slave_io_running`|IO 线程是否运行(1=是)|
|SQL 线程状态|`mysql_slave_status_slave_sql_running`|SQL 线程是否运行(1=是)|
### 4.5 告警阈值参考
| 监控指标            | 告警阈值   | 级别    |
| --------------- | ------ | ----- |
| 连接数使用率          | > 80%  | ⚠️ 重要 |
| Buffer Pool 命中率 | < 95%  | ⚠️ 重要 |
| 主从复制延迟          | > 60 秒 | 🔴 紧急 |
| 复制线程停止          | 任一为 0  | 🔴 紧急 |
| 慢查询数(增量)        | > 50/秒 | ⚠️ 重要 |

## 五、附录
### 5.1 常用命令速查
| 操作                      | 命令                                          |
| ----------------------- | ------------------------------------------- |
| 查看 Prometheus targets   | `curl http://localhost:9090/api/v1/targets` |
| 查看 mysqld_exporter 指标   | `curl http://localhost:9104/metrics`        |
| 重启 Prometheus           | `systemctl restart prometheus`              |
| 重启 mysqld_exporter      | `systemctl restart mysqld_exporter`         |
| 查看 Zabbix Agent 日志      | `tail -f /var/log/zabbix/zabbix_agentd.log` |
| 测试 Zabbix UserParameter | `zabbix_agentd -t mysql.slow_queries`       |
### 5.2 推荐 Grafana 仪表盘模板
| 模板 ID | 名称                   | 说明               |
| ----- | -------------------- | ---------------- |
| 7362  | MySQL Overview       | 最常用的 MySQL 监控仪表盘 |
| 11323 | MySQL Dashboard      | 全面的 MySQL 监控     |
| 10685 | MySQL InnoDB Metrics | 专注于 InnoDB 引擎指标  |
### 5.3 总结
Prometheus + Grafana 适合云原生和需要灵活可视化的场景，Zabbix 适合传统 IDC 和需要统一监控多种设备的场景。

两者都需要在 MySQL 中创建专用的监控用户，并配置相应的 exporter 或 agent。核心监控指标覆盖连接、查询、InnoDB 和主从复制四个维度，设置合理的告警阈值是监控体系的关键。
