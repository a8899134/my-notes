## 一、MySQL 与Redis 协同
### 1.1 MySQL 和 Redis 各自的定位
MySQL 和 Redis 是两种完全不同定位的数据存储工具，它们的关系不是“替代”，而是“互补”。

|对比维度|MySQL|Redis|
|---|---|---|
|存储位置|硬盘(磁盘)|内存|
|读写速度|慢(毫秒级，受磁盘 I/O 限制)|极快(微秒级，纯内存操作)|
|数据容量|大(TB 级别)|相对小(受内存限制)|
|数据持久化|强(数据永久保存)|弱(依赖 RDB/AOF，仍有丢失风险)|
|事务支持|完整 ACID|有限事务支持|
|适用场景|数据持久化存储、复杂查询|高速缓存、会话存储、计数器|

通俗理解：
- MySQL 就像一个档案库—所有的数据最终都存放在这里，安全、可靠、永久保存。但每次去档案库查资料，都要花时间翻找(磁盘 I/O)。
- Redis 就像一个前台接待员的记忆—经常被问到的问题，接待员直接就能回答，不用每次都跑去档案库翻。但接待员的记忆有限(内存有限)，而且可能会忘(数据可能丢失)。
### 1.2 协同作用
如果把所有请求都直接打到 MySQL，数据库很快就会不堪重负。Redis 的引入，相当于在 MySQL 前面加了一道“快速通道”：
- 热点数据缓存在 Redis：高频访问的数据直接从 Redis 返回，毫秒级响应
- MySQL 专注持久化：只有缓存未命中或写操作才访问 MySQL，大幅降低数据库压力
- 提升用户体验：响应速度从几百毫秒降到几毫秒

## 二、核心缓存策略
### 2.1 Cache-Aside(旁路缓存)
Cache-Aside(旁路缓存) 是生产环境中使用最广泛的缓存模式。它的核心思想是：应用程序直接管理缓存，缓存只是“旁路”，不是写入的必经之路。
#### 2.1.1 读流程
```text
1. 应用程序查询 Redis
     │
     ├── 命中(缓存存在)→ 直接返回数据
     │
     └── 未命中(缓存不存在)→ 查询 MySQL → 将数据写入 Redis → 返回数据
```
读操作代码示例：
```python
def get_user(user_id):
    # 1. 先查 Redis
    cache_key = f"user:{user_id}"
    data = redis.get(cache_key)
    
    if data:
        return data  # 缓存命中，直接返回
    
    # 2. 缓存未命中，查 MySQL
    data = mysql.query("SELECT * FROM users WHERE id = %s", user_id)
    
    if data:
        # 3. 写入 Redis，设置过期时间
        redis.setex(cache_key, 3600, data)
    
    return data
```
#### 2.1.2 写流程
```text
1. 更新 MySQL 中的数据
     ↓
2. 删除 Redis 中对应的缓存(而不是更新)
```
为什么是“删除缓存”而不是“更新缓存”？
这是一个关键的设计决策：

| 方案       | 问题                           |
| -------- | ---------------------------- |
| 更新缓存     | 每次写操作都要写缓存，如果该数据不常被读取，就是浪费资源 |
| 更新缓存(并发) | 多个线程同时更新时，可能导致缓存数据与数据库不一致    |
| 删除缓存     | 简单、幂等，下次读取时再从 MySQL 加载最新数据   |

写操作代码示例：
```python
def update_user(user_id, new_data):
    # 1. 先更新 MySQL
    mysql.execute("UPDATE users SET name = %s WHERE id = %s", new_data, user_id)
    
    # 2. 再删除 Redis 缓存
    redis.delete(f"user:{user_id}")
```
⚠️ 注意：先更新 MySQL，再删除缓存。如果先删除缓存再更新 MySQL，在并发场景下可能导致其他线程读到旧数据并重新缓存。
#### 2.1.3 Cache-Aside 的优缺点

|优点|缺点|
|---|---|
|实现简单，易于理解和维护|首次读取有缓存未命中，需要查数据库|
|灵活，应用可自由控制缓存策略|存在短暂的数据不一致窗口|
|适合读多写少的场景|应用程序需自行处理缓存逻辑|
### 2.2 Read/Write Through(读写穿透)
Read/Write Through(读写穿透),在这种模式下，缓存层自己负责与数据库交互，应用程序只与缓存打交道。

读流程：应用读取缓存 → 如果未命中，缓存层自动从数据库加载并填充缓存 → 返回数据。

写流程：应用写入缓存 → 缓存层同步写入数据库 → 两者都成功才返回

|优点|缺点|
|---|---|
|对应用透明，业务逻辑简单|性能较差，每次写操作都涉及数据库|
|一致性比 Cache-Aside 更好|实现复杂，依赖成熟的缓存中间件|
### 2.3 Write Behind(异步写回)
Write Behind (异步写回)是 Write Through 的异步版本。应用写入缓存后立即返回，缓存层在后台异步批量更新数据库。

|优点|缺点|
|---|---|
|写性能极高(无需等待数据库)|缓存故障可能导致数据丢失|
|可批量合并写操作，减少数据库压力|实现复杂，需要处理数据同步失败的重试|

## 三、数据一致性问题
### 3.1 为什么会出现不一致？
MySQL 和 Redis 是两个独立的存储系统，写操作必须同时更新两者。任何一步失败都会导致不一致：

|场景|结果|
|---|---|
|写 MySQL 成功，写 Redis 失败|Redis 中是旧数据|
|写 Redis 成功，写 MySQL 失败|Redis 中有“脏数据”，数据库中不存在|
|并发读写|一个线程更新数据库时，另一个线程读取了旧的缓存数据|

💡 核心认知：在分布式环境下，实现强一致性(任何时刻读取的数据都是最新的)极其困难且代价高昂。实践中通常追求最终一致性—允许短暂的不一致，但保证数据最终会一致。
### 3.2 Cache-Aside 的不一致窗口
Cache-Aside 虽然简单，但仍存在一个极小概率的不一致窗口：
```text
时间线：
1. 线程 A 更新 MySQL(数据从 100 改为 200)
2. 线程 B 读取数据，发现缓存不存在，从 MySQL 读取旧数据(100)
   (因为线程 A 可能还没提交，或刚提交)
3. 线程 B 将旧数据(100)写入缓存
4. 线程 A 删除缓存 → 但删除的是“空的”，因为线程 B 刚写入了旧数据
结果：缓存中是旧数据(100)，数据库是新数据(200)
```
为什么概率很低？

因为数据库写操作通常比读操作耗时更长(涉及锁、事务日志等)，所以步骤 2 在步骤 1 之前完成的概率很小。

### 3.3 延迟双删策略
如果需要进一步降低不一致的概率，可以使用延迟双删策略。

核心思路：更新数据库后，立即删除缓存，然后延迟一段时间(如 500ms)再次删除缓存。
```python
def update_user_with_delay(user_id, new_data):
    # 1. 更新 MySQL
    mysql.execute("UPDATE users SET name = %s WHERE id = %s", new_data, user_id)
    
    # 2. 第一次删除缓存
    redis.delete(f"user:{user_id}")
    
    # 3. 延迟一段时间(如 500ms)
    time.sleep(0.5)
    
    # 4. 第二次删除缓存(清除可能被其他线程写入的旧数据)
    redis.delete(f"user:{user_id}")
```
延迟时间如何确定？

延迟时间应大于一次 MySQL 主从同步的延迟时间，通常设置为 500ms ~ 1s。

### 3.4 基于 Binlog 的异步同步(终极方案)
对于对一致性要求极高的场景，可以通过解析 MySQL 的 Binlog 日志来实时同步数据到 Redis。
```
MySQL 数据变更 → 产生 Binlog → Canal/Maxwell 解析 → 更新 Redis
```
常用工具：
1. Canal，阿里巴巴开源，监听 MySQL Binlog，同步到 Redis/ES 等
2. Maxwell，轻量级 Binlog 解析工具，输出 JSON 格式
3. Debezium，CDC 平台，支持多种数据源
优点：与业务逻辑解耦，支持实时同步。
缺点：部署和维护复杂，需要处理 Binlog 格式兼容性问题。

## 四、缓存三大异常与解决方案
Redis 作为缓存层，可能遇到三类典型异常：**穿透、击穿、雪崩**。这三类异常都会导致大量请求直接打到 MySQL，可能压垮数据库。
### 4.1 缓存穿透
定义：请求的数据在 Redis 和 MySQL 中都不存在。每次请求都会穿透缓存直达数据库。

场景：恶意攻击者不断请求不存在的用户 ID(如 user_id = -1)，导致每次请求都查询 MySQL。

解决方案：

1. 方案一：缓存空值
```python
def get_user(user_id):
    cache_key = f"user:{user_id}"
    data = redis.get(cache_key)
    
    if data is not None:
        return data if data != "NULL" else None  # 空值标记
    
    data = mysql.query("SELECT * FROM users WHERE id = %s", user_id)
    
    if data:
        redis.setex(cache_key, 3600, data)
    else:
        # 缓存空值，过期时间短一些(如 60 秒)
        redis.setex(cache_key, 60, "NULL")
    
    return data
```
2. 方案二：布隆过滤器(Bloom Filter)

在缓存前加一层布隆过滤器，快速判断数据是否可能存在。如果布隆过滤器判断不存在，直接返回，不查询 MySQL。
### 4.2 缓存击穿

定义：一个热点数据的缓存恰好过期，大量并发请求同时打到 MySQL。

场景：爆款商品的详情页缓存过期，瞬间成千上万的请求同时查询 MySQL。

解决方案：互斥锁(Mutex)
```python
def get_hot_product(product_id):
    cache_key = f"product:{product_id}"
    data = redis.get(cache_key)
    
    if data:
        return data
    
    # 缓存过期，尝试获取分布式锁
    lock_key = f"lock:product:{product_id}"
    
    if redis.setnx(lock_key, "1", ex=5):  # 获取锁，5秒过期
        try:
            # 只有获得锁的线程查数据库
            data = mysql.query("SELECT * FROM products WHERE id = %s", product_id)
            redis.setex(cache_key, 3600, data)
            return data
        finally:
            redis.delete(lock_key)
    else:
        # 没拿到锁，等待并重试
        time.sleep(0.1)
        return get_hot_product(product_id)  # 递归重试
```
### 4.3 缓存雪崩
定义：大量缓存同时失效，导致大量请求同时打到 MySQL。

场景：设置了统一的缓存过期时间(如全部 1 小时)，到了整点全部失效。

解决方案：

1. 方案一：随机过期时间
```python
import random

# 在原有过期时间上增加随机值(1-5 分钟)
base_ttl = 3600
random_ttl = random.randint(60, 300)
redis.setex(cache_key, base_ttl + random_ttl, data)
```
2. 方案二：Redis 集群部署，避免单点故障。

3. 方案三：限流降级，在缓存失效时对请求进行限流，保护 MySQL。

## 五、Redis 核心配置
### 5.1 配置文件位置
|安装方式|配置文件路径|
|---|---|
|YUM/DNF 安装|`/etc/redis/redis.conf`|
|源码编译安装|`/usr/local/redis/redis.conf`|
### 5.2 核心配置参数
#### 5.2.1 网络配置
```ini
# 绑定的 IP 地址(127.0.0.1 只允许本地访问)
bind 127.0.0.1

# 监听端口
port 6379

# 保护模式(开启后，未设置密码且未绑定 IP 时，只允许本地访问)
protected-mode yes

# 最大客户端连接数
maxclients 10000
```
#### 5.2.2 内存管理
```ini
# 最大内存限制(根据服务器内存设置)
maxmemory 4gb

# 内存淘汰策略(达到 maxmemory 时的处理方式)
# noeviction：不淘汰，写入报错
# allkeys-lru：淘汰最近最少使用的 key
# volatile-lru：淘汰设置了过期时间的 key 中最近最少使用的
# allkeys-random：随机淘汰
# volatile-ttl：淘汰剩余时间最短的 key
maxmemory-policy allkeys-lru
```
淘汰策略选择建议：

|策略|适用场景|
|---|---|
| allkeys-lru |最常用，适合缓存场景|
| volatile-lru |部分数据需要长期保留，只淘汰设置了 TTL 的 key|
| noeviction |不允许淘汰，写入会报错(不推荐缓存场景)|
#### 5.2.3 持久化配置
```ini
# RDB 持久化(快照)
save 900 1      # 900 秒内至少 1 个 key 变化则保存
save 300 10     # 300 秒内至少 10 个 key 变化则保存
save 60 10000   # 60 秒内至少 10000 个 key 变化则保存

# RDB 文件名
dbfilename dump.rdb

# RDB 文件目录
dir /var/lib/redis

# AOF 持久化(追加日志)
appendonly yes
appendfilename "appendonly.aof"

# AOF 同步策略
# always：每次写入都同步(最安全，最慢)
# everysec：每秒同步一次(推荐)
# no：由操作系统决定
appendfsync everysec
```
#### 5.2.4 安全配置
```ini
# 设置密码(生产环境必须)
requirepass your_strong_password

# 重命名危险命令(防止误操作)
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG ""
```
### 5.3 缓存 Key 设计规范

|规范|示例|说明|
|---|---|---|
|使用业务前缀| user:1001、product:2001 |便于分类管理和排查|
|包含业务标识| order:status:12345 |多个维度时用冒号分隔|
|设置过期时间| EXPIRE user:1001 3600 |所有缓存必须设置 TTL|
|避免 key 过大|单个 key 不超过 10 KB|大 key 影响 Redis 性能|

## 六、应用层集成示例
### 6.1 Spring Boot 集成 Redis 缓存
#### 6.1.1 添加依赖
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-cache</artifactId>
</dependency>
```
#### 6.1.2 配置 Redis 连接
application.yml：
```ymal
spring:
  redis:
    host: 192.168.1.100
    port: 6379
    password: your_password
    database: 0
    lettuce:
      pool:
        max-active: 8
        max-idle: 8
        min-idle: 0
        max-wait: -1ms
```
#### 6.1.3 启用缓存并配置 CacheManager
```java
@Configuration
@EnableCaching
public class RedisCacheConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofHours(1))  // 默认过期时间 1 小时
            .serializeValuesWith(
                RedisSerializationContext.SerializationPair.fromSerializer(
                    new GenericJackson2JsonRedisSerializer()
                )
            );
        
        // 为不同缓存区域设置不同的过期时间
        Map<String, RedisCacheConfiguration> configMap = new HashMap<>();
        configMap.put("users", config.entryTtl(Duration.ofMinutes(30)));
        configMap.put("products", config.entryTtl(Duration.ofHours(2)));
        
        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .withInitialCacheConfigurations(configMap)
            .build();
    }
}
```
#### 6.1.4 使用缓存注解
```java
@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    // @Cacheable：查询时自动缓存[reference:63][reference:64]
    @Cacheable(value = "users", key = "#id")
    public User getUserById(Long id) {
        return userRepository.findById(id).orElse(null);
    }

    // @CachePut：更新时自动更新缓存[reference:65]
    @CachePut(value = "users", key = "#user.id")
    public User updateUser(User user) {
        return userRepository.save(user);
    }

    // @CacheEvict：删除时自动清除缓存[reference:66]
    @CacheEvict(value = "users", key = "#id")
    public void deleteUser(Long id) {
        userRepository.deleteById(id);
    }
}
```
### 6.2 Python 集成示例
```python
import redis
import pymysql

class CacheService:
    def __init__(self):
        self.redis = redis.Redis(host='192.168.1.100', port=6379, db=0, decode_responses=True)
        self.mysql = pymysql.connect(host='192.168.1.10', user='app', password='xxx', database='mydb')
    
    def get_user(self, user_id):
        cache_key = f"user:{user_id}"
        
        # 1. 查 Redis
        data = self.redis.get(cache_key)
        if data:
            return data
        
        # 2. 查 MySQL
        cursor = self.mysql.cursor()
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        if user:
            # 3. 写入 Redis
            self.redis.setex(cache_key, 3600, str(user))
        
        return user
    
    def update_user(self, user_id, new_data):
        # 1. 更新 MySQL
        cursor = self.mysql.cursor()
        cursor.execute("UPDATE users SET name = %s WHERE id = %s", (new_data, user_id))
        self.mysql.commit()
        
        # 2. 删除 Redis 缓存
        self.redis.delete(f"user:{user_id}")
```

## 七、监控与运维
### 7.1 缓存命中率
命中率是衡量缓存效果的核心指标。如果命中率低，说明缓存没有起到应有的作用，大量请求还是打到了 MySQL。
#### 7.1.1 查看命中率
```bash
# 查看 Redis 统计信息
redis-cli INFO stats
```
关键字段：
1. keyspace_hits，缓存命中的次数
2. keyspace_misses，缓存未命中的次数
计算公式：
```text
命中率 = keyspace_hits / (keyspace_hits + keyspace_misses) × 100%
```
示例：
```bash
redis-cli INFO stats | grep -E "keyspace_(hits|misses)"
```
输出：
```text
keyspace_hits: 1234567
keyspace_misses: 54321
```
命中率 = 1234567 / (1234567 + 54321) = 95.8%

健康阈值：

|命中率|状态|建议|
|---|---|---|
|> 90%|✅ 优秀|缓存配置合理|
|70% ~ 90%|⚠️ 一般|检查是否有大量冷数据或缓存过期时间太短|
|< 70%|❌ 差|需要优化缓存策略或增大内存|
#### 7.1.2 周期性监控(通过脚本)
```bash
#!/bin/bash
# 计算缓存命中率
HITS=$(redis-cli INFO stats | grep keyspace_hits | cut -d: -f2 | tr -d '\r')
MISSES=$(redis-cli INFO stats | grep keyspace_misses | cut -d: -f2 | tr -d '\r')
TOTAL=$((HITS + MISSES))

if [ $TOTAL -gt 0 ]; then
    HIT_RATE=$(echo "scale=2; $HITS * 100 / $TOTAL" | bc)
    echo "Redis 缓存命中率: ${HIT_RATE}%"
else
    echo "无请求数据"
fi
```
### 7.2 连接数
连接数管理是 Redis 运维的基础技能，连接数过高可能导致 Redis 拒绝新连接。
#### 7.2.1 查看当前连接数
```bash
# 查看当前客户端连接数量
redis-cli INFO clients | grep connected_clients

# 查看最大连接数限制
redis-cli CONFIG GET maxclients

# 查看所有连接的详细信息
redis-cli CLIENT LIST
```
CLIENT LIST 输出示例：
```text
id=123 addr=192.168.1.10:54321 fd=6 age=10 idle=5 flags=N db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=0
id=124 addr=192.168.1.11:54322 fd=7 age=20 idle=8 flags=N db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=0
```
关键字段：

|字段|含义|
|---|---|
| `addr` |客户端 IP 和端口|
| `age` |连接建立时长(秒)|
| `idle` |连接空闲时长(秒)|
| `flags` |连接状态标识|
#### 7.2.2 设置最大连接数
```bash
# 临时设置(重启后失效)
redis-cli CONFIG SET maxclients 20000

# 永久设置(修改配置文件)
# 在 redis.conf 中设置：maxclients 20000
```
#### 7.2.3 查看连接数使用率
```bash
#!/bin/bash
CURRENT=$(redis-cli INFO clients | grep connected_clients | cut -d: -f2 | tr -d '\r')
MAX=$(redis-cli CONFIG GET maxclients | tail -1)

USAGE=$(echo "scale=2; $CURRENT * 100 / $MAX" | bc)
echo "Redis 连接数: ${CURRENT} / ${MAX} (使用率 ${USAGE}%)"
```
健康阈值：

|连接数使用率|状态|建议|
|---|---|---|
|< 70%|✅ 正常|继续观察|
|70% ~ 85%|⚠️ 偏高|检查是否有连接泄漏|
|> 85%|🔴 告警|立即排查，或临时调大 maxclients|
#### 7.2.4 排查连接数异常
场景：连接数突增
```bash
# 1. 查看连接来源分布
redis-cli CLIENT LIST | awk '{print $2}' | cut -d= -f2 | cut -d: -f1 | sort | uniq -c | sort -rn

# 2. 查看连接状态分布
redis-cli CLIENT LIST | grep -o "flags=[^ ]*" | sort | uniq -c

# 3. 关闭空闲连接
redis-cli CLIENT KILL IDLE 3600   # 关闭空闲超过1小时的连接
```


### 7.1 常用监控命令

|命令|作用|
|---|---|
| redis-cli INFO |查看 Redis 运行状态|
| redis-cli INFO stats |查看统计信息(命中率等)|
| redis-cli INFO memory |查看内存使用情况|
| redis-cli --stat |实时查看 Redis 统计|
| redis-cli MONITOR |实时监控 Redis 命令(生产慎用)|
### 7.2 关键监控指标

| 指标    | 说明                               | 告警阈值               |
| ----- | -------------------------------- | ------------------ |
| 缓存命中率 | 从 Redis 直接返回数据的比例                | 80% 告警             |
| 连接数   | 当前客户端连接数                         | > maxclients 的 80% |
| 慢查询   | 执行超过 slowlog-log-slower-than 的命令 | 持续增长需排查            |
### 7.3 命令速查表

|操作|Redis 命令|说明|
|---|---|---|
|查看缓存命中率| redis-cli INFO stats \| grep keyspace |查看 hits 和 misses|
|查看当前连接数| redis-cli INFO clients \| grep connectedclients |当前连接数|
|查看最大连接数| redis-cli CONFIG GET maxclients |配置的最大连接数|
|查看所有连接| redis-cli CLIENT LIST |连接详情(IP、端口、状态)|
|设置最大连接数| redis-cli CONFIG SET maxclients 20000 |动态调整|
|关闭空闲连接| redis-cli CLIENT KILL IDLE 3600 |关闭空闲超过 3600 秒的连接|
### 7.4 总结
Redis 是 MySQL 的“高速缓存层”，负责加速读请求；MySQL 是数据的“最终归宿”，负责持久化存储。

两者协同的核心是 Cache-Aside 模式：读请求先查 Redis，未命中再查 MySQL 并回填缓存；写请求先更新 MySQL，再删除 Redis 缓存。

缓存三大异常(穿透、击穿、雪崩)需针对性防范，所有缓存必须设置 TTL，Redis 生产环境必须配置密码和内存淘汰策略。
