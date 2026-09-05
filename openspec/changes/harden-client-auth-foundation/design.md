## Context

client 当前把 token、用户、权限和派生布尔值一起持久化到 localStorage；路由守卫第一次校验 Cookie 后永久缓存 Promise，API 的 401 又只改 Zustand，造成 Cookie、内存状态、查询缓存和路由匹配可能互相矛盾。路由权限还使用共享权限树中不存在的本地字符串，导航不执行相同判断。server 虽已签发 signed、HttpOnly Cookie，却仍把 JWT 放入响应，同时普通用户密码直接写入并参与 SQL 等值查询。

该改造跨越 React client、共享 API 契约、权限运行时和 Node server，且需要兼容已有 user 表中的明文密码。仓库现有 PostgreSQL 启动同步只补缺失表、不自动修改已有结构；密码列 `varchar(255)` 足以容纳 Argon2id 编码值，因此迁移只更新数据，不变更表结构。

## Goals / Non-Goals

**Goals:**

- 浏览器认证只依赖服务端管理的 HttpOnly Cookie，不把可复用 JWT 暴露给前端 JavaScript。
- client 用互斥状态表达会话生命周期，并使校验请求可并发合并、完成释放、失败重试。
- 401 触发一个统一、幂等的客户端失效流程，清理所有用户作用域状态后进入登录页。
- 路由访问和导航展示复用同一共享权限 key 与判断函数。
- 普通用户密码在任何数据库写入路径中都只保存 Argon2id 哈希，历史明文在服务启动接流量前完成迁移。

**Non-Goals:**

- 不替换现有 JWT Cookie 会话协议，也不在本次引入 refresh token、服务端 session 表或多设备会话管理。
- 不对 Basic Auth 接口调用方改造；“Cookie 唯一凭据”限定浏览器登录会话。
- 不引入客户端自制密码加密；传输机密性由 HTTPS 提供，服务端负责单向哈希。
- 不迁移配置文件中的系统管理员密码；它不写入 user 表，仍作为独立运维凭据处理。
- 不顺带重构 client 其他页面或 admin 的状态管理架构。

## Decisions

### 1. 会话使用不持久化的判别联合状态机

Zustand 只保留 `unknown`、`checking`、`authenticated`、`anonymous` 四种互斥状态以及对应数据。`authenticated` 才包含 user 和 permissions，其余状态不保留身份数据；不再保存 token、`isAuthenticated` 或任何 session localStorage。这样登录态只能由当前进程内一次 Cookie 校验或成功登录建立，不会出现布尔值、用户和权限漂移。

替代方案是保留扁平字段并增加 `status`，但无效组合仍能被表达；也不选择 persist 用户展示信息，因为它会在 Cookie 失效后短暂展示过期身份。

### 2. 校验 Promise 只用于合并当前在途请求

路由守卫仅在状态为 `unknown` 时发起 `/login/verify`。模块级 Promise 在请求进行中被复用，并在 `finally` 中无条件置空。401 转为 `anonymous`；非认证类网络/服务错误恢复到 `unknown` 并继续向路由层抛出，从而保留后续重试能力而不是把网络故障误判为登出。

替代方案是永久缓存成功 Promise，但它无法表达登出、Cookie 过期或失败重试，正是当前缺陷来源。

### 3. API 只发布认证失效信号，由启动层注入协调器

Axios 仍是底层传输模块，仅识别标准化业务错误并调用已注册的 unauthorized handler，不静态导入 router 或 QueryClient。client 启动时注册认证生命周期协调器；该协调器同步把 session 置为 `anonymous` 并清空 QueryClient，再异步失效当前路由匹配并通过路由 helper 替换到登录页。重复 401 合并为同一个在途清理流程。

每个请求记录发出时的 session epoch。只有响应仍属于当前 epoch 时，401 才能触发失效；旧会话请求延迟返回的 401 不得清理之后刚建立的新会话。会话校验的成功和失败分支也遵守同一约束。

这种依赖方向避免 `router -> guard -> api -> router` 的静态循环。拦截器不等待路由导航完成，防止 `/login/verify` 的 beforeLoad 等待自身 401 处理而形成死锁。

主动退出复用同一客户端清理原语，但先请求 server 清 Cookie；即使服务端不可用也必须清理本地用户态。

### 4. 权限 key 以共享树为唯一手写数据源

共享权限树新增正式的 client 设置页权限 `pages.client.settings`，client 路由 meta 通过 `adminPermissionKey` 声明并使用 `AdminPermissionKey` 类型。共享包现有 `hasAllPermissions` 同时用于路由守卫与导航过滤，系统管理员在两处统一 bypass。导航由函数根据当前 session 派生，不保存第二份可见性状态。

替代方案是复用 `actions.setting.set`，但该 key 表达服务端系统设置写权限，与仅管理工作台偏好的页面语义不一致；继续保留 `settings.view` 则无法由角色权限树授予。

### 5. 登录响应不再携带 JWT

`LOGIN_RESPONSE` 删除可选 token；login 和 verify 只返回时间戳、用户及权限。token 只写入 signed、HttpOnly、SameSite Cookie，刷新时也只更新 Cookie。浏览器请求继续设置 `withCredentials: true`。

这是一项 API 契约破坏性变更。使用同一契约的 admin 登录辅助逻辑需要同步停止 localStorage token 读写，否则其类型检查和浏览器凭据模型会与服务端契约不一致。

### 6. 普通用户密码统一使用 Argon2id

server 新增单一密码模块封装 `hash`、`verify` 和编码识别，算法固定为 Argon2id，并使用库的安全默认参数。创建用户时在事务数据准备前异步哈希；更新请求只有显式提供非空密码时才生成新哈希，未提供密码保持原值，空密码请求被拒绝。

登录只按规范化用户名与启用状态查询 user id、昵称和密码哈希，再在应用层调用 Argon2 verify。数据库查询不再包含密码条件，日志和响应均不暴露哈希。

### 7. 启动迁移在服务监听前完成

在表结构自检之后、创建 Fastify 监听之前扫描普通用户的非空密码。以 Argon2id 编码前缀识别已迁移值，对其他值逐条哈希，并通过带“旧值仍相等”条件的更新实现并发安全；只有全部成功后服务才继续启动。迁移日志只记录数量，不记录用户名、明文或哈希。

选择启动期全量迁移而不是登录时惰性迁移，是因为惰性方案会让从未再次登录的账号继续永久保存明文。当前方案增加一次升级启动耗时，但满足“停止明文存储”的完整要求。

## Risks / Trade-offs

- [Argon2 是 CPU/内存密集操作，历史用户较多时首次启动变慢] → 在监听前迁移并记录计数，避免带着混合密码状态接流量；后续启动只做轻量扫描。
- [多实例同时启动可能重复计算同一明文] → 更新语句同时匹配 user id 和旧密码值；后写实例匹配不到时视为已被迁移。
- [旧数据可能包含其他未知哈希格式] → 本次将所有非 Argon2id 字符串视为历史凭据原值并再次 Argon2id 哈希，不尝试不可验证的格式猜测；升级前应备份数据库。
- [删除响应 token 会影响依赖该字段的浏览器应用] → 同一仓库 admin 同步移除 localStorage/header token 逻辑，外部 Basic Auth 调用协议不变。
- [401 导航与当前路由 beforeLoad 并发] → 本地清理同步完成，路由刷新放入独立异步任务且拦截器立即 reject；路由守卫仍可基于 `anonymous` 自行重定向。
- [新增 client 权限后普通用户默认看不到设置页] → 由管理员通过现有共享权限树显式授权；系统管理员保持全权限 bypass。

## Migration Plan

1. 先部署包含 Argon2id 依赖、密码工具和启动迁移的 server 构建；启动前备份 user 表。
2. server 启动时完成历史普通用户密码迁移，确认日志中的迁移成功数量且服务正常监听。
3. 同步发布共享类型、client 和 admin，停止读取响应 token 与浏览器 localStorage token。
4. 为需要访问 client 设置页的普通用户角色授予 `pages.client.settings`。
5. 验证登录、刷新、token 半程 Cookie 刷新、退出、401 清理和权限导航。

回滚应用版本前必须同时恢复升级前 user 表备份；Argon2id 哈希不可逆，旧版明文等值登录逻辑无法读取已迁移数据。若仅回滚前端，无需回滚密码数据，但旧前端不能再依赖登录响应 token。

## Open Questions

无。系统管理员配置密码后续可单独规划 secret manager 或哈希配置改造，不阻塞本次普通用户凭据安全闭环。
