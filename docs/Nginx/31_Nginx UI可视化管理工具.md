## 一、为什么需要 Nginx UI

### 1.1 传统 Nginx 管理的痛点

Nginx 是一款高性能的 Web 服务器和反向代理工具，但其配置完全依赖文本文件(如`nginx.conf`)，存在以下问题：

- 易出错：一个分号缺失或括号不匹配就会导致服务启动失败。
- 难调试：需手动执行 `nginx -t` 检查语法，错误信息不够直观。
- 效率低：添加新站点需复制模板、修改域名、设置代理，重复劳动多。
- 无可视化：无法直观查看当前有多少连接、QPS(每秒请求数)、流量趋势。
- HTTPS 配置复杂：申请 Let's Encrypt 证书需命令行操作，续期易遗忘。

### 1.2 Nginx UI 能带来什么？

Nginx UI 是一套基于 Web 浏览器的图形化管理界面，它能：

- ✅ 可视化编辑配置：表单填写代替手写代码，自动校验语法。
- ✅ 一键申请 HTTPS 证书：集成 Let's Encrypt，自动完成验证与部署。
- ✅ 实时日志查看：在网页中直接查看 access.log 和 error.log，支持搜索。
- ✅ 性能监控面板：显示活跃连接数、请求速率、响应时间等关键指标。
- ✅ 配置版本管理：每次修改自动保存历史，支持一键回滚。
- ✅ 多用户权限控制：管理员可分配只读/编辑权限给不同成员。

💡 一句话总结：Nginx UI 让你像操作 WordPress 后台一样管理 Nginx！

## 二、主流 Nginx UI 工具介绍

### 2.1 nginxWebUI

#### 2.1.1 基本信息

- 开源地址：[https://gitee.com/cym1102/nginxWebUI](https://gitee.com/cym1102/nginxWebUI)
- 开发语言：Java + Vue
- 适用场景：需要全面管理 Nginx 的中小型团队或个人项目

#### 2.1.2 核心功能

- 完整支持 `http`、`stream`(TCP/UDP 代理)配置
- 内置 Nginx 状态监控(需启用 `stub_status`)
- 支持多服务器集群统一管理
- 自动申请和续期 Let's Encrypt 证书
- 日志实时滚动 + 关键词高亮
- 用户角色权限(管理员 / 普通用户)

### 2.2 Nginx Proxy Manager

#### 2.2.1 基本信息

- 官网：[https://nginxproxymanager.com/](https://nginxproxymanager.com/)
- 开发语言：Node.js + React
- 适用场景：家庭 NAS、Docker 服务暴露、快速搭建 HTTPS 代理

#### 2.2.2 核心功能

- 极简 UI，5 分钟上手
- 自动处理 Let's Encrypt 证书(支持 HTTP-01 和 DNS-01 验证)
- 内置 Basic Auth(访问密码保护)
- 支持自定义高级 Nginx 配置片段
- 完美适配 Docker 环境

🔍 选型建议：

- 如果你需要全面管理 Nginx(包括 TCP 代理、日志、状态) → 选 nginxWebUI
- 如果你只想快速为多个服务加 HTTPS 反向代理 → 选 Nginx Proxy Manager

## 三、快速部署指南

### 3.1 部署 nginxWebUI

#### 3.1.1 使用 Docker 一键部署

```
# 创建持久化数据目录(防止容器删除后配置丢失)
mkdir -p ~/nginxwebui/{data,logs}

# 启动容器
docker run -d \
  --name nginxwebui \
  -p 8080:8080 \          # Web 管理界面端口
  -p 8443:8443 \          # HTTPS 管理界面端口(可选)
  -v ~/nginxwebui/data:/home/nginxWebUI/data \   # 存放 UI 配置和 Nginx 配置
  -v ~/nginxwebui/logs:/var/log/nginx \          # 挂载 Nginx 日志目录
  --privileged \          # 允许容器内重启宿主机 Nginx(生产环境可优化)
  cym1102/nginxwebui:latest
```

📌 命令参数解释：

- `-d`：后台运行容器(detached mode)
- `-p 8080:8080`：将宿主机的 8080 端口映射到容器的 8080 端口
- `-v`：挂载卷(volume)，实现数据持久化
- `--privileged`：授予容器扩展权限(用于执行 `nginx -s reload` 等命令)

#### 3.1.2 首次配置步骤

1. 打开浏览器，访问 `http://你的服务器IP:8080`
2. 设置管理员账号(邮箱 + 密码)
3. 进入「Nginx 管理」页面，填写以下信息：

- Nginx 安装路径：如 `/usr/local/webserver/nginx` 或 `/etc/nginx`
- Nginx 配置文件路径：如 `/usr/local/webserver/nginx/conf/nginx.conf`
- Nginx 日志路径：如 `/var/log/nginx`

4. 点击「保存并验证」→ 系统会自动检测 Nginx 是否正常

⚠️ 注意：如果 Nginx 是通过 `yum` 或 `apt` 安装的，路径通常是：

- 配置文件：`/etc/nginx/nginx.conf`
- 日志目录：`/var/log/nginx`

### 3.2 部署 Nginx Proxy Manager

#### 3.2.1 使用 Docker Compose 部署

创建 `docker-compose.yml` 文件：

```
version: '3'
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '80:80'    # HTTP 流量入口(Let's Encrypt 验证必需)
      - '443:443'  # HTTPS 流量入口
      - '81:81'    # Web 管理界面端口
    volumes:
      - ./data:/data                # 存放数据库、配置
      - ./letsencrypt:/etc/letsencrypt  # 存放 SSL 证书
```

启动服务：

```
# 在 docker-compose.yml 所在目录执行
docker-compose up -d
```

📌 端口说明：

- `80` 和 `443` 必须开放，用于接收网站流量和证书验证
- `81` 是管理后台端口，可按需修改(如 `- '9000:81'`)

#### 3.2.2 首次登录

- 管理地址：`http://你的服务器IP:81`
- 默认账号：

- 邮箱：`admin@example.com`
- 密码：`changeme`

🔐 安全提醒：首次登录后立即修改密码！

## 四、核心功能使用示例

### 4.1 添加一个反向代理站点(以 nginxWebUI 为例)

#### 4.1.1 操作步骤

1. 登录 nginxWebUI 后，点击左侧「HTTP 配置」→「添加」
2. 填写基本信息：

- 域名：`app.yourdomain.com`
- 监听端口：`443`(HTTPS)
- 根目录：留空(反向代理不需要)

3. 切换到「反向代理」标签页：

- 代理地址：`http://127.0.0.1:3000`(你的后端服务地址)

4. 切换到「SSL」标签页：

- 勾选「启用 HTTPS」
- 选择「申请免费证书(Let's Encrypt)」
- 填写邮箱(用于证书到期通知)

5. 点击「保存」→ 系统自动：

- 生成 Nginx 配置
- 申请并部署证书
- 重载 Nginx 服务

✅ 几十秒后，访问 `https://app.yourdomain.com` 即可看到你的应用！

### 4.2 为站点添加访问密码(Basic Auth)

#### 4.2.1 在 Nginx Proxy Manager 中操作

1. 编辑已有的 Proxy Host
2. 切换到「Access Lists」标签页
3. 点击「Create New Access List」

- 名称：`Admin Only`
- 添加用户：用户名 `admin`，密码 `your_secure_password`

4. 保存后，下次访问该站点将弹出登录框

💡 此功能基于 Nginx 的 `auth_basic` 模块，安全且轻量。

## 五、安全与维护建议

### 5.1 安全加固

#### 5.1.1 限制管理界面访问 IP

在服务器防火墙中，只允许可信 IP 访问管理端口(如 8080 或 81)：

```
# CentOS 7 示例(使用 firewalld)
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port port="8080" protocol="tcp" accept'
firewall-cmd --reload
```

#### 5.1.2 禁用默认账户

- nginxWebUI：创建新管理员后删除默认账户
- Nginx Proxy Manager：首次登录必须改密码

### 5.2 日常维护

#### 5.2.1 备份配置

- nginxWebUI：备份 `~/nginxwebui/data` 目录
- Nginx Proxy Manager：备份 `./data` 和 `./letsencrypt` 目录

#### 5.2.2 更新 UI 工具

```
# nginxWebUI
docker stop nginxwebui && docker rm nginxwebui
docker pull cym1102/nginxwebui:latest
# 重新运行启动命令

# Nginx Proxy Manager
docker-compose pull
docker-compose up -d
```

## 六、常见问题解答(FAQ)

### 6.1 Q：部署后无法访问管理界面？

- 检查服务器安全组/防火墙是否开放对应端口(8080 / 81)
- 执行 `docker logs nginxwebui` 查看容器日志

### 6.2 Q：Let's Encrypt 证书申请失败？

- 确保域名已正确解析到服务器 IP
- 确保 80 端口未被占用(Nginx Proxy Manager 需要 80 端口做验证)

### 6.3 Q：能否管理已存在的 Nginx 配置？

- 可以！ nginxWebUI 支持导入现有 `nginx.conf`，自动解析为可视化表单。

## 七、总结

| 工具 | 优势 | 推荐场景 |
|------|------|----------|
| nginxWebUI | 功能全面，支持 TCP 代理、日志、监控 | 需要深度管理 Nginx 的团队 |
| Nginx Proxy Manager | HTTPS 集成最简单，UI 极简 | 快速为 Docker 服务加 HTTPS |

