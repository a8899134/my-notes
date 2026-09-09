## 一、离线导入镜像作用

### 1.1 常见场景
- 服务器处于内网环境，无法访问 Docker Hub 或互联网
- 公司安全策略禁止生产服务器直接拉取外部镜像
- 需要将开发环境的镜像完整迁移到测试/生产环境
- 灾备恢复时需快速部署服务
💡 核心思路：  
在有网机器上拉取并导出镜像 → 通过 U 盘/内网传输 → 在无网机器上导入使用
### 1.2 离线部署的核心命令

| 操作   | 命令                | 说明               |
| ---- | ----------------- | ---------------- |
| 导出镜像 | `docker save`     | 将镜像保存为 `.tar` 文件 |
| 导入镜像 | `docker load`     | 从 `.tar` 文件加载镜像  |
| 压缩传输 | `gzip` / `tar.gz` | 减小文件体积，加快传输      |

## 二、导出镜像

### 2.1 拉取所需镜像

```bash
# 示例：拉取 Nginx 和 MySQL 镜像
docker pull nginx:1.26
docker pull mysql:5.7
```
⚠️ 注意：确保拉取的是最终生产版本，避免后续兼容问题。
### 2.2 导出单个镜像
```bash
docker save nginx:1.26 -o nginx-1.26.tar
```
命令解释：
- `docker save`：导出镜像命令
- `nginx:1.26`：要导出的镜像名(可通过 `docker images` 查看)
- `-o nginx-1.26.tar`：指定输出文件名(`.tar` 格式)

✅ 生成的 `nginx-1.26.tar` 包含镜像所有层和元数据，可直接导入其他机器。
### 2.3 导出多个镜像
1. 一次导出多个镜像到一个文件
```bash
docker save nginx:1.26 mysql:5.7 -o my-app-images.tar
```
优点：
- 只需传输一个文件
- 保持镜像间依赖关系(如 Web + DB)

2. 分别导出(便于管理)
```bash
docker save nginx:1.26 -o nginx-1.26.tar
docker save mysql:5.7 -o mysql-5.7.tar
```
适用场景：
- 镜像较大，需分批传输
- 不同团队负责不同组件
### 2.4 压缩镜像文件
根据镜像大小决定要不要压缩，不影响流程。
```bash
# 压缩单个文件
gzip nginx-1.26.tar

# 压缩多个文件为一个包
tar -czvf my-app-images.tar.gz nginx-1.26.tar mysql-5.7.tar
```
优势：
- 体积减少 50%~70%(尤其对含大量文本的镜像)
- 传输更快，节省带宽

💡 压缩后文件扩展名为 `.tar.gz`，导入时需先解压或管道处理。

## 三、镜像复制
将镜像文件传输到目标机器
### 3.1 传输方式选择

| 方式 | 命令示例 | 适用场景         |
|------|----------|----------|
| SCP(推荐) | `scp *.tar.gz user@192.168.1.100:/opt/images/` | Linux 服务器间传输 |
| U 盘/移动硬盘 | 手动拷贝 | 物理隔离网络       |
| 内网 HTTP 服务 | `wget http://内网服务器/images.tar.gz` | 大规模分发        |
| rsync | `rsync -avz images/ user@host:/backup/` | 增量同步         

✅ 建议创建专用目录存放镜像包，如 `/opt/docker-images/`

## 四、导入镜像

### 4.1 导入未压缩的 `.tar` 文件
```bash
docker load -i nginx-1.26.tar
```
命令解释：
- `docker load`：导入镜像命令
- `-i nginx-1.26.tar`：指定输入文件

✅ 导入后自动恢复镜像名和标签(如 `nginx:1.26`)
### 4.2 导入压缩的 `.tar.gz` 文件
1. 先解压再导入
```bash
# 解压
gunzip my-app-images.tar.gz

# 导入
docker load -i my-app-images.tar
```
2. 管道直接导入(节省磁盘空间)
```bash
gunzip -c my-app-images.tar.gz | docker load
```
命令解释：
- `gunzip -c`：将解压内容输出到标准输出(不生成中间文件)
- `| docker load`：通过管道直接导入

✅ 推荐第二选项，避免占用双倍磁盘空间。
### 4.3 验证导入是否成功
```bash
# 查看所有镜像
docker images

# 检查特定镜像
docker images nginx
```
预期输出：
```text
REPOSITORY   TAG       IMAGE ID       CREATED        SIZE
nginx        1.26      abcdef123456   2 weeks ago    142MB
mysql        5.7       123456abcdef   3 weeks ago    505MB
```
✅ 如果看到镜像列表，说明导入成功！

## 五、完整离线部署流程
### 5.1 部署 Nginx + MySQL 应用
1. 有网服务器上操作
```bash
# 1. 拉取镜像
docker pull nginx:1.26
docker pull mysql:5.7

# 2. 导出并压缩
docker save nginx:1.26 mysql:5.7 -o web-db-images.tar
gzip web-db-images.tar  # 生成 web-db-images.tar.gz

# 3. 传输到目标机
scp web-db-images.tar.gz root@192.168.10.50:/opt/
```
2. 无网服务器上操作
```bash
# 1. 创建目录
mkdir -p /opt/docker-images && cd /opt

# 2. 导入镜像
gunzip -c web-db-images.tar.gz | docker load

# 3. 验证
docker images

# 4. 启动服务
docker run -d --name my-web -p 8080:80 nginx:1.26
docker run -d --name my-db -e MYSQL_ROOT_PASSWORD=123 mysql:5.7
```

✅ 整个过程无需联网，100% 离线完成！

## 六、总结

| 步骤 | 操作 | 命令示例 |
|------|------|----------|
| 1. 导出 | 有网机器保存镜像 | `docker save nginx:1.26 -o nginx.tar` |
| 2. 压缩 | 减小体积(推荐) | `gzip nginx.tar` |
| 3. 传输 | 拷贝到目标机器 | `scp nginx.tar.gz user@host:/opt/` |
| 4. 导入 | 无网机器加载镜像 | `gunzip -c nginx.tar.gz \| docker load` |

🌟 记住：`docker save` + `docker load` 是 Docker 离线迁移的黄金标准！
