## 一、Docker 网络概述
### 1.1  Docker 网络概念
Docker 容器的核心价值之一是“隔离”，但完全隔离的容器是没有实际用途的。生产环境中的容器需要与外部世界通信—用户需要访问容器内的 Web 服务，容器需要访问数据库，不同容器之间需要相互调用。

Docker 网络就是解决容器通信问题的机制。它让容器可以：
- 与宿主机通信。
- 与同一宿主机上的其他容器通信。
- 与跨宿主机的容器通信(通过 Overlay 网络)。
- 被外部用户访问(通过端口映射)。
### 1.2 Docker 网络的底层基础
Docker 本身并没有重新发明网络技术，而是利用了 Linux 内核提供的网络功能：

| 底层技术                      | 作用                              |
| ------------------------- | ------------------------------- |
| 网络命名空间(Network Namespace) | 每个容器拥有独立的网络栈(网卡、IP、路由表、端口)      |
| veth pair(虚拟以太网对)         | 一对虚拟网卡，用于连接容器的网络命名空间和宿主机的网络命名空间 |
| 网桥(Bridge)                | 软件交换机，连接多个容器，实现二层通信             |
| iptables / nftables       | Linux 防火墙规则，实现端口映射(NAT)和网络隔离    |

通俗理解：
- 网络命名空间让每个容器拥有自己独立的“网络房间”。
- veth pair 是一条“网线”，一头插在容器的房间里，另一头插在宿主机的交换机上。
- 网桥就是那个“交换机”，把多个容器连接在一起。
- iptables 是“门卫”，负责把外部请求转发到正确的容器房间。
### 1.3 容器的网络模型
从容器内部看向外部世界，数据流向大致如下：

容器内部(网络命名空间)→ veth pair → 宿主机网桥(docker0 或自定义网桥)→ 宿主机网卡 → 外部网络

这个模型让容器既能与外界通信，又能保持网络层面的隔离。

## 二、网络模式
Docker 提供了多种网络模式，每种模式适用于不同的场景。
### 2.1 网络模式总览
| 网络模式      | 说明                     | 适用场景         |
| --------- | ---------------------- | ------------ |
| bridge    | 默认模式，容器通过 NAT 访问外网     | 单机多容器通信      |
| host      | 容器共享宿主机网络命名空间          | 对网络性能要求极高的场景 |
| none      | 无网络，完全隔离               | 安全要求极高的批处理任务 |
| container | 容器共享另一个容器的网络命名空间       | 需要网络栈完全一致的场景 |
| overlay   | 跨主机容器通信(需 Swarm 或 K8s) | 集群环境         |
| macvlan   | 容器拥有独立 MAC 地址，直连物理网络   | 需要容器看起来像物理设备 |
### 2.2 查看当前网络
```bash
# 列出所有 Docker 网络
docker network ls
```
命令解释：
- `network ls`：显示当前 Docker 守护进程中的所有网络。
- 输出包含三列：NETWORK ID(网络 ID)、NAME(网络名称)、DRIVER(驱动类型)、SCOPE(作用域)。

典型输出：
```text
NETWORK ID     NAME      DRIVER    SCOPE
8c2b7f0a3d1e   bridge    bridge    local
3a5f8c9d2e1b   host      host      local
4b6e9a1f3c7d   none      null      local
```
### 2.3 Bridge 模式
Bridge (桥接)模式是 Docker 的默认网络模式。当你不指定 --network 参数时，容器会自动连接到名为 bridge 的默认网桥。

工作原理：
1. Docker 启动时会创建一个名为 `docker0` 的虚拟网桥(桥接设备)。
2. 每个新容器会获得一对 veth pair(虚拟网卡)，一头放在容器内，另一头连接到 `docker0` 网桥上。
3. 容器被分配一个 `docker0` 网桥子网内的 IP 地址(默认是 172.17.0.0/16)。
4. 容器通过 NAT(网络地址转换)访问外网，外网无法直接访问容器(需端口映射)。
```bash
# 使用默认 bridge 网络运行容器
docker run -d --name web nginx:1.26-alpine

# 查看容器的 IP 地址
docker inspect web | grep IPAddress
```
缺点：
- 容器之间通过 IP 地址通信，IP 会变化，不稳定。
- 默认网桥不支持容器名自动 DNS 解析。
### 2.4 Host 模式
Host 模式让容器共享宿主机的网络命名空间。容器不会获得独立的 IP，而是直接使用宿主机的 IP 和端口。
```bash
# 使用 host 网络模式
docker run -d --network host --name web nginx:1.26-alpine
```
特点：
- 容器内监听的端口直接暴露在宿主机上(无需 `-p` 参数)。
- 网络性能最好(无 NAT 开销)。
- 隔离性最差(容器和宿主机共享网络)。
- 端口冲突风险高(不同容器不能监听同一端口)。
适用场景：
对网络性能要求极高的应用(如高性能网关、负载均衡器)。
需要监控宿主机网络流量的应用。
### 2.5 None 模式
None 模式表示容器没有网络配置，只有 loopback 接口(127.0.0.1)，无法与外界通信。
```bash
# 使用 none 网络模式
docker run -d --network none --name isolated alpine sleep 3600
```
特点：
- 完全的网络隔离。
- 没有任何网络设备(除了 lo)。
适用场景：
- 高安全性批处理任务(不需要网络)。
- 离线计算任务。
### 2.6 Container 模式
Container 模式让新容器共享另一个容器的网络命名空间。两个容器共用 IP 和端口空间。
```bash
# 先运行一个容器
docker run -d --name web1 nginx:1.26-alpine

# 让 web2 共享 web1 的网络命名空间
docker run -d --network container:web1 --name web2 alpine sleep 3600
```
特点：
- 两个容器通过 localhost(127.0.0.1)即可通信。
- 端口不能冲突(共享端口空间)。
适用场景：
- 需要网络栈完全一致的应用(如 sidecar 代理)。
- 调试容器网络问题。

## 三、默认桥接网络
### 3.1 默认网桥
Docker 安装时会自动创建一个名为 `docker0` 的虚拟网桥，并分配一个子网(通常是 172.17.0.0/16)。
```bash
# 查看宿主机上的网桥设备
ip addr show docker0
```
默认网桥的限制：
- 容器之间只能通过 IP 地址通信(IP 不固定，容器重启会变化)。
- 容器名不能自动解析为 IP。
- 默认网桥上的容器可以互相通信，但受 iptables 规则限制。
### 3.2 默认网桥上的容器通信
在默认 bridge 网络中，容器之间可以互相通信，但需要用 IP 地址。
```bash
# 启动两个容器
docker run -d --name container1 alpine sleep 3600
docker run -d --name container2 alpine sleep 3600

# 获取 container1 的 IP
docker inspect container1 | grep IPAddress

# 在 container2 中 ping container1 的 IP
docker exec container2 ping <container1的IP>
```
问题：如果 container1 重启，IP 可能变化，container2 中的配置就失效了。
### 3.3 连接外部网络(出站)
默认 bridge 模式下，容器可以访问外网，这是通过 NAT(网络地址转换)实现的。
```bash
# 在容器内 ping 外网地址
docker exec web ping 8.8.8.8
```
原理：Docker 在宿主机上设置了 iptables 规则，将容器的出站流量进行 SNAT(源地址转换)，把容器的私有 IP 转换为宿主机的公网 IP。

## 四、自定义桥接网络
### 4.1 自定义网络作用
相比于默认的 bridge 网络，自定义桥接网络有三个重要优势：

|优势|说明|
|---|---|
|自动 DNS 解析|容器可以通过容器名互相访问，无需关心 IP 变化|
|更好的隔离性|不同自定义网络相互隔离，只有显式连接的容器才能通信|
|可配置性|可以自定义子网、网关、IP 范围|

生产环境强烈建议使用自定义桥接网络，而非默认的 bridge。
### 4.2 创建自定义桥接网络
```bash
# 创建一个名为 mynet 的自定义桥接网络
docker network create mynet

# 创建时指定子网和网关
docker network create --subnet=10.10.0.0/16 --gateway=10.10.0.1 mynet

# 创建时指定驱动(默认 bridge)
docker network create --driver bridge mynet
```
命令解释：
- `network create`：创建一个新网络。
- `--subnet`：指定网络的子网范围(CIDR 格式)。
- `--gateway`：指定网关 IP。
- `--driver`：指定网络驱动类型(bridge、overlay 等)。
### 4.3 在自定义网络中运行容器
```bash
# 在 mynet 网络中运行容器
docker run -d --network mynet --name web1 nginx:1.26-alpine

# 再运行一个容器，也连接到 mynet
docker run -d --network mynet --name web2 nginx:1.26-alpine

# web1 可以通过容器名访问 web2
docker exec web1 ping web2
```
关键区别：容器名 web2 会自动解析为 IP 地址，无论容器重启 IP 如何变化。
### 4.4 将已有容器连接到网络
```bash
# 将运行中的容器连接到 mynet 网络
docker network connect mynet web1

# 断开连接
docker network disconnect mynet web1
```
命令解释：
- `network connect`：将容器连接到指定网络。
- `network disconnect`：将容器从指定网络断开。
一个容器可以同时连接到多个网络。这使得容器在不同网络之间充当“桥梁”成为可能。

## 五、端口映射
### 5.1 端口映射作用
容器拥有独立的网络命名空间，外部用户无法直接访问容器内部的端口。端口映射的作用是将容器内部的端口“发布”到宿主机，让外部用户通过宿主机的 IP 和端口访问容器服务。
### 5.2 端口映射的基本语法
```bash
docker run -d -p [宿主机IP:]宿主机端口:容器端口[/协议] 镜像名
```
各部分含义：

|部分|说明|是否必须|
|---|---|---|
|宿主机 IP|绑定的宿主机 IP 地址，默认为 0.0.0.0(所有网卡)|非必须|
|宿主机端口|宿主机上监听的端口|必须|
|容器端口|容器内部监听的端口|必须|
|协议|tcp 或 udp，默认为 tcp|非必须|
### 5.3 常用端口映射示例
```bash
# 将宿主机的 8080 端口映射到容器的 80 端口
docker run -d -p 8080:80 nginx:1.26-alpine

# 映射多个端口
docker run -d -p 80:80 -p 443:443 nginx:1.26-alpine

# 只允许本机访问(127.0.0.1)
docker run -d -p 127.0.0.1:8080:80 nginx:1.26-alpine

# 指定 UDP 协议
docker run -d -p 53:53/udp dns-server

# 让 Docker 自动分配宿主机端口
docker run -d -p 80 nginx:1.26-alpine
# 可用 docker ps 查看分配的端口号

# 同时映射 TCP 和 UDP(同一端口)
docker run -d -p 53:53/tcp -p 53:53/udp dns-server
```
### 5.4 查看端口映射
```bash
# 查看容器的端口映射
docker port my-web

# 在 docker ps 中查看
docker ps --filter "name=my-web"
```
命令解释：
- `docker port`：显示容器的端口映射关系。
- 输出格式：`容器端口/协议 -> 宿主机IP:宿主机端口`。

## 六、容器间通信
### 6.1 通过 IP 地址通信
容器之间可以通过 IP 地址直接通信，但容器的 IP 在重启后可能变化，不适合生产环境。
```bash
# 获取容器 IP
docker inspect web1 | grep IPAddress

# 在 web2 中访问 web1 的 IP
docker exec web2 curl http://<web1的IP>
```
### 6.2 通过容器名通信
在自定义网络中，容器可以通过容器名相互访问，这是生产环境推荐的方式。
```bash
# 创建自定义网络
docker network create appnet

# 启动两个容器在同一网络
docker run -d --network appnet --name web nginx:1.26-alpine
docker run -d --network appnet --name redis redis:7.2-alpine

# 在 web 容器中访问 redis(通过容器名)
docker exec web ping redis  # 可以 ping 通
```
原理：Docker 在自定义网络中内置了 DNS 服务器，将容器名解析为对应的 IP 地址。
### 6.3 通过服务名通信
在 Docker Compose 中，服务名会自动作为网络中的主机名，服务之间可以通过服务名通信。
docker-compose.yml 示例：
```yaml
version: '3'
services:
  web:
    image: nginx:1.26-alpine
    networks:
      - appnet
  redis:
    image: redis:7.2-alpine
    networks:
      - appnet
networks:
  appnet:
```

此时 web 容器可以通过 redis 这个名字访问 Redis 服务。
### 6.4 跨网络通信
不同网络中的容器默认不能相互通信。如果需要跨网络通信，有两种方式：
1. 方式一：将容器同时连接到多个网络。
```bash
docker network connect mynet web1
docker network connect otherapp web1
# 现在 web1 可以访问两个网络中的容器
```
2. 方式二：使用网络间路由(需配置 iptables，复杂且不推荐)。

## 七、网络管理命令
### 7.1 创建网络
```bash
# 创建默认驱动(bridge)的网络
docker network create mynet

# 创建时指定子网
docker network create --subnet=10.10.0.0/16 mynet

# 创建时指定 IP 范围
docker network create --subnet=10.10.0.0/16 --ip-range=10.10.1.0/24 mynet

# 创建时指定驱动类型
docker network create --driver bridge mynet
docker network create --driver overlay --attachable swarm-net
```
### 7.2 查看网络
```bash
# 列出所有网络
docker network ls

# 查看网络详情
docker network inspect mynet

# 只查看网络名称(脚本用)
docker network ls -q
```
### 7.3 删除网络
```bash
# 删除网络(必须没有容器连接)
docker network rm mynet

# 强制删除(即使有容器连接)
docker network rm -f mynet

# 删除所有未使用的网络
docker network prune
```
命令解释：
- `network prune`：删除所有没有被任何容器使用的网络，释放资源。
### 7.4 连接与断开
```bash
# 将容器连接到网络
docker network connect mynet web1

# 指定容器 IP
docker network connect --ip 10.10.1.100 mynet web1

# 断开连接
docker network disconnect mynet web1
```

## 八、生产环境网络最佳实践
### 8.1 网络选择建议
|场景|推荐网络模式|原因|
|---|---|---|
|生产环境微服务|自定义 bridge|支持容器名 DNS 解析，稳定可靠|
|高性能网关|host|减少 NAT 开销，提升性能|
|数据库容器|自定义 bridge(不对外暴露端口)|安全隔离，只供内部服务访问|
|跨主机集群|overlay|让不同宿主机的容器互通|
|安全批处理任务|none|完全隔离，减少攻击面|
### 8.2 安全建议
| 安全措施         | 说明                             |
| ------------ | ------------------------------ |
| 不公开敏感端口      | 数据库(如 MySQL 3306)不应通过端口映射暴露给外网 |
| 使用自定义网络隔离    | 不同应用使用不同网络，互相隔离                |
| 限制网络访问       | 使用防火墙(firewalld)控制宿主机端口访问      |
| 避免使用 host 模式 | 除非性能确实是瓶颈，否则优先使用 bridge        |
| 网络命名空间隔离     | 确保每个容器有独立的网络命名空间               |
### 8.3 Rocky Linux 8 特别提示
1. firewalld 与 Docker 的兼容性
Rocky Linux 8 默认启用 firewalld，Docker 会直接操作 iptables，可能与 firewalld 产生冲突。

常见问题：容器端口映射后，外部无法访问。

解决方案：
```bash
# 方法一：在 firewalld 中放行端口
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --reload

# 方法二：将 docker0 网桥加入 trusted 区域
sudo firewall-cmd --zone=trusted --add-interface=docker0 --permanent
sudo firewall-cmd --reload
```
2. 查看 iptables 规则
```bash
# Docker 自动生成的 NAT 规则
sudo iptables -t nat -L -n
```
### 8.4 网络调试命令
```bash
# 进入容器进行网络测试
docker exec -it my-web sh

# 在容器内执行网络命令
docker exec my-web ping 8.8.8.8
docker exec my-web curl http://redis:6379
docker exec my-web nslookup redis

# 查看容器的网络详细信息
docker inspect my-web --format='{{json .NetworkSettings}}' | jq
```

**总结：** ：“自定义网络 + 容器名通信 + 精准端口映射 = 稳定可靠的 Docker 网络架构”

