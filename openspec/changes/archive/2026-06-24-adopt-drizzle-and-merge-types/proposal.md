## Why

当前仓库中 `apps/types` 和 `apps/tables` 实际承担共享包职责，导致 `apps` 同时包含可运行应用和共享契约/模型，目录语义不清晰。数据库层还依赖自研 SQL/table helper，迁移、类型推导和查询边界都与后端实现耦合，后续演进容易形成隐式依赖。

## What Changes

- 将 `apps/types` 合并到 `packages/types`，在 `packages/types/src/routes` 存放 API 路由契约，在 `packages/types/src/common` 存放公共类型工具。
- **BREAKING** 移除 `@repo/deploy-types` 包，前端和后端统一从 `@repo/types` 引用共享类型。
- 将数据库 schema 固定在 `apps/server/src/database/schema`，并以 Drizzle schema 作为数据库结构和类型推导来源。
- 使用 Drizzle 替换自研数据库封装，逐步移除 `apps/tables` 与 `packages/tables` 中数据库相关 helper 的运行时依赖。
- 后端数据库访问改为基于 Drizzle client、Drizzle schema、事务和必要的 raw SQL，而不是 `getHelper`、`insertHelper`、`updateHelper` 等自研接口。

## Capabilities

### New Capabilities

- `shared-types-package`: 定义共享类型包的组织方式、导出约定和应用引用方式。
- `server-drizzle-database`: 定义服务端数据库 schema、查询、事务和迁移能力迁移到 Drizzle 后应满足的行为。

### Modified Capabilities

暂无。

## Impact

- 影响 `apps/client`、`apps/server`、`apps/types`、`apps/tables`、`packages/types`、`packages/tables`。
- 影响包依赖：移除 `@repo/deploy-types`、`@repo/deploy-tables` 的消费路径，新增 Drizzle 相关依赖。
- 影响数据库初始化与迁移流程：由自研 `tableInit`/table helper 转向 Drizzle schema/migration。
- 影响 API 类型引用：路由契约从 `packages/types/src/routes` 导出。
