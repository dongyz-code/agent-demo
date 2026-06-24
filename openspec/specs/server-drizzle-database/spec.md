## Purpose

定义服务端数据库层迁移到 Drizzle 后的 schema 位置、数据库访问方式、迁移入口、运行时依赖边界，以及 API 响应与数据库 row 的映射约束。

## Requirements

### Requirement: 服务端 Drizzle schema 位置
服务端数据库 schema SHALL 放置在 `apps/server/src/database/schema`，并使用 Drizzle schema 定义产品表、列类型、索引和关系。

#### Scenario: 开发者查看数据库 schema
- **WHEN** 开发者需要查看产品数据库表结构
- **THEN** 系统 MUST 在 `apps/server/src/database/schema` 下提供 Drizzle schema 定义

### Requirement: 服务端使用 Drizzle 访问数据库
服务端业务代码 SHALL 使用 Drizzle client、Drizzle transaction 和 Drizzle SQL template 访问 PostgreSQL。

#### Scenario: 路由查询数据库
- **WHEN** 服务端路由需要查询、插入、更新或删除数据库记录
- **THEN** 代码 MUST 使用 Drizzle 提供的查询、事务或 SQL template 能力
- **THEN** 代码 MUST NOT 调用 `getHelper`、`insertHelper`、`updateHelper`、`removeHelper` 等自研 table helper

### Requirement: 移除自研数据库封装运行时依赖
迁移完成后，`apps/server` SHALL 不再运行时依赖 `apps/tables`、`@repo/deploy-tables` 或 `packages/tables` 提供的数据库 helper。

#### Scenario: 服务端构建依赖检查
- **WHEN** `apps/server` 构建或启动
- **THEN** 系统 MUST NOT 需要 `@repo/deploy-tables` 包
- **THEN** 系统 MUST NOT 需要 `@repo/tables` 中的数据库 helper

### Requirement: Drizzle 迁移作为数据库结构变更入口
数据库结构变更 SHALL 通过 Drizzle schema 与迁移产物表达，并在部署或启动流程中有明确的执行入口。

#### Scenario: 新增或修改表结构
- **WHEN** 开发者修改 `apps/server/src/database/schema`
- **THEN** 系统 MUST 能生成或维护对应 Drizzle migration
- **THEN** 系统 MUST 能在目标数据库执行该 migration

### Requirement: API 响应与数据库行显式映射
服务端 SHALL 在数据库 row 类型和 API DTO 之间保持显式映射，避免前端契约直接暴露数据库实现。

#### Scenario: 返回任务列表
- **WHEN** 服务端从数据库读取任务记录并返回给前端
- **THEN** 服务端 MUST 将 Drizzle 查询结果映射为 `@repo/types` 中定义的响应 DTO
- **THEN** 前端 MUST NOT 依赖 Drizzle 推导的数据库 row 类型
