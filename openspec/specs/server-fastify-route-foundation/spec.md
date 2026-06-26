## Purpose

定义服务端基于 Fastify 的路由基础能力，包括类型安全的路由定义、schema 校验、错误响应、认证上下文、统一响应包裹、目录路由加载以及 Fastify 工具库的职责拆分。

## Requirements

### Requirement: 类型安全的路由定义
服务端 SHALL 提供类型安全的 route 定义入口，并保持现有 `routerHandler` 使用方式可继续工作。

#### Scenario: 旧 route 不修改业务 handler
- **WHEN** 现有 route 使用 `routerHandler({ url, method, handler })` 且 handler 读取兼容参数 `body`
- **THEN** 系统 MUST 继续通过 TypeScript 类型检查
- **THEN** 系统 MUST 继续按现有 API 契约推导请求和响应类型

#### Scenario: 新 route 声明多个请求部位
- **WHEN** route 契约声明 `body`、`query` 或 `params`
- **THEN** route handler MUST 能分别以强类型读取 `body`、`query` 和 `params`
- **THEN** route handler MUST NOT 依赖 `body ?? query` 合并逻辑获取请求数据

#### Scenario: route 挂载 schema
- **WHEN** route 定义传入 Fastify `schema`
- **THEN** 系统 MUST 将该 schema 原样注册到 Fastify route
- **THEN** TypeScript MUST 保留该 route 的请求和响应契约类型推导

### Requirement: Fastify schema 校验
服务端 SHALL 支持使用 Fastify 原生 schema 对请求进行运行时校验。

#### Scenario: 请求满足 schema
- **WHEN** 请求的 `body`、`querystring` 和 `params` 满足 route schema
- **THEN** 系统 MUST 执行业务 handler

#### Scenario: 请求不满足 schema
- **WHEN** 请求的 `body`、`querystring` 或 `params` 不满足 route schema
- **THEN** 系统 MUST 拒绝请求
- **THEN** 响应 HTTP 状态码 MUST 为 400
- **THEN** 响应体 MUST 包含统一错误对象

#### Scenario: 未声明 schema 的兼容 route
- **WHEN** route 未声明 schema
- **THEN** 系统 MUST 保持现有运行行为
- **THEN** 系统 MUST NOT 阻止该 route 注册

### Requirement: 非 200 错误响应
服务端 SHALL 使用 HTTP 状态码表达请求失败，并保持统一错误响应体。

#### Scenario: 认证失败
- **WHEN** 请求未通过认证
- **THEN** 响应 HTTP 状态码 MUST 为 401
- **THEN** 响应体 MUST 包含 `{ error: { code, msg } }`

#### Scenario: 权限不足
- **WHEN** 业务错误表示当前身份无权执行操作
- **THEN** 响应 HTTP 状态码 MUST 为 403
- **THEN** 响应体 MUST 包含 `{ error: { code, msg } }`

#### Scenario: 未知服务端错误
- **WHEN** handler 抛出未映射的未知错误
- **THEN** 响应 HTTP 状态码 MUST 为 500
- **THEN** 系统 MUST 记录错误日志
- **THEN** 响应体 MUST 包含统一默认错误码和错误消息

#### Scenario: 前端读取业务错误
- **WHEN** 服务端返回非 2xx 错误响应
- **THEN** 响应体 MUST 保持 `{ error: { code, msg } }` 结构
- **THEN** 前端拦截器 MUST 能从错误响应中读取业务错误码和消息

### Requirement: 认证上下文
服务端 SHALL 将认证结果写入 Fastify request 装饰字段，而不是写入请求 headers。

#### Scenario: JWT 认证成功
- **WHEN** 请求携带有效 JWT token
- **THEN** 认证 hook MUST 将解析结果写入 `request.auth`
- **THEN** route handler MUST 能通过注入参数读取认证信息
- **THEN** 系统 MUST NOT 将认证结果写入 `request.headers.__token`

#### Scenario: Basic Auth 认证成功
- **WHEN** 请求通过 Basic Auth 认证
- **THEN** 认证 hook MUST 将接口调用身份写入 `request.auth`
- **THEN** route handler MUST 能区分用户 token 身份和接口 client 身份

#### Scenario: 兼容旧 handler 参数
- **WHEN** 旧 handler 读取 `__token` 或 `operator`
- **THEN** 系统 MUST 从 `request.auth` 派生兼容参数
- **THEN** 系统 MUST NOT 要求旧 route 一次性重写

### Requirement: 统一响应包裹
服务端 SHALL 在统一位置处理成功响应包裹，并允许业务 route 使用自己的 Fastify hook。

#### Scenario: 普通成功响应
- **WHEN** handler 返回普通对象或数组
- **THEN** 系统 MUST 返回 `{ data: payload }`

#### Scenario: 已包裹响应
- **WHEN** handler 或 hook 返回已包含顶层 `data` 或 `error` 的对象
- **THEN** 系统 MUST NOT 重复包裹响应

#### Scenario: 特殊响应类型
- **WHEN** handler 返回 string、Buffer、stream、null 或已由 reply 发送的响应
- **THEN** 系统 MUST NOT 强制包裹该响应

#### Scenario: 业务 preSerialization
- **WHEN** route 自己声明 `preSerialization`
- **THEN** 系统 MUST 允许 route 注册
- **THEN** 统一响应包裹 MUST NOT 因 route 使用 `preSerialization` 而抛错

### Requirement: 目录路由加载
服务端 SHALL 支持从 routes 目录动态加载 route 文件，并移除生成单文件聚合的必要性。

#### Scenario: 开发环境加载路由
- **WHEN** 服务端在 `tsx` 开发环境启动
- **THEN** 系统 MUST 从 `apps/server/src/router/routes` 递归加载 `.ts` route 文件
- **THEN** 系统 MUST 按稳定顺序注册 route

#### Scenario: 构建产物加载路由
- **WHEN** 服务端从 TypeScript 编译后的构建产物启动
- **THEN** 系统 MUST 从构建目录中的 router routes 目录递归加载 `.js` route 文件
- **THEN** 系统 MUST NOT 依赖 `routes-single-file.ts`

#### Scenario: 移除 route make 脚本依赖
- **WHEN** 执行服务端 `build` 或 `lint`
- **THEN** 系统 MUST NOT 要求先执行 `route:make`
- **THEN** 仓库 MUST NOT 依赖生成的 `routes-single-file.ts` 才能启动服务

#### Scenario: 非 route 文件保护
- **WHEN** routes 目录中存在不应注册的辅助文件、测试文件或类型文件
- **THEN** 路由加载器 MUST 跳过这些文件或在启动时给出明确错误

### Requirement: Fastify 工具职责拆分
Fastify 基础工具库 SHALL 拆分核心职责，并保持对现有公共 API 的兼容导出。

#### Scenario: 创建 Fastify 实例
- **WHEN** 应用调用新的 `createFastify`
- **THEN** 系统 MUST 创建 Fastify 实例并按配置注册基础插件
- **THEN** 插件注册 MUST 能通过配置开启、关闭或传入插件选项

#### Scenario: 兼容旧拼写
- **WHEN** 现有代码继续调用 `creatFastify`
- **THEN** 系统 MUST 继续工作
- **THEN** 系统 MUST 将其作为兼容别名保留到迁移完成

#### Scenario: 模块边界清晰
- **WHEN** 开发者查看 Fastify 工具库源码
- **THEN** 创建服务、路由加载、错误处理、响应包裹、认证上下文和类型导出 MUST 位于职责清晰的文件中
- **THEN** 单个文件 MUST NOT 同时承载所有 Fastify 基础能力
