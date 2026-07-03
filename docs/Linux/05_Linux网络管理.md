掌握网络管理是使用系统、部署服务、排查故障的必备技能。Linux 网络功能强大但命令繁多，本文将用清晰结构 + 实用命令 + 场景化示例，带你从零彻底掌握 Linux 网络管理核心知识

## 一、基础概念
1. 网卡（Network Interface）：物理或虚拟的网络设备（如 `eth0`, `ens33`, `wlan0`）。
2. IP 地址：设备在网络中的“门牌号”（IPv 4 如 `192.168.1.10`，IPv 6 更长）。
3. 子网掩码 & 网关：决定哪些地址在本地网络，哪些需要通过网关转发。
4. DNS：将域名（如 `www.baidu.com`）解析为 IP 地址。
5. 端口（Port）：应用程序的“门”，如 Web 服务用 80/443，SSH 用 22。
💡 Linux 一切皆文件，网络配置也以文件形式存在（如 `/etc/sysconfig/network-scripts/`）。

## 二、查看网络信息

### 2.1 查看 IP 地址和网卡状态

#### 2.1.1 ip addr

```
ip addr show
# 或简写
ip a
```

输出示例：

```
2: ens33: <BROADCAST,MULTICAST,UP> mtu 1500...
    inet 192.168.1.100/24 brd 192.168.1.255 scope global dynamic ens33
```

1. `ens33`：网卡名（不同系统可能叫 `eth0`, `enp0s3` 等）
2. `192.168.1.100/24`：IP 地址 + 子网掩码（/24 = 255.255.255.0）

#### 2.1.2 ifconfig 

```
# CentOS/Rocky/openEuler 安装工具：
sudo dnf install net-tools -y
ifconfig
```

建议新手优先学 `ip` 命令，它是未来标准。

### 2.2 查看路由表
查看路由表跟网关
```
ip route show
#需要 net-tools
route -n   
```

输出示例：

```
default via 192.168.1.1 dev ens33   # 默认网关是 192.168.1.1
192.168.1.0/24 dev ens33 proto kernel scope link src 192.168.1.100
```

### 2.3 查看 DNS 配置

```
cat /etc/resolv.conf
```

输出：

```
nameserver 8.8.8.8
nameserver 114.114.114.114
```

在使用 NetworkManager 或 systemd-resolved 的系统中，此文件可能是自动生成的。

### 2.4 测试网络连通性

测试到网关是否通：

```
ping 192.168.1.1
```

测试到外网是否通：

```
ping  www.baidu.com 
```

测试 DNS 是否工作：

```
#需安装bind-utils
sudo yum install bind-utils

nslookup www.qq.com 

```

❗ 如果 `ping` 不通，但 `nslookup` 能解析，说明 DNS 正常，但网络或防火墙有问题。

## 三、配置网络

### 3.1 临时修改 IP

```
# 设置 IP
sudo ip addr add 192.168.1.101/24 dev ens33

# 删除旧 IP（如果需要）
sudo ip addr del 192.168.1.100/24 dev ens33

# 设置默认网关
sudo ip route add default via 192.168.1.1

# 设置 DNS（临时）
echo "nameserver 223.5.5.5" | sudo tee /etc/resolv.conf
```

适合测试，重启后会失效，生产环境必须用永久配置。
### 3.2 永久配置网络
CentOS / Rocky / RHEL / openEuler ,(使用 NetworkManager 或传统脚本）
#### 3.2.1 使用 nmcli

```
# 查看连接名
nmcli con show

# 修改 IP（假设连接名为 "System ens33"）
sudo nmcli con mod "System ens33" ipv4.addresses 192.168.1.101/24
sudo nmcli con mod "System ens33" ipv4.gateway 192.168.1.1
sudo nmcli con mod "System ens33" ipv4.dns "223.5.5.5,114.114.114.114"
sudo nmcli con mod "System ens33" ipv4.method manual
sudo nmcli con mod "System ens33" ipv6.method disabled

# 重启连接
sudo nmcli con down "System ens33" && sudo nmcli con up "System ens33"
```

#### 3.2.2 编辑配置文件

```
sudo vi /etc/sysconfig/network-scripts/ifcfg-ens33
```

内容示例：

```
TYPE=Ethernet
BOOTPROTO=static
NAME=ens33
DEVICE=ens33
ONBOOT=yes
IPADDR=192.168.1.101
NETMASK=255.255.255.0
GATEWAY=192.168.1.1
DNS1=223.5.5.5
```

然后重启网络：

```
sudo systemctl restart NetworkManager
# 或
sudo nmcli con reload
```
## 四、防火墙管理

Linux 默认启用防火墙（firewalld 或 iptables），会阻止外部访问你的服务（如 Web、数据库）。
### 4.1 使用firewalld
备注：CentOS / Rocky / openEuler 系统
```
# 查看状态
sudo firewall-cmd --state

# 查看开放的端口
sudo firewall-cmd --list-ports

# 永久开放 80 端口（HTTP）
sudo firewall-cmd --permanent --add-port=80/tcp

# 重载配置
sudo firewall-cmd --reload

# 开放服务（如 http）
sudo firewall-cmd --permanent --add-service=http
```
部署 Web 服务后，记得开放端口！否则外网无法访问。
## 五、网络诊断与排错

### 5.1 无法上网
1. `ip a` → 网卡有 IP 吗？
2. `ping 127.0.0.1` → 本地 TCP/IP 协议栈正常？
3. `ping 网关` → 局域网通吗？
4. `ping 8.8.8.8` → 能出外网吗？
5. `ping www.baidu.com` → DNS 正常吗？
6. `systemctl status NetworkManager` → 网络服务运行吗？
### 5.2 查看监听的端口

```
ss -tuln
# 或
netstat -tuln   # 需安装 net-tools
```

- `-t`：TCP
- `-u`：UDP
- `-l`：监听状态
- `-n`：显示数字端口（不解析服务名）
### 5.3 测试远程端口是否开放

```
telnet 192.168.1.100 80

```
### 5.4 抓包分析

```

sudo tcpdump -i ens33 port 80 -w http.pcap
# 用 Wireshark 分析 pcap 文件
```

## 六、建议

1. 先学会 `ip a` 和 `ping`，这是网络诊断的起点。
2. 配置网络优先用图形工具或 `nmcli`，避免手写配置出错。
3. 部署服务后第一件事：检查防火墙和SeLinux！
4. 国内 DNS 推荐：`223.5.5.5`（阿里云）、`114.114.114.114`（电信）。
5. 虚拟机网络模式：学习时用 NAT 模式（自动获取 IP），生产用 桥接。