## Purpose

定义 `packages/types` 作为共享类型包的目录分区、导出边界、应用引用方式，以及旧共享类型应用包下线后的约束。

## Requirements

### Requirement: 共享类型包目录分区
`packages/types` SHALL 使用 `src/common` 存放公共类型工具，使用 `src/routes` 存放 API 路由契约，并通过顶层入口导出两类类型。

#### Scenario: 开发者查找路由契约
- **WHEN** 开发者需要查看任一 API 路由的请求或响应类型
- **THEN** 系统 MUST 在 `packages/types/src/routes` 下提供对应类型定义

#### Scenario: 开发者查找公共类型工具
- **WHEN** 开发者需要查看通用 TypeScript 工具类型
- **THEN** 系统 MUST 在 `packages/types/src/common` 下提供对应类型定义

### Requirement: 应用统一依赖共享类型包
前端和后端应用 SHALL 从 `@repo/types` 引用共享类型，不再依赖 `@repo/deploy-types`。

#### Scenario: 应用执行类型检查
- **WHEN** `apps/client` 或 `apps/server` 执行 TypeScript 类型检查
- **THEN** 类型引用 MUST 解析到 `@repo/types`
- **THEN** 类型引用 MUST NOT 依赖 `@repo/deploy-types`

### Requirement: API 契约不得依赖数据库实现
`packages/types/src/routes` SHALL 定义稳定 API DTO、枚举和路由契约，不得通过数据库表 schema 或生成产物直接导出数据库 row 类型。

#### Scenario: 路由类型导出
- **WHEN** `@repo/types` 导出 API 路由契约
- **THEN** 导出的契约 MUST NOT 引用 `apps/server/src/database/schema`
- **THEN** 导出的契约 MUST NOT 通过 `node_modules` 相对路径引用数据库类型产物

### Requirement: 移除旧共享类型应用包
迁移完成后，仓库 SHALL 移除 `apps/types` 应用包及其 workspace 依赖入口。

#### Scenario: Workspace 包扫描
- **WHEN** 开发者查看 workspace 包列表
- **THEN** 系统 MUST NOT 将 `apps/types` 作为独立包发布或构建

### Requirement: API 契约支持请求部位
`packages/types` SHALL 支持 API route 契约分别声明 `body`、`query` 和 `params`，并保持旧 `req` 契约兼容。

#### Scenario: 旧 req 契约保持兼容
- **WHEN** route 契约只声明 `req` 和 `resp`
- **THEN** 前端 API 调用类型 MUST 继续使用 `req` 作为请求数据类型
- **THEN** 后端 route handler 类型 MUST 继续使用 `req` 推导兼容请求数据

#### Scenario: POST body 契约
- **WHEN** route 契约声明 `body`
- **THEN** 前端 API 调用的数据参数 MUST 推导为 `body` 类型
- **THEN** 后端 route handler 的 `body` 参数 MUST 推导为相同类型

#### Scenario: query 契约
- **WHEN** route 契约声明 `query`
- **THEN** 后端 route handler 的 `query` 参数 MUST 推导为该类型
- **THEN** 前端 HTTP 客户端 MUST 能在 GET 请求中将该数据作为 query 参数发送

#### Scenario: params 契约
- **WHEN** route 契约声明 `params`
- **THEN** 后端 route handler 的 `params` 参数 MUST 推导为该类型
- **THEN** route 类型 MUST 能表达路径参数约束

#### Scenario: 同时声明多个请求部位
- **WHEN** route 契约同时声明 `body`、`query` 和 `params`
- **THEN** 后端 route handler MUST 能分别读取三类强类型参数
- **THEN** 类型工具 MUST NOT 将三类请求数据合并为单个不透明对象

### Requirement: API 响应类型兼容
`packages/types` SHALL 保持现有 `resp` 推导能力，并继续支持未声明 `resp` 时默认返回 `'ok'`。

#### Scenario: 显式 resp
- **WHEN** route 契约声明 `resp`
- **THEN** 前端 API 调用返回值 MUST 推导为该 `resp` 类型
- **THEN** 后端 route handler 返回值 MUST 推导为该 `resp` 类型

#### Scenario: 默认 resp
- **WHEN** route 契约未声明 `resp`
- **THEN** 类型工具 MUST 将响应类型推导为 `'ok'`

### Requirement: API 类型工具可读且兼容
`packages/types` 与 `@repo/utils-node` SHALL 提供可读的 API 类型工具，并保留 `APISource` 和 `APIRoutes` 兼容导出。

#### Scenario: 现有类型引用
- **WHEN** 服务端代码引用 `APISource<API>` 或 `APIRoutes<API>`
- **THEN** TypeScript MUST 继续解析这些类型
- **THEN** 现有 `RoutesSource` 和 `Routes` 类型别名 MUST 继续工作

#### Scenario: 类型工具拆分
- **WHEN** 开发者查看 API 类型工具实现
- **THEN** 系统 MUST 提供命名清晰的小型类型工具表达 route body、query、params 和 response
- **THEN** 复杂递归 flatten 逻辑 MUST 被封装在内部工具中

#### Scenario: 前后端类型一致
- **WHEN** 同一 route 被前端 API 客户端和后端 route handler 使用
- **THEN** 两侧 MUST 从同一份 `@repo/types` 契约推导请求和响应类型
- **THEN** 两侧 MUST NOT 复制定义同一 route 的 DTO 类型

### Requirement: API 契约 schema 关联
`packages/types` SHALL 支持 route schema 与 API 契约在开发期进行一致性校验，但不强制所有 route 一次性声明 schema。

#### Scenario: route 提供 schema
- **WHEN** route 为 `body`、`query`、`params` 或 `resp` 提供 schema
- **THEN** 类型辅助工具 MUST 能校验 schema 静态类型与 route 契约相互兼容

#### Scenario: route 未提供 schema
- **WHEN** route 暂未提供 schema
- **THEN** 类型工具 MUST 保持旧 route 可用
- **THEN** 系统 MUST NOT 因缺少 schema 破坏现有类型检查

#### Scenario: schema 校验失败
- **WHEN** schema 静态类型与 route 契约不兼容
- **THEN** TypeScript MUST 在开发期暴露类型错误
