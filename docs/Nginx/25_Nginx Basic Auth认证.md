## 一、什么是 `auth_basic`

- `auth_basic` 是 Nginx 内置的 HTTP 基本认证模块
- 当用户访问受保护的页面时，浏览器会弹出一个原生登录框：

```
用户名：________
密码：  ________
[确定] [取消]
```

- 输入正确的用户名和密码后，才能看到内容
- 适用于：测试环境、管理后台、临时分享、API 调试等场景

⚠️ 注意：Basic Auth 不加密密码(Base64 编码可轻易解码)，必须配合 HTTPS 使用！

## 二、工作原理

```
用户 → 访问 /admin
       ↓
Nginx → 返回 401 Unauthorized + WWW-Authenticate: Basic realm="..."
       ↓
浏览器 → 弹出登录框
       ↓
用户输入账号密码 → 浏览器自动在请求头加：
        Authorization: Basic dXNlcjpwYXNz (Base64("user:pass"))
       ↓
Nginx → 用 htpasswd 文件验证 → 成功则返回页面，失败则再次 401
```

## 三、配置步骤

### 3.1 安装 `httpd-tools`(提供 `htpasswd` 命令)

```
# CentOS / RHEL
sudo yum install -y httpd-tools

# Ubuntu / Debian
sudo apt install -y apache2-utils
```

🔑 `htpasswd` 用于生成加密的用户名密码文件

### 3.2 创建密码文件

```
# 创建第一个用户(-c 表示新建文件)
sudo htpasswd -c /etc/nginx/.htpasswd admin

# 添加第二个用户(不要 -c，否则会覆盖)
sudo htpasswd /etc/nginx/.htpasswd devuser
```

💡 文件内容示例(`/etc/nginx/.htpasswd`)：

```
admin: $ apr1 $ xxxxx $ yyyyyyyyyyyyyy
devuser: $ apr1 $ aaaaa $ bbbbbbbbbbbbbb
```

- 密码使用 MD5 或 bcrypt 加密(不是明文！)
- 文件权限建议设为 `600`(仅 root 可读写)：

```
chmod 600 /etc/nginx/.htpasswd
chown root:root /etc/nginx/.htpasswd
```

### 3.3 在 Nginx 配置中启用认证

#### 3.3.1 保护整个站点

```
server {
    listen 80;
    server_name secret.example.com;

    # 启用 Basic Auth
    auth_basic "Restricted Area";          # 弹窗提示文字
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        root /var/www/secret;
        index index.html;
    }
}
```

#### 3.3.2 只保护特定路径

```
location /admin/ {
    auth_basic "Admin Login";
    auth_basic_user_file /etc/nginx/.htpasswd;
    alias /var/www/admin/;
}
```

#### 3.3.3 保护 API 接口

```
location /api/internal/ {
    auth_basic "Internal API";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://backend;
}
```

✅ 支持嵌套：可在 `server`、`location`、甚至 `limit_except` 中使用

### 3.4 重载 Nginx 配置

```
# 检查语法
sudo nginx -t

# 重载配置(不中断服务)
sudo nginx -s reload
```

✅ 现在访问受保护页面，就会弹出登录框！

## 四、高级用法

### 4.1 允许特定 IP 绕过认证

```
location /admin/ {
    # 允许内网 IP 直接访问
    satisfy any;

    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;

    auth_basic "Admin Only";
    auth_basic_user_file /etc/nginx/.htpasswd;
}
```

- `satisfy any;` 表示：满足任一条件即可(IP 白名单 或 密码正确)

### 4.2 使用变量动态设置 realm

```
auth_basic "Restricted:  $ server_name";
```

### 4.3 与 HTTPS 结合

```
server {
    listen 443 ssl;
    server_name secret.example.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    auth_basic "Secure Area";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        root /var/www/secure;
    }
}
```

🔒 没有 HTTPS 的 Basic Auth = 明文传密码！

## 五、安全建议

| 风险 | 建议 |
|------|------|
| 密码被嗅探 | 必须配合 HTTPS |
| 密码复用 | 不要使用与其他系统相同的密码 |
| 暴力破解 | 用 `fail2ban`，限制失败次数 |
| 文件权限泄露 | `.htpasswd` 权限设为 `600`，不要放在 Web 目录下 |
| 缓存问题 | 浏览器会缓存凭证，退出需关闭标签页或清除缓存 |

## 六、常见问题排查

### 6.1 输入正确密码仍提示“401 Unauthorized”

- 检查 `.htpasswd` 文件路径是否正确
- 检查 Nginx 是否有读取权限(`ls -l /etc/nginx/.htpasswd`)
- 检查 SELinux 是否阻止(临时禁用测试：`setenforce 0`)

### 6.2 如何“退出” Basic Auth？

- 浏览器不会提供“退出”按钮
- 方法 1：关闭浏览器标签页
- 方法 2：用隐身模式访问
- 方法 3：用 JavaScript 清除(不通用)：

```
// 有些浏览器支持
document.execCommand('ClearAuthenticationCache');
```

### 6.3 能否自定义登录页面？

- 不能！ Basic Auth 是浏览器原生行为，无法改样式
- 如需自定义登录页，请改用 应用层认证(如 Laravel Auth、Spring Security)

## 七、替代方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| `auth_basic` | 配置简单，Nginx 原生支持 | 无自定义 UI，必须 HTTPS | 临时保护、内部工具 |
| 应用层登录 | 可定制 UI、支持多因素 | 需开发工作 | 正式产品 |
| OAuth / SSO | 安全、统一身份 | 复杂 | 企业级系统 |

## 八、总结

Basic Auth 三要素
1. 生成密码文件：`htpasswd -c /etc/nginx/.htpasswd user`
2. 配置 Nginx：
```
auth_basic "提示文字";
auth_basic_user_file /etc/nginx/.htpasswd;
```

3. 强制 HTTPS：避免密码泄露！

🌐 它不是万能的，但对“快速加锁”来说，它是最简单的钥匙！

📌 附：速查命令

| 操作 | 命令 |
|------|------|
| 安装工具 | `yum install -y httpd-tools` |
| 创建用户 | `htpasswd -c /etc/nginx/.htpasswd admin` |
| 添加用户 | `htpasswd /etc/nginx/.htpasswd newuser` |
| 重载配置 | `nginx -s reload` |
| 测试认证 | `curl -u admin:password http://yoursite/admin` |