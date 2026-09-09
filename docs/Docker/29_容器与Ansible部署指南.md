## 一、Ansible 管理容器作用
### 1.1 容器环境的管理痛点
当你从单机 Docker 扩展到多台服务器时，会遇到以下问题：

|痛点|说明|
|---|---|
|重复劳动|每台服务器都要手动安装 Docker、配置 daemon.json、创建用户|
|环境不一致|不同服务器的 Docker 版本、配置可能不同|
|部署效率低|每台服务器都要手动执行 `docker run` 或 `docker compose up` |
|回滚困难|没有统一的版本管理，出问题时难以快速回滚|
|缺乏审计|手动操作无法追溯，难以满足合规要求|
### 1.2 Ansible 用处
Ansible 是一款自动化运维工具，通过 YAML 格式的 Playbook(剧本)在远程服务器上执行任务。

Ansible 管理容器的核心价值：

|价值|说明|
|---|---|
|批量操作|一次 Playbook 执行，同时操作数十台服务器|
|幂等性|多次执行同一 Playbook，结果始终一致，不会重复已完成的任务|
|声明式配置|告诉 Ansible“最终状态是什么”，它会自动判断如何达到|
|无代理架构|只需 SSH 和 Python，不需要在目标机器安装 Agent|
|版本可控|Playbook 可以提交到 Git，实现配置的版本管理|
### 1.3 Ansible 的定位

|层级|工具|职责|
|---|---|---|
|基础设施层|Ansible|批量初始化服务器(安装 Docker、配置内核、设置防火墙)|
|容器编排层|Docker Compose / K3s|单机或多机的容器编排|
|监控观测层|Prometheus + Grafana + Loki|监控和日志采集|
Ansible 做的事情是：把“装系统、配网络、安 Docker”这些重复劳动自动化，让你把精力放在业务容器本身。
-- -
## 二、Ansible 基础
### 2.1 安装 Ansible
在 Rocky Linux 8 上安装 Ansible：
```bash
# 安装 EPEL 仓库(Ansible 在 EPEL 中)
sudo dnf install -y epel-release

# 安装 Ansible
sudo dnf install -y ansible

# 验证安装
ansible --version
```
命令解释：
- `epel-release`：Extra Packages for Enterprise Linux，提供了 Rocky Linux 官方仓库之外的软件包。
- `ansible --version`：显示 Ansible 版本信息，确认安装成功。
通过 pip 安装(可选，获取更新版本) ：
```bash
# 安装 pip
sudo dnf install -y python3-pip

# 使用 pip 安装 Ansible
pip3 install --user ansible

# 将 ~/.local/bin 添加到 PATH
echo 'export PATH=$PATH:~/.local/bin' >> ~/.bashrc
source ~/.bashrc
```
### 2.2 Ansible 的核心概念
| 概念            | 说明              | 类比   |
| ------------- | --------------- | ---- |
| Inventory(清单) | 定义要管理的主机列表      | 通讯录  |
| Playbook(剧本)  | 定义要执行的任务序列      | 操作手册 |
| Module(模块)    | 执行具体操作的工具       | 工具函数 |
| Task(任务)      | Playbook 中的一个步骤 | 操作步骤 |
| Role(角色)      | 一组相关任务的集合       | 职能分工 |
### 2.3 测试 Ansible 是否正常工作
```bash
# 创建一个简单的清单文件
echo "localhost ansible_connection=local" > inventory.ini

# 测试连通性
ansible -i inventory.ini all -m ping
```
命令解释：
- `-i inventory.ini`：指定清单文件。
- `all`：对清单中的所有主机执行。
- `-m ping`：使用 ping 模块测试连通性。
-- -
## 三、用 Ansible 安装和配置 Docker
### 3.1 编写 Playbook 安装 Docker
以下 Playbook 可以在 Rocky Linux 8 服务器上自动安装 Docker。
```yaml
---
- name: 安装和配置 Docker(Rocky Linux 8 / 国内优化版)
  hosts: all
  become: yes
  tasks:
    # ============================================================
    # 1. 安装系统依赖包
    # ============================================================
    - name: 安装必要依赖
      dnf:
        name:
          - dnf-utils
          - device-mapper-persistent-data
          - lvm2
        state: present

    # ============================================================
    # 2. 添加 Docker 国内镜像源(阿里云)
    # ============================================================
    - name: 添加 Docker CE 仓库(阿里云镜像)
      yum_repository:
        name: docker-ce
        description: Docker CE Repository(阿里云)
        baseurl: https://mirrors.aliyun.com/docker-ce/linux/centos/$releasever/$basearch/stable
        gpgcheck: yes
        gpgkey: https://mirrors.aliyun.com/docker-ce/linux/centos/gpg

    # ============================================================
    # 3. 安装 Docker 引擎及插件
    # ============================================================
    - name: 安装 Docker 引擎
      dnf:
        name:
          - docker-ce
          - docker-ce-cli
          - containerd.io
          - docker-buildx-plugin
          - docker-compose-plugin
        state: present

    # ============================================================
    # 4. 启动 Docker 并设置开机自启
    # ============================================================
    - name: 启动并启用 Docker 服务
      systemd:
        name: docker
        state: started
        enabled: yes

    # ============================================================
    # 5. 将当前用户加入 docker 组(免 sudo 执行 docker 命令)
    # ============================================================
    - name: 将运维用户加入 docker 组
      user:
        name: "{{ ansible_user }}"
        groups: docker
        append: yes

    # ============================================================
    # 6. 配置 Docker daemon.json
    #    - 镜像加速器(国内多源备份)
    #    - 日志轮转(防止磁盘占满)
    #    - live-restore(Docker 重启时容器不中断)
    #    - userland-proxy(禁用用户态代理，提升网络性能)
    # ============================================================
    - name: 创建 Docker 配置目录
      file:
        path: /etc/docker
        state: directory
        mode: '0755'

    - name: 配置 Docker daemon.json
      copy:
        dest: /etc/docker/daemon.json
        content: |
          {
            "registry-mirrors": [
              "https://docker.m.daocloud.io",
              "https://docker.1ms.run",
              "https://docker.mirrors.ustc.edu.cn"
            ],
            "log-driver": "json-file",
            "log-opts": {
              "max-size": "10m",
              "max-file": "3"
            },
            "live-restore": true,
            "userland-proxy": false
          }
        mode: '0644'
      notify: restart docker

  # ============================================================
  # Handlers：当配置变化时自动重启 Docker
  # ============================================================
  handlers:
    - name: restart docker
      systemd:
        name: docker
        state: restarted
```
Playbook 逐行解释：

|部分|说明|
|---|---|
| `hosts: all` |对清单中的所有服务器执行|
| `become: yes` |使用 sudo 提权执行|
| `dnf` 模块|Rocky Linux 的包管理模块，安装软件包|
| `yum_repository` 模块|添加软件仓库|
| `systemd` 模块|管理 systemd 服务|
| `user` 模块|管理用户和组|
| `copy` 模块|复制文件到目标服务器|
| `handlers` |当任务触发 `notify` 时执行(如重启 Docker)|
### 3.2 执行 Playbook
```bash
# 创建清单文件(列出要管理的服务器)
cat > inventory.ini << 'EOF'
[docker_servers]
192.168.100.231 ansible_user=fmc
192.168.100.232 ansible_user=fmc
EOF

# 执行 Playbook
ansible-playbook -i inventory.ini install-docker.yml
```
命令解释：
- `ansible-playbook`：执行 Playbook 的命令。
- `-i inventory.ini`：指定清单文件。
- `install-docker.yml`：Playbook 文件名。
### 3.3 验证 Docker 安装
```bash
# 在远程服务器上执行命令
ansible -i inventory.ini docker_servers -m shell -a "docker --version"
```
命令解释：
- `-m shell`：使用 shell 模块执行命令。
- `-a "docker --version"`：要执行的命令。
-- -
## 四、用 Ansible 管理 Docker 容器
### 4.1 使用 docker_container 模块
Ansible 提供了 `community.docker.docker_container` 模块，可以管理容器的完整生命周期。
安装 Docker 模块集合：
```bash
# 安装 community.docker 集合
ansible-galaxy collection install community.docker
```
命令解释：
- ansible-galaxy：Ansible 的集合管理命令。
- collection install community.docker：安装 Docker 相关的模块集合。
Playbook 示例：启动一个 Nginx 容器：
```yaml
---
- name: 管理 Docker 容器
  hosts: docker_servers
  become: yes
  tasks:
    - name: 拉取 Nginx 镜像
      community.docker.docker_image:
        name: nginx:1.26-alpine
        source: pull

    - name: 创建并启动 Nginx 容器
      community.docker.docker_container:
        name: web
        image: nginx:1.26-alpine
        state: started
        restart_policy: unless-stopped
        ports:
          - "8080:80"
        env:
          TZ: "Asia/Shanghai"
        volumes:
          - /data/nginx/html:/usr/share/nginx/html:ro
        healthcheck:
          test: ["CMD", "curl", "-f", "http://localhost/"]
          interval: 30s
          timeout: 3s
          retries: 3
```
模块参数解释：

|参数|说明|
|---|---|
| `community.docker.docker_image` |管理镜像的模块|
| `source: pull` |从仓库拉取镜像|
| `community.docker.docker_container` |管理容器的模块|
| `state: started` |容器状态(started / stopped / absent)|
| `restart_policy` |重启策略，对应 `--restart` |
| `ports` |端口映射，对应 `-p` |
| `env` |环境变量，对应 `-e` |
| `volumes` |数据卷挂载，对应 `-v` |
| `healthcheck` |健康检查配置|
### 4.2 使用 docker_compose_v 2 模块
对于多容器应用，推荐使用 community.docker.docker_compose_v2 模块，它具备更好的幂等性和可读性。
Playbook 示例：部署 Compose 项目：
```yaml
---
- name: 部署 Docker Compose 应用
  hosts: docker_servers
  become: yes
  tasks:
    # 1. 创建项目目录
    - name: 创建应用目录
      file:
        path: /opt/myapp
        state: directory
        mode: '0755'

    # 2. 复制 Compose 文件
    - name: 复制 docker-compose.yml
      copy:
        src: ./docker-compose.yml
        dest: /opt/myapp/docker-compose.yml
        mode: '0644'

    # 3. 复制 .env 文件
    - name: 复制 .env 文件
      copy:
        src: ./env.production
        dest: /opt/myapp/.env
        mode: '0600'

    # 4. 启动 Compose 服务
    - name: 启动 Docker Compose 服务
      community.docker.docker_compose_v2:
        project_src: /opt/myapp
        state: present
        pull: always
```
模块参数解释：

|参数|说明|
|---|---|
| `project_src` |包含 `docker-compose.yml` 的目录|
| `state: present` |确保服务运行(present / absent)|
| `pull: always` |启动前总是拉取最新镜像|
### 4.3 使用 command 模块运行 Docker 命令
如果 Docker 模块不可用，也可以使用 `command` 模块直接执行 Docker 命令。
```yaml
---
- name: 使用 command 模块管理容器
  hosts: docker_servers
  become: yes
  tasks:
    - name: 运行 Docker 命令
      command:
        cmd: docker run -d --name web -p 8080:80 nginx:1.26-alpine
      register: result

    - name: 显示命令输出
      debug:
        var: result.stdout
```
命令解释：
- `command` 模块：在远程主机上执行命令。
- `register: result`：将命令输出保存到变量 `result`。
- `debug` 模块：打印变量的值，用于调试。
-- -
## 五、用 Ansible 部署 K 3 s 集群
### 5.1 K 3 s 部署的复杂度
手动部署 K 3 s 集群需要在多台服务器上执行以下操作：

|步骤|操作|
|---|---|
|1|设置主机名和 hosts 解析|
|2|关闭 Swap(K 3 s 要求)|
|3|配置内核参数(`net.bridge.bridge-nf-call-iptables`)|
|4|安装 Docker 或 containerd|
|5|安装 K 3 s(server 或 agent 模式)|
|6|配置 kubeconfig|
|7|安装网络插件(如 Flannel、Calico)|
用 Ansible 可以将上述所有步骤自动化。
### 5.2 使用社区 K 3 s 角色
社区提供了成熟的 K 3 s Ansible 角色，可以直接使用。
```bash
# 安装 K3s Ansible 角色
ansible-galaxy install PyratLabs.ansible-role-k3s
```
### 5.3 编写 K 3 s 部署 Playbook
```yaml
---
- name: 部署 K3s 集群
  hosts: k3s_servers
  become: yes
  vars:
    # K3s 版本
    k3s_version: v1.28.0+k3s1
    # Server 节点列表
    k3s_server_manifests_urls:
      - https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
    # 集群令牌
    k3s_token: "your-cluster-token-here"

  tasks:
    # 1. 关闭 Swap
    - name: 关闭 Swap
      command: swapoff -a
      when: ansible_swaptotal_mb > 0

    - name: 永久禁用 Swap
      replace:
        path: /etc/fstab
        regexp: '^([^#].*?swap.*)$'
        replace: '# \1'

    # 2. 设置内核参数
    - name: 配置内核参数
      sysctl:
        name: "{{ item.name }}"
        value: "{{ item.value }}"
        state: present
        reload: yes
      loop:
        - { name: net.bridge.bridge-nf-call-iptables, value: 1 }
        - { name: net.ipv4.ip_forward, value: 1 }

    # 3. 安装 K3s(使用社区角色)
    - name: 安装 K3s
      include_role:
        name: PyratLabs.ansible-role-k3s

    # 4. 等待集群就绪
    - name: 等待 K3s 集群就绪
      command: kubectl get nodes
      register: result
      until: result.stdout.find("NotReady") == -1
      retries: 30
      delay: 10
      changed_when: false
```
### 5.4 执行 K 3 s 部署
```bash
# 创建清单文件
cat > inventory-k3s.ini << 'EOF'
[k3s_master]
192.168.100.231 ansible_user=fmc

[k3s_worker]
192.168.100.232 ansible_user=fmc
192.168.100.233 ansible_user=fmc

[k3s_servers:children]
k3s_master
k3s_worker
EOF

# 执行部署
ansible-playbook -i inventory-k3s.ini deploy-k3s.yml
```
### 5.5 验证 K 3 s 集群
```bash
# 在 master 节点上查看集群状态
ansible -i inventory-k3s.ini k3s_master -m shell -a "kubectl get nodes"
```
-- -
## 六、Ansible 与 CI/CD 集成
### 6.1 在 GitLab CI 中使用 Ansible
在 GitLab CI 流水线中调用 Ansible Playbook，实现自动化部署。
```yaml
# .gitlab-ci.yml
deploy:
  stage: deploy
  image: rockylinux:8
  before_script:
    - dnf install -y ansible
  script:
    - ansible-playbook -i inventory.ini deploy.yml
  only:
    - main
```
### 6.2 在 Jenkins 中使用 Ansible
Jenkins Pipeline 中调用 Ansible：
```groovy
pipeline {
    agent any
    stages {
        stage('Deploy with Ansible') {
            steps {
                sh '''
                    ansible-playbook -i inventory.ini deploy.yml
                '''
            }
        }
    }
}
```
-- -
## 七、Ansible 与容器的生产实践
### 7.1 推荐的目录结构
```text
/opt/ansible/
├── inventory/                 # 清单文件
│   ├── production.ini         # 生产环境
│   ├── staging.ini            # 预发布环境
│   └── group_vars/            # 分组变量
│       ├── all.yml
│       └── docker_servers.yml
├── roles/                     # 角色
│   ├── docker/                # Docker 安装角色
│   │   ├── tasks/
│   │   │   └── main.yml
│   │   └── vars/
│   │       └── main.yml
│   └── app/                   # 应用部署角色
│       └── tasks/
│           └── main.yml
├── playbooks/                 # 剧本
│   ├── site.yml               # 主剧本
│   ├── deploy-app.yml         # 部署应用
│   └── update-docker.yml      # 更新 Docker
└── ansible.cfg                # Ansible 配置文件
```
### 7.2 生产环境最佳实践
|实践|说明|
|---|---|
|使用 Vault 加密敏感信息|`ansible-vault encrypt secrets.yml` 加密密码和密钥|
|分环境管理|使用不同的 inventory 文件区分开发、测试、生产环境|
|使用 Roles 组织代码|将 Docker 安装、应用部署拆分为独立的 Role|
|幂等性验证|多次执行 Playbook，结果应始终一致[](https://spacelift.io/blog/ansible-docker?utm_source=hubspot&utm_medium=email&utm_campaign=fy25%20-%20always-on%20-%20linkedin%20-%20newsletter%20-%20mission%20infrastructure&utm_content=mission%20infrastructure%20newsletter%20-%20january%20edition%202026&_hsenc=p2ANqtz-80Xr7WWvCLMB6DNIyarTpd74K0EODIacbGmu6-Sta-QJMKlw2MDpScB4hpkXxPye9godgF)|
|版本控制|所有 Playbook 提交到 Git 仓库|
|先 dry-run 再执行|`ansible-playbook --check` 预览变更|
### 7.3 常用 Ansible 命令速查
| 操作          | 命令                                           | 说明                 |
| ----------- | -------------------------------------------- | ------------------ |
| 测试连通性       | `ansible all -m ping`                        | 测试所有主机的 SSH 连通性    |
| 执行单个命令      | `ansible all -m shell -a "docker ps"`        | 在所有主机上执行 Docker 命令 |
| 执行 Playbook | `ansible-playbook -i inventory.ini site.yml` | 执行剧本               |
| 预览变更        | `ansible-playbook --check site.yml`          | 只预览不执行             |
| 加密文件        | `ansible-vault encrypt secrets.yml`          | 加密敏感信息             |
| 解密文件        | `ansible-vault decrypt secrets.yml`          | 解密敏感信息             |
-- -
## 八、总结
Ansible 与 Docker/K 3 s 的结合，实现了从“手动部署”到“自动化编排”的跨越。以下是核心要点：
1. Ansible 的定位：
    - 不是替代 Docker Compose 或 K 3 s，而是补充。
    - Ansible 负责“基础设施自动化”(装 Docker、配系统、初始化集群)。
    - Compose/K 3 s 负责“应用编排”(跑容器、管理服务)。
2. 核心模块：
    - `community.docker.docker_container`：管理单个容器。
    - `community.docker.docker_compose_v2`：管理 Compose 项目。
    - 社区 K 3 s 角色：自动化部署 K 3 s 集群。
3. 生产实践：
    - 所有 Playbook 提交 Git，实现配置版本控制。
    - 使用 `ansible-vault` 加密敏感信息。
    - 分环境管理 inventory。
    - 先 `--check` 预览，再实际执行。