## 一、为什么需要从 Docker 过渡到 K 3 s
### 1.1 你已经掌握了 Docker Compose
通过之前的学习，你已经掌握了 Docker 和 Docker Compose 的核心能力：

|能力|说明|
|---|---|
|制作镜像|通过 Dockerfile 将应用打包成标准化的容器镜像|
|单机编排|通过 docker-compose.yml 在一台机器上编排多个容器|
|数据持久化|通过 Volume 和 Bind Mount 持久化数据|
|网络隔离|通过自定义网络实现容器间通信和隔离|
|资源限制|通过 cpus 和 mem_limit 限制容器资源使用|
|健康检查|通过 healthcheck 监控容器健康状态|
但你同时也遇到了单机部署的瓶颈：

| 瓶颈      | 说明                    |
| ------- | --------------------- |
| 单点故障    | 宿主机宕机，所有容器停止运行        |
| 无法弹性伸缩  | 流量突增时无法自动增加容器副本数      |
| 无法滚动更新  | 更新版本时需要停止所有容器再启动，业务中断 |
| 无法跨机器调度 | 所有容器只能运行在一台机器上        |
### 1.2 K 3 s 的作用
K 3 s 是轻量级 Kubernetes，它保留了 K 8 s 的核心能力，但将组件打包成一个不到 100 MB 的二进制文件，非常适合在 Rocky Linux 8 等生产环境中部署。
K3s 带来的核心能力：

| 能力    | 说明                             |
| ----- | ------------------------------ |
| 多节点集群 | 多台物理机组成集群，容器可以调度到任意节点          |
| 故障自愈  | 节点宕机后，容器自动迁移到其他节点              |
| 弹性伸缩  | 根据 CPU/内存使用率自动增减容器副本数          |
| 滚动更新  | 发布新版本时逐步替换旧容器，实现不停机升级          |
| 服务发现  | 容器通过 Service 名称互相访问，无需关心 IP 变化 |
### 1.3 Docker Compose 到 K 3 s 的定位变化
| 对比维度 | Docker Compose  | K3s / Kubernetes |
| ---- | --------------- | ---------------- |
| 管理范围 | 单台物理机           | 多台物理机组成的集群       |
| 适用场景 | 开发环境、内网系统、小规模生产 | 大规模生产环境、微服务架构    |
| 故障自愈 | 无(机器挂了容器就挂了)    | 有(自动迁移到存活节点)     |
| 弹性伸缩 | 手动改 --scale     | 自动根据指标扩缩容        |
| 学习曲线 | 平缓(几天上手)        | 陡峭(几周到几个月)       |
| 定位   | 单机编排工具          | 集群编排平台           |
-- -
## 二、核心概念映射：Compose 到 K 3 s
### 2.1 概念对照表
将 Docker Compose 中你已熟悉的概念，映射到 K 3 s/Kubernetes 中对应的概念，是学习 K 3 s 最快的方式。

|Docker Compose|K 3 s / Kubernetes|说明|
|---|---|---|
|服务(service)|Deployment|Compose 中的一个 service 对应 K 8 s 中的一个 Deployment(无状态应用)|
|容器(container)|Pod|K 8 s 中最小的调度单元，一个 Pod 可以包含一个或多个容器|
|网络(network)|Service / Ingress|Service 提供内部服务发现，Ingress 提供外部访问入口|
|数据卷(volume)|PersistentVolumeClaim|声明式申请存储资源|
|环境变量(environment)|ConfigMap / Secret|配置和敏感信息分离管理|
|依赖关系(depends_on)|Init Container / 健康检查|通过启动探针和就绪探针控制启动顺序|
|重启策略(restart)|restartPolicy|Pod 级别的重启策略|
|资源限制(deploy.resources)|resources.limits / requests|CPU 和内存的请求与限制|
### 2.2 从 Compose 视角理解 K 3 s 核心资源
1. Pod(容器组)
在 K 3 s 中，最小的调度单位是 Pod，而不是容器。
- 一个 Pod 可以包含一个或多个容器。
- 同一个 Pod 中的容器共享网络命名空间(共享 IP 和端口空间)。
- 在 Docker Compose 中，每个 service 启动一个容器；在 K 3 s 中，每个 Deployment 启动一个 Pod(通常包含一个容器)。

2. Deployment(无状态应用)
Deployment 是 K3s 中管理无状态应用的核心资源，它负责：
- 管理 Pod 的副本数(如 3 个副本)。
- 滚动更新(新版本逐步替换旧版本)。
- 回滚(出问题时恢复到旧版本)。

3. Service(服务发现)
Service 为 Pod 提供稳定的网络访问入口：
- 即使 Pod 重启 IP 变化，Service 的 ClusterIP 保持不变。
- 其他服务可以通过 Service 名称访问(内置 DNS 解析)。

4. Ingress(外部访问入口)
Ingress 将外部 HTTP/HTTPS 流量路由到内部的 Service：
- 相当于 Compose 中的端口映射(`ports`)。
- 支持基于域名和路径的路由(如 `api.example.com` → 后端服务)。

5. ConfigMap / Secret(配置管理)
- ConfigMap：存放非敏感配置(如环境变量、配置文件)。
- Secret：存放敏感信息(如密码、Token)，内容经过 Base 64 编码。
### 2.3 命令对照表
你在 Docker 中常用的命令，在 K 3 s 中对应的命令：

|操作|Docker 命令|K 3 s 命令|说明|
|---|---|---|---|
|查看所有资源| `docker ps -a` | `kubectl get all` |查看 Pod、Service、Deployment 等|
|查看容器/Pod| `docker ps` | `kubectl get pods` |查看所有 Pod|
|查看日志| `docker logs 容器名` | `kubectl logs Pod名` |查看 Pod 日志|
|进入容器/Pod| `docker exec -it 容器名 bash` | `kubectl exec -it Pod名 -- bash` |进入 Pod 内部|
|查看详情| `docker inspect 容器名` | `kubectl describe Pod名` |查看 Pod 的详细状态和事件|
|停止容器/Pod| `docker stop 容器名` | `kubectl delete pod Pod名` |删除 Pod(Deployment 会自动重建)|
|删除容器/Pod| `docker rm 容器名` | `kubectl delete deployment 名称` |删除 Deployment|
|查看资源使用| `docker stats` | `kubectl top pods` |查看 Pod 的资源使用(需安装 metrics-server)|
-- -
## 三、从 Compose 到 K 3 s 的迁移步骤
### 3.1 迁移路径总览
从 Docker Compose 迁移到 K 3 s，可以分三步走：
```text
第一步：将 Compose 服务转换为 K3s YAML
第二步：在 K3s 集群中部署并验证
第三步：配置外部访问(Ingress)和存储(PVC)
```
### 3.2 第一步：转换 Compose 服务
原始 Compose 文件示例：
```yaml
version: '3.8'

services:
  web:
    image: nginx:1.26-alpine
    ports:
      - "8080:80"
    environment:
      - TZ=Asia/Shanghai
    volumes:
      - ./html:/usr/share/nginx/html
    restart: unless-stopped

  app:
    image: myapp:1.0
    environment:
      - DB_HOST=db
      - DB_PASSWORD=${DB_PASSWORD}
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: mysql:5.7
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql
    restart: unless-stopped

volumes:
  db_data:
```
转换为 K3s Deployment + Service YAML：
```yaml
# 1. Namespace(命名空间，用于隔离环境)
apiVersion: v1
kind: Namespace
metadata:
  name: myapp

---
# 2. ConfigMap(存放非敏感配置)
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: myapp
data:
  TZ: "Asia/Shanghai"
  DB_HOST: "db-service"

---
# 3. Secret(存放敏感信息)
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
  namespace: myapp
type: Opaque
data:
  MYSQL_ROOT_PASSWORD: <Base64编码后的密码>
  DB_PASSWORD: <Base64编码后的密码>

---
# 4. Deployment(Web 服务)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deployment
  namespace: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.26-alpine
          ports:
            - containerPort: 80
          envFrom:
            - configMapRef:
                name: app-config
          resources:
            limits:
              cpu: "500m"
              memory: "256Mi"
            requests:
              cpu: "250m"
              memory: "128Mi"

---
# 5. Service(暴露 Web 服务)
apiVersion: v1
kind: Service
metadata:
  name: web-service
  namespace: myapp
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP

---
# 6. Deployment(App 服务)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deployment
  namespace: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
        - name: app
          image: myapp:1.0
          env:
            - name: DB_HOST
              value: "db-service"
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: DB_PASSWORD
            - name: TZ
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: TZ
          resources:
            limits:
              cpu: "1000m"
              memory: "512Mi"
            requests:
              cpu: "500m"
              memory: "256Mi"

---
# 7. Service(App 服务)
apiVersion: v1
kind: Service
metadata:
  name: app-service
  namespace: myapp
spec:
  selector:
    app: app
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP

---
# 8. Deployment(DB 服务)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: db-deployment
  namespace: myapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
        - name: db
          image: mysql:5.7
          ports:
            - containerPort: 3306
          env:
            - name: MYSQL_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: MYSQL_ROOT_PASSWORD
          volumeMounts:
            - name: db-storage
              mountPath: /var/lib/mysql
          resources:
            limits:
              cpu: "1000m"
              memory: "1Gi"
            requests:
              cpu: "500m"
              memory: "512Mi"
      volumes:
        - name: db-storage
          persistentVolumeClaim:
            claimName: db-pvc

---
# 9. Service(DB 服务)
apiVersion: v1
kind: Service
metadata:
  name: db-service
  namespace: myapp
spec:
  selector:
    app: db
  ports:
    - port: 3306
      targetPort: 3306
  type: ClusterIP

---
# 10. PersistentVolumeClaim(数据持久化)
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: db-pvc
  namespace: myapp
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```
### 3.3 第二步：在 K 3 s 中部署
将上述 YAML 保存为 myapp.yaml，然后执行：
```bash
# 部署应用
kubectl apply -f myapp.yaml

# 查看部署状态
kubectl get all -n myapp

# 查看 Pod 状态
kubectl get pods -n myapp

# 查看详细信息(排查问题)
kubectl describe pod <Pod名> -n myapp
```
### 3.4 第三步：配置外部访问(Ingress)
如果需要将服务暴露到集群外部，需要使用 Ingress。
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  namespace: myapp
spec:
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-service
                port:
                  number: 80
```
部署 Ingress Controller(K3s 默认已集成 Traefik)：
```bash
# 查看 K3s 自带的 Traefik
kubectl get pods -n kube-system | grep traefik
```
如果使用自定义域名，需要在 /etc/hosts 或 DNS 中解析域名到 K3s 节点 IP。
-- -
## 四、Docker 镜像与 K 3 s 的配合
### 4.1 镜像构建与分发
K 3 s 和 Docker 使用完全相同的镜像格式，你在 Docker 中构建的镜像可以直接在 K 3 s 中使用。
镜像构建流程：
```bash
# 1. 编写 Dockerfile
# 2. 构建镜像
docker build -t myapp:1.0 .

# 3. 推送到镜像仓库(供 K3s 集群拉取)
docker tag myapp:1.0 harbor.internal.com/myapp:1.0
docker push harbor.internal.com/myapp:1.0
```
### 4.2 镜像拉取策略
在 K 3 s 中，可以通过 `imagePullPolicy` 控制镜像拉取行为：

|策略|说明|
|---|---|
|Always|每次都从仓库拉取|
|IfNotPresent|本地没有时才拉取(默认)|
|Never|只使用本地镜像|
```yaml
spec:
  containers:
    - name: myapp
      image: myapp:1.0
      imagePullPolicy: IfNotPresent
```
### 4.3 内网离线镜像
在内网环境中，K 3 s 支持从私有仓库或本地镜像拉取：
```bash
# 方式一：在每台节点上手动加载镜像
k3s ctr images import myapp.tar

# 方式二：配置私有仓库
# 编辑 /etc/rancher/k3s/registries.yaml
mirrors:
  harbor.internal.com:
    endpoint:
      - "http://harbor.internal.com"
```
### 4.4 从 Docker Compose 迁移镜像的最佳实践
| 最佳实践   | 说明                              |
| ------ | ------------------------------- |
| 固定镜像版本 | 使用具体版本号(如 `v1.0.0`)，避免 `latest` |
| 使用内网仓库 | 将镜像推送到内网 Harbor 仓库，加速拉取         |
| 镜像体积控制 | 使用 Alpine 或多阶段构建减小体积            |
| 镜像扫描   | 定期扫描镜像漏洞(Trivy 等)               |
-- -
## 五、K 3 s 基础运维命令
### 5.1 集群管理命令
```bash
# 查看集群信息
kubectl cluster-info

# 查看集群节点
kubectl get nodes

# 查看节点详细信息
kubectl describe node <节点名>

# 查看所有命名空间
kubectl get namespaces
```
### 5.2 资源管理命令
```bash
# 查看 Pod
kubectl get pods -n myapp
kubectl get pods -n myapp -o wide

# 查看 Deployment
kubectl get deployments -n myapp

# 查看 Service
kubectl get services -n myapp

# 查看 Ingress
kubectl get ingress -n myapp

# 查看 ConfigMap
kubectl get configmaps -n myapp

# 查看 Secret
kubectl get secrets -n myapp

# 查看 PersistentVolumeClaim
kubectl get pvc -n myapp
```
### 5.3 排错命令
```bash
# 查看 Pod 日志
kubectl logs <Pod名> -n myapp
kubectl logs <Pod名> -n myapp --tail 50
kubectl logs <Pod名> -n myapp -f

# 查看 Pod 详情(含事件)
kubectl describe pod <Pod名> -n myapp

# 进入 Pod 内部
kubectl exec -it <Pod名> -n myapp -- /bin/sh

# 查看集群事件
kubectl get events -n myapp --sort-by='.lastTimestamp'

# 查看资源使用
kubectl top pods -n myapp
kubectl top nodes
```
### 5.4 应用部署与更新
```bash
# 部署应用
kubectl apply -f myapp.yaml

# 更新应用(修改 YAML 后)
kubectl apply -f myapp.yaml

# 滚动更新(直接修改镜像版本)
kubectl set image deployment/web-deployment web=nginx:1.27-alpine -n myapp

# 查看滚动更新状态
kubectl rollout status deployment/web-deployment -n myapp

# 回滚到上一个版本
kubectl rollout undo deployment/web-deployment -n myapp

# 查看历史版本
kubectl rollout history deployment/web-deployment -n myapp

# 删除应用
kubectl delete -f myapp.yaml
```
-- -
## 六、Docker 与 K 3 s 的共生关系
### 6.1 K 3 s 仍然依赖 Docker
在 系统上部署 K 3 s 时，默认使用 containerd 作为容器运行时，而不是 Docker。但你可以选择使用 Docker 作为运行时：
```bash
# 使用 Docker 作为 K3s 的容器运行时
curl -sfL https://get.k3s.io | sh -s - --docker
```
这样 K 3 s 可以复用你已经安装好的 Docker 环境。如果你选择 containerd，仍然可以使用 `docker build` 构建镜像，只是运行时由 containerd 接管。
### 6.2 Docker 与 K 3 s 的分工
|任务|使用 Docker|使用 K3s|说明|
|---|---|---|---|
|构建镜像|✅|❌|Dockerfile 构建镜像|
|本地测试|✅|❌|用 `docker run` 快速验证|
|单机编排|✅|⚠️|Compose 适合单机，K3s 也可以单机但较重|
|集群编排|❌|✅|多节点高可用部署|
|生产部署|⚠️|✅|生产环境推荐 K3s/K8s|
-- -
## 七、从 Compose 到 K 3 s 的迁移建议
### 7.1 迁移策略
| 迁移策略 | 适用场景                           |
| ---- | ------------------------------ |
| 直接迁移 | 简单应用，直接编写 K3s YAML             |
| 渐进迁移 | 复杂应用，先部署无状态服务，再迁移有状态服务         |
| 重构迁移 | 利用 K3s 原生能力(如 Operator)，重新设计架构 |
### 7.2 迁移检查清单
| 检查项                         | 状态  |
| --------------------------- | --- |
| 镜像已推送到内网仓库                  | ☐   |
| 配置已提取到 ConfigMap            | ☐   |
| 敏感信息已提取到 Secret             | ☐   |
| 数据卷已转换为 PVC                 | ☐   |
| 环境变量引用方式已更新                 | ☐   |
| 服务发现已使用 Service 名称          | ☐   |
| 资源限制已配置(limits/requests)    | ☐   |
| 健康检查已配置(liveness/readiness) | ☐   |
| 外部访问已配置 Ingress             | ☐   |
-- -
## 八、总结
Docker 与 K 3 s 是互补而非替代的关系。Docker 负责镜像构建和本地测试，K 3 s 负责集群编排和生产部署。
1. Docker Compose 与 K 3 s 的定位：
    - Compose 适合单机内网部署，配置简单，快速上手。
    - K 3 s 适合集群生产部署，提供高可用、弹性伸缩、滚动更新等能力。
    
2. 概念映射是学习的关键：
- service → Deployment
- container → Pod
- network → Service + Ingress
- volume → PersistentVolumeClaim
- environment → ConfigMap + Secret
- depends_on → 健康检查 + 启动探针

3. 迁移路径清晰：
- 将 Compose 服务拆分为独立的 YAML 资源(Deployment、Service、ConfigMap、Secret、PVC)。
- 使用 `kubectl apply -f` 部署到 K 3 s 集群。
- 配置 Ingress 提供外部访问。