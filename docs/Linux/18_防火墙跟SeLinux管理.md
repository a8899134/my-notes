
## 一、定位与分工

| 组件                                       | 作用层级         | 控制对象                           | 典型问题表现                                                        |
| ---------------------------------------- | ------------ | ------------------------------ | ------------------------------------------------------------- |
| 防火墙(firewalld,<br><br>iptables,nftables) | 网络层(L 3/L 4) | 进/出站 网络连接  <br>(IP + 端口 + 协议)  | 连接超时、`Connection refused`, `No route to host`                 |
| SELinux                                  | 内核 MAC 层     | 进程对资源的访问权限  <br>(文件、目录、端口、套接字) | 服务启动成功但功能异常(如 403 Forbidden)、日志报 `Permission denied`(但文件权限正常) |

一句话总结：
- 防火墙决定“能不能连进来”
- SELinux 决定“连进来后能不能干某事”

## 二、Linux 防火墙详解

### 2.1 主流工具对比

| 工具        | 后端                  | 特点                     | 默认发行版                        |
| --------- | ------------------- | ---------------------- | ---------------------------- |
| firewalld | iptables 或 nftables | 动态管理、支持 zone、D-Bus API | RHEL 7+、CentOS Stream、Fedora |
| iptables  | netfilter           | 规则链式、脚本友好              | 老系统、容器环境                     |
| nftables  | nftables            | 性能高、语法统一、替代 iptables   | RHEL 8+/9、Debian 10+         |

建议：新部署优先使用 firewalld(用户友好)，底层自动适配。

### 2.2 Firewalld 核心操作

```
# 查看防火墙状态
systemctl status firewalld

# 重启防火墙
systemctl restart firewalld

# 开机自启
systemctl enable firewalld

# 停止防火墙
systemctl stop firewalld

# 禁用开机自启
sudo systemctl disable firewalld

# 永久添加端口
sudo firewall-cmd --permanent --add-port=8080/tcp

# 永久添加服务
sudo firewall-cmd --permanent --add-service=http

# 移除服务
sudo firewall-cmd --permanent --remove-service=http

# 移除端口
sudo firewall-cmd --permanent --remove-port=8080/tcp

# 平滑重载规则
firewall-cmd --reload

# 查看所有开放的服务和端口
sudo firewall-cmd --list-all

# 仅允许特定网段访问 SSH
firewall-cmd --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port port="22" protocol="tcp" accept' --permanent

```

### 2.3 关键配置文件

- 永久规则：`/etc/firewalld/zones/public.xml`
- 自定义服务：`/etc/firewalld/services/myapp.xml`

## 三、SELinux 详解

### 3.1 三种工作模式

| 模式         | 命令                       | 说明             |
| ---------- | ------------------------ | -------------- |
| enforcing  | `setenforce 1`           | 强制执行策略，拒绝违规并记录 |
| permissive | `setenforce 0`           | 仅记录不阻止(调试用)    |
| disabled   | 修改 `/etc/selinux/config` | 禁止生产使用！        |

生产环境必须为 `enforcing`

### 3.2 安全上下文(Security Context)

每个对象都有标签，格式：`user:role:type:level`

```
$ ls -Z /var/www/html/index.html
system_u:object_r:httpd_sys_content_t:s0 index.html
```

```
$ ps -eZ | grep httpd
system_u:system_r:httpd_t:s0 1234 ? 00:00:00 httpd
```

### 3.3 常见场景配置

#### 3.3.1 Web 服务监听非标准端口(如 8080)

```
# 查看当前允许的 HTTP 端口
semanage port -l | grep http_port_t

# 添加 8080 到许可列表
sudo semanage port -a -t http_port_t -p tcp 8080

# 重启服务
sudo systemctl restart httpd
```

#### 3.3.2 Nginx 访问自定义目录 `/data/web`

```
# 设置正确文件类型
sudo semanage fcontext -a -t httpd_sys_content_t "/data/web(/.*)?"
sudo restorecon -Rv /data/web
```

#### 3.3.3 允许 vsftpd 写入用户家目录

```
sudo setsebool -P ftp_home_dir on
```

`semanage` 修改策略(持久)，`chcon` 仅改标签(重启丢失)

### 3.4 故障排查四步法

#### 3.4.1 确认是否 SELinux 导致

```
sudo setenforce 0    # 临时关闭
# 测试服务是否恢复 → 若是，则为 SELinux 问题
sudo setenforce 1    # 立即重新启用！
```

#### 3.4.2 查看拒绝日志

```
sudo ausearch -m avc -ts recent
# 或
sudo grep "denied" /var/log/audit/audit.log
```

#### 3.4.3 使用 sealert 分析(需安装 setools)

```
sudo dnf install setroubleshoot-server -y
sudo sealert -a /var/log/audit/audit.log
```

按建议修复(通常为上述 3.3 中的操作)

## 四、防火墙 + SELinux 协同加固示例

需求：部署一个内部 Web 应用(端口 8443)，仅限内网访问

#### 4.1 配置防火墙(网络准入)

```
# 仅允许 10.0.0.0/8 访问 8443
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="8443" protocol="tcp" accept'
firewall-cmd --reload
```

#### 4.2 配置 SELinux(资源访问)

```
# 允许 httpd 监听 8443
semanage port -a -t http_port_t -p tcp 8443

# 设置 Web 目录上下文
semanage fcontext -a -t httpd_sys_content_t "/opt/myapp(/.*)?"
restorecon -Rv /opt/myapp
```

#### 4.3 验证

- 外网 IP 访问 → 连接被防火墙拒绝
- 内网 IP 访问但路径错误 → 返回 403(SELinux 阻止)
- 内网 IP 正常访问 → 成功

## 五、安全最佳实践

| 项目      | 推荐做法                                                                  |
| ------- | --------------------------------------------------------------------- |
| 防火墙     | - 默认策略设为 `drop`<br>- 按最小开放原则配置  <br>- 使用 rich rules 限制源 IP            |
| SELinux | - 永远保持 `enforcing`<br>- 用 `semanage`<br>而非 disable  <br>- 定期审计 AVC 日志 |
| 运维      | - 不混用 firewalld 与 iptables 命令  <br>- 所有变更通过配置文件管理(可版本控制)              |

## 六、速查命令表

安全箴言：  
“防火墙是城墙，SELinux 是城内巡捕。  
城墙防外敌，巡捕治内奸。”  
双重防护，方保系统长治久安。