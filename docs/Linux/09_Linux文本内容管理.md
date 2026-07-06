文本内容管理是日常运维、开发和系统管理中最基础也最核心的技能之一。无论是查看日志、编辑配置文件、处理数据，还是自动化脚本，都离不开对文本的高效操作。
下面我将用 清晰结构 + 实用命令 + 场景化示例，带你全面掌握 Linux 文本内容管理的核心能力。

## 一、查看文本内容

### 1.1 `cat`
```
cat /etc/hosts
cat file1.txt file2.txt    # 合并多个文件输出
```
全文输出，适合小文件,大文件慎用！会刷屏。
### 1.2 `less`
```
less /var/log/syslog
```
- 按 空格：下一页
- 按 b：上一页
- 按 /：搜索关键词(如 `/error`)
- 按 q：退出
- 按 GG 跳到最后
分页查看,这是查看大日志文件的首选工具！
### 1.3 `head` / `tail`
```
head -n 10 file.txt     # 前10行
tail -n 20 file.log     # 后20行
tail -f /var/log/nginx/access.log   # 实时追踪新增内容(按 Ctrl+C 退出)
```
`tail -f` 是监控日志的神器！

## 二、编辑文本内容
### 2.1 `nano`
```
nano config.conf
```
- 底部有快捷键提示(如 `^O` = 保存，`^X` = 退出)
- 安装：新手友好型编辑器,大多数系统默认自带
### 2.2 `vim` / `vi`

```
vim script.sh
```
高效专业编辑器
- 三种模式：
- 普通模式(按 `Esc` 进入)：移动、删除、复制
- 插入模式(按 `i`)：输入文字
- 命令模式(按 `:`)：保存、退出等
- 常用命令：
- `:w` → 保存
- `:q` → 退出
- `:wq` → 保存并退出
- `:q!` → 强制退出不保存
- 初学者可运行 `vimtutor` 学习基础操作。
## 三、搜索与过滤文本
### 3.1 `grep`-文本搜索工具
```
# 在文件中找包含 "error" 的行
grep "error" /var/log/syslog

# 忽略大小写
grep -i "ERROR" file.log

# 显示行号
grep -n "timeout" config.conf

# 递归搜索目录Recursive
grep -r "password" /etc/



# 反向匹配Invert(显示不包含的行)
grep -v "success" access.log

# 匹配 fail 或 error 或 denied
grep -iE "fail|error|denied" file

# 统计匹配行数
grep -c "failed" auth.log
```
支持正则表达式(如 `grep '^[0-9]' file` 匹配以数字开头的行)
### 3.2 `awk`- 文本分析与字段提取
```
# 提取 /etc/passwd 中的用户名(第1列，: 分隔)
awk -F: '{print $1}' /etc/passwd

# 找出 CPU 使用率 > 50% 的进程(结合 top)
top -bn1 | awk 'NR>7 && $9+0 > 50 {print $12, $9"%"}'
```
### 3.3 `sed`- 批量替换、删除

```

# 将文件中所有 "old" 替换为 "new"(不修改原文件)
sed 's/old/new/g' file.txt

# 修改的时候，顺便备份文件
sed -i.bak 's/旧/新/g' 文件

# 直接修改原文件(-i 参数)
sed -i 's/old/new/g' file.txt

# 删除空行
sed '/^$/d' file.txt

# 删除注释行(以 # 开头)
sed '/^#/d' config.conf
```

使用 `-i` 前建议先备份：`cp file.txt file.txt.bak`

## 四、文本处理组合技(管道`|`是灵魂)

Linux 的强大在于命令组合，通过管道 `|` 将多个命令串联：
### 4.1 找出访问量最高的 IP

```
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -nr | head -10
```

- `awk` 提取 IP(假设在第 1 列)
- `sort` 排序
- `uniq -c` 统计重复次数
- `sort -nr` 按数字降序
- `head` 取前 10

### 4.2 实时监控含“ERROR”的日志

```
tail -f app.log | grep --color=always "ERROR"
```

### 4.3 提取配置文件中的有效行

```
grep -v "^#" config.conf | grep -v "^$"
# 或用 sed
sed -e '/^#/d' -e '/^$/d' config.conf
```

## 五、重定向与保存输出

| 符号     | 作用                |
| ------ | ----------------- |
| `>`    | 覆盖写入文件            |
| `>>`   | 追加写入文件            |
| `2>`   | 重定向错误输出           |
| `&>`   | 同时重定向标准输出和错误      |
| `2>&1` | 同时重定向标准输出和错误，老使用法 |

示例：
```
# 将 grep 结果保存到文件
grep "warning" syslog > warnings.txt

# 追加新内容
echo "New log entry" >> app.log

# 同时保存正常和错误输出
command &> output.log
```

## 六、安全与最佳实践

### 6.1 编辑重要配置前先备份：

```
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
```

### 6.2 使用 `grep` 验证再 `sed` 修改：

```
grep "Listen 80" httpd.conf      # 先确认
sed -i 's/Listen 80/Listen 8080/' httpd.conf   # 再修改
```

### 6.3 避免直接编辑正在运行的服务配置，修改后记得 reload：

```
sudo systemctl reload nginx
```

1. 大文件处理用 `less` + `grep`，不要用 `cat`。

## 七、查询文件大小命令表

| 需求                 | 推荐命令                                       |
| ------------------ | ------------------------------------------ |
| 查看单个文件大小(人类可读)     | `ls -lh filename` (常用)                     |
| 查看单个文件大小(字节数，用于脚本) | `stat -c %s filename` 或 `wc -c < filename` |
| 查看目录总大小(含子目录)      | `du -sh dirname` (常用)                      |
| 查看目录下每个子项的大小       | `du -h --max-depth=1 dirname`              |
| 按文件大小排序列出文件        | `ls -lS` 或 `ls -lhS`                       |
| 查找大文件(如 >100 MB)   | `find /path -type f -size +100M`           |

总结：怎么选

| 场景               | 命令                               |
| ---------------- | -------------------------------- |
| “这个文件多大？”        | `ls -lh 文件名`                     |
| “这个目录总共多大？”      | `du -sh 目录名`                     |
| “哪个文件最大？”        | `ls -lhS`                        |
| “找出所有 >1 GB 的日志” | `find . -name "*.log" -size +1G` |
| 写脚本需要精确字节数       | `stat -c %s 文件名`                 |

## 八、速查表

| 需求     | 命令                                 |
| ------ | ---------------------------------- |
| 查看小文件  | `cat file`                         |
| 查看大文件  | `less file`                        |
| 实时看日志  | `tail -f log`                      |
| 搜索关键词  | `grep "word" file`                 |
| 替换文本   | `sed -i 's/old/new/g' file`        |
| 提取列    | `awk -F: '{print $1}' /etc/passwd` |
| 编辑文件   | `nano file`(新手)或 `vim file`(进阶)    |
| 保存命令输出 | `command > output.txt`             |

## 九、总结
Linux 文本管理的核心思想是：
- 查看 → `cat` / `less` / `tail` / `head`
- 搜索 → `grep`
- 提取 → `awk`
- 修改 → `sed` / 编辑器
- 组合 → 管道 `|`
- 保存 → 重定向 `>`
- 记住：不要手动逐行修改大文件，用 `sed`、`awk` 自动化处理！
```
0 = 标准输入(键盘)
1 = 标准输出(正常打印)
2 = 标准错误(报错)

>   覆盖写入文件(只针对 1)
>>  追加写入文件(只针对 1)
2>  覆盖写入错误
2>> 追加写入错误
&>  全部覆盖
&>> 全部追加

2>&1  错误也送到 1 那里去(合并)
&     后台运行
|     管道(前一个输出给后一个)
```