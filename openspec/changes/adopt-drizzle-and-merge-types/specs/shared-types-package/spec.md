## ADDED Requirements

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
