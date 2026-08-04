## 一、Nginx与后端应用
### 1.1 典型的 Web 架构
在现代 Web 应用中，Nginx 和后端应用各司其职：

| 组件    | 职责                             | 特点                                 |
| ----- | ------------------------------ | ---------------------------------- |
| Nginx | 接收用户请求、反向代理、负载均衡、静态资源服务、SSL 终结 | 高性能、高并发、轻量级                        |
| 后端应用  | 执行业务逻辑、处理数据、生成动态内容             | 由具体语言(Java/node.js/PHP/Python 等)实现 |

完整请求链路：
```
用户浏览器 → Nginx(80/443 端口)→ 后端应用(如 8080 端口)→ 数据库/缓存 → 返回响应
```

### 1.2 Nginx 的作用
| 原因     | 说明                         |
| ------ | -------------------------- |
| 安全     | 隐藏后端应用的真实端口和 IP，减少攻击面      |
| 负载均衡   | 将请求分发到多个后端实例，提升吞吐量         |
| SSL 终结 | Nginx 处理 HTTPS 加密解密，后端专注业务 |
| 静态资源   | Nginx 直接返回图片/CSS/JS，释放后端资源 |
| 统一入口   | 多个后端服务通过同一个 Nginx 对外提供服务   |
### 1.3 后端部署的核心三要素
无论哪种语言，部署到生产环境都需要解决三个核心问题：

|要素|说明|
|---|---|
|① 应用怎么启动|用什么命令启动应用(java -jar、node app.js 等)|
|② 应用监听什么端口|后端服务运行在哪个端口，Nginx 的 proxy_pass 就指向哪里|
|③ 进程怎么保活|应用崩溃后能自动重启(systemd、pm2、supervisor 等)|
### 1.4 通用架构图
```
用户浏览器
    │
    ▼
[ Nginx (监听 80/443) ]
    │
    ├── 静态文件(HTML/CSS/JS/图片) → 直接返回
    │
    ├── /api/* → 转发给 Node.js (127.0.0.1:3000)
    ├── /java/* → 转发给 Spring Boot (127.0.0.1:8080)
    ├── /python/*   → 转发给 Gunicorn (127.0.0.1:8080)
    └── *.php   → 转发给 PHP-FPM (127.0.0.1:9000)
```
✅ 所有后端服务都只监听本地回环地址(127.0.0.1)，不对外暴露！
### 1.5 部署前置条件
无论部署哪种语言，都需要满足以下前置条件：

| 条件          | 说明                |
| :---------- | :---------------- |
| Nginx 已安装   | `nginx -v` 确认     |
| 域名已解析       | 生产环境需要域名指向服务器 IP  |
| 防火墙已放行      | 80/443 端口已开放      |
| SELinux 已配置 | 如启用，需配置相应的布尔值或上下文 |

## 二、Java 应用部署
### 2.1 Java 应用的特点
Java 应用(特别是 Spring Boot)通常打包成 JAR 包(可执行文件)或 WAR 包(部署到 Tomcat)。Spring Boot 内置了 Tomcat 容器，可以直接通过 java -jar 运行。

**架构图**：
```
① 系统级：安装 JDK(操作系统层面)
    │   └── 运行 Java 程序的基础环境(java -jar 依赖它)
    │
    ▼
② 项目级：创建应用目录和应用专用用户
    │   ├── /opt/java-app/(项目代码存放位置)
    │   └── appuser(低权限用户，禁止登录，只用来运行应用)
    │
    ▼
③ 项目代码：将 JAR 包上传到服务器
    │   └── Spring Boot 项目通过 Maven/Gradle 打包成可执行 JAR
    │       注意：JAR 包中已包含内嵌 Tomcat，无需额外安装 Web 服务器
    │
    ▼
④ 应用启动：通过 java -jar 启动项目
    │   └── java -jar myapp.jar --spring.profiles.active=production
    │       说明：Spring Boot 自带内嵌 Tomcat，所以不需要 Gunicorn 这类中间层
    │
    ▼
⑤ 进程管理：systemd 管理 Java 应用
    │   └── 创建 /etc/systemd/system/java-app.service
    │       功能：开机自启 + 崩溃自动重启 + 日志统一管理
    │
    ▼
⑥ 反向代理：Nginx 转发请求到 Java 应用
    │   └── proxy_pass http://127.0.0.1:8080;
    │       说明：Java 应用默认监听 8080 端口，由 Nginx 转发外部请求
    │
    ▼
⑦ 用户访问：通过域名访问网站
        └── https://yourdomain.com → Nginx → Java 应用 → 返回响应
```
### 2.2 部署步骤
1. 安装 JDK,选择合适自己的版本
```
# RockyLinux / CentOS
sudo yum install -y java-1.8.0-openjdk-devel #Spring Boot 2.x(老项目)
sudo yum install -y java-11-openjdk-devel  #Spring Boot 2.x(主流)
sudo yum install -y java-17-openjdk-devel  #Spring Boot 3.x(新项目)


# Ubuntu / Debian
sudo apt update
sudo apt install -y openjdk-8-jdk
sudo apt install -y openjdk-11-jdk
sudo apt install -y openjdk-17-jdk

# 验证安装
java -version
```
生产环境部署 Java 应用时，有时会涉及 JAR 包重新打包或调试，安装 -devel 更保险，避免运行时出现“找不到 javac”等意外情况。

2. 项目目录与应用用户
```
# 创建应用专用用户(不能登录，低权限)
sudo useradd -r -s /bin/false appuser

# 创建项目目录
sudo mkdir -p /opt/java-app
sudo chown -R appuser:appuser /opt/java-app

# 创建日志目录
sudo mkdir -p /var/log/java-app
sudo chown -R appuser:appuser /var/log/java-app
```
应用不以 root 运行是生产环境的基本安全要求。

3. 在开发环境打包项目(开发机执行，不是服务器)

Java(Spring Boot)项目通过 Maven 或 Gradle 打包成可执行的 JAR 文件：

安装 Maven
```
# 安装 Maven
sudo dnf install -y maven

# 验证安装
mvn -version
```
安装 Gradle
```
# 安装 SDKMAN(Gradle 推荐安装方式)
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"

# 安装 Gradle
sdk install gradle

# 验证安装
gradle -v
```

Java(Spring Boot)项目通过 Maven 或 Gradle 打包成可执行的 JAR 文件：
```
# 进入项目根目录(有 pom.xml 的地方)
cd /path/to/your-project

# 清理并打包
mvn clean package -DskipTests

# 清理并打包
gradle clean build -x test
```
打包后生成的 JAR 文件位置,Maven 打包后 JAR 文件位置 target/项目名-版本号.jar。Gradle 打包后文件位置 build/libs/项目名-版本号.jar。

**注意**：生产服务器上通常不需要安装 Maven/Gradle，只需要安装 JDK 来运行 JAR 包。如果服务器上安装了 Maven/Gradle，会增加不必要的依赖和安全风险。

4. 上传 JAR 包到服务器
```
# 在开发机上执行(替换为你的服务器 IP 和路径)
scp target/myapp-1.0.0.jar appuser@服务器IP:/opt/java-app/
```

5. 通过 `java -jar` 启动项目
测试启动(前台运行)
```
# 切换到应用目录
cd /opt/java-app

# 前台启动测试(验证 JAR 包是否正常)
sudo -u appuser java -jar /opt/java-app/myapp-1.0.0.jar
```
看到类似输出说明启动成功：
```
.   ____          _            __ _ _
 /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
 \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
  '  |____| .__|_| |_|_| |_\__, | / / / /
 =========|_|==============|___/=/_/_/_/
 :: Spring Boot ::               (v3.0.0)

2026-07-15 10:00:00.000  INFO 12345 --- [main] com.example.Application  : Started Application in 4.567 seconds
```

为什么：这一步验证 JAR 包是否完整、JDK 版本是否兼容、应用能否正常启动。确认无误后再配置 systemd 管理。

6. 生产环境启动方式(带 JVM 参数)
```
# 指定 JVM 内存参数
java -Xms256m -Xmx512m -jar /opt/java-app/myapp-1.0.0.jar

# 指定 Spring Profile(环境)
java -jar myapp.jar --spring.profiles.active=production

# 指定端口(默认 8080)
java -jar myapp.jar --server.port=8080

# 组合使用
java -Xms256m -Xmx512m -jar /opt/java-app/myapp-1.0.0.jar --spring.profiles.active=production
```

**参数说明**：

| 参数                         | 含义          | 推荐值                           |
| -------------------------- | ----------- | ----------------------------- |
| `-Xms`                     | JVM 初始堆内存   | 256m ~ 512m                   |
| `-Xmx`                     | JVM 最大堆内存   | 512m ~ 2048m(根据服务器内存调整)       |
| `--spring.profiles.active` | Spring 环境配置 | `dev` / `test` / `production` |
| `--server.port`            | 应用监听端口      | 默认 8080                       |
7. systemd 管理 Java 应用
创建 systemd 服务文件
```
sudo tee /etc/systemd/system/java-app.service > /dev/null << 'EOF'
[Unit]
Description=Java Spring Boot Application
After=network.target

[Service]
Type=simple
User=appuser
Group=appuser
WorkingDirectory=/opt/java-app
ExecStart=/usr/bin/java -Xms256m -Xmx512m -jar /opt/java-app/myapp-1.0.0.jar
Restart=always
RestartSec=5
StandardOutput=append:/var/log/java-app/out.log
StandardError=append:/var/log/java-app/err.log

[Install]
WantedBy=multi-user.target
EOF
```
8. 启动并启用服务
```
# 重新加载 systemd 配置
sudo systemctl daemon-reload

# 立即启动服务
sudo systemctl start java-app

# 设置开机自启
sudo systemctl enable java-app

# 查看服务状态
sudo systemctl status java-app
```
### 2.3 Nginx 配置反向代理
创建 /etc/nginx/conf.d/java-app.conf：
```
upstream java_backend {
    server 127.0.0.1:8080;   # Java 应用的地址和端口
    # 多实例时添加更多 server
    # server 127.0.0.1:8081;
    keepalive 32;
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://java_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
```
重载 Nginx：
```
sudo nginx -t && sudo systemctl reload nginx
```
### 2.4 测试验证
创建一个简单的 Spring Boot 测试接口：
```
// 在 src/main/java/com/example/demo/controller/HelloController.java
package com.example.demo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {

    @GetMapping("/")
    public String hello() {
        return "Hello from Java Spring Boot!";
    }

    @GetMapping("/api/users")
    public String users() {
        return "{\"users\": [\"alice\", \"bob\"]}";
    }
}
```
打包并上传 JAR 包
```
# 在开发机打包
mvn clean package -DskipTests

# 上传到服务器
scp target/demo-0.0.1-SNAPSHOT.jar appuser@服务器IP:/opt/java-app/
```
启动并验证
```
# 启动应用
sudo systemctl start java-app

# 本地验证(直接访问 Java 应用)
curl http://127.0.0.1:8080/
# 预期：Hello from Java Spring Boot!

curl http://127.0.0.1:8080/api/users
# 预期：{"users": ["alice", "bob"]}

# 通过 Nginx 验证
curl http://localhost/
# 预期：Hello from Java Spring Boot!

# 公网验证
curl http://yourdomain.com/
# 预期：Hello from Java Spring Boot!
```
查看服务状态和日志
```
# 查看服务状态
sudo systemctl status java-app

# 查看实时日志
sudo journalctl -u java-app -f

# 查看应用输出日志
sudo tail -f /var/log/java-app/out.log
```
## 三、PHP 应用部署
### 3.1 PHP 应用的特点
PHP 与 Java/Node.js 不同，它本身不是一个常驻进程，而是通过 PHP-FPM(FastCGI 进程管理器)来处理请求。Nginx 通过 fastcgi_pass 将 PHP 请求转发给 PHP-FPM。

**架构图**：
```
① 系统级：安装 PHP + PHP-FPM
    │   └── 运行 PHP 程序的基础环境
    │
    ▼
② 项目级：创建应用目录和应用专用用户
    │   ├── /var/www/php-app/(项目代码存放位置)
    │   └── appuser(低权限用户，禁止登录，只用来运行应用)
    │
    ▼
③ 项目代码：将 PHP 源码上传到服务器
    │   └── 解释型语言，无需编译打包，直接上传 .php 文件
    │       注意：PHP-FPM 负责执行 PHP 脚本，Nginx 通过 FastCGI 协议转发请求
    │
    ▼
④ 应用启动：PHP-FPM 作为常驻进程运行
    │   └── systemctl start php-fpm
    │       说明：PHP-FPM 是 FastCGI 进程管理器，多进程处理并发请求
    │
    ▼
⑤ 进程管理：systemd 管理 PHP-FPM
    │   └── 已自动创建 /usr/lib/systemd/system/php-fpm.service
    │       功能：开机自启 + 崩溃自动重启 + 日志统一管理
    │
    ▼
⑥ 反向代理：Nginx 通过 FastCGI 转发请求到 PHP-FPM
    │   └── fastcgi_pass unix:/run/php/php-fpm.sock;
    │       说明：Nginx 不直接执行 PHP，而是转发给 PHP-FPM 执行
    │
    ▼
⑦ 用户访问：通过域名访问网站
        └── https://yourdomain.com → Nginx → PHP-FPM → 执行 PHP → 返回响应
```
### 3.2 部署步骤
1. 安装 PHP 和 PHP-FPM
使用 Remi 仓库,这是最稳妥的做法，能确保安装最新版本的 PHP。

第 1 步：安装 EPEL 和 Remi 仓库
EPEL 是 Remi 仓库的依赖，需要先装上。
```
# 安装 EPEL 仓库
sudo yum install -y epel-release

# 安装 Remi 仓库(以 Rocky Linux 8 为例)
sudo yum install -y https://rpms.remirepo.net/enterprise/remi-release-8.rpm
```
**注意：** 如果你用的是 Rocky Linux 9，需要将上面 URL 中的 `8` 改为 `9`。

第 2 步：启用所需的 PHP 版本模块
Remi 仓库将不同版本的 PHP 做成了模块。安装前需要先启用对应的模块。
```
# 例如，要安装 PHP 8.2，先重置并启用该模块
sudo dnf module reset php
sudo dnf module enable php:remi-8.2
```

第 3 步：安装 PHP 及所需扩展
```
sudo yum install -y php php-fpm php-mysqlnd php-gd php-xml php-mbstring php-curl php-zip
```
- php：核心 PHP 包(解释器)。
- php-fpm：FastCGI 进程管理器—用于处理 Web 请求(Nginx/Apache 常用)的服务。
- php-mysqlnd：MySQL 原生驱动—用于连接 MySQL/MariaDB 数据库。
- php-gd：图形绘制库—用于处理图像(调整大小、缩略图、验证码)。
- php-xml：XML 解析器—用于处理 XML/HTML 数据(RSS 订阅、站点地图、WordPress REST API)。
- php-mbstring：多字节字符串—用于处理非英文字符(中文、日文、韩文，以及 UTF-8 编码)。
- php-curl：请求外部接口(支付、登录)。
- php-zip：在线安装更新(解压插件/主题)。
这样就能安装上你指定的、较新的 PHP 版本了。

2. 创建应用目录和应用专用用户
```
# 创建应用专用用户(不能登录，低权限)
sudo useradd -r -s /bin/false appuser
# 将 appuser 加入 nginx 组：
sudo usermod -a -G nginx appuser

# 创建项目目录(PHP 项目通常放在 /var/www/)
sudo mkdir -p /var/www/php-app
sudo chown -R appuser:appuser /var/www/php-app
sudo chmod 755 /var/www/php-app

# 创建日志目录
sudo mkdir -p /var/log/php
sudo chown -R appuser:appuser /var/log/php
```
- PHP 项目放在 `/var/www/` 是 LAMP/LNMP 架构的标准位置，`appuser` 低权限用户运行 PHP-FPM，即使被攻破也无法影响系统

3. 项目代码：将 PHP 代码上传到服务器
```
# 方式一：使用 scp 上传
scp index.php appuser@服务器IP:/var/www/php-app/

# 方式二：使用 rsync 同步整个项目
rsync -avz --exclude='vendor' /local/php-project/ appuser@服务器IP:/var/www/php-app/

# 方式三：使用 Git 拉取(推荐)
cd /var/www/php-app
sudo -u appuser git clone https://github.com/your-repo/php-project.git .
```

4. 通过 PHP-FPM 运行项目
```
# RockyLinux / CentOS
sudo systemctl start php-fpm
sudo systemctl enable php-fpm

# Ubuntu / Debian
sudo systemctl start php8.2-fpm
sudo systemctl enable php8.2-fpm

# 查看状态
sudo systemctl status php-fpm
```

5. 配置 PHP-FPM
编辑 PHP-FPM 池配置文件：
```
# RockyLinux / CentOS
sudo vi /etc/php-fpm.d/www.conf

# Ubuntu / Debian
sudo vi /etc/php/8.2/fpm/pool.d/www.conf
```
关键配置项：
```
# 监听方式(二选一)
listen = /run/php/php-fpm.sock   # Unix Socket(推荐)
# listen = 127.0.0.1:9000        # TCP 端口

# 运行用户(与 Nginx 用户一致)
user = appuser
group = appuser

# 进程管理
pm = dynamic
pm.max_children = 50
pm.start_servers = 5
pm.min_spare_servers = 5
pm.max_spare_servers = 35
pm.max_requests = 500            # 单个进程处理 500 个请求后重启

```
6. systemd 管理 PHP-FPM
```
# 管理 PHP-FPM
sudo systemctl start php-fpm       # 启动
sudo systemctl stop php-fpm        # 停止
sudo systemctl restart php-fpm     # 重启
sudo systemctl reload php-fpm      # 重载配置
sudo systemctl status php-fpm      # 查看状态
sudo systemctl enable php-fpm      # 开机自启

# 查看实时日志
sudo journalctl -u php-fpm -f
```
### 3.3 Nginx 配置反向代理
创建 /etc/nginx/conf.d/php-app.conf：
```
server {
    listen 80;
    server_name php.example.com;

    root /var/www/php-app;
    index index.php index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \.php$ {
        # 使用 Unix Socket(推荐)
        fastcgi_pass unix:/run/php/php-fpm.sock;
        # 或使用 TCP(与 PHP-FPM 配置一致)
        # fastcgi_pass 127.0.0.1:9000;

        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # 禁止访问隐藏文件
    location ~ /\.ht {
        deny all;
    }
}
```
重载 Nginx：
```
sudo nginx -t && sudo systemctl reload nginx
```
### 3.4 测试验证
```
# 创建测试文件[reference:11]
echo "<?php phpinfo(); ?>" | sudo tee /var/www/php-app/info.php

# 浏览器访问 http://php.example.com/info.php
# 显示 PHP 信息页即为成功
# ⚠️ 测试后立即删除该文件
sudo rm /var/www/php-app/info.php
```

## 四、Node.js 应用部署
### 4.1 Node.js 应用的特点
Node.js 应用是常驻进程，需要通过进程管理工具(如 PM2)来保持运行。Nginx 通过 proxy_pass 将请求转发给 Node.js 应用。

**架构图**：
```
① 系统级：安装 Node.js + npm
    │   └── 运行 Node.js 程序的基础环境
    │
    ▼
② 项目级：创建应用目录和应用专用用户
    │   ├── /opt/node-app/(项目代码存放位置)
    │   └── appuser(低权限用户，禁止登录，只用来运行应用)
    │
    ▼
③ 项目代码：将 Node.js 源码上传到服务器
    │   └── npm install --production 安装依赖
    │       注意：Node.js 是常驻进程，通过 PM2 管理
    │
    ▼
④ 应用启动：通过 PM2 启动 Node.js
    │   └── pm2 start app.js --name myapp
    │       说明：PM2 是 Node.js 进程管理器，提供自动重启、日志管理、零停机重载
    │
    ▼
⑤ 进程管理：PM2 + systemd 管理 Node.js
    │   └── pm2 startup + pm2 save
    │       功能：开机自启 + 崩溃自动重启 + 日志统一管理
    │
    ▼
⑥ 反向代理：Nginx 转发请求到 Node.js
    │   └── proxy_pass http://127.0.0.1:3000;
    │       说明：Java 用 8080，Node.js 用 3000，原理完全相同
    │
    ▼
⑦ 用户访问：通过域名访问网站
        └── https://yourdomain.com → Nginx → Node.js → 返回响应
```
### 4.2 部署步骤
1. 安装 Node.js 和 npm
```
# 方式一：使用 NodeSource 官方源(推荐)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 方式二：使用 nvm(版本管理)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts

# 验证
node -v
npm -v
```
- Node.js 是常驻进程，和 Java 一样通过 node app.js 启动后持续运行
- 推荐安装 Node.js 20 LTS 或 22 LTS，长期支持，稳定可靠

2. 上传并启动 Node.js 应用
```
# 创建应用专用用户(不能登录，低权限)
sudo useradd -r -s /bin/false appuser

# 创建项目目录
sudo mkdir -p /opt/node-app
sudo chown -R appuser:appuser /opt/node-app

# 创建日志目录
sudo mkdir -p /var/log/node-app
sudo chown -R appuser:appuser /var/log/node-app
```
3. 在开发环境准备项目
```
# 进入项目根目录(有 package.json 的地方)
cd /path/to/your-node-project

# 安装依赖
npm install

# 测试启动
node app.js
```
4. 上传代码到服务器
```
# 方式一：使用 scp 上传
scp -r /local/node-project/* appuser@服务器IP:/opt/node-app/

# 方式二：使用 rsync 同步(推荐，排除 node_modules)
rsync -avz --exclude='node_modules' /local/node-project/ appuser@服务器IP:/opt/node-app/

# 方式三：使用 Git 拉取(推荐)
cd /opt/node-app
sudo -u appuser git clone https://github.com/your-repo/node-project.git .
```
5. 在服务器上安装依赖
```
# 以 appuser 身份安装生产依赖
cd /opt/node-app
sudo -u appuser npm install --production
```
为什么：--production 只安装 dependencies，跳过 devDependencies，减少体积和潜在安全风险。

6. 使用 PM2 管理 Node.js 应用(生产环境)
安装 PM2：
```
# 全局安装 PM2
sudo npm install -g pm2
# 验证安装
pm2 --version
```

启动应用：
```
# 进入项目目录
cd /opt/node-app

# 启动应用(以 appuser 身份)
sudo -u appuser pm2 start app.js --name myapp

# 查看状态
sudo -u appuser pm2 status

# 查看日志
sudo -u appuser pm2 logs myapp

# 设置开机自启
sudo -u appuser pm2 startup
sudo -u appuser pm2 save
```
7. PM2 常用命令

| 命令                            | 说明             |
| ----------------------------- | -------------- |
| pm2 start app.js --name myapp | 启动应用并命名为 myapp |
| pm2 status                    | 查看所有应用状态       |
| pm2 logs myapp                | 查看日志           |
| pm2 restart myapp             | 重启应用           |
| pm2 stop myapp                | 停止应用           |
| pm2 delete myapp              | 删除应用           |
| pm2 startup                   | 生成开机自启脚本       |
| pm2 save                      | 保存当前进程列表       |
| pm 2 reload myapp             | 优雅重启(零停机)      |

PM2 的 startup 命令会自动生成 systemd 服务文件，让 PM2 本身随系统启动，然后 PM2 再启动 Node.js 应用。

PM2 生成的 systemd 服务文件位置：/etc/systemd/system/pm2-appuser.service

8. PM2 管理命令
```
# 查看所有应用
sudo -u appuser pm2 list

# 查看单个应用详情
sudo -u appuser pm2 show myapp

# 监控所有应用(实时面板)
sudo -u appuser pm2 monit

# 查看日志
sudo -u appuser pm2 logs myapp

# 优雅重启(零停机)
sudo -u appuser pm2 reload myapp

# 保存当前进程列表
sudo -u appuser pm2 save

# 开机自启
sudo -u appuser pm2 startup
```
### 4.3 Nginx 配置反向代理
创建 /etc/nginx/conf.d/node-app.conf：
```
upstream node_backend {
    server 127.0.0.1:3000;   # Node.js 应用的端口
    keepalive 32;
}

server {
    listen 80;
    server_name node.example.com;

    location / {
        proxy_pass http://node_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }

    # 静态资源由 Nginx 直接处理(可选)
    location /static/ {
        root /opt/node-app/public;
        expires 30d;
    }
}
```
重载 Nginx：
```
sudo nginx -t && sudo systemctl reload nginx
```
### 4.4 测试验证
1. 创建测试入口文件
```
sudo -u appuser tee /opt/node-app/app.js > /dev/null << 'EOF'
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello from Node.js!\n');
});

server.listen(3000, '127.0.0.1', () => {
    console.log('Server running on http://127.0.0.1:3000');
});
EOF
```
启动并验证
```
# 启动应用
cd /opt/node-app
sudo -u appuser pm2 start app.js --name myapp

# 本地验证
curl http://127.0.0.1:3000/
# 预期：Hello from Node.js!

# 通过 Nginx 验证
curl http://localhost/
# 预期：Hello from Node.js!

# 公网验证
curl http://yourdomain.com/
```

## 五、Python 应用部署
### 5.1 Python 应用的特点
Python Web 应用(如 Django、Flask)需要通过 WSGI 服务器(如 Gunicorn、uWSGI)来运行。Nginx 通过 proxy_pass 将请求转发给 Gunicorn。

**架构图**：
```
① 系统级：安装 python3 + python3-pip(操作系统层面)
    │
    ▼
② 项目级：在 /opt/python-app 下创建虚拟环境(venv)
    │
    ▼
③ 虚拟环境中：安装 flask + gunicorn(通过 pip)
    │   ├── Flask    → Web 框架(提供 HTTP 处理能力)
    │   └── Gunicorn → WSGI 服务器(多进程承载应用)
    │
    ▼
④ 项目代码：将 app.py(你的业务代码)放在 /opt/python-app 目录下
    │   └── 代码中引用了 Flask 框架：from flask import Flask
    │
    ▼
⑤ Gunicorn 加载项目：gunicorn -w 2 -b 127.0.0.1:8080 app:app
    │   └── Gunicorn 通过 Flask 的 app 对象驱动你的业务代码
    │
    ▼
⑥ systemd 管理 Gunicorn：创建 /etc/systemd/system/python-app.service
    │
    ▼
⑦ 系统启动时自动运行：systemctl enable python-app
```
### 5.2 部署步骤
1. 安装 Python 和 pip
```
# RockyLinux / CentOS
sudo yum install -y python3 python3-pip

# 验证
python3 --verison
pip3 --verison
```

 2. 创建应用专用用户
 ```
 sudo useradd -r -s /bin/false appuser
 ```
 为什么：生产环境应用不应该用 root 或普通用户运行。appuser 是一个系统用户，无法登录，只能用来运行应用。即使应用被攻破，攻击者也只能拿到这个低权限用户，无法影响系统。
 
3. 创建项目目录并设置权限
```
sudo mkdir -p /opt/python-app
sudo chown -R appuser:appuser /opt/python-app
```
目录所有权交给 `appuser`，确保应用有权限读写自己的文件

4. 切换到 appuser 并创建虚拟环境
```
# 切换到 appuser
sudo -u appuser bash
cd /opt/python-app
source venv/bin/activate
pip install flask gunicorn

# 安装完成后，如果要退出虚拟环境
deactivate
```
以 `appuser` 身份创建虚拟环境，确保所有文件权限正确。

如果 Flask 和 Gunicorn 不是你的项目依赖，请替换为 pip install -r requirements.txt。

在虚拟环境中安装依赖，不影响系统 Python 环境，不同项目之间依赖隔离，互不冲突。

5. 创建 app.py 文件
```
sudo -u appuser tee /opt/python-app/app.py > /dev/null << 'EOF'
from flask import Flask, request
app = Flask(__name__)

@app.route('/')
def hello():
    return f"Hello from backend! Your IP: {request.remote_addr}"

@app.route('/api/users')
def users():
    return '{"users": ["alice", "bob"]}'

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8080)
EOF
```
⚠️ 生产环境请替换为你的实际项目代码。

6. 创建 Gunicorn 配置文件
```
sudo -u appuser tee /opt/python-app/gunicorn_config.py > /dev/null << 'EOF'
bind = '127.0.0.1:8080'
workers = 4
worker_class = 'sync'
timeout = 30
accesslog = '/var/log/gunicorn/access.log'
errorlog = '/var/log/gunicorn/error.log'
pidfile = '/var/run/gunicorn.pid'
EOF
```
只监听本地，不对外暴露，Worker 数量，公式 = CPU 核心数 × 2 + 1(4 核 CPU 建议 9，这里取 4 作为示例)，Worker 超时时间，防止慢请求阻塞，生产环境必须有日志。

7. 创建日志目录
```
sudo mkdir -p /var/log/gunicorn
sudo chown -R appuser:appuser /var/log/gunicorn
```

8. 创建 systemd 服务文件
```
sudo tee /etc/systemd/system/python-app.service > /dev/null << 'EOF'
[Unit]
Description=Python Flask App with Gunicorn
After=network.target

[Service]
Type=simple
User=appuser
Group=appuser
WorkingDirectory=/opt/python-app
Environment="PATH=/opt/python-app/venv/bin"
ExecStart=/opt/python-app/venv/bin/gunicorn -c /opt/python-app/gunicorn_config.py app:app
Restart=always
RestartSec=5
StandardOutput=append:/var/log/gunicorn/stdout.log
StandardError=append:/var/log/gunicorn/stderr.log

[Install]
WantedBy=multi-user.target
EOF
```
- `Restart=always`：进程崩溃后自动重启，`RestartSec=5`：重启等待 5 秒，避免频繁重启，`Environment="PATH=..."`：指定虚拟环境的 PATH，确保 Gunicorn 能正确找到。

9. 启动 Gunicorn 服务
```
sudo systemctl daemon-reload
sudo systemctl start python-app
sudo systemctl enable python-app
sudo systemctl status python-app
```
### 5.3 Nginx 配置反向代理
```
sudo tee /etc/nginx/conf.d/python-app.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
EOF
```
⚠️ 将 `yourdomain.com` 替换为你的实际域名。生产环境还需要添加 HTTPS/SSL 配置。
  重载 Nginx
```
sudo nginx -t
sudo systemctl reload nginx
```
### 5.4 测试验证
```
curl http://yourdomain.com/
# 或本地测试
curl http://localhost/
```

## 六、Go 应用部署
### 6.1 Go 应用的特点
Go 应用编译后生成单个二进制可执行文件，无需运行时依赖(如 JVM、Node 运行时)。Nginx 通过 proxy_pass 将请求转发给 Go 应用。

**架构图**：
```
① 系统级：安装 Go 语言环境
    │   └── 编译 Go 程序的基础环境
    │
    ▼
② 项目级：创建应用目录和应用专用用户
    │   ├── /opt/go-app/(项目代码存放位置)
    │   └── appuser(低权限用户，禁止登录，只用来运行应用)
    │
    ▼
③ 项目代码：编译 Go 项目生成二进制文件
    │   └── go build -o myapp main.go
    │       注意：编译后生成单一可执行文件，无需任何运行时依赖
    │
    ▼
④ 应用启动：直接运行二进制文件
    │   └── ./myapp
    │       说明：不需要 JVM、不需要 Node 运行时，直接执行
    │
    ▼
⑤ 进程管理：systemd 管理 Go 应用
    │   └── 创建 /etc/systemd/system/go-app.service
    │       功能：开机自启 + 崩溃自动重启 + 日志统一管理
    │
    ▼
⑥ 反向代理：Nginx 转发请求到 Go 应用
    │   └── proxy_pass http://127.0.0.1:8080;
    │       说明：Go 应用和 Java 应用一样，用 proxy_pass 转发
    │
    ▼
⑦ 用户访问：通过域名访问网站
        └── https://yourdomain.com → Nginx → Go 应用 → 返回响应
```
### 6.2 部署步骤
1. 安装 Go 语言环境
```
# 下载 Go(以 1.22.x LTS 版本为例，当前生产环境最主流)
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz

# 解压到 /usr/local
sudo tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz

# 配置环境变量
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# 验证安装
go version
```
Go 是编译型语言，代码编译后生成单一二进制可执行文件，编译后的二进制文件无需任何运行时依赖(不需要像 Java 那样安装 JVM，不需要像 Node.js 那样安装 Node 运行时)，推荐安装 Go 1.22.x LTS，是目前生产环境最主流、最稳定的版本。

2. 创建应用目录和应用专用用户
```
# 创建应用专用用户(不能登录，低权限)
sudo useradd -r -s /bin/false appuser

# 创建项目目录
sudo mkdir -p /opt/go-app
sudo chown -R appuser:appuser /opt/go-app

# 创建日志目录
sudo mkdir -p /var/log/go-app
sudo chown -R appuser:appuser /var/log/go-app
```

3. 在开发环境编译 Go 应用
Go 是编译型语言，代码需要先编译成可执行文件再部署到服务器。
```
# 进入项目根目录(有 go.mod 的地方)
cd /path/to/your-go-project

# 编译(生成二进制文件，根据项目入口文件调整)
go build -o myapp .

# 或指定入口文件
go build -o myapp main.go

# 交叉编译(在开发机编译，部署到 Linux 服务器)
GOOS=linux GOARCH=amd64 go build -o myapp main.go
```
4. 上传二进制文件到服务器
```
# 方式一：使用 scp 上传
scp myapp appuser@服务器IP:/opt/go-app/

# 方式二：使用 rsync 同步
rsync -avz myapp appuser@服务器IP:/opt/go-app/
```
5. 设置执行权限
```
# 给二进制文件添加执行权限
sudo chmod +x /opt/go-app/myapp
sudo chown -R appuser:appuser /opt/go-app/
```
6. 测试启动(前台运行)
```
# 切换到应用目录
cd /opt/go-app

# 前台启动测试(验证二进制文件是否正常)
sudo -u appuser ./myapp
```
看到类似输出说明启动成功：
```
Server started on port 8080
```
按 `Ctrl+C` 停止，继续下一步。

7. 指定端口启动
```
# 如果应用支持命令行参数
./myapp -port=8080

# 或通过环境变量
PORT=8080 ./myapp
```
8. systemd 管理 Go 应用，创建 systemd 服务文件
```
sudo tee /etc/systemd/system/go-app.service > /dev/null << 'EOF'
[Unit]
Description=Go Application
After=network.target

[Service]
Type=simple
User=appuser
Group=appuser
WorkingDirectory=/opt/go-app
ExecStart=/opt/go-app/myapp
Restart=always
RestartSec=5
StandardOutput=append:/var/log/go-app/out.log
StandardError=append:/var/log/go-app/err.log

[Install]
WantedBy=multi-user.target
EOF
```
9. 启动并启用服务
```
# 重新加载 systemd 配置
sudo systemctl daemon-reload

# 立即启动服务
sudo systemctl start go-app

# 设置开机自启
sudo systemctl enable go-app

# 查看服务状态
sudo systemctl status go-app
```
10. 查看日志
```
# 查看 systemd 日志(实时)
sudo journalctl -u go-app -f

# 查看应用输出日志
sudo tail -f /var/log/go-app/out.log

# 查看应用错误日志
sudo tail -f /var/log/go-app/err.log
```
### 6.3 Nginx 配置反向代理
创建 /etc/nginx/conf.d/go-app.conf：
```
upstream go_backend {
    server 127.0.0.1:8080;   # Go 应用的端口
    keepalive 32;
}

server {
    listen 80;
    server_name go.example.com;

    location / {
        proxy_pass http://go_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
```
重载 Nginx
```
sudo nginx -t && sudo systemctl reload nginx
```
### 6.4 测试验证
创建测试入口文件
```
sudo -u appuser tee /opt/go-app/main.go > /dev/null << 'EOF'
package main

import (
    "fmt"
    "net/http"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "Hello from Go!\n")
    })

    http.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, `{"users": ["alice", "bob"]}`)
    })

    http.ListenAndServe(":8080", nil)
}
EOF
```
编译并启动
```
# 编译
cd /opt/go-app
sudo -u appuser go build -o myapp main.go

# 启动服务
sudo systemctl start go-app

# 本地验证
curl http://127.0.0.1:8080/
# 预期：Hello from Go!

# 通过 Nginx 验证
curl http://localhost/
# 预期：Hello from Go!

# 公网验证
curl http://yourdomain.com/
```

## 七、五种语言部署对比总结
| 对比维度 | Java(Spring Boot) | PHP | Node.js | Python(Flask/Django) | Go |
|----------|-------------------|-----|---------|----------------------|-----|
| ① 系统依赖 | JDK | PHP + PHP-FPM | Node.js + npm | Python3 + pip | Go 语言环境 |
| ② 项目目录 | `/opt/java-app/` | `/var/www/php-app/` | `/opt/node-app/` | `/opt/python-app/` | `/opt/go-app/` |
| ③ 环境隔离 | 不需要(JAR 自包含) | 不需要 | 不需要(但有 node_modules) | 需要虚拟环境(venv) | 不需要(单二进制) |
| ④ 代码形式 | JAR 包(编译后) | PHP 源码(解释执行) | 源码 + node_modules | 源码 + 依赖(pip install) | 二进制文件(编译后) |
| ⑤ 应用启动 | `java -jar` | `systemctl start php-fpm` | `pm2 start app.js` | Gunicorn 加载 | `./myapp` |
| ⑥ 进程管理 | systemd | systemd | PM2 + systemd | systemd | systemd |
| ⑦ 运行时依赖 | 需要 JVM | 需要 PHP 解释器 | 需要 Node 运行时 | 需要 Python 解释器 + 虚拟环境 | 无需任何依赖 |
| ⑧ Nginx 转发 | `proxy_pass` | `fastcgi_pass` | `proxy_pass` | `proxy_pass` | `proxy_pass` |
| ⑨ 典型端口 | 8080 | 9000 | 3000 | 8000 | 8080 |
| ⑩ 用户访问 | `https://域名` | `https://域名` | `https://域名` | `https://域名` | `https://域名` |
### 7.1 配置速查
| 语言      | Nginx 转发配置                                                              |
| ------- | ----------------------------------------------------------------------- |
| Java    | `proxy_pass http://127.0.0.1:8080;`                                     |
| PHP     | `fastcgi_pass unix:/run/php/php-fpm.sock;或fastcgi_pass 127.0.0.1:9000;` |
| Node.js | `proxy_pass http://127.0.0.1:3000;`                                     |
| Python  | `proxy_pass http://127.0.0.1:8000;`                                     |
| Go      | `proxy_pass http://127.0.0.1:8080;`                                     |
### 7.2 进程管理方式
| 语言          | 推荐方式                | 配置文件位置                                   |
| ----------- | ------------------- | ---------------------------------------- |
| **Java**    | systemd             | `/etc/systemd/system/myapp.service`      |
| **PHP**     | systemd(PHP-FPM 自带) | `/etc/php-fpm.d/www.conf`                |
| **Node.js** | PM2                 | `pm2 start app.js --name myapp`          |
| **Python**  | systemd             | `/etc/systemd/system/python-app.service` |
| **Go**      | systemd             | `/etc/systemd/system/go-app.service`     |

**总结**：无论哪种后端语言，部署的核心都是 “让应用启动并监听某个端口，然后配置 Nginx 将请求转发到该端口” 。区别仅在于启动方式(java -jar / node / go run / PHP-FPM)和进程管理工具(systemd / PM2 / supervisor)。掌握了这个通用模式，任何后端语言的部署都能快速上手。