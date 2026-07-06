掌握文件管理是使用系统的基础核心技能。Linux 一切皆文件(包括硬件、进程、网络连接等)，因此理解如何查看、创建、移动、复制、删除、查找文件和目录，是你迈向熟练使用 Linux 的关键一步。
下面我将从 零基础出发，用清晰的结构、通俗的语言和大量实用示例，带你全面掌握 Linux 文件管理。

## 一、Linux 文件系统结构
Linux 没有 C:\、D:\ 盘符，而是一棵倒置的树，根目录是 `/`。
常见目录含义(必须了解)：

| 目录              | 作用                                    |
| --------------- | ------------------------------------- |
| `/`             | 根目录，所有文件的起点                           |
| `/home`         | 普通用户的家目录(如 `/home/yourname`)          |
| `/root`         | root 用户的家目录                           |
| `/etc`          | 系统配置文件(如网络、服务配置)                      |
| `/var`          | 经常变动的文件(日志 `/var/log`、邮件、数据库)         |
| `/tmp`          | 临时文件(重启后清空)                           |
| `/usr`          | 用户程序和只读数据(类似 Windows 的 Program Files) |
| `/bin`, `/sbin` | 系统基本命令(如 `ls`, `cp`, `reboot`)        |
| `/dev`          | 设备文件(硬盘、键盘等，一切皆文件！)                   |
| `/proc`         | 虚拟文件系统，反映内核和进程信息                      |

说明：你的工作区通常是 `/home/用户名`

## 二、核心命令详解

### 2.1 `pwd` - 所在目录

```
$ pwd
/home/yourname
```

### 2.2 `ls` - 列出目录内容

```
ls                # 列出当前目录文件(不显示隐藏文件)
ls -l             # 详细列表(权限、大小、修改时间)
ls -a             # 显示所有文件(包括 . 开头的隐藏文件)
ls -lh            # 人类可读的文件大小(如 1.2K, 3.5M)
ls /etc           # 列出 /etc 目录内容
```

### 2.3 `cd` - 切换目录

```
cd /etc           # 进入 /etc
cd ..             # 返回上一级目录
cd ～              # 回到自己的家目录(等价于 cd)
cd -              # 切换到上一次所在的目录
cd /              # 进入根目录
```

### 2.4 `mkdir` - 创建目录

```
mkdir mydir               # 创建 mydir 目录
mkdir -p a/b/c            # 递归创建多级目录(即使 a、b 不存在)
```

### 2.5 `touch` - 创建空文件或更新文件时间戳

```
touch file.txt        # 创建空文件 file.txt
touch *.log           # 更新所有 .log 文件的修改时间为当前时间
```

### 2.6 `cp` - 复制文件或目录

```
cp file1.txt file2.txt        # 复制文件
cp file.txt /backup/          # 复制到 /backup 目录
cp -r dir1/ dir2/             # 递归复制整个目录(-r = recursive)
cp -i file.txt newfile.txt    # 覆盖前询问(-i = interactive)
```

重要：复制目录必须加 `-r`！

### 2.7 `mv` - 移动或重命名

```
mv oldname.txt newname.txt    # 重命名
mv file.txt /backup/          # 移动文件
mv dir1/ dir2/                # 移动目录(也可用于重命名目录)
```

### 2.8 `rm` - 删除文件或目录

```
rm file.txt           # 删除文件
rm -i file.txt        # 删除前确认(推荐！)
rm -r dir/            # 递归删除目录及内容
rm -rf dir/           # 强制删除(不提示！慎用！)
```

### 2.9 `cat` / `less` / `head` / `tail` -查看文件内容

| 命令                          | 用途                      |
| --------------------------- | ----------------------- |
| `cat file.txt`              | 一次性输出全部内容(适合小文件)        |
| `less file.log`             | 分页查看大文件(按空格翻页，q 退出)✅ 推荐 |
| `head -n 10 file`           | 查看前 10 行                |
| `tail -n 20 file`           | 查看后 20 行                |
| `tail -f /var/log/messages` | 实时追踪日志(按 Ctrl+C 退出)     |

### 2.10 `find` / `grep` - 查找文件和内容

`find`：按名称、类型、时间等找文件

```
find /home -name "*.txt"        # 在 /home 下找所有 .txt 文件
find . -type d                  # 找当前目录下所有子目录(d=directory)
find /var/log -mtime -7         # 找最近7天修改过的文件
```

`grep`：在文件中搜索文本

```
grep "error" /var/log/syslog    # 在日志中找包含 "error" 的行
grep -r "password" /etc/        # 递归搜索 /etc 下所有文件
grep -i "ERROR" file.log        # 忽略大小写(-i)
```

## 三、文件权限管理

每个文件都有所有者(user)、所属组(group)、其他人(others) 三类权限。

权限表示：

- `r` = read(读)
- `w` = write(写)
- `x` = execute(执行)

### 3.1 查看权限

```
ls -l file.txt
# 输出示例：-rw-r--r-- 1 user group 1024 Jan 1 10:00 file.txt
# 第一个 '-' 表示普通文件(d=目录，l=链接)
# rw- r-- r-- → user: rw-, group: r--, others: r--
```

### 3.2 修改权限

```
chmod 755 script.sh     # 数字法：7=rwx, 5=rx
chmod u+x script.sh     # 符号法：给所有者加执行权限
```

### 3.3 修改所有者

```
chown user:group file.txt   # 同时改用户和组
chown user file.txt         # 只改用户
```

## 四、路径概念

绝对路径 vs 相对路径

| 类型   | 示例                         | 说明               |
| ---- | -------------------------- | ---------------- |
| 绝对路径 | `/home/user/docs/file.txt` | 从根目录 `/` 开始，完整路径 |
| 相对路径 | `docs/file.txt`            | 从当前目录开始          |
| 相对路径 | `../config.conf`           | `..` 表示上一级目录     |

建议：脚本中尽量用绝对路径，避免出错。

## 五、实用技巧与最佳实践

### 5.1 使用 Tab 键自动补全
输入 `cd /ho` + 按 `Tab` → 自动补全为 `/home/`
### 5.2 历史命令
按 ↑ ↓ 键浏览历史命令，或用 `history` 查看
### 5.3 通配符(Wildcard)
- `*` 匹配任意字符：`rm *.tmp`
- `?` 匹配单个字符：`ls file?.txt` → file 1.txt, fileA.txt
### 5.4 安全操作习惯
- 删除前先 `ls` 确认
- 重要操作前备份：`cp important.conf important.conf.bak`
- 使用 `rm -i` 代替 `rm`

## 六、新手速查表

| 操作     | 命令                                |
| ------ | --------------------------------- |
| 查看当前位置 | `pwd`                             |
| 列出文件   | `ls -lh`                          |
| 进入目录   | `cd dirname`                      |
| 创建目录   | `mkdir -p my/project`             |
| 创建空文件  | `touch note.txt`                  |
| 复制文件   | `cp file.txt backup/`             |
| 移动/重命名 | `mv old.txt new.txt`              |
| 删除文件   | `rm -i file.txt`                  |
| 查看文件   | `less bigfile.log`                |
| 搜索文件   | `find / -name "nginx.conf"`       |
| 搜索内容   | `grep "failed" /var/log/auth.log` |

## 七、总结
Linux 文件管理的核心就是：
- 知道你在哪(`pwd`)
- 知道有什么(`ls`)
- 能去想去的地方(`cd`)
- 能安全地增删改查(`mkdir`, `cp`, `mv`, `rm`, `cat`)
记住：Linux 没有“回收站”，操作前请三思！多用 `-i` 参数，养成备份习惯。