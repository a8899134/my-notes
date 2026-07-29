## 一、什么是 types 域
### 1.1 types 域的概念
types 域(MIME 类型映射配置块)是 Nginx 中用于定义文件扩展名与 MIME 类型映射关系的配置单元。

简单来说，types 域就是 Nginx 的“文件类型翻译官”—它告诉 Nginx：“当用户请求 .html 文件时，告诉浏览器这是 text/html；当请求 .png 文件时，告诉浏览器这是 image/png。”
### 1.2  types 域作用
当浏览器请求一个资源时，服务器需要在 HTTP 响应头中告诉浏览器这个文件是什么类型，浏览器才能正确地解析和显示它。

| 文件类型 | 正确的 Content-Type | 浏览器行为 |
|----------|---------------------|------------|
| `text/html` | 浏览器解析为网页，渲染显示 | |
| `image/png` | 浏览器显示图片 | |
| `application/javascript` | 浏览器当作 JS 脚本执行 | |
| `application/octet-stream` | 浏览器当作二进制流，直接下载 | |

如果 Nginx 不知道文件的 MIME 类型(或者配置错误)，浏览器可能会：
- 把 HTML 页面当成纯文本显示(显示源代码)
- 把图片当成文件直接下载(而不是显示)
- 把 JS 文件当成文本输出(而不是执行)
### 1.3 types 域的位置
types 块可以出现在 http、server、location 三个层级中，且以最下层的配置为准。
```
http {
    # 方式一：直接定义 types 块(不推荐)
    types {
        text/html html htm;
        text/css css;
    }

    # 方式二：通过 include 引入外部文件(推荐)
    include /etc/nginx/mime.types;

    server {
        # server 级的 types 会覆盖 http 级的
        types {
            # 自定义配置
        }

        location / {
            # location 级的 types 优先级最高
            types {
                # 自定义配置
            }
        }
    }
}
```

## 二、mime.types 文件
### 2.1 什么是 mime.types
mime.types 是 Nginx 自带的一个独立的配置文件，里面定义了一个完整的 types 块，包含了常见文件扩展名与 MIME 类型的映射表。
在默认的 `nginx.conf` 中，通常会看到这样一行：
```
http {
    include mime.types;    # 引入 mime.types 文件
    default_type application/octet-stream;
}
```
这行配置的作用，就是把 mime.types 文件里的所有 MIME 映射规则“复制粘贴”到当前 http 块中。
### 2.2 mime.types 文件内容示例
打开 `/etc/nginx/mime.types` 文件，你会看到类似这样的内容：
```
types {
    text/html                             html htm shtml;
    text/css                              css;
    text/xml                              xml;
    image/gif                             gif;
    image/jpeg                            jpeg jpg;
    image/png                             png;
    image/webp                            webp;
    application/javascript                js;
    application/json                      json;
    application/pdf                       pdf;
    application/zip                       zip;
    audio/mpeg                            mp3;
    video/mp4                             mp4;
    video/x-msvideo                       avi;
    # ... 更多映射关系
}
```
格式说明：
- 冒号左边是 MIME 类型(如 text/html)
- 冒号右边是对应的文件扩展名(如 html、htm、shtml)
- 一个 MIME 类型可以对应多个扩展名
### 2.3 为什么推荐用 include 而不是直接写 types？
| 方式                  | 优点             | 缺点             |
| - | -- | -- |
| include mime.types; | 简洁、自带完整映射、易于维护 | 无法自定义(除非修改原文件) |
| 直接写 types { ... }   | 可完全自定义         | 配置冗长、容易遗漏常见类型  |

**最佳实践**：在 http 块中用 include mime.types; 引入标准映射表，然后在需要的地方(server 或 location 块)用自定义 types 进行覆盖或补充。
## 三、default_type 指令
### 3.1 什么是 default_type
default_type 是 Nginx 中用于设置默认 MIME 类型的指令。
当 Nginx 在 types 映射表中找不到请求文件对应的 MIME 类型时，就会使用 default_type 指定的类型作为兜底。
### 3.2 语法
```
default_type mime-type;
```
默认值：text/plain

**常见生产环境配置**：
```
default_type application/octet-stream;
```
### 3.3 default_type 的实际效果
| 场景 | 配置 | 访问一个未知类型的文件(如 `.xyz`) |
|------|------|--------------------------------|
| 不配置 `default_type` | 默认 `text/plain` | 浏览器直接显示文件内容(乱码) |
| `default_type application/octet-stream;` | 二进制流 | 浏览器提示下载文件 |

**为什么要设成 application/octet-stream**

生产环境通常将 default_type 设为 application/octet-stream。这样，如果一个未知类型的文件被访问，浏览器会直接提示用户下载，而不是尝试去解析它(可能造成安全风险或显示乱码)。
### 3.4 配置位置
default_type 可以在 http、server、location 三个层级中配置。
```
http {
    default_type application/octet-stream;    # 全局默认

    server {
        default_type text/plain;              # server 级覆盖

        location /download/ {
            default_type application/octet-stream;   # location 级覆盖
        }
    }
}
```

## 四、配置位置与优先级
### 4.1 层级结构
```
http 块
├── types { ... }              ← 可以定义 types
├── include mime.types;        ← 引入标准映射表(推荐)
├── default_type application/octet-stream;   ← 设置默认类型
│
├── server 块
│   ├── types { ... }          ← 覆盖 http 级的 types(合并，非完全替换)
│   ├── default_type ...       ← 覆盖 http 级的 default_type
│   │
│   └── location 块
│       ├── types { ... }      ← 覆盖上级的 types
│       └── default_type ...   ← 覆盖上级的 default_type
```
### 4.2 优先级规则
| 规则                  | 说明                                        |
| - | -- |
| types 以最下层为准        | location 中的 types 优先级最高，其次 server，最后 http |
| default_type 以最下层为准 | 同样遵循就近原则，最内层的配置覆盖外层                       |
| types 是“合并”而非“替换”   | 子级的 `types` 不会完全替换父级的，而是在父级基础上增加/覆盖       |
### 4.3 示例说明
```
http {
    include mime.types;    # 包含标准映射：text/html → html htm

    server {
        # server 级的 types 会与 http 级的合并
        types {
            text/html myhtml;    # 增加：.myhtml 也映射到 text/html
        }
        # 结果：text/html 同时对应 html、htm、myhtml

        location /special/ {
            types {
                text/html special;    # 仅在这个 location 中，.special 映射到 text/html
            }
            # 注意：这里的 types 不会继承 server 级的 myhtml 映射
            # 只保留 special + 父级的标准映射
        }
    }
}
```

## 五、自定义 MIME 类型
虽然 mime.types 已经包含了绝大多数常见文件类型，但在实际项目中，你可能会遇到：
- 项目中使用了新的文件格式(如 .webmanifest、.wasm)
- 需要为特定后缀强制指定某种 MIME 类型
- 需要覆盖某个后缀的默认 MIME 类型
### 5.2 如何在 Nginx 中添加自定义 MIME 类型
1. 方式一：直接修改 mime.types 文件(不推荐)
直接编辑 /etc/nginx/mime.types，在 types 块中添加：
```
types {
    # ... 原有内容 ...
    application/manifest+json    webmanifest;    # 新增
    application/wasm             wasm;           # 新增
}
```
⚠️ **不推荐**：升级 Nginx 时可能会覆盖此文件，丢失自定义配置。

2. 方式二：在 nginx.conf 中补充(推荐)
在 http、server 或 location 块中追加自定义映射：
```
http {
    include mime.types;    # 先引入标准映射

    # 补充自定义 MIME 类型
    types {
        application/manifest+json    webmanifest;
        application/wasm             wasm;
        text/csv                     csv;
    }
}
```
3. **方式三：创建独立的自定义文件(最佳实践)**
```
# /etc/nginx/conf.d/custom-mime.conf
types {
    application/manifest+json    webmanifest;
    application/wasm             wasm;
}
```
然后在 `nginx.conf` 中引入：
```
http {
    include mime.types;
    include /etc/nginx/conf.d/custom-mime.conf;    # 引入自定义映射
}
```
### 5.3 常用自定义 MIME 类型
| 文件扩展名 | MIME 类型 | 用途 |
|------------|-----------|------|
| `.webmanifest` | `application/manifest+json` | PWA 应用清单 |
| `.wasm` | `application/wasm` | WebAssembly 二进制文件 |
| `.csv` | `text/csv` | CSV 数据文件 |
| `.woff2` | `font/woff2` | WOFF2 字体文件 |
| `.mjs` | `application/javascript` | ES Module JS 文件 |

## 六、综合配置示例
### 6.1 标准配置(推荐)
```
http {
    # 引入标准 MIME 类型映射
    include /etc/nginx/mime.types;

    # 设置默认 MIME 类型(未知类型 → 下载)
    default_type application/octet-stream;

    # 补充自定义 MIME 类型
    types {
        application/manifest+json    webmanifest;
        application/wasm             wasm;
        text/csv                     csv;
        font/woff2                   woff2;
    }

    server {
        listen 80;
        server_name example.com;
        root /var/www/html;

        # 所有请求走标准 MIME 映射 + 自定义补充
        location / {
            try_files $uri $uri/ =404;
        }

        # 特定目录使用不同的默认类型
        location /download/ {
            default_type application/octet-stream;    # 强制下载
        }
    }
}
```
### 6.2 临时测试配置
如果你想验证 types 和 default_type 的效果，可以用这个测试配置：
```
location /mimetest/ {
    alias /var/www/html/;
    types { }                      # 清空 types 映射
    default_type text/plain;       # 所有文件以纯文本返回
}
```
访问 /mimetest/index.html，浏览器会直接显示 HTML 源代码，而不是渲染页面，证明配置生效。

## 七、总结
types 域是 Nginx 的“文件类型翻译官”—它通过 mime.types 文件定义了一套完整的文件扩展名与 MIME 类型的映射表，让浏览器能够正确地解析和显示各种类型的文件；当遇到未知类型时，default_type 则作为最后的兜底方案。