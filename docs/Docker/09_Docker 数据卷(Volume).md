## 一、数据卷作用
### 1.1 容器的无状态特性
Docker 容器默认将所有文件写入自己的可写层。但：
- ✅ 容器运行时：数据正常读写
- ❌ 容器删除后：所有数据永久丢失！
📌 举例：  
你运行 MySQL 容器，创建了数据库 → 删除容器 → 数据库消失！
### 1.2 数据存储需求
在生产环境中，我们通常需要解决以下数据存储问题：

| 需求    | 说明                     |
| ----- | ---------------------- |
| 数据持久化 | 容器删除后，数据仍然保留，新容器可以继续使用 |
| 数据共享  | 多个容器之间可以共享同一份数据        |
| 数据备份  | 方便对数据进行备份和恢复           |
| 数据迁移  | 数据可以随容器在不同宿主机之间迁移      |
| 性能要求  | 数据读写性能满足业务需求           |

Docker 的数据卷(Volume)机制正是为了解决这些问题而设计的。
### 1.3 数据卷的定义
数据卷是独立于容器生命周期之外的存储空间。它直接挂载到容器的文件系统中，但数据的存储位置在宿主机上，与容器本身解耦。

通俗理解：
- 容器好比一个移动硬盘盒，里面装着程序。
- 数据卷好比这个硬盘盒里的硬盘。
- 硬盘盒坏了(容器删除)，硬盘(数据)还在，可以装到新的硬盘盒里继续使用。
### 1.4 卷映射的作用
卷映射(Volume Mapping) 就是把容器内的目录/文件“链接”到宿主机(或 Docker 管理的存储)，实现：
- ✅ 数据持久化：容器删了，数据还在
- ✅ 配置热更新：改宿主机配置文件，容器内立即生效
- ✅ 共享数据：多个容器共用同一份数据

💡 核心思想：“容器无状态，数据外置”

## 二、Docker 存储方式
Docker 提供了三种数据存储方式，适用于不同的场景。
### 2.1 三种方式对比
| 存储方式             | 存储位置                                | 生命周期            | 适用场景        |
| ---------------- | ----------------------------------- | --------------- | ----------- |
| 容器层存储            | 容器可写层                               | 随容器删除而消失        | 临时文件、缓存     |
| 绑定挂载(Bind Mount) | 宿主机指定路径                             | 独立于容器，手动管理      | 开发环境、共享配置文件 |
| 数据卷(Volume)      | Docker 管理(/var/lib/docker/volumes/) | 独立于容器，Docker 管理 | 生产环境推荐      |
### 2.2 容器层存储
这是 Docker 的默认存储方式。容器运行时产生的所有修改都存储在容器的可写层。

特点：
- 不需要任何额外配置。
- 数据随容器删除而丢失。
- 多个容器之间无法共享数据。
- 性能相对较低(写时复制机制有额外开销)。

适用场景：
- 临时生成的日志(不需要长期保存)。
- 应用的缓存数据。
- 测试环境中的数据。
### 2.3 绑定挂载(Bind Mount)
绑定挂载将宿主机上的指定目录或文件挂载到容器内部的指定路径。

特点：
- 数据存储在宿主机上的用户指定位置。
- 容器删除后数据仍然保留。
- 宿主机和容器之间可以双向同步数据。
- 需要手动管理文件权限和 SELinux 上下文。

适用场景：
- 开发环境：代码热更新，修改宿主机代码容器内立即生效。
- 配置文件注入：将宿主机上的配置文件挂载到容器内。
- 日志收集：将容器日志输出到宿主机指定目录。

示例：
```bash
# 将宿主机的 /data/website 目录挂载到容器的 /usr/share/nginx/html
docker run -d -v /data/website:/usr/share/nginx/html nginx
```

### 2.4 数据卷(Volume)
数据卷是 Docker 管理的存储空间，数据存储在 /var/lib/docker/volumes/ 目录下。

特点：
- Docker 完全管理数据卷的生命周期。
- 数据独立于容器，删除容器不会删除数据卷。
- 多个容器可以同时挂载同一个数据卷。
- 支持数据卷驱动，可以实现远程存储(如 NFS、云存储)。
- 在 Rocky Linux 8 上默认使用，权限管理由 Docker 自动处理。

适用场景：
- 生产环境的数据库数据。
- 需要持久保存的应用数据。
- 需要多个容器共享的数据。

## 三、数据卷的管理命令
### 3.1 创建数据卷
```bash
# 创建一个名为 mydata 的数据卷
docker volume create mydata

# 创建时指定驱动(默认 local)
docker volume create --driver local mydata

# 创建时添加标签(便于分类管理)
docker volume create --label environment=prod mydata
```
命令解释：
- `volume create`：创建数据卷。
- 数据卷名称只能包含字母、数字、下划线、点和连字符。
- 如果不指定名称，Docker 会生成一个随机名称。
### 3.2 查看数据卷
```bash
# 列出所有数据卷
docker volume ls

# 查看数据卷的详细信息
docker volume inspect mydata
```
命令解释：
- `volume ls`：列出当前所有数据卷，包括名称、驱动类型。
- `volume inspect`：输出数据卷的详细元数据(JSON 格式)，包括：
    - 创建时间(CreatedAt)。
    - 挂载点(Mountpoint)：数据在宿主机上的实际存储路径。
    - 驱动类型(Driver)。
    - 标签(Labels)。
### 3.3 删除数据卷
```bash
# 删除指定的数据卷
docker volume rm mydata

# 强制删除(即使正在被使用)
docker volume rm -f mydata

# 删除所有未使用的数据卷
docker volume prune

# 删除所有数据卷(危险操作)
docker volume rm $(docker volume ls -q)
```
命令解释：
- `volume rm`：删除数据卷。
- 如果数据卷正在被容器使用，默认无法删除，需要先停止并删除容器，或使用 `-f` 强制删除。
- `volume prune`：清理所有未被任何容器引用的数据卷，释放磁盘空间。
### 3.4 使用数据卷运行容器
在 docker run 中使用 -v 或 --mount 参数挂载数据卷。
1. 使用 -v(简洁写法)
```bash
# 挂载已存在的数据卷
docker run -d -v mydata:/app/data nginx

# 如果数据卷不存在，Docker 会自动创建
docker run -d -v newdata:/app/data nginx
```
2. 使用 --mount(更详细的写法)
```bash
docker run -d --mount source=mydata,target=/app/data nginx
```
3. 挂载为只读
```bash
docker run -d -v mydata:/app/data:ro nginx
# 或
docker run -d --mount source=mydata,target=/app/data,readonly nginx
```
命令解释：
- `-v` 格式：`数据卷名:容器内路径[:选项]`
- `--mount` 格式：`source=数据卷名,target=容器内路径[,选项]`
- 选项 `ro` 或 `readonly`：只读模式，容器内无法修改数据。
- 选项 `rw`：读写模式(默认)。

## 四、绑定挂载(Bind Mount)的管理
### 4.1 绑定挂载概念
绑定挂载是将宿主机上的任意目录或文件直接映射到容器内部。与数据卷不同，绑定挂载的数据位置由用户指定，Docker 不参与管理。
### 4.2 绑定挂载的使用
```bash
# 将宿主机的 /data/web 目录挂载到容器的 /usr/share/nginx/html
docker run -d -v /data/web:/usr/share/nginx/html nginx

# 使用 --mount 方式(更清晰)
docker run -d --mount type=bind,source=/data/web,target=/usr/share/nginx/html nginx

# 挂载单个文件
docker run -d -v /etc/hosts:/etc/hosts:ro nginx

# 只读挂载
docker run -d -v /data/web:/usr/share/nginx/html:ro nginx
```
命令解释：
- 绑定挂载的 `-v` 格式与数据卷略有不同：
    - 数据卷：`数据卷名:容器内路径`
    - 绑定挂载：`宿主机绝对路径:容器内路径`
- `type=bind`：明确指定为绑定挂载类型。
- `source`：宿主机上的绝对路径。
- `target`：容器内的目标路径。
### 4.3 安全注意事项
1. SELinux 权限问题

Rocky Linux 8 默认启用 SELinux，绑定挂载时可能遇到权限错误。解决方法是在挂载参数后添加`:z 或 :Z`。

```bash
# 添加 :z 选项，让 Docker 自动设置 SELinux 上下文
docker run -d -v /data/web:/usr/share/nginx/html:z nginx
```
 `:z` 与 `:Z` 的区别：
 
|选项|含义|适用场景|
|---|---|---|
|:z|多个容器共享该目录|多个容器需要同时挂载同一目录|
|:Z|单个容器独占该目录|只有一个容器需要挂载该目录|

2. 权限控制
绑定挂载直接暴露宿主机目录，存在安全隐患。建议：
- 只挂载必要的目录。
- 使用只读模式(:ro)避免容器修改宿主机文件。
- 确保宿主机目录的权限设置合理。

## 五、数据卷的高级用法
### 5.1 多个容器共享同一个数据卷
多个容器可以同时挂载同一个数据卷，实现数据共享。
```bash
# 创建数据卷
docker volume create shared-data

# 容器 A 写入数据
docker run -d --name writer -v shared-data:/data alpine sh -c "echo hello > /data/file.txt"

# 容器 B 读取数据
docker run --rm --name reader -v shared-data:/data alpine cat /data/file.txt
# 输出：hello
```
生产场景：
- Web 容器和 PHP 容器共享代码目录。
- Nginx 容器和前端构建容器共享静态文件目录。
- 日志收集容器和应用容器共享日志目录。
### 5.2 数据卷容器(Volume Container)
数据卷容器是一种专门用于保存数据卷的容器，它本身不运行任何业务，仅作为数据卷的载体。

创建数据卷容器：
```bash
# 创建一个仅声明数据卷的容器(不运行任何进程)
docker create -v /data --name data-container alpine /bin/true
```
其他容器挂载数据卷容器的卷：
```bash
# 容器 A 挂载数据卷容器的卷
docker run -d --volumes-from data-container --name app1 nginx

# 容器 B 也挂载同一个数据卷
docker run -d --volumes-from data-container --name app2 nginx
```
适用场景：
- 需要在多个容器之间共享数据。
- 便于数据卷的集中管理和备份。
### 5.3 使用数据卷驱动实现远程存储
Docker 支持通过数据卷驱动(Volume Driver)将数据存储在远程位置，如 NFS、CIFS、云存储等。

示例：使用 NFS 数据卷驱动
```bash
# 创建使用 NFS 驱动的数据卷
docker volume create --driver local \
  --opt type=nfs \
  --opt o=addr=192.168.1.100,rw \
  --opt device=:/exports/data \
  nfs-data

# 使用该数据卷运行容器
docker run -d -v nfs-data:/app/data nginx
```
常见的数据卷驱动：
- `local`：默认驱动，存储在宿主机本地。
- `nfs`：NFS 网络存储。
- `azure`：Azure 云存储。
- `aws`：AWS EBS 或 S 3 存储。

## 六、数据卷的备份与恢复
### 6.1 备份数据卷
备份数据卷的最常用方法是：启动一个临时容器，将数据卷挂载到该容器，然后将数据打包压缩。
```bash
# 备份 mydata 数据卷到当前目录的 backup.tar.gz
docker run --rm -v mydata:/source -v $(pwd):/backup alpine \
  tar czf /backup/backup.tar.gz -C /source .
```
命令解释：
- `--rm`：容器执行完成后自动删除。
- `-v mydata:/source`：将数据卷挂载到容器的 `/source` 目录。
- `-v $(pwd):/backup`：将当前目录挂载到容器的 `/backup` 目录。
- `tar czf /backup/backup.tar.gz -C /source .`：将 `/source` 目录下的所有文件打包压缩到 `/backup/backup.tar.gz`。
### 6.2 恢复数据卷
恢复数据卷的步骤类似，将备份文件解压到目标数据卷。
```bash
# 先从备份文件恢复数据到当前目录
tar xzf backup.tar.gz -C /tmp/restore

# 方式一：使用临时容器将数据复制到数据卷
docker run --rm -v mydata:/target -v /tmp/restore:/source alpine \
  cp -r /source/. /target/
```
简化的恢复命令：
```bash
# 将备份文件直接解压到数据卷
docker run --rm -v mydata:/target -v $(pwd):/backup alpine \
  tar xzf /backup/backup.tar.gz -C /target
```
### 6.3 定期备份脚本示例
在生产环境中，建议对重要数据卷进行定期备份。以下是一个简单的备份脚本示例：
```bash
#!/bin/bash
# 备份脚本：/usr/local/bin/backup-volumes.sh

BACKUP_DIR="/backup/volumes"
DATE=$(date +%Y%m%d_%H%M%S)
VOLUMES=("mydata" "dbdata" "redisdata")

mkdir -p $BACKUP_DIR

for VOL in "${VOLUMES[@]}"; do
    echo "Backing up volume: $VOL"
    docker run --rm -v ${VOL}:/source -v ${BACKUP_DIR}:/backup alpine \
        tar czf /backup/${VOL}_${DATE}.tar.gz -C /source .
done

# 保留最近 30 天的备份
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```
配置定时任务：
```bash
# 每天凌晨 2 点执行备份
sudo crontab -e
# 添加以下行：
0 2 * * * /usr/local/bin/backup-volumes.sh
```

## 七、实战配置示例
### 7.1 Nginx：配置 + 静态文件(Bind Mount)
```bash
# 准备目录
mkdir -p /opt/nginx/{html,conf}

# 写入简单首页
echo "<h1>Hello Docker!</h1>" > /opt/nginx/html/index.html

# 启动容器
docker run -d \
  --name web \
  -p 8080:80 \
  -v /opt/nginx/html:/usr/share/nginx/html:ro \
  -v /opt/nginx/conf:/etc/nginx/conf.d:ro \
  nginx:1.26
```
✅ 修改 `/opt/nginx/html/index.html`，刷新浏览器立即生效！
### 7.2 MySQL：数据持久化(Named Volume)
```bash
# 启动数据库(自动创建 mysql-data 卷)
docker run -d \
  --name db \
  -v mysql-data:/var/lib/mysql \
  -e MYSQL_ROOT_PASSWORD=secret \
  mysql:5.7

# 验证数据持久化
docker stop db && docker rm db
docker run -d --name db2 -v mysql-data:/var/lib/mysql -e MYSQL_ROOT_PASSWORD=secret mysql:5.7
# → 原有数据库依然存在！
```
### 7.3 混合使用：Web 应用 + 数据库
```yaml
# docker-compose.yml 示例
version: '3'
services:
  web:
    image: nginx
    volumes:
      - ./html:/usr/share/nginx/html:ro   # Bind Mount(当前目录)
    ports:
      - "8080:80"

  db:
    image: mysql:5.7
    volumes:
      - db-data:/var/lib/mysql            # Named Volume
    environment:
      MYSQL_ROOT_PASSWORD: secret

volumes:
  db-data:  # 声明命名卷
```

## 八、生产环境最佳实践
### 8.1 数据卷 vs 绑定挂载的选择
| 场景        | 推荐方式  | 原因                    |
| --------- | ----- | --------------------- |
| 生产环境数据库   | 数据卷   | 性能更好，由 Docker 管理，便于备份 |
| 生产环境应用代码  | 数据卷   | 避免 SELinux 权限问题，便于迁移  |
| 开发环境代码热更新 | 绑定挂载  | 宿主机修改代码容器立即生效         |
| 配置文件注入    | 绑定挂载  | 方便在宿主机上修改配置           |
| 日志持久化     | 数据卷   | 便于统一管理和轮转             |
| 临时文件      | 容器层存储 | 不需要持久保存               |
### 8.2 命名规范
| 数据卷类型 | 命名规范              | 示例               |
| ----- | ----------------- | ---------------- |
| 应用数据  | <环境>-<应用名>-<数据类型> | prod-mysql-data  |
| 日志数据  | <环境>-<应用名>-logs   | prod-nginx-logs  |
| 配置数据  | <环境>-<应用名>-config | prod-app-config  |
| 缓存数据  | <环境>-<应用名>-cache  | prod-redis-cache |
### 8.3 重要提醒
1. 数据卷不会被自动删除
删除容器时，数据卷默认不会被删除。这是为了防止误删重要数据。
```bash
# 删除容器时不会删除数据卷
docker rm container_name

# 只有明确删除数据卷才会清理
docker volume rm volume_name
```
2. 清理未使用的数据卷
定期清理未使用的数据卷，释放磁盘空间。
```bash
# 查看数据卷使用情况
docker system df

# 删除所有未使用的数据卷
docker volume prune

# 强制删除所有未使用的数据卷(不询问确认)
docker volume prune -f
```
3. 数据卷的磁盘位置
数据卷的数据实际存储在宿主机上：
```bash
# 查看数据卷的挂载点
docker volume inspect mydata
# 输出中的 Mountpoint 字段就是宿主机上的实际路径

# 在 Rocky Linux 8 上，默认路径通常是：
# /var/lib/docker/volumes/mydata/_data
```
### 8.4 数据卷安全
|安全措施|说明|
|---|---|
|敏感数据加密|数据库数据、密钥等敏感数据应加密存储|
|权限控制|使用只读挂载防止容器篡改数据|
|定期备份|建立自动化备份机制|
|监控告警|监控数据卷的使用率，磁盘满时告警|
|访问控制|限制哪些容器可以挂载敏感数据卷|

## 九、总结
| 场景      | 推荐方式           | 命令示例                               |
| ------- | -------------- | ---------------------------------- |
| 配置文件    | Bind Mount(只读) | `-v /host/conf:/container/conf:ro` |
| 代码/静态资源 | Bind Mount(读写) | `-v $(pwd)/app:/app`               |
| 数据库数据   | Named Volume   | `-v db-data:/var/lib/mysql`        |
| 临时缓存    | tmpfs(慎用)      | `--tmpfs /tmp`                     |

🌟 记住三句话：
1. 数据要持久 → 一定要用卷！
2. 配置要灵活 → 用 Bind Mount！
3. 删容器前 → 先确认卷是否要保留！

