磁盘管理是系统运维、数据存储和故障排查的核心技能。Linux 的磁盘管理比 Windows 更灵活但也更复杂——它不依赖“C 盘/D 盘”，而是通过设备文件 + 挂载点的方式组织存储。
本文档将用清晰结构 + 实用命令 + 场景化示例，带你彻底掌握 Linux 磁盘管理。
核心流程：
- **普通分区**：`分区(fdisk) → 格式化(mkfs) → 挂载(mount) → 写fstab → 测试(mount -a)`
- **LVM 逻辑卷**：`物理卷(PV) → 卷组(VG) → 逻辑卷(LV) → 格式化 → 挂载 → 写fstab`
## 一、基础概念
### 1.1 一切皆文件
1. 硬盘在 Linux 中表现为设备文件，位于 `/dev/` 目录下。
2. SATA/SCSI 硬盘：`/dev/sda`, `/dev/sdb`...
3. NVMe 固态硬盘：`/dev/nvme0n1`, `/dev/nvme0n2`...
4. 分区：`/dev/sda1`, `/dev/sda2`(数字表示分区号)
5. `sda` = 第一块硬盘，`sda1` = 第一块硬盘的第一个分区
### 1.2 挂载(Mount)机制
1. Linux 没有“盘符”，而是将分区挂载到某个目录(称为挂载点)。
2. 例如：把 `/dev/sdb1` 挂载到 `/data`，那么访问 `/data` 就是在访问这块硬盘。
3. 根文件系统 `/` 必须挂载，其他分区可选。
### 1.3 文件系统(Filesystem)
1. 常见类型：`ext4`(Linux 通用)、`xfs`(高性能，CentOS/RHEL 默认)、`btrfs`(支持快照)、`ntfs`(Windows 兼容)、`vfat`(FAT 32，U 盘常用)
2. 文件系统决定了如何存储文件、权限、日志等。
### 1.4 LVM逻辑卷概念
一句话概括：物理卷(PV)是砖头 → 卷组(VG)是砖头堆 → 逻辑卷(LV)是从砖头堆里划出来的房间。
1. 物理卷(PV，Physical Volume)
- **是什么**：就是你的**物理硬盘或分区**(比如 `/dev/sdb1`、整块 `/dev/sdc`)。
- **作用**：它是 LVM 的“原材料”。你需要先用 `pvcreate` 命令把一块硬盘或分区“初始化”成 LVM 能识别的格式，它才变成一个物理卷。
- **类比**：一块块等待被使用的**砖头**。
2. 卷组(VG，Volume Group)
- **是什么**：把多个物理卷(PV)**打包成一个大的资源池**。
- **作用**：它把零散的硬盘空间整合成一个统一的大仓库，然后你可以从这个大仓库里任意切出空间给逻辑卷使用。
- **类比**：把所有砖头堆在一起的**砖头堆**。你不需要关心砖头是哪来的，只需要知道“这堆砖一共有多少块”。
3. 逻辑卷(LV，Logical Volume)
- **是什么**：从卷组(VG)这个大池子里**切出来的一块逻辑分区**。
- **作用**：这就是你最终**格式化(mkfs)和挂载(mount)** 使用的对象，比如 `/dev/rl/root`、`/dev/rl/home`。
- **类比**：从砖头堆里划出来的**房间**(客厅、卧室)。你可以随时扩大或缩小这个房间(而不需要拆墙重盖)。

| 层级  | 名称  | 英文                   | 类比        | 创建命令                           |
| --- | --- | -------------------- | --------- | ------------------------------ |
| 第一层 | 物理卷 | PV (Physical Volume) | 一块块砖头     | `pvcreate /dev/sdb`            |
| 第二层 | 卷组  | VG (Volume Group)    | 砖头堆(仓库)   | `vgcreate myvg /dev/sdb`       |
| 第三层 | 逻辑卷 | LV (Logical Volume)  | 从仓库里隔出的房间 | `lvcreate -L 10G -n mylv myvg` |

**核心优势**：
- ✅ **在线扩容**：不用停机、不用卸载，就能扩空间
- ✅ **跨硬盘**：多块硬盘可以合并成一个卷组，再切出逻辑卷
- ✅ **快照**：支持 LVM 快照(备份时有用)
### 1.5 分区方式
方式一：普通分区(适用于 备份盘 / 数据盘 / 追求极致 I/O)
```
lsblk              → 查看新硬盘是否被识别(如 /dev/sdb)
   ↓
fdisk /dev/sdb     → 创建分区表，划分出 /dev/sdb1
   ↓
mkfs.ext4 /dev/sdb1 → 格式化分区，创建文件系统
   ↓
mount /dev/sdb1 /mnt/data → 临时挂载测试
   ↓
blkid /dev/sdb1    → 获取 UUID
   ↓
写入 /etc/fstab    → 永久挂载(重启不丢失)
```
方式二：LVM 逻辑卷(适用于 系统盘扩容 / 多盘合并 / 需要在线扩容)
```
lsblk              → 查看新硬盘是否被识别(如 /dev/sdb)
   ↓
pvcreate /dev/sdb  → 将整块硬盘初始化为物理卷(PV)
   ↓
vgcreate myvg /dev/sdb → 创建卷组(VG)，把 PV 加入池子
   ↓
lvcreate -L 50G -n mylv myvg → 从 VG 中切出逻辑卷(LV)
   ↓
mkfs.ext4 /dev/myvg/mylv → 格式化逻辑卷
   ↓
mount /dev/myvg/mylv /mnt/data → 临时挂载测试
   ↓
blkid /dev/myvg/mylv → 获取 UUID
   ↓
写入 /etc/fstab    → 永久挂载
```
**两种方式的本质区别**

|对比维度|普通分区|LVM|
|---|---|---|
|**核心步骤**|`fdisk` → `mkfs`|`pvcreate` → `vgcreate` → `lvcreate` → `mkfs`|
|**分区数量**|必须用 `fdisk` 划分分区(如 sdb1)|可以直接用整块盘(/dev/sdb)，不需要分区|
|**能否在线扩容**|❌ 不能(需要卸载、重新分区、重新格式化)|✅ 能(`lvextend` + `resize2fs`，无需停机)|
|**能否跨硬盘合并**|❌ 不能|✅ 能(多块 PV 加入同一个 VG)|
|**管理复杂度**|低(命令少，直观)|高(需要理解 PV/VG/LV 三层概念)|
|**推荐场景**|备份盘、数据库盘、云服务器系统盘|系统盘(/)、需要频繁扩容的目录、多盘合并|
- 如果你只是想“插一块盘，有个地方存备份文件” → 走普通分区流程(最快、最简单)。
- 如果你觉得“以后这块盘可能不够用，想能随时扩” 或者“想多块盘合成一个目录” → 走LVM流程(一劳永逸)。
### 1.6 相关命令
|命令|全称|作用|
|---|---|---|
|`lsblk`|List Block Devices|列出块设备|
|`fdisk`|Fixed Disk / Format Disk|分区(MBR)|
|`gdisk`|GPT fdisk|分区(GPT，适用于 >2TB 硬盘)|
|`mkfs`|Make FileSystem|创建文件系统(格式化)|
|`mount`|Mount|挂载|
|`umount`|Unmount|卸载|
|`blkid`|Block Identification|块设备标识，查找 UUID|
|`fstab`|/etc/fstab|永久挂载配置文件|
|`pvcreate`|Physical Volume Create|创建物理卷|
|`vgcreate`|Volume Group Create|创建卷组|
|`lvcreate`|Logical Volume Create|创建逻辑卷|
|`pvs` / `vgs` / `lvs`|—|简略查看 PV/VG/LV 状态|
|`pvdisplay` / `vgdisplay` / `lvdisplay`|—|详细查看 PV/VG/LV 状态|

## 二、查看磁盘与分区信息
### 2.1 lsblk—查看块设备
```
lsblk
```
输出示例：
```
NAME        MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
sda           8:0    0   50G  0 disk
├─sda1        8:1    0    1G  0 part /boot
└─sda2        8:2    0   49G  0 part
  ├─rl-root 253:0    0   30G  0 lvm  /
  ├─rl-swap 253:1    0    2G  0 lvm  [SWAP]
  └─rl-home 253:2    0   17G  0 lvm  /home
sdb           8:16   0  100G  0 disk
└─sdb1        8:17   0  100G  0 part /data
```
- `TYPE` 列：`disk` =整块硬盘，`part` =普通分区，`lvm` =逻辑卷
- `MOUNTPOINT`：挂载点(`/` 表示根分区)
### 2.2 df—查看磁盘空间
```
df -h    # -h = human-readable(以 GB/MB 显示)
```
输出示例：
```
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda2        49G   10G   37G  22% /
/dev/sdb1       100G   50G   45G  53% /data
```
这是你日常监控磁盘空间的主要命令！
### 2.3 lsblk -f—查看文件系统类型和 UUID
```
lsblk -f
```
这比 `blkid` 更直观，一次性看到所有设备的文件系统类型和 UUID：
```
NAME        FSTYPE  LABEL           UUID                                 MOUNTPOINT
sda
├─sda1      ext4                    a1b2c3d4-...                         /boot
└─sda2      LVM2_member             xyz123-...
  ├─rl-root ext4                    1234-...                             /
  └─rl-home ext4                    5678-...                             /home
sdb1        xfs                     e5f6g7h8-...                         /data
```
### 2.4 fdisk -l—看详细分区表
```
sudo fdisk -l
```
显示每个磁盘的分区布局、起始扇区、类型等。适用于查看 MBR 分区表。
### 2.5 blkid—查看分区的 UUID 和文件系统类型
```
sudo blkid /dev/sdb1
```
输出：
```
/dev/sdb1: UUID="e5f6g7h8-..." TYPE="xfs"
```
UUID 是分区的唯一标识，比 `/dev/sdX` 更可靠(设备名可能变化)。

## 三、磁盘管理全流程
### 3.1 普通分区
普通分区(适用于备份盘、数据盘、追求极致 I/O)
#### 3.1.1 确认新硬盘存在
```
lsblk
# 应看到 /dev/sdb(无分区，无挂载点)
```
#### 3.1.2 创建分区(使用 fdisk)
```
sudo fdisk /dev/sdb

# 交互界面操作步骤：
# n → 新建分区
# p → 主分区
# 回车(默认起始扇区)
# 回车(使用全部空间)
# w → 写入并退出
```
#### 3.1.3 创建文件系统(格式化)
```
# 创建 ext4(通用，兼容性好)
sudo mkfs.ext4 /dev/sdb1

# 或创建 xfs(高性能，适合大文件)
sudo mkfs.xfs /dev/sdb1
```
#### 3.1.4 创建挂载点并临时挂载
```
sudo mkdir /data
sudo mount /dev/sdb1 /data
```
#### 3.1.5 获取 UUID 并设置开机自动挂载
```
# 获取 UUID
sudo blkid /dev/sdb1
# 输出：UUID="e5f6g7h8-..." TYPE="xfs"

# 编辑 /etc/fstab
sudo vi /etc/fstab
# 添加一行(用 UUID 更稳定)：
UUID=e5f6g7h8-...  /data  xfs  defaults  0 0
```
#### 3.1.6 测试 fstab 是否正确
```
sudo mount -a   # 尝试挂载所有 fstab 条目，无报错即成功
```
### 3.2 LVM 逻辑卷
LVM 逻辑卷(适用于系统盘扩容、多盘合并、需要在线扩容)
#### 3.2.1 确认新硬盘存在
```
lsblk
# 应看到 /dev/sdb(无分区，无挂载点)
```
#### 3.2.2 将整块硬盘初始化为物理卷(PV)
```
sudo pvcreate /dev/sdb
```
💡 也可以先用 `fdisk` 分区，再 `pvcreate /dev/sdb1`。但推荐直接使用整块硬盘，更方便。
#### 3.2.3 创建卷组(VG)
```
sudo vgcreate data_vg /dev/sdb
```
#### 3.2.4 创建逻辑卷(LV)
```
# 创建一个名为 data_lv 的逻辑卷，大小为 50G
sudo lvcreate -L 50G -n data_lv data_vg

# 或使用所有剩余空间
sudo lvcreate -l 100%FREE -n data_lv data_vg
```
#### 3.2.5 格式化逻辑卷
```
sudo mkfs.ext4 /dev/data_vg/data_lv
# 或
sudo mkfs.xfs /dev/data_vg/data_lv
```
#### 3.2.6 创建挂载点并临时挂载
```
sudo mkdir /data
sudo mount /dev/data_vg/data_lv /data
```
#### 3.2.7 获取 UUID 并写入 /etc/fstab
```
sudo blkid /dev/data_vg/data_lv
# 添加一行到 /etc/fstab：
UUID=xxx  /data  ext4  defaults  0 0
```
#### 3.2.8 验证挂载
```
sudo mount -a
df -h /data
```

## 四、LVM 常用管理操作
### 4.1 查看 LVM 状态
```
sudo pvs           # 查看物理卷(简略)
sudo vgs           # 查看卷组(简略)
sudo lvs           # 查看逻辑卷(简略)

sudo pvdisplay     # 查看物理卷(详细)
sudo vgdisplay     # 查看卷组(详细)
sudo lvdisplay     # 查看逻辑卷(详细)
```

### 4.2 LVM 在线扩容(核心技能)
场景：`/data` 空间不够了，新加一块硬盘 `/dev/sdc`，给逻辑卷扩容。
```
# 1. 新硬盘初始化为物理卷
sudo pvcreate /dev/sdc

# 2. 将新 PV 加入现有的卷组
sudo vgextend data_vg /dev/sdc

# 3. 扩展逻辑卷(+20G)
sudo lvextend -L +20G /dev/data_vg/data_lv

# 4. 扩展文件系统(必须执行！否则 df -h 看不到变化)
# 如果是 ext4：
sudo resize2fs /dev/data_vg/data_lv
# 如果是 xfs：
sudo xfs_growfs /data
```
### 4.3 LVM 缩容
LVM 支持缩容，但**生产环境强烈不建议操作**，容易导致数据损坏。如果确实需要，建议备份数据后重新创建 LV。
### 4.4 删除 LVM
```
# 1. 先卸载
sudo umount /data

# 2. 删除逻辑卷
sudo lvremove /dev/data_vg/data_lv

# 3. 删除卷组
sudo vgremove data_vg

# 4. 删除物理卷
sudo pvremove /dev/sdb
```

## 五、常用操作与技巧
### 5.1 临时挂载 / 卸载
```
# 挂载
sudo mount /dev/sdb1 /mnt

# 卸载(必须确保无人使用该目录！)
sudo umount /mnt
# 或
sudo umount /dev/sdb1
```
### 5.2 检查磁盘健康(SMART)
如果服务器做了 raid，用这个没法检查出来
```
# 安装工具
sudo dnf install smartmontools -y

# 查看硬盘健康状态
sudo smartctl -a /dev/sda
```
### 5.3 查找大文件(清理空间)
```
# 查找 /var 下大于 100MB 的文件
find /var -type f -size +100M -exec ls -lh {} \;

# 查找 / 下最大的 10 个文件或目录
sudo du -ah / | sort -rh | head -20
```
### 5.4 查看已删除但未释放的文件
```
lsof +L1   # 查找 deleted 但仍在使用的文件
# 重启对应进程即可释放空间
```
### 5.5 离线扩容普通分区(需卸载)
普通分区扩容需要先卸载，再重新分区，再恢复数据(操作风险较高，不推荐生产环境使用)。建议普通分区在规划时就预留足够的空间。
### 5.6 查看挂载参数
```
mount | grep /data
# 显示当前挂载的详细参数
