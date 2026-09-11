## 一、资源限制作用
### 1.1 没有资源限制的后果
在生产环境中，如果不给容器设置资源限制，一个容器可能耗尽宿主机所有资源，导致整台服务器上的其他服务全部瘫痪。

举例说明：
假设你在一台 4 核 8 GB 内存的服务器上运行了三个容器：A(Web 服务)、B(数据库)、C(缓存)。如果不对容器 A 做任何限制，当它因为某个异常(如内存泄露、遭受攻击)突然消耗 7 GB 内存时，宿主机只剩下 1 GB 内存给 B 和 C 使用。

结果就是：

- 数据库容器 B 因为内存不足被 OOM Killer 杀死。
- 缓存容器 C 频繁触发 GC，响应变慢。
- 最终整个服务集群雪崩。

没有资源限制的容器，就像不限速的汽车—一旦失控，会撞毁整条路上的所有车辆。
### 1.2 资源限制的两个核心目的
|目的|说明|
|---|---|
|保障公平|确保每个容器都能获得应有的资源份额，不被其他容器挤占|
|防止雪崩|单个容器出现异常时，不会拖垮整台宿主机上的其他服务|
### 1.3 资源限制的底层原理
Docker 的资源限制依赖于 Linux 内核的 Cgroup(控制组) 机制。
- Cgroup 可以对一组进程进行资源配额和优先级控制。
- Docker 在创建容器时，会为每个容器创建一个独立的 Cgroup 子系统。
- 你设置的 `--cpus`、`--memory` 等参数，最终都会写入容器的 Cgroup 配置文件中。

通俗理解：Cgroup 就是 Linux 内核给进程设置的“预算审批员”—每个进程能花多少 CPU 时间、能用多少内存，都由这个审批员说了算。

## 二、CPU 资源限制
### 2.1 CPU 限制的核心参数
Docker 提供了多个 CPU 限制参数，用于控制容器对 CPU 资源的使用。

|参数|作用|适用场景|
|---|---|---|
|--cpus|限制容器最多使用的 CPU 核心数|通用场景，精确控制 CPU 上限|
|--cpuset-cpus|指定容器只能在哪些 CPU 核心上运行|需要绑定核心的场景(如高性能计算)|
|--cpu-shares|设置 CPU 优先级权重|多容器争抢 CPU 时，保障重要服务的份额|
|--cpu-period / --cpu-quota|更精细的 CPU 时间片控制|需要精确控制 CPU 使用比例的极少数场景|
### 2.2 --cpus：限制使用的 CPU 核心数
`--cpus` 是最常用的 CPU 限制参数，它指定容器最多可以使用多少个 CPU 核心。
```bash
# 限制容器最多使用 1.5 个 CPU 核心
docker run -d --cpus=1.5 --name web nginx

# 限制容器最多使用 2 个 CPU 核心(生产环境常见)
docker run -d --cpus=2 --name app myapp:1.0
```
命令解释：
- `--cpus` 接受整数或小数(如 `0.5`、`1`、`2.5`)。
- 数值表示容器在所有 CPU 核心上可用的总时间片。
- 例如 `--cpus=1.5` 表示容器可以使用 1.5 个 CPU 核心的计算能力。

生产环境建议：
- 为每个服务设置合理的 CPU 上限，避免单个容器耗尽宿主机 CPU。
- 一般 Web 应用设为 `0.5` ~ `1`，数据库设为 `1` ~ `2`，计算密集型任务按需设置。
### 2.3 --cpuset-cpus：绑定 CPU 核心
`--cpuset-cpus` 将容器绑定到指定的物理 CPU 核心上运行。这对需要稳定缓存命中率或减少上下文切换的应用非常有用。
```bash
# 限制容器只能在 CPU 0 和 CPU 1 上运行
docker run -d --cpuset-cpus="0,1" --name web nginx

# 限制容器只能在 CPU 0 到 CPU 3 之间运行
docker run -d --cpuset-cpus="0-3" --name app myapp:1.0

# 限制容器只能在 CPU 1、CPU 3、CPU 5 上运行
docker run -d --cpuset-cpus="1,3,5" --name cache redis
```
命令解释：
- CPU 编号从 0 开始，与 lscpu 或 /proc/cpuinfo 中的编号对应。
- 可以用逗号分隔(如 0,2,4)，也可以用短横线表示范围(如 0-3)。
- 绑核后，容器进程只会在指定的核心上运行。

适用场景：
- 高性能计算任务(如 AI 推理、音视频转码)。
- 需要稳定性能的服务(如数据库、缓存)。
- **注意**：绑核可能造成资源碎片，非必要不建议使用。
### 2.4 --cpu-shares：设置 CPU 优先级
`--cpu-shares` 设置在 CPU 资源争抢时，容器获得的相对权重。默认所有容器的 CPU 权重都是 `1024`。
```bash
# 容器的 CPU 权重为 1024(默认)
docker run -d --cpu-shares=1024 --name app-normal myapp:1.0

# 容器的 CPU 权重为 2048(比其他容器高，重要性更高)
docker run -d --cpu-shares=2048 --name app-critical myapp:1.0

# 容器的 CPU 权重为 512(比默认低，重要性低)
docker run -d --cpu-shares=512 --name app-low myapp:1.0
```
命令解释：
- `--cpu-shares` 只在 CPU 资源紧张时才生效。如果 CPU 空闲，容器可以用满所有核心。
- 当多个容器争抢 CPU 时，系统按权重比例分配 CPU 时间。
- 例如：权重 2048 的容器获得的 CPU 时间是权重 1024 的容器的两倍。

生产环境建议：
- 核心服务(如数据库、网关)设为较高权重(如 `2048`)。
- 非核心服务(如日志收集、监控探针)设为较低权重(如 `512`)。
- 普通服务保持默认 `1024` 即可。
### 2.5 查看容器的 CPU 限制
```bash
# 查看容器的详细资源限制
docker inspect web --format='{.HostConfig.CpuShares}'
docker inspect web --format='{.HostConfig.CpuPeriod}'

# 实时查看容器 CPU 使用情况
docker stats web
```

## 三、内存资源限制

### 3.1 内存限制的核心参数
内存限制比 CPU 限制更严格—容器一旦超过内存上限，会被内核直接杀死(OOM Killer)。

|参数|作用|适用场景|
|---|---|---|
|--memory / -m|设置容器的内存使用上限|所有场景，必设参数|
|--memory-swap|设置内存 + Swap 的总上限|需要禁用 Swap 或控制总内存的场景|
|--memory-reservation|内存软限制|保障容器在资源紧张时的基本内存|
|--oom-kill-disable|禁用 OOM Killer|极少数特殊场景(不推荐)|
### 3.2 --memory / -m：内存硬限制
`--memory` 设置容器的内存使用上限。容器一旦超过这个上限，会被 OOM Killer 直接终止。
```bash
# 限制容器最多使用 512MB 内存
docker run -d --memory=512m --name web nginx

# 限制容器最多使用 1GB 内存
docker run -d --memory=1g --name db mysql

# 限制容器最多使用 256MB 内存
docker run -d --memory=256M --name cache redis
```
命令解释：
- 单位支持 `b`(字节)、`k`(千字节)、`m`(兆字节)、`g`(千兆字节)。
- 大小写不敏感，`512m` 和 `512M` 等价。
- 内存上限是硬性限制，一旦超限，容器会立即被杀死。

生产环境建议：
- 每个容器都必须设置内存上限，这是生产环境最基本的安全措施。
- Web 应用一般 256MB ~ 512MB。
- 数据库类服务一般 1GB ~ 4GB(视数据量而定)。
- 内存上限应留有 20%-30% 的余量，避免 OOM。
### 3.3 --memory-swap：控制 Swap 使用
--memory-swap 设置容器内存 + Swap 的总上限。
```bash
# 禁用 Swap(内存和 Swap 总上限等于内存上限)
docker run -d --memory=512m --memory-swap=512m nginx

# 允许容器使用 1GB 内存 + 1GB Swap(总上限 2GB)
docker run -d --memory=1g --memory-swap=2g myapp:1.0

# 不限制 Swap(默认，内存上限 512MB，Swap 不限制)
docker run -d --memory=512m nginx
```
命令解释：
- `--memory-swap` 的值必须大于或等于 `--memory` 的值。
- 当 `--memory-swap` 与 `--memory` 相等时，禁用 Swap。
- 不设置 `--memory-swap` 时，Swap 无限制(但总内存使用仍受 `--memory` 限制)。

生产环境建议：
- 大多数生产环境建议**禁用 Swap**(`--memory-swap` 等于 `--memory`)。
- 禁用 Swap 可以避免容器因使用 Swap 导致性能下降。
- 在系统上，如果宿主机本身禁用了 Swap，该参数无效。
### 3.4 --memory-reservation：内存软限制
`--memory-reservation` 是内存的软限制。当宿主机内存充足时，容器可以使用超过软限制的内存；当宿主机内存紧张时，系统会强制容器回落到软限制以内。
```bash
# 内存硬限制 1GB，软限制 512MB
docker run -d --memory=1g --memory-reservation=512m myapp:1.0
```
命令解释：
- 软限制值必须小于硬限制值。
- 宿主机内存充足时，软限制不生效。
- 宿主机内存紧张时，系统会优先回收超过软限制的内存。

适用场景：
- 运行批处理任务，平时内存占用低，但高峰期可以消耗更多内存。
- 需要保障关键服务内存，但不希望在内存充足时浪费资源。

### 3.5 OOM Killer 和 oom-kill-disable
当容器内存超限时，Linux 内核的 OOM Killer 会杀死容器进程。你可以通过 --oom-kill-disable 禁用这个行为，但生产环境极少使用。
```bash
# 禁用 OOM Killer(不推荐)
docker run -d --memory=512m --oom-kill-disable nginx
```
为什么不推荐：
- 禁用 OOM Killer 后，容器内存超限时不会被杀，但会陷入“卡死”状态。
- 此时容器既无法工作，也无法被正常停止，只能强制重启 Docker。
- **生产环境建议**：不要禁用 OOM Killer，让容器内存超限时自动重启。
### 3.6 查看容器的内存限制
```bash
# 查看容器的内存限制
docker inspect web --format='{.HostConfig.Memory}'

# 实时查看容器内存使用情况
docker stats web
```

## 四、磁盘 I/O 限制
### 4.1 为什么需要限制 I/O
一个容器如果频繁读写磁盘，会抢占 I/O 资源，导致其他容器读写变慢，甚至让宿主机整体响应变慢。

|参数|作用|
|---|---|
|--device-read-bps|限制容器从指定设备读取数据的速率(每秒字节数)|
|--device-write-bps|限制容器向指定设备写入数据的速率(每秒字节数)|
|--device-read-iops|限制容器从指定设备读取的 IOPS(每秒输入/输出操作数)|
|--device-write-iops|限制容器向指定设备写入的 IOPS|
### 4.2 限制读写速率(BPS)
```bash
# 限制容器从 /dev/sda 读取数据的速度不超过 10MB/s
docker run -d --device-read-bps=/dev/sda:10mb --name app myapp:1.0

# 限制容器向 /dev/sda 写入数据的速度不超过 5MB/s
docker run -d --device-write-bps=/dev/sda:5mb --name app myapp:1.0

# 同时限制读写速率
docker run -d \
  --device-read-bps=/dev/sda:10mb \
  --device-write-bps=/dev/sda:5mb \
  --name app myapp:1.0
```
命令解释：
- 必须指定具体的块设备(如 `/dev/sda`、`/dev/vda`)。
- 速率单位支持 `kb`、`mb`、`gb`。
- 限制的是**物理设备**的读写速率，而非文件系统。
### 4.3 限制 IOPS
IOPS 限制比 BPS 限制更精细，控制的是每秒的读写操作次数。
```bash
# 限制读取 IOPS 不超过 100
docker run -d --device-read-iops=/dev/sda:100 --name app myapp:1.0

# 限制写入 IOPS 不超过 50
docker run -d --device-write-iops=/dev/sda:50 --name app myapp:1.0
```
命令解释：
- IOPS 是衡量磁盘性能的关键指标，尤其对数据库应用非常重要。
- 云服务器(如阿里云、腾讯云)的磁盘通常有 IOPS 上限，设置合理的 IOPS 限制可以避免被云平台限流。
### 4.4 查看设备的 I/O 限制
```bash
# 查看容器的 I/O 限制配置
docker inspect app --format='{.HostConfig.DeviceReadBps}'
docker inspect app --format='{.HostConfig.DeviceWriteBps}'
```

## 五、在 Docker Compose 中设置资源限制
### 5.1 运行模式
Docker Compose 在不同运行模式下，读取资源限制的字段完全不同。如果你用错了写法，资源限制不会生效，容器会不受限制地消耗宿主机资源。

现在由于大家大多适用Docker compose V2版本，所以建议采用Swarm 集群模式写法，V2可以兼容所有格式。

| 运行模式       | 启动命令                  | 读取的字段                                | 不生效的字段             |
| ---------- | --------------------- | ------------------------------------ | ------------------ |
| 单机模式       | `docker compose up`   | `cpus`、`mem_limit`、`mem_reservation` | `deploy.resources` |
| Swarm 集群模式 | `docker stack deploy` | `deploy.resources`                   | `cpus`、`mem_limit` |

### 5.2 单机模式下的写法
在单机模式下，资源限制字段与 image、ports 等字段平级(放在服务名称下方)。

语法示例：
```yaml
services:
  服务名:
    image: 镜像名
    cpus: 'CPU核心数'
    mem_limit: 内存上限
    mem_reservation: 内存预留
```
参数说明：

|字段|说明|示例|
|---|---|---|
| `cpus` |容器最多能使用的 CPU 核心数| `'0.5'`、`'1.0'`、`'2.5'` |
| `mem_limit` |容器内存硬限制，超限会被 OOM Killer 杀死| `256M`、`1G`、`512MB` |
| `mem_reservation` |容器内存软限制，系统内存紧张时会强制容器回落到此值以内| `128M`、`512MB` |

完整示例(单机模式)：
```yaml
version: '3.8'

services:
  web:
    image: nginx:1.26-alpine
    ports:
      - "8080:80"
    cpus: '0.5'
    mem_limit: 256M
    mem_reservation: 128M
    restart: unless-stopped

  db:
    image: mysql:5.7
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql
    cpus: '1.0'
    mem_limit: 1G
    mem_reservation: 512M
    restart: unless-stopped

volumes:
  db_data:
```
**提醒**：生产环境请使用 `${变量名}` 引用 `.env` 文件中的敏感信息，切勿在 Compose 文件中直接写明文密码。

### 5.3 Swarm 模式下的写法
在 Swarm 集群模式下，资源限制必须写在 `deploy.resources` 字段中。顶层的 `cpus`、`mem_limit` 会被 Swarm 忽略。

语法示例：
```yaml
services:
  服务名:
    image: 镜像名
    deploy:
      resources:
        limits:        # 硬限制(上限)
          cpus: 'CPU核心数'
          memory: 内存上限
        reservations:  # 软限制(预留)
          cpus: 'CPU核心数'
          memory: 内存上限
```
参数说明：

|字段|说明|示例|
|---|---|---|
| `deploy.resources.limits.cpus` |容器最多能使用的 CPU 核心数| `'0.5'`、`'1.0'` |
| `deploy.resources.limits.memory` |容器内存硬限制| `256M`、`1G` |
| `deploy.resources.reservations.cpus` |系统为容器预留的 CPU 核心数| `'0.25'`、`'0.5'` |
| `deploy.resources.reservations.memory` |系统为容器预留的内存量| `128M`、`512M` |

完整示例(Swarm 模式)：
```yaml
version: '3.8'

services:
  web:
    image: nginx:1.26-alpine
    ports:
      - "8080:80"
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.25'
          memory: 128M
    restart: unless-stopped

  db:
    image: mysql:5.7
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    restart: unless-stopped

volumes:
  db_data:
```

## 六、生产环境资源限制最佳实践
**生产环境**：无论你用哪种方式启动，每个容器都必须设置内存上限，这是防止单个容器拖垮整台宿主机的最后一道防线。

### 6.1 各类型服务推荐配置
| 服务类型                           | CPU 上限    | 内存上限          | 说明                 |
| ------------------------------ | --------- | ------------- | ------------------ |
| 静态 Web(Nginx)                  | 0.5 - 1 核 | 256MB - 512MB | 主要是 I/O 密集，CPU 需求低 |
| 动态 Web(Node.js/Python)         | 1 - 2 核   | 512MB - 1GB   | 业务逻辑处理，适度配置        |
| 数据库(MySQL/PostgreSQL)          | 2 - 4 核   | 2GB - 8GB     | 数据量大时适当增加          |
| 缓存(Redis)                      | 1 - 2 核   | 1GB - 4GB     | 内存型应用，内存是关键        |
| 消息队列(RabbitMQ/Kafka)           | 2 - 4 核   | 2GB - 8GB     | 吞吐量敏感，需充足资源        |
| 日志收集(Fluentd/Filebeat)         | 0.5 核     | 256MB - 512MB | 轻量级任务              |
| 监控探针(Prometheus Node Exporter) | 0.25 核    | 128MB - 256MB | 极轻量，资源需求小          |
### 6.2 资源限制的五大原则
| 原则          | 说明                               |
| ----------- | -------------------------------- |
| 必须设置内存上限    | 每个容器都必须设置 `--memory`，这是生产环境的最低要求 |
| CPU 上限可适当宽松 | CPU 超限一般不会导致容器崩溃(只会变慢)，可以略宽松     |
| 预留资源给系统     | 宿主机至少预留 20%-30% 的资源给系统和其他进程      |
| 压力测试验证      | 上线前进行压测，验证配置的资源是否满足业务需求          |
| 监控告警        | 配置资源使用率监控，当接近上限时提前告警             |
### 6.3 设置资源限制的检查清单
在将容器部署到生产环境之前，请逐项确认：

| 检查项                                                                          | 状态  |
| ---------------------------------------------------------------------------- | --- |
| 每个容器都设置了 `--memory` 上限                                                       | ☐   |
| 核心服务设置了 CPU 权重(`--cpu-shares`)                                               | ☐   |
| 数据库容器禁用了 Swap(`--memory-swap` 等于 `--memory`)                                 | ☐   |
| 数据库等敏感服务绑定了 CPU 核心(`--cpuset-cpus`)                                          | ☐   |
| 生产环境的 Compose 文件已配置资源限制 | ☐   |
| 宿主机预留了 20% 以上的 CPU 和内存资源                                                     | ☐   |
| 已配置监控告警，当资源使用率超过 80% 时通知                                                     | ☐   |

## 七、监控与排错
### 7.1 查看容器资源使用情况
```bash
# 实时查看所有容器的资源使用
docker stats

# 查看指定容器的资源使用
docker stats web

# 只查看一次(不持续刷新)
docker stats --no-stream web
```
命令解释：
- `docker stats` 会持续刷新，显示每个容器的 CPU、内存、网络 I/O、磁盘 I/O。
- 按 `Ctrl+C` 退出。
- `--no-stream` 只输出一次，适合脚本采集。
### 7.2 查看容器的详细资源配置
```bash
# 查看容器的完整配置(含资源限制)
docker inspect web

# 只查看 CPU 限制
docker inspect web --format='{.HostConfig.CpuShares}'
docker inspect web --format='{.HostConfig.CpuPeriod}'
docker inspect web --format='{.HostConfig.CpuQuota}'

# 只查看内存限制
docker inspect web --format='{.HostConfig.Memory}'
docker inspect web --format='{.HostConfig.MemorySwap}'
```
### 7.3 排查 OOM(内存超限)问题
当容器因内存超限被 OOM Killer 杀死时，可以通过以下方式排查：
```bash
# 查看容器的退出状态(137 表示被 SIGKILL 杀死，通常是 OOM)
docker inspect web --format='{.State.ExitCode}'

# 查看宿主机 OOM 日志
sudo dmesg | grep -i "out of memory"
sudo journalctl -k | grep -i "oom"

# 查看 Docker 守护进程的 OOM 日志
sudo journalctl -u docker | grep -i "oom"
```
OOM 后的处理步骤：
1. 确认容器的内存上限是否设置合理(`docker inspect`)。
2. 查看宿主机剩余内存(`free -h`)。
3. 如果是应用内存泄露，修复代码。
4. 如果业务量增长导致内存不足，适当提高内存上限。
### 7.4 CPU 限制过紧导致性能问题
如果容器 CPU 使用率持续接近上限(`docker stats` 中 CPU % 长期为 100%)，说明 CPU 限制过紧。

排查步骤：

1. 查看容器的 CPU 上限设置：`docker inspect web --format='{.HostConfig.CpuQuota}'`。
2. 查看宿主机整体 CPU 使用率：`top` 或 `htop`。
3. 如果宿主机 CPU 充足，适当提高容器的 CPU 上限。
4. 如果宿主机 CPU 不足，考虑扩容或迁移部分服务。
