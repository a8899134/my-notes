## 一、Nginx 日志基础
### 1.1 两类日志文件
| 日志类型           | 默认路径(YUM 安装)                | 默认路径(源码编译)                         | 作用                             |
| -------------- | --------------------------- | ---------------------------------- | ------------------------------ |
| access.log | `/var/log/nginx/access.log` | `/usr/local/nginx/logs/access.log` | 记录每个用户请求(谁？访问了什么？结果如何？)        |
| error.log | `/var/log/nginx/error.log`  | `/usr/local/nginx/logs/error.log`  | 记录 Nginx 自身错误(配置错误、文件权限、连接失败等) |

💡 **路径差异说明**：
- YUM/DNF 安装：日志默认在 `/var/log/nginx/`
- 源码编译安装：日志默认在 `/usr/local/nginx/logs/`
- 源码编译(自定义路径)：日志在 `{prefix}/logs/`

### 1.2 默认日志格式(combined)
Nginx 默认使用 log_format combined，一行示例如下：
```
192.168.1.100 - - [22/Jan/2026:14:30:01 +0800] "GET /api/user HTTP/1.1" 200 1234 "https://example.com" "Mozilla/5.0 ..."
```

|字段|含义|示例|
|---|---|---|
| `$remote_addr` |客户端 IP| `192.168.1.100` |
| `-` |远程用户(通常为空)| `-` |
| `-` |认证用户(通常为空)| `-` |
| `[$time_local]` |请求时间| `[22/Jan/2026:14:30:01 +0800]` |
| `"$request"` |方法 + 路径 + 协议| `"GET /api/user HTTP/1.1"` |
| `$status` |HTTP 响应码| `200` |
| `$body_bytes_sent` |返回字节数(不含头)| `1234` |
| `"$http_referer"` |从哪个页面跳转来| `"https://example.com"` |
| `"$http_user_agent"` |客户端设备/浏览器| `"Mozilla/5.0 ..."` |

💡 如果你用了 CDN 或反向代理，真实 IP 可能在 `$http_x_forwarded_for` 字段中！

## 二、自定义日志格式
为便于分析，建议在 `nginx.conf` 中定义更丰富的格式：
```
http {
    log_format main_ext '$remote_addr - $remote_user [$time_local] '
                        '"$request" $status $body_bytes_sent '
                        '"$http_referer" "$http_user_agent" '
                        'rt=$request_time uct="$upstream_connect_time" '
                        'uht="$upstream_header_time" urt="$upstream_response_time"';

    access_log /var/log/nginx/access.log main_ext;
}
```
**新增字段说明**：

| 字段    | 含义                | 用途            |
| ----- | ----------------- | ------------- |
| `rt`  | 总请求耗时(秒，含网络+后端处理) | 判断整体响应速度      |
| `uct` | 与上游建立连接耗时         | 判断网络连接是否正常    |
| `uht` | 接收上游响应头耗时         | 判断上游服务响应速度    |
| `urt` | 上游响应耗时(后端处理时间)    | 核心字段！定位慢接口的关键 |

✅ 有了这些字段，你就能精准定位“是网络慢还是后端慢”：

| 现象               | 结论                 |
| ---------------- | ------------------ |
| `rt` 大，`urt` 小   | 网络/客户端慢，或 Nginx 排队 |
| `rt` 大，`urt` 也大  | 后端慢(需要优化应用或数据库)    |
| `rt` 正常，`urt` 正常 | 一切正常               |

## 三、常用日志分析命令
所有命令假设日志文件为 access.log，请根据实际路径替换。
### 3.1 统计独立访问 IP 数
```
awk '{print $1}' access.log | sort -u | wc -l
```
查看有多少不同用户访问了你的服务
### 3.2 查看访问 TOP 10 的 IP
```
awk '{print $1}' access.log | sort | uniq -c | sort -nr | head -10
```
快速发现爬虫、攻击源或高流量用户
### 3.3 统计各状态码数量
```
awk '{print $9}' access.log | sort | uniq -c | sort -nr
```
关注 4xx(客户端错误)、5xx(服务端错误)
### 3.4 查找 502/503/504 错误
后端宕机信号
```
grep " 50[234] " access.log
```
结合时间分析，判断后端是否不稳定
### 3.5 查看最慢的 10 个请求
```
# 假设 $request_time 是最后一个字段(需自定义日志格式)
awk '{print $NF, $0}' access.log | sort -k1 -nr | head -10
```
⚠️ 注意：这里使用 $NF 取最后一个字段，前提是 $request_time 确实是你日志格式中的最后一个字段。如果你的日志格式不同，请调整命令或使用 grep -o 配合正则提取。
### 3.6 统计热门 URL
```
awk '{print $7}' access.log | sort | uniq -c | sort -nr | head -10
```
优化缓存策略、CDN 配置依据
### 3.7 分析 User-Agent
识别爬虫/设备
```
awk -F'"' '{print $6}' access.log | sort | uniq -c | sort -nr | head -10
```
发现异常 UA(如 sqlmap、nmap)
### 3.8 按小时统计请求量
分析流量高峰
```
awk -F: '{print $2":"$3}' access.log | sort | uniq -c
```
输出如：14:30 → 1250 次请求

## 四、识别异常行为
### 4.1 暴力破解登录
```
grep "/login" access.log | awk '{print $1}' | sort | uniq -c | sort -nr | head -5
```
如果某个 IP 短时间内大量访问 /login，可能是爆破
### 4.2 扫描敏感文件
```
grep -E "\.(sql|bak|zip|log|git|env|config|yml|json)" access.log
```
攻击者常尝试下载备份文件、数据库导出等
### 4.3 高频请求(CC 攻击)
```
# 每秒超过 100 次的 IP
awk '{print $1, substr($4,2,17)}' access.log | \
  sort | uniq -c | awk '$1 > 100 {print $2, $1}'
```
可配合 iptables 或 Nginx limit_req 限流

## 五、性能分析
### 5.1 找出响应时间 > 2 秒的请求
```
# 假设 $request_time 是最后一个字段
awk '$NF > 2.0 {print $0}' access.log
```
### 5.2 关联后端处理时间
- 如果 urt(后端时间)接近 rt(总时间)→ 后端慢
- 如果 rt 很大但 urt 很小 → 网络或客户端慢
### 5.3 按接口聚合平均耗时
```
# 提取 URL 和耗时，计算平均
awk '{url[$7] += $NF; count[$7]++} END {for (u in url) print url[u]/count[u], u}' access.log | sort -nr | head -10
```

## 六、自动化分析工具推荐
| 工具                                           | 特点                     | 适用场景       |
| -------------------------------------------- | ---------------------- | ---------- |
| GoAccess                                     | 实时 Web 仪表盘，终端/HTML 双模式 | 快速可视化，适合单机 |
| ELK Stack(Elasticsearch + Logstash + Kibana) | 强大搜索、聚合、告警             | 大规模日志集中分析  |
| Grafana + Loki                               | 轻量级日志聚合，与监控集成          | 云原生环境首选    |
| AWStats                                      | 传统 Web 日志分析工具          | 生成日报/月报    |
### 6.1 GoAccess 快速上手
推荐新手
```
# 安装(RockyLinux / CentOS)
sudo yum install -y goaccess

# 实时分析
goaccess access.log -c

# 生成 HTML 报告
goaccess access.log -o report.html --log-format=COMBINED
```

## 七、日志轮转与清理
Nginx 日志会不断增长，必须配置轮转，避免磁盘爆满！
### 7.1 使用 logrotate
创建 `/etc/logrotate.d/nginx`：
```
/var/log/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 nginx adm
    postrotate
        if [ -f /var/run/nginx.pid ]; then
            kill -USR1 `cat /var/run/nginx.pid`
        fi
    endscript
}
```
**配置说明**：

|参数|说明|
|---|---|
|`daily`|每天轮转一次|
|`rotate 30`|保留 30 个历史文件|
|`compress`|压缩历史日志|
|`delaycompress`|延迟压缩(保留最新一个未压缩)|
|`postrotate`|轮转后执行，通知 Nginx 重新打开日志文件|

⚠️ 如果 Nginx 是由 systemd 管理的，也可使用以下更通用的方式：
```
postrotate
    /usr/bin/systemctl reload nginx > /dev/null 2>&1 || true
endscript
```
### 7.2 源码编译安装的 logrotate 配置
如果 Nginx 是源码编译安装的，路径可能不同，需要相应调整：
```
/usr/local/nginx/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 nginx nginx
    postrotate
        if [ -f /usr/local/nginx/logs/nginx.pid ]; then
            kill -USR1 `cat /usr/local/nginx/logs/nginx.pid`
        fi
    endscript
}
```
### 7.3 手动清理日志
```
# 清空日志文件(不删除文件)
> /var/log/nginx/access.log

# 或使用 truncate
truncate -s 0 /var/log/nginx/access.log

# 然后通知 Nginx 重新打开日志
nginx -s reopen
```
**总结**：日志是系统的“黑匣子”，定期分析能提前发现故障、阻止攻击、优化体验。建议将关键指标(如 5 xx 率、平均响应时间)接入监控告警系统(如 Prometheus + Alertmanager)。