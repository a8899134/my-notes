## 一、什么是 LVS
### 1.1 LVS 的概念
LVS(Linux Virtual Server，Linux 虚拟服务器)是由章文嵩博士于 1998 年发起的一个开源项目，已被集成到 Linux 内核中。它是一个内核级别的四层负载均衡器，工作在 OSI 模型的第四层(传输层)，专门处理 TCP/UDP 协议的流量转发。

简单来说，LVS 是一个“内核级流量调度员”—它不关心请求的内容是什么(不解析 HTTP 协议)，只根据 IP 地址和端口号，将请求高效地分发给后端的真实服务器。
### 1.2 LVS 的核心优势
| 优势 | 说明 |
|------|------|
| 极高性能 | 工作在内核态，数据包转发效率极高，单台 LVS 可处理百万级并发连接 |
| 低成本 | 开源免费，普通 Linux 服务器即可部署，无需昂贵的硬件负载均衡器 |
| 对后端透明 | 后端服务器无需修改任何应用代码 |
| 灵活可扩展 | 支持多种工作模式和调度算法，可横向扩展后端服务器 |

### 1.3 LVS 的三个关键角色
在 LVS 架构中，存在三个关键角色：

| 角色 | 说明 | 类比 |
|------|------|------|
| Director Server(调度器) | 接收客户端请求，根据算法将请求转发给后端真实服务器 | 公司前台，负责接待和引导 |
| Real Server(真实服务器) | 实际处理请求的后端服务器(如 Nginx、应用服务器) | 公司里的具体部门 |
| VIP(虚拟 IP) | 对外提供的统一访问 IP，客户端通过 VIP 访问服务 | 公司的总机号码 |

## 二、LVS 的三种工作模式
LVS 支持三种工作模式，分别适用于不同的网络环境和性能需求。
### 2.1 NAT 模式(网络地址转换)
原理：LVS 作为网关，修改请求和响应数据包的 IP 地址。客户端请求到达 LVS 后，LVS 修改目标 IP 为 Real Server 的 IP，转发请求；Real Server 处理完成后，将响应返回给 LVS，LVS 再修改源 IP 为 VIP，返回给客户端。

**特点**：

| 优点 | 缺点 |
|------|------|
| 配置简单，无需修改后端服务器配置 | LVS 成为性能瓶颈(所有进出流量都经过 LVS) |
| 支持异构操作系统 | 扩展性受限 |

适用场景：小型集群、测试环境、Real Server 无公网 IP 的情况。

### 2.2 DR 模式(直接路由)
原理：LVS 只处理请求(入站流量)，响应数据包直接由 Real Server 返回给客户端，不经过 LVS。LVS 仅修改数据包的目标 MAC 地址(改为 Real Server 的 MAC)，IP 地址保持不变。

**关键配置**：
- Director 和所有 Real Server 必须在同一个物理网段
- Real Server 需要在 lo 接口绑定 VIP，并抑制 ARP 响应，避免 VIP 冲突

**特点**：

| 优点 | 缺点 |
|------|------|
| 性能最高，LVS 压力极小，吞吐量可达 10Gbps+ | 要求 LVS 和 Real Server 在同一网段 |
| 响应延迟低 | 配置相对复杂，需处理 ARP 抑制 |
| 生产环境应用最广泛的模式 | Real Server 需配置 VIP |

适用场景：生产环境首选，高吞吐量、低延迟场景，如金融交易系统、游戏服务器等。
### 2.3 TUN 模式(IP 隧道)
原理：LVS 通过 IP 隧道技术，将请求封装在 IP 包中发送给 Real Server。Real Server 解包后处理请求，响应直接返回客户端。

**特点**：

| 优点 | 缺点 |
|------|------|
| 支持跨网段/跨机房部署 | 配置最复杂 |
| 负载均衡层与业务层物理隔离 | 隧道封装/解封装有性能开销 |

适用场景：跨机房、跨云部署。

## 三、什么是 Keepalived
### 3.1 Keepalived 的概念
虽然 LVS 性能极高，但它本身没有健康检查和高可用机制。如果 LVS 调度器宕机，整个服务将不可用。
Keepalived 正是为了解决这一问题而生的。它是一个基于 VRRP 协议(虚拟路由冗余协议)的高可用工具，为 LVS 提供 VIP 漂移、健康检查和故障转移能力。
简单来说：LVS 是“干活的”，Keepalived 是“保命的”

### 3.2 VRRP 协议与 VIP 漂移
Keepalived 的核心机制是 **VRRP 协议**：
1. VRRP 将多台 LVS 服务器组成一个“虚拟路由器”，对外使用一个虚拟 IP(VIP)
2. 多台 LVS 服务器中，一台为 MASTER(主节点)，一台为 BACKUP(备节点)
3. MASTER 持有 VIP，处理所有流量
4. MASTER 定期通过心跳信号向 BACKUP 报告自己的健康状态
5. 如果 MASTER 故障(心跳超时)，BACKUP 自动接管 VIP
6. VIP 漂移在秒级完成，用户几乎无感知

**通俗理解：** 就像公司有两个前台，一个在岗(MASTER)，一个待命(BACKUP)。MASTER 正常时由 MASTER 接待客人；MASTER 请假时，BACKUP 立刻坐到前台位置(VIP 漂移)，客人完全感觉不到变化。

## 四、LVS + Keepalived 的协同工作
### 4.1 整体架构(以 DR 模式为例)
```
客户端
                      │
                      ▼
              ┌─────────────┐
              │    VIP      │  ← 对外唯一入口(如 192.168.1.100)
              │ (Keepalived)│
              └─────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│  LVS Master     │ ←心跳→│  LVS Backup     │
│ (Keepalived)    │       │ (Keepalived)    │
│ 优先级: 100     │       │ 优先级: 90      │
└─────────────────┘       └─────────────────┘
         │                         │
         └────────────┬────────────┘
                      │(修改 MAC 地址转发)
                      ▼
         ┌────────────┴────────────┐
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│  Real Server 1  │       │  Real Server 2  │
│    (Nginx)      │       │    (Nginx)      │
└─────────────────┘       └─────────────────┘
         │                         │
         └────────────┬────────────┘
                      │(响应直接返回客户端，不经过 LVS)
                      ▼
                    客户端
```
### 4.2 各组件分工
| 组件 | 角色 | 职责 |
|------|------|------|
| Keepalived | “管家 + 秘书” | 管理 VIP、监控 LVS 健康状态、故障时触发 VIP 漂移、健康检查 Real Server |
| LVS | “流量调度员” | 接收 VIP 上的请求，根据算法转发给 Real Server |
| Real Server(如 Nginx) | “业务处理员” | 实际处理请求，响应直接返回客户端(DR 模式) |

### 4.3 数据包流向(DR 模式)
客户端 → LVS：客户端请求发送到 VIP，数据包到达 LVS

LVS → Real Server：LVS 仅修改数据包的目标 MAC 地址(改为目标 Real Server 的 MAC)，IP 地址不变(源 IP 是客户端 IP，目标 IP 是 VIP)

Real Server → 客户端：Real Server 通过 lo 接口上的 VIP 处理请求，响应数据包直接发送给客户端(源 IP 是 VIP，目标 IP 是客户端 IP)，不经过 LVS

这就是 DR 模式性能高的根本原因：LVS 只处理入站流量(请求)，出站流量(响应)完全由 Real Server 直接返回，LVS 压力极小。

## 五、配置示例
### 5.1 环境规划
以 DR 模式为例：

| 角色 | IP 地址 | 核心软件 | 职责 |
|------|---------|----------|------|
| LVS Master | 192.168.1.10 | LVS, Keepalived | 主调度器，持有 VIP |
| LVS Backup | 192.168.1.11 | LVS, Keepalived | 备调度器，待命接管 |
| Real Server 1 | 192.168.1.20 | Nginx | 后端 Web 服务器 |
| Real Server 2 | 192.168.1.21 | Nginx | 后端 Web 服务器 |
| VIP | 192.168.1.100 | - | 对外统一入口 |

### 5.2 安装 LVS 和 Keepalived
在 LVS Master 和 Backup 节点上执行：
```
# 安装 ipvsadm(LVS 管理工具)和 keepalived
yum install -y ipvsadm keepalived
```
### 5.3 主 LVS 节点 Keepalived 配置
编辑 `/etc/keepalived/keepalived.conf`：
```
# ============================================
# Keepalived 主配置文件(Master 节点)
# ============================================

global_defs {
    router_id LVS_MASTER          # 节点标识，备节点改为 LVS_BACKUP
}

# -- --- VRRP 配置：管理 VIP 漂移 -- ---
vrrp_instance VI_1 {
    state MASTER                  # 主节点为 MASTER，备节点为 BACKUP
    interface eth0                # 监听的物理网卡
    virtual_router_id 51          # 虚拟路由 ID(0-255)，主备必须一致
    priority 100                  # 优先级，主节点高于备节点(如 100 vs 90)
    advert_int 1                  # 心跳间隔(秒)
    authentication {
        auth_type PASS
        auth_pass 1111            # 主备通信密码，必须一致
    }
    virtual_ipaddress {
        192.168.1.100/24 dev eth0 # VIP(对外服务 IP)
    }
}

# -- --- LVS 配置：定义负载均衡规则 -- ---
virtual_server 192.168.1.100 80 { # VIP 和端口
    delay_loop 6                  # 健康检查间隔(秒)
    lb_algo rr                    # 调度算法：rr(轮询)
    lb_kind DR                    # 工作模式：DR(直接路由)
    persistence_timeout 50        # 会话保持时间(秒)，同一 IP 的请求转发到同一 RS
    protocol TCP                  # 协议

    # 后端 Real Server 1
    real_server 192.168.1.20 80 {
        weight 1                  # 权重
        TCP_CHECK {               # TCP 健康检查
            connect_timeout 3
            retry 3
            delay_before_retry 3
        }
    }

    # 后端 Real Server 2
    real_server 192.168.1.21 80 {
        weight 1
        TCP_CHECK {
            connect_timeout 3
            retry 3
            delay_before_retry 3
        }
    }
}
```
**关键配置说明**：

| 配置项 | 说明 |
|--------|------|
| `state MASTER` | 主节点角色，备节点改为 `BACKUP` |
| `priority 100` | 优先级，主节点必须高于备节点 |
| `virtual_ipaddress` | VIP 地址，客户端通过此 IP 访问 |
| `lb_algo rr` | 调度算法，支持 `rr`(轮询)、`wlc`(加权最少连接)等 |
| `lb_kind DR` | 工作模式，生产环境推荐 DR |
| `TCP_CHECK` | 健康检查，自动剔除故障 Real Server |

### 5.4 备 LVS 节点配置
备节点只需修改两处：
```
global_defs {
    router_id LVS_BACKUP          # 改为不同的标识
}

vrrp_instance VI_1 {
    state BACKUP                  # 改为 BACKUP
    priority 90                   # 降低优先级(低于主节点)
    # ... 其他配置与主节点完全相同
}
```
### 5.5 后端 Real Server 配置(DR 模式关键)
Real Server 需要配置 VIP 在 lo 接口并抑制 ARP 响应
```
# 1. 在 lo 接口绑定 VIP(子网掩码为 /32)
ip addr add 192.168.1.100/32 dev lo:0

# 2. 抑制 ARP 响应(避免 VIP 冲突)
echo 1 > /proc/sys/net/ipv4/conf/lo/arp_ignore
echo 2 > /proc/sys/net/ipv4/conf/lo/arp_announce
echo 1 > /proc/sys/net/ipv4/conf/all/arp_ignore
echo 2 > /proc/sys/net/ipv4/conf/all/arp_announce
```
⚠️ **注意**：这些配置在重启后会失效，需要写入 `/etc/rc.local` 或创建 systemd 服务实现永久生效。
### 5.6 启动服务
```
# LVS 节点上启动 Keepalived
systemctl start keepalived
systemctl enable keepalived

# Real Server 上启动 Nginx
systemctl start nginx
```
### 5.7 验证
```
# 1. 查看 VIP 是否在主节点上
ip addr show eth0 | grep 192.168.1.100

# 2. 查看 LVS 转发规则
ipvsadm -L -n

# 输出示例：
# IP Virtual Server version 1.2.1
# Prot LocalAddress:Port Scheduler Flags
#   -> RemoteAddress:Port           Forward Weight ActiveConn InActConn
# TCP  192.168.1.100:80 rr
#   -> 192.168.1.20:80              Route   1      0          0
#   -> 192.168.1.21:80              Route   1      0          0

# 3. 测试访问
curl http://192.168.1.100
```
**ipvsadm 命令说明**：

| 命令 | 说明 |
|------|------|
| `ipvsadm -L -n` | 查看当前 LVS 转发规则 |
| `ipvsadm -A -t VIP:端口 -s 算法` | 添加虚拟服务 |
| `ipvsadm -a -t VIP:端口 -r RS:端口 -g` | 添加 Real Server(`-g` 表示 DR 模式) |

## 六、高可用故障转移流程
### 6.1 正常情况
- VIP 绑定在 LVS Master 
- LVS Master 处理所有客户端请求
- LVS Backup 监听 Master 的心跳信号
### 6.2 Master 故障时
1. Backup 检测到 Master 心跳超时
2. Backup 自动接管 VIP(VIP 漂移)
3. Backup 开始处理客户端请求
4. 整个过程在 1-3 秒内完成，用户基本无感知
### 6.3 Master 恢复后
- Master 重新上线后，Backup 检测到 Master 的心跳
- 默认情况下，Master 会重新抢占 VIP(通过更高优先级)
- 如果不想抢占，可在 Keepalived 配置中添加 nopreempt 参数

## 七、LVS + Keepalived + Nginx 三层架构
### 7.1 完整架构
在实际生产环境中，LVS + Keepalived 通常与 Nginx 配合使用：
```
用户请求
    │
    ▼
┌──────────────────────────────────────────────────────┐
│ ① LVS + Keepalived(四层负载均衡 + 高可用)        │
│    职责：接收所有流量，根据 IP+端口 分发            │
│    性能：单机百万级并发，内核级转发                │
└──────────────────────────────────────────────────────┘
    │
    ▼ 转发到一台健康的 Nginx
┌──────────────────────────────────────────────────────┐
│ ② Nginx 集群(七层负载均衡 + 业务网关)            │
│    职责：URL 路由、SSL 卸载、限流、缓存、静态资源   │
│    性能：单机 5-10 万并发                          │
└──────────────────────────────────────────────────────┘
    │
    ▼ 根据 location 转发
┌──────────────────────────────────────────────────────┐
│ ③ 后端应用服务器(业务逻辑)                        │
│    职责：执行业务代码，查询数据库                    │
└──────────────────────────────────────────────────────┘
```
### 7.2 为什么需要 LVS + Nginx 两层
| 问题 | LVS 解决 | Nginx 解决 |
|------|----------|------------|
| 单点故障 | ✅ Keepalived 实现主备切换 | ❌ 本身是单点 |
| 高性能四层转发 | ✅ 内核级转发，百万级并发 | ❌ 用户态处理，性能有限 |
| 七层精细化路由 | ❌ 看不到 HTTP 内容 | ✅ URL 路由、限流、缓存 |
| SSL 卸载 | ❌ 不支持 | ✅ 支持 |
| 健康检查 | ✅ 被动检查 | ✅ 主动/被动检查 |

**简单来说** ：
LVS：管“谁来”(四层，看 IP 和端口)— 高效分发
Nginx：管“干什么”(七层，看域名和 URL)— 精细路由

**总结**：LVS + Keepalived 是一套开源、免费、高性能的四层高可用负载均衡方案—LVS 在内核态做高效的流量分发，Keepalived 通过 VRRP 协议管理 VIP 漂移，两者配合实现秒级故障切换。在生产环境中，它通常与 Nginx 配合使用，形成 LVS(四层分发)+ Nginx(七层路由)+ 应用服务器(业务逻辑) 的三层高可用架构。