## 一、防火墙作用
### 1.1 防火墙在容器环境中的角色
在传统物理机环境中，防火墙是保护服务器的第一道防线。在 Docker 容器环境中，防火墙的角色没有变弱，反而更加重要。

防火墙保护的对象：

|保护对象|说明|
|---|---|
|宿主机本身|SSH(22)、Docker API(2375)等管理端口|
|容器服务|通过端口映射暴露到宿主机上的容器服务(如 80、443、8080)|
|内部网络|容器之间的通信、容器访问外部网络|
通俗理解：
- 宿主机防火墙就是大楼的门禁系统。
- 每个容器就像大楼里的一个房间。
- 端口映射就像给某个房间开了一扇朝外的门。
- 防火墙就是决定谁可以进这扇门的保安。
### 1.2 Docker 与防火墙的“特殊关系”
Docker 在启动容器并做端口映射时，会直接操作 Linux 内核的 iptables(或 nftables)规则。这意味着：
- Docker 可以绕过 firewalld 的配置，直接在底层插入网络规则。
- 如果 firewalld 和 Docker 的规则发生冲突，可能导致端口访问异常。
- 需要理解两者的协作关系，才能正确配置防火墙。
关键认知：Docker 只管“能把流量转进来”，但不负责“谁可以访问”。防火墙决定了“哪些外部来源可以访问”。
-- -
## 二、Linux 防火墙基础
### 2.1 iptables 与 firewalld 的关系
Rocky Linux 8 默认使用 firewalld 作为防火墙管理工具，但 firewalld 本身是 iptables(更准确地说是 nftables)的上层封装。

|组件|角色|说明|
|---|---|---|
|内核 netfilter|底层过滤引擎|Linux 内核中的网络包过滤框架|
|iptables / nftables|规则管理工具|直接操作内核防火墙规则|
|firewalld|上层管理服务|提供 zone、service、rich rule 等高级概念，简化管理|
Docker 直接操作 iptables：
- 当你执行 `docker run -p 8080:80` 时，Docker 直接在 iptables 中添加 NAT 和过滤规则。
- 这些规则不会在 firewalld 中显示，但会生效。
### 2.2 firewalld 的核心概念
firewalld 使用 区域(zone) 和 服务(service) 的概念来管理防火墙规则。
常用区域(zone)：

|区域|默认策略|适用场景|
|---|---|---|
|public|信任度低，只允许明确放行的流量|面向公网的服务器|
|trusted|信任度高，允许所有流量|内部网络或 Docker 网桥|
|internal|中等信任度|企业内部网络|
|dmz|隔离区域|对外服务的 DMZ 主机|
常用服务(service)：
- `ssh`：SSH 服务(22 端口)。
- `http`：HTTP 服务(80 端口)。
- `https`：HTTPS 服务(443 端口)。
- `docker`：Docker API(2375/2376 端口，需自定义)。
### 2.3 查看防火墙状态
```bash
# 查看 firewalld 服务状态
sudo systemctl status firewalld

# 查看 firewalld 是否运行
sudo firewall-cmd --state
# 输出: running 或 not running

# 查看当前激活的区域
sudo firewall-cmd --get-active-zones

# 查看当前区域的所有规则
sudo firewall-cmd --list-all
```
-- -
## 三、DOCKER-USER 链
### 3.1 DOCKER-USER 链概念
Docker 为了管理网络，会在系统的 iptables 防火墙中创建自己的规则链。为了避免用户自定义的规则与 Docker 自身的规则冲突，Docker 专门预留了一条链，它就是 DOCKER-USER 链。
- 专属通道：DOCKER-USER 链是 Docker 官方指定的、用于添加用户自定义防火墙规则的专用通道。
- 优先级最高：所有流向容器的流量，会最先经过 DOCKER-USER 链的检查。
- 持久稳定：Docker 承诺永远不会自动修改 DOCKER-USER 链中的规则，这意味着你的规则不会因为 Docker 重启或容器变化而被覆盖。
### 3.2 DOCKER-USER 链作用
在默认情况下，Docker 会在 DOCKER-USER 链中放行所有流量。因此，你在 firewalld 或 iptables FORWARD 链中配置的规则，会因为执行顺序靠后而无法生效。

DOCKER-USER 链解决了这个问题，它让你能在 Docker 的规则之前，插入自己的安全策略。例如，你可以用它来实现：
- IP 白名单/黑名单：只允许特定的 IP 地址访问你的容器。
- 端口访问控制：限制特定端口只能被内网访问。
- 流量限速或日志记录：为容器流量添加更复杂的处理规则。
重要概念澄清：在 DOCKER-USER 链中配置规则时，匹配的是容器的内部端口，而不是你在 docker run 时映射到宿主机上的端口。
### 3.3 配置 DOCKER-USER 链
在 Rocky Linux 8 上，我们可以通过 firewalld 的 直通规则(Direct Rules) 功能来管理 DOCKER-USER 链。
1. 配置 IP 白名单
场景：只允许 192.168.1.0/24 这个内网网段访问所有容器的 80 端口。
```bash
# 1. 添加白名单规则(允许特定源 IP 访问)
sudo firewall-cmd --permanent --direct --add-rule ipv4 filter DOCKER-USER 0 -p tcp -m multiport --dports 80 -s 192.168.1.0/24 -j ACCEPT

# 2. 添加默认拒绝规则(拒绝所有其他访问)
sudo firewall-cmd --permanent --direct --add-rule ipv4 filter DOCKER-USER 1 -p tcp -m multiport --dports 80 -j DROP

# 3. 重载防火墙使配置生效
sudo firewall-cmd --reload
```
命令解释：
- `--direct --add-rule ipv4 filter DOCKER-USER`：在 `filter` 表的 `DOCKER-USER` 链中添加一条IPv 4 规则。
- `0` 和 `1`：规则的优先级，数字越小，优先级越高。`0` 在 `1` 之前执行。
- `-p tcp -m multiport --dports 80`：匹配 TCP 协议且目标端口为 `80` 的流量。
- `-s 192.168.1.0/24`：匹配源 IP 地址为 `192.168.1.0/24` 网段。
- `-j ACCEPT` 或 `-j DROP`：执行的动作，接受(ACCEPT)或丢弃(DROP)。

2. 配置 IP 黑名单
场景：拒绝来自 10.0.0.5 这个特定 IP 访问所有容器的 443 端口。
```bash
# 1. 添加黑名单规则(拒绝特定 IP 访问)
sudo firewall-cmd --permanent --direct --add-rule ipv4 filter DOCKER-USER 0 -p tcp --dport 443 -s 10.0.0.5 -j DROP

# 2. 重载防火墙使配置生效
sudo firewall-cmd --reload
```

3.  验证规则是否生效
```bash
# 查看 DOCKER-USER 链中的规则
sudo iptables -L DOCKER-USER -n --line-numbers
```
### 3.4 常规防火墙规则 vs DOCKER-USER 链规则

| 对比维度 | 常规防火墙规则 (firewall-cmd)        | DOCKER-USER 链规则 (--direct)                                                                         |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| 管理工具 | firewall-cmd 的标准接口            | firewall-cmd --direct 直通接口                                                                         |
| 作用对象 | 宿主机本身的入站/出站流量(INPUT/OUTPUT 链) | 流向容器的转发流量(FORWARD 链)                                                                               |
| 优先级  | 较低                            | 较高                                                                                                 |
| 目标端口 | 宿主机上映射的端口                     | 容器内部的实际端口[](https://docs.dockerd.com.cn/engine/network/packet-filtering-firewalls/#docker-and-ufw) |
| 主要用途 | 管理 SSH、Nginx 等宿主机服务           | 精细化控制容器服务的访问来源                                                                                     |

-- -
## 四、Docker 与 firewalld 的交互
### 4.1 Docker 如何影响防火墙规则
当容器启动并映射端口时(如 `-p 8080:80`)，Docker 会在 iptables 中插入以下类型的规则：

|规则链|作用|
|---|---|
|PREROUTING(NAT 表)|将外部访问宿主机 8080 端口的流量转发到容器 80 端口|
|FORWARD(filter 表)|允许宿主机网卡与容器网桥之间的流量转发|
|INPUT(filter 表)|允许外部访问宿主机映射的端口|
问题点：Docker 添加的 FORWARD 规则默认允许所有容器之间的流量转发。如果 firewalld 的 FORWARD 策略是 DROP，Docker 的规则可能被覆盖，导致容器无法访问外网。
### 4.2 Docker 对 firewalld 的“感知”
- Docker 不会自动配置 firewalld。
- 即使 firewalld 没有开放某个端口，Docker 的端口映射仍然会生效(因为 Docker 在 iptables 中直接添加了规则)。
- 但如果 firewalld 明确拒绝某个端口，它的规则优先级通常高于 Docker 的规则，可能导致访问被阻断。
结论：防火墙和 Docker 的规则是并存的，需要双方都放行，流量才能通过。实际规则加载顺序决定了谁先生效，firewalld 的富规则或直接规则通常优先级更高。
-- -
## 五、生产环境防火墙配置
### 5.1 标准配置策略
推荐配置策略：

|步骤|操作|说明|
|---|---|---|
|1|启动 firewalld| `sudo systemctl start firewalld` |
|2|将 docker 0 网桥加入 trusted 区域|解决容器间通信和容器访问外网的问题|
|3|放行必要的服务端口(SSH、HTTP、HTTPS)|允许外部访问|
|4|明确拒绝不需要的端口|防止未经授权的访问|
|5|重启 firewalld 并验证|使配置生效|
### 5.2 将 docker 0 网桥加入 trusted 区域
这是解决 Docker 与 firewalld 兼容问题最关键的步骤。将 docker0 网桥加入 trusted 区域，可以避免 firewalld 阻断容器之间的通信。
```bash
# 将 docker0 网桥加入 trusted 区域
sudo firewall-cmd --zone=trusted --add-interface=docker0 --permanent

# 重新加载防火墙配置
sudo firewall-cmd --reload

# 验证配置
sudo firewall-cmd --zone=trusted --list-interfaces
```
命令解释：
- `--zone=trusted`：指定区域为 trusted(信任所有流量)。
- `--add-interface=docker0`：将 `docker0` 网桥设备加入该区域。
- `--permanent`：将配置写入永久文件，重启后依然生效。
- `--reload`：重新加载防火墙配置，使更改立即生效。
为什么要这样做：
- 容器通过 `docker0` 网桥与宿主机通信。
- 如果 `docker0` 在默认的 `public` 区域，防火墙会限制容器之间的流量，导致容器间通信异常。
- 加入 `trusted` 后，`docker0` 上的所有流量(包括容器与外网的流量)都被信任。
### 5.3 放行必要的端口
1. 通过服务名放行(推荐)
```bash
# 放行 SSH 服务(22 端口)
sudo firewall-cmd --add-service=ssh --permanent

# 放行 HTTP 服务(80 端口)
sudo firewall-cmd --add-service=http --permanent

# 放行 HTTPS 服务(443 端口)
sudo firewall-cmd --add-service=https --permanent
```
2. 通过端口号放行
```bash
# 放行 8080 端口(TCP)
sudo firewall-cmd --add-port=8080/tcp --permanent

# 放行 9090 端口(TCP)
sudo firewall-cmd --add-port=9090/tcp --permanent

# 放行 3000-3010 端口范围
sudo firewall-cmd --add-port=3000-3010/tcp --permanent
```
3. 添加富规则(更精细的控制)
```bash
# 只允许 192.168.1.0/24 网段访问 8080 端口
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port port="8080" protocol="tcp" accept'

# 只允许特定 IP 访问 SSH
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.100" port port="22" protocol="tcp" accept'
```
### 5.4 拒绝不需要的端口
虽然默认策略已经是拒绝，但显式拒绝可以记录攻击日志。
```bash
# 拒绝所有对 3306(MySQL)端口的访问
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" port port="3306" protocol="tcp" reject'

# 拒绝所有对 6379(Redis)端口的访问
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" port port="6379" protocol="tcp" reject'
```
### 5.5 重新加载并验证配置
```bash
# 重新加载防火墙配置
sudo firewall-cmd --reload

# 查看当前区域的完整配置
sudo firewall-cmd --list-all

# 查看所有区域的配置
sudo firewall-cmd --list-all-zones
```
-- -
## 六、端口映射场景下的防火墙配置
### 6.1 容器端口映射与防火墙的关系
```bash
# 启动一个 Nginx 容器，映射 8080 端口
docker run -d -p 8080:80 --name web nginx:alpine
```
此时防火墙规则的状态：

|检查项|状态|
|---|---|
|Docker iptables 规则|✅ 已自动添加，流量可以从宿主机 8080 转发到容器 80|
|firewalld 是否开放 8080 端口|❌ 默认没有开放，外部访问会被阻断|
外部用户访问流程：
1. 用户访问 `http://宿主机IP:8080`。
2. 流量到达宿主机网卡。
3. firewalld 检查 8080 端口是否开放 → 如果未开放，直接丢弃数据包。
4. 即使 Docker 的 iptables 规则已经配置好，流量也到达不了
结论：端口映射需要在 Docker 层和 防火墙层都配置正确。
### 6.2 放行容器映射的端口
```bash
# 查看容器映射了哪些端口
docker ps --format "table {{.Names}}\t{{.Ports}}"

# 放行容器映射的端口(以 8080 为例)
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --reload
```
### 6.3 动态端口场景的处理
某些容器(如 Docker Compose 启动的多容器应用)会使用随机端口或自动分配的端口。此时建议：
1. 使用端口范围放行
```bash
# 放行 8080-8090 端口范围
sudo firewall-cmd --add-port=8080-8090/tcp --permanent
sudo firewall-cmd --reload
```
2. 在 Compose 中固定端口
```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"   # 固定宿主机端口
```
3. 查询并动态放行(脚本方式)
```bash
#!/bin/bash
# 获取所有容器映射的端口并放行
for PORT in $(docker ps --format '{{.Ports}}' | grep -oE '[0-9]+->' | sed 's/->//'); do
    sudo firewall-cmd --add-port=${PORT}/tcp --permanent
done
sudo firewall-cmd --reload
```
-- -
## 七 、生产环境安全建议
### 7.1 端口放行最小化原则
| 原则         | 说明                                |
| ---------- | --------------------------------- |
| 只放行必要的端口   | 不要放行所有端口，只开放服务需要的端口               |
| 使用服务名而非端口号 | service 方式比 port 方式更易维护           |
| 限制来源 IP    | 管理端口(如 SSH、Docker API)只允许特定 IP 访问 |
| 定期审计       | 定期检查防火墙规则，移除不再使用的端口放行             |
### 7.2 外部暴露端口清单(示例)
| 端口   | 服务         | 是否需要对外开放 | 备注                      |
| ---- | ---------- | -------- | ----------------------- |
| 22   | SSH        | ✅ 是      | 管理访问                    |
| 80   | HTTP       | ✅ 是      | Web 服务                  |
| 443  | HTTPS      | ✅ 是      | Web 服务(SSL)             |
| 8080 | 容器 Web 服务  | ⚠️ 看情况   | 如果 80/443 被占用时用         |
| 3306 | MySQL      | ❌ 否      | 数据库不对外开放，只内部访问          |
| 6379 | Redis      | ❌ 否      | 缓存不对外开放，只内部访问           |
| 2375 | Docker API | ❌ 绝对禁止   | 暴露 Docker API 等于交出整个服务器 |
### 7.3 firewalld 配置备份与恢复
```bash
# 备份当前防火墙配置
sudo firewall-cmd --list-all > /backup/firewall-backup-$(date +%Y%m%d).txt

# 恢复配置(手动重新执行放行命令)
sudo firewall-cmd --add-service=ssh --permanent
sudo firewall-cmd --add-service=http --permanent
sudo firewall-cmd --add-service=https --permanent
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --reload
```
### 7.4 配置持久化
```bash
# 确保所有配置都已写入永久文件
sudo firewall-cmd --runtime-to-permanent

# 或者每次添加规则时加 --permanent 参数
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --reload
```
-- -
## 八、总结
宿主机防火墙是容器安全的最后一道防线
1. Docker 直接操作 iptables，可以绕过 firewalld 添加规则，但不代表不需要防火墙配置。
2. 标准配置三步走：
    - 将 `docker0` 网桥加入 `trusted` 区域。
    - 放行必要的服务端口(SSH、HTTP、HTTPS)和容器映射端口。
    - 重新加载防火墙配置。
3. 端口映射需要两层配置：
    - Docker 层的端口映射(`-p`)。
    - 防火墙层对外开放端口(`firewall-cmd --add-port`)。
    - 两层必须同时配置，外部才能访问。
4. 最小权限原则：
    - 只放行必要的端口。
    - 管理端口(如 SSH、Docker API)限制来源 IP。
    - 数据库、缓存等内部服务不对外暴露端口。