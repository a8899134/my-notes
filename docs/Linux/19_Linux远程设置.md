## 一、SSH连接

通过加密通道远程登录 Linux 服务器，执行命令，是最基础、最常用的方式。

- **常用工具**：

- Linux/macOS 终端：直接使用 ssh 命令，例如：ssh 用户名@服务器 IP(首次连接需确认密钥，输入服务器密码即可登录)
```
ssh 用户名@服务器IP
```
- Windows：可使用**WindTerm**(开源软件) 、**Tabby**、**Xshell**、**FinalShell** 等图形化工具，输入 IP、端口(默认 22)、用户名和密码即可连接。

- **进阶**：配置 SSH 密钥登录(免密码)，更安全便捷。

## 二、VNC连接

- 若需要远程操作 Linux 的图形化桌面，常用方案：

- **VNC(Virtual Network Computing)**：需在服务器安装 VNC 服务(如 vncserver)，客户端使用 VNC Viewer 连接。
- **XRDP**：基于 Windows 远程桌面协议(RDP)，Linux 服务器安装 xrdp 后，可直接用 Windows 自带的 “远程桌面连接” 工具连接。
- 工具推荐：RealVNC、TightVNC、Remmina(Linux 客户端)。

## 三、文件传输

- 远程连接时如需传输文件，常用工具：
- **SCP**：基于 SSH 的命令行文件传输，例如：scp 本地文件 用户名@服务器 IP:目标路径(上传)scp 用户名@服务器 IP:远程文件 本地路径(下载)。
- **SFTP 工具**：图形化工具如 FileZilla、WinSCP，通过 SSH 协议传输文件，操作类似 FTP。

## 四、注意事项

- 确保服务器开启了对应服务(如 SSH 默认端口 22，需在防火墙允许该端口)。
- 生产环境中，建议禁用密码登录，改用 SSH 密钥，并修改默认端口提高安全性。