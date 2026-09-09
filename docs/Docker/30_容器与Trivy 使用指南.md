## 一、Trivy 概念
### 1.1 Trivy 简介
Trivy 是一款由 Aqua Security 开源的综合性安全扫描工具，专为容器和云原生环境设计。

Trivy 的名字含义：Trivy 是 “tri(三)” 和 “vy(视觉)” 的组合词，寓意从多个维度“看见”安全问题。

Trivy 的核心能力：

|扫描目标|能发现什么|
|---|---|
|容器镜像(Container Image)|OS 软件包漏洞(CVE)、应用依赖漏洞|
|文件系统(Filesystem)|代码仓库中的依赖漏洞、硬编码密钥|
|Git 仓库(Repository)|远程仓库的依赖安全问题|
|IaC 文件(Infrastructure as Code)|Dockerfile、Kubernetes、Terraform 等配置错误|
|Kubernetes 集群|集群配置安全问题|
|虚拟机镜像|VM 镜像中的漏洞|
Trivy 的特点：

|特点|说明|
|---|---|
|速度快|扫描一个镜像通常只需几秒到几十秒|
|无依赖|不需要安装数据库或额外库，开箱即用|
|覆盖面广|支持多种语言(Go、Python、Node.js、Java、Rust 等)|
|CI/CD 友好|支持 GitHub Actions、GitLab CI、Jenkins 等|
|输出格式丰富|支持 JSON、SARIF、CycloneDX、SPDX 等|
### 1.2 Trivy 作用
在生产环境中，容器镜像可能包含已知漏洞(CVE)，这些漏洞可能被攻击者利用。

|风险来源|说明|
|---|---|
|基础镜像漏洞|官方镜像也可能包含未修复的漏洞|
|应用依赖漏洞|引入的第三方库可能存在已知安全问题|
|配置错误|Dockerfile 中的不安全配置(如以 root 运行、使用 latest 标签)|
|敏感信息泄露|镜像中可能硬编码了密钥或密码|
Trivy 的作用：在镜像部署到生产环境之前，自动扫描并报告这些安全问题，帮助你在漏洞被利用之前修复它们。
-- -
## 二、安装 Trivy
### 2.1 安装 Trivy 
1. 使用 RPM 包直接安装(推荐)
```bash
# 下载最新版本的 RPM 包
sudo rpm -ivh https://github.com/aquasecurity/trivy/releases/latest/download/trivy_*_Linux-64bit.rpm
```
命令解释：
- `rpm -ivh`：安装 RPM 包，`-i` 表示安装，`-v` 显示详细信息，`-h` 显示进度条。
- `*` 通配符会自动匹配版本号，确保下载最新版本。

2. 使用官方 YUM 仓库(推荐)
```bash
# 添加 Trivy 官方仓库
RELEASE_VERSION=$(grep -Po '(?<=VERSION_ID=")[0-9]' /etc/os-release)
sudo tee /etc/yum.repos.d/trivy.repo << EOF
[trivy]
name=Trivy repository
baseurl=https://aquasecurity.github.io/trivy-repo/rpm/releases/$RELEASE_VERSION/\$basearch/
gpgcheck=1
enabled=1
gpgkey=https://aquasecurity.github.io/trivy-repo/rpm/public.key
EOF

# 更新并安装
sudo dnf update -y
sudo dnf install -y trivy
```
命令解释：
- `RELEASE_VERSION=$(grep -Po '(?<=VERSION_ID=")[0-9]' /etc/os-release)`：从 `/etc/os-release` 中提取 Rocky Linux 的主版本号(如 8)。
- `tee /etc/yum.repos.d/trivy.repo`：创建 Trivy 的 YUM 仓库配置文件。

3. 使用安装脚本(最简单)
```bash
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
```
命令解释：
- `curl -sfL`：静默下载安装脚本，`-s` 静默模式，`-f` 失败时不输出，`-L` 跟随重定向。
- `sh -s -- -b /usr/local/bin`：执行安装脚本，`-b` 指定二进制文件的安装目录。
### 2.2 验证安装
```bash
# 查看 Trivy 版本
trivy --version
```
如果看到版本信息，说明安装成功。
### 2.3 更新漏洞数据库
Trivy 首次运行时会自动下载漏洞数据库(约 100-200 MB)，存放在 `~/.cache/trivy/` 目录下。
```bash
# 手动更新漏洞数据库
trivy image --download-db-only
```
命令解释：
- `--download-db-only`：只下载漏洞数据库，不执行扫描。
-- -
## 三、扫描容器镜像
### 3.1 基础扫描
```bash
# 扫描本地镜像
trivy image nginx:1.26-alpine

# 扫描远程镜像(无需先 pull)
trivy image alpine:3.18
```
命令解释：
- `trivy image`：对容器镜像进行漏洞扫描。
- 如果不指定标签，默认扫描 `latest` 版本。
输出解读：

|列|说明|
|---|---|
|库(Library)|存在漏洞的软件包名称|
|漏洞(Vulnerability)|CVE 编号(如 CVE-2023-12345)|
|严重程度(Severity)|CRITICAL / HIGH / MEDIUM / LOW|
|已修复版本(Fixed Version)|修复该漏洞的版本号|
|状态(Status)|是否有可用修复|
### 3.2 按严重程度过滤
```bash
# 只显示高危和严重漏洞
trivy image --severity HIGH,CRITICAL nginx:1.26-alpine
```
命令解释：
- `--severity HIGH,CRITICAL`：只显示严重程度为 HIGH 和 CRITICAL 的漏洞。
### 3.3 忽略未修复的漏洞
有些漏洞可能还没有官方修复版本，可以选择忽略它们。
```bash
trivy image --ignore-unfixed nginx:1.26-alpine
```
命令解释：
- `--ignore-unfixed`：只显示已有修复版本的漏洞，忽略尚未修复的。
### 3.4 输出 JSON 格式报告
```bash
# 输出 JSON 格式，便于脚本处理
trivy image -f json -o report.json nginx:1.26-alpine
```
命令解释：
- `-f json`：指定输出格式为 JSON。
- `-o report.json`：将结果保存到 `report.json` 文件。
### 3.5 扫描 tar 归档文件
如果只有镜像的 tar 文件(如离线环境导出的镜像)：
```bash
trivy image --input ruby-3.1.tar
```
命令解释：
- `--input`：从 tar 文件读取镜像进行扫描。
### 3.6 CI/CD 集成：扫描失败时退出
```bash
# 发现 CRITICAL 漏洞时返回非零退出码(导致 CI 失败)
trivy image --exit-code 1 --severity CRITICAL nginx:1.26-alpine
```
命令解释：
- `--exit-code 1`：发现漏洞时返回退出码 1，可用于 CI/CD 流水线阻断。
-- -
## 四、扫描文件系统(Filesystem)
### 4.1 文件系统扫描概念
文件系统扫描可以直接分析项目目录中的依赖文件(如 package.json、go.mod、requirements.txt 等)，在构建镜像之前就能发现依赖漏洞。
```bash
# 扫描当前目录
trivy fs .

# 扫描指定目录
trivy fs /path/to/project
```
命令解释：
- `trivy fs`：对本地文件系统进行扫描。
- Trivy 会自动识别项目中的依赖文件并分析其漏洞。
### 4.2 限制严重程度
```bash
trivy fs --severity CRITICAL,HIGH .
```
### 4.3 指定扫描器类型
```bash
# 只扫描漏洞和密钥
trivy fs --scanners vuln,secret .

# 扫描漏洞、密钥和配置问题
trivy fs --scanners vuln,secret,config .
```
命令解释：
- `--scanners`：指定要运行的扫描器类型。
- 可用扫描器：`vuln`(漏洞)、`secret`(密钥)、`config`(配置问题)。
-- -
## 五、扫描 IaC 配置(Infrastructure as Code)
### 5.1 扫描 Dockerfile
```bash
# 扫描 Dockerfile 中的配置问题
trivy config Dockerfile
```
常见发现：
- 以 root 用户运行容器。
- 使用 latest 标签。
- 缺少 HEALTHCHECK。
- 暴露了不必要的端口。
### 5.2 扫描 Kubernetes 清单
```bash
# 扫描 K8s YAML 文件
trivy config k8s/

# 扫描指定文件
trivy config deployment.yaml
```
常见发现：
- 容器以 root 运行。
- 缺少资源限制(CPU/内存)。
- 缺少 securityContext。
- 根文件系统可写。
### 5.3 扫描 Terraform 配置
```bash
trivy config ./terraform
```
Trivy 会自动检测 Terraform 文件并应用相应的安全策略。
-- -
## 六、生成 SBOM(软件物料清单)
SBOM(Software Bill of Materials)列出了镜像中包含的所有软件组件，便于审计和合规管理。
```bash
# 生成 SPDX 格式的 SBOM
trivy image --format spdx-json -o sbom.spdx.json nginx:1.26-alpine

# 生成 CycloneDX 格式的 SBOM
trivy image --format cyclonedx -o sbom.cdx.json nginx:1.26-alpine
```
命令解释：
- `--format spdx-json` 或 `cyclonedx`：指定 SBOM 格式。
- `-o`：指定输出文件名。
SBOM 的用途：
- 满足合规要求(如美国行政命令 EO 14028)。
- 便于漏洞溯源(知道哪些组件存在漏洞)。
- 供应链安全管理。
-- -
## 七、CI/CD 集成
### 7.1 GitHub Actions 集成
```yaml
name: Security Scan
on: [push, pull_request]

jobs:
  trivy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: 构建镜像
        run: docker build -t myapp:${{ github.sha }} .

      - name: Trivy 漏洞扫描
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: myapp:${{ github.sha }}
          format: sarif
          output: trivy-results.sarif
          severity: HIGH,CRITICAL
          exit-code: 1

      - name: 上传扫描结果到 GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-results.sarif
```
配置解释：
- `aquasecurity/trivy-action`：Trivy 官方 GitHub Action。
- `format: sarif`：SARIF 格式可被 GitHub Security 原生解析。
- `exit-code: 1`：发现高危漏洞时构建失败。
### 7.2 GitLab CI 集成
```yaml
# .gitlab-ci.yml
stages:
  - scan

trivy-scan:
  stage: scan
  image: aquasec/trivy:latest
  script:
    - trivy image --exit-code 1 --severity CRITICAL $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  variables:
    TRIVY_IGNORE_UNFIXED: "true"
```
配置解释：
- `image: aquasec/trivy:latest`：使用官方 Trivy 镜像作为运行环境。
- `--exit-code 1`：发现严重漏洞时流水线失败。
- `TRIVY_IGNORE_UNFIXED: "true"`：通过环境变量忽略未修复的漏洞。
### 7.3 Jenkins Pipeline 集成
```groovy
pipeline {
    agent any
    stages {
        stage('Trivy Scan') {
            steps {
                sh '''
                    trivy image --exit-code 1 --severity CRITICAL myapp:latest
                '''
            }
        }
    }
}
```
-- -
## 八、忽略漏洞(.trivyignore)
### 8.1 为什么需要忽略
某些漏洞可能：
- 不影响你的应用(如特定操作系统环境才触发的漏洞)。
- 暂时没有修复版本，且风险较低。
- 已经被评估为可接受风险。
### 8.2 创建 .trivyignore 文件
在项目根目录创建 .trivyignore 文件：
```text
# 已评估为可接受风险，影响较低
CVE-2023-12345

# 将在下个版本中修复
CVE-2024-67890
```
Trivy 在扫描时会自动读取该文件，并过滤掉对应的 CVE。
### 8.3 环境变量方式忽略
```bash
# 忽略未修复的漏洞
export TRIVY_IGNORE_UNFIXED=true
trivy image nginx:latest

# 限制报告的严重程度
export TRIVY_SEVERITY=CRITICAL,HIGH
trivy image nginx:latest
```
命令解释：
- `TRIVY_IGNORE_UNFIXED=true`：忽略尚未修复的漏洞。
- `TRIVY_SEVERITY=CRITICAL,HIGH`：只显示严重和高危漏洞。
-- -
## 九、生产环境最佳实践
### 9.1 扫描策略建议
| 策略     | 说明                            |
| ------ | ----------------------------- |
| 构建时扫描  | 每次构建镜像时自动扫描，阻止有漏洞的镜像进入仓库      |
| 定时全量扫描 | 定期扫描已部署镜像，发现新披露的漏洞            |
| 分级阻断   | 先阻断 CRITICAL/HIGH 级别漏洞，逐步收紧策略 |
| 记录忽略原因 | 忽略的漏洞必须记录原因和过期时间              |
### 9.2 CI/CD 阻断策略
| 策略            | 说明                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 阻断 CRITICAL   | 发现严重漏洞时构建失败[](https://raw.githubusercontent.com/OneUptime/blog/refs/heads/master/posts/2026-02-09-container-vulnerability-scanning-ci/README.md#1) |
| 阻断 HIGH       | 安全要求更高的场景可阻断高危漏洞                                                                                                                                   |
| 允许 MEDIUM/LOW | 中低危漏洞可先放行，安排后续修复                                                                                                                                   |
### 9.3 漏洞修复优先级
| 优先级 | 条件                    | 处理方式          |
| --- | --------------------- | ------------- |
| 最高  | CRITICAL + 已有修复版本     | 立即升级          |
| 高   | HIGH + 已有修复版本         | 尽快升级          |
| 中   | CRITICAL/HIGH + 无修复版本 | 评估风险，考虑替换基础镜像 |
| 低   | MEDIUM/LOW            | 定期跟进，非紧急      |
### 9.4 选择安全的基础镜像
使用 Trivy 对比不同基础镜像的漏洞数量：
```bash
# 对比 Alpine、Debian、Ubuntu 的漏洞数量
trivy image --severity HIGH,CRITICAL alpine:3.18
trivy image --severity HIGH,CRITICAL debian:12-slim
trivy image --severity HIGH,CRITICAL ubuntu:22.04
```
生产环境建议：优先选择漏洞较少的基础镜像(如 Alpine、Debian-slim)。
-- -
## 十、总结
Trivy 是容器安全扫描的首选工具，与 Docker 和 K3s/K8s 环境天然集成。以下是核心要点：
1. Trivy 的定位：
    - 综合安全扫描器，覆盖容器镜像、文件系统、IaC、Kubernetes 等多种目标。
    - 速度快、无依赖、CI/CD 友好。
2. 核心扫描场景：
    - 镜像扫描(`trivy image`)：在镜像构建后、部署前扫描漏洞。
    - 文件系统扫描(`trivy fs`)：在代码提交后、镜像构建前扫描依赖。
    - IaC 扫描(`trivy config`)：扫描 Dockerfile、K 8 s YAML 等配置问题。
3. CI/CD 集成：
    - 支持 GitHub Actions、GitLab CI、Jenkins 等主流工具。
    - 使用 `--exit-code 1` 在发现高危漏洞时阻断构建。
4. 生产环境提醒
	- 推荐使用 RPM 包或官方 YUM 仓库安装。
	- 首次扫描需下载漏洞数据库(约 100-200 MB)。
	- 建议在 CI/CD 流水线中集成 Trivy 扫描。
	- 漏洞数据库定期更新，建议定期执行全量扫描。