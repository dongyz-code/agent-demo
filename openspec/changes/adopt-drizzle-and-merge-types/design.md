## Context

仓库目标是保持 `apps` 与 `packages` 两层语义：`apps` 放可运行应用，`packages` 放共享能力。当前 `apps/types` 承担前后端共享 API 契约职责，`apps/tables` 承担产品数据库表定义职责，和 `apps/client`、`apps/server` 的应用语义混在一起。

数据库层目前由 `packages/tables` 提供自研 SQL/table helper，`apps/tables` 定义产品表模型，`apps/server/src/database` 再组装 `pgsqlHelper` 并向业务路由暴露 `getHelper`、`insertHelper`、`updateHelper`、`removeHelper`、`tableInit` 等接口。这个模式能工作，但数据库模型、API 契约和服务端实现之间的边界不够清楚。

## Goals / Non-Goals

**Goals:**

- 将 `apps/types` 合并进 `packages/types`，通过 `common` 与 `routes` 目录表达类型职责。
- 使用 Drizzle 替换产品数据库表模型和运行时数据库访问。
- 将 Drizzle schema 放在 `apps/server/src/database/schema`，作为 server 内部数据库实现的一部分。
- 移除服务端对 `apps/tables`、`@repo/deploy-tables`、`packages/tables` 自研数据库 helper 的运行时依赖。
- 保持前后端 API 契约从 `@repo/types` 统一导出，避免契约直接依赖数据库 row 类型。

**Non-Goals:**

- 不在本变更中引入第三层目录，如 `domains`。
- 不把数据库 schema 拆成独立 `packages/db` 包，除非后续出现多个运行应用直接复用数据库 schema 的需求。
- 不在本变更中重做全部业务路由设计或权限模型。
- 不要求一次性消除所有 raw SQL；复杂查询可通过 Drizzle 的 SQL template 保留。

## Decisions

### 1. `packages/types` 成为项目共享类型包

`packages/types/src/common` 存放原通用类型工具，`packages/types/src/routes` 存放原 `apps/types/src/routes` 的 API 路由契约，顶层 `index.d.ts` 统一导出公共类型与路由契约。

备选方案是保留单独 `packages/deploy-contracts`，但当前约束希望 `types` 可以合并；因此通过目录分区维持语义边界，而不是增加包数量。

### 2. Drizzle schema 放在 `apps/server/src/database/schema`

数据库是 server 的实现细节，当前没有独立 worker、cron 或 CLI 需要直接复用 schema。将 schema 放在 server 内部可以阻止前端或共享类型包误依赖数据库结构。

如果未来出现多个后端运行单元共享数据库访问，再评估拆出 `packages/db`；现在拆包会过早扩大数据库结构的公共 API 面。

### 3. Drizzle 替代自研数据库 helper

服务端数据库入口保留在 `apps/server/src/database`，但内部从 `PostgreSql`/`pgsqlHelper` 切换到 Drizzle client、schema、transactions 和 `sql` template。业务代码逐步从 helper 调用迁移到 Drizzle query API。

迁移顺序应先建立 Drizzle schema 与 client，再按路由/模块替换查询，最后移除 `apps/tables` 与 `packages/tables` 的数据库 helper 依赖。

### 4. API 契约不再直接引用数据库 row 类型

原 `apps/types` 会通过 `deploy-tables` 推导 `SqlData`，这会让 API 响应结构被数据库表结构牵引。迁移后 `packages/types/routes` 应定义稳定 DTO 和枚举；server 在数据库 row 与 API DTO 之间做显式映射。

短期可先迁移已有类型结构，但不能继续通过 `node_modules/@repo/deploy-tables/build` 或 Drizzle schema 反向导出数据库类型给前端。

## Risks / Trade-offs

- [Risk] Drizzle schema 与现有数据库结构不完全一致，导致迁移生成误判。→ 先用现有表定义逐表对齐，生成迁移前检查 SQL diff，并在测试数据库验证。
- [Risk] 一次性替换全部 helper 改动面过大。→ 按模块迁移，保留 `apps/server/src/database` 作为唯一过渡入口，业务文件逐步切换到 Drizzle。
- [Risk] API DTO 与数据库 row 解耦会增加映射代码。→ 只在对外响应边界映射，内部查询仍使用 Drizzle 推导类型。
- [Risk] 移除 `@repo/deploy-types` 是破坏性变更。→ 先更新所有 workspace import，再删除包目录和 workspace 配置。

## Migration Plan

1. 重组 `packages/types`：创建 `common`、`routes` 目录，迁移原 `apps/types` 内容并更新导出。
2. 更新 `apps/client`、`apps/server` 的类型引用，从 `@repo/deploy-types` 切换到 `@repo/types`。
3. 在 `apps/server/src/database/schema` 建立 Drizzle schema，覆盖现有产品表。
4. 在 `apps/server/src/database` 建立 Drizzle client、事务和迁移入口。
5. 按业务模块替换 `getHelper`、`insertHelper`、`updateHelper`、`removeHelper`、`pgsql.query` 调用。
6. 移除 `apps/tables`、`apps/types` 及相关 workspace/package 依赖。
7. 在测试数据库运行构建、类型检查和迁移验证。

回滚策略：迁移完成前保留独立提交边界；如果 Drizzle 迁移验证失败，回滚数据库访问替换提交并保留旧 helper 路径。

## Open Questions

暂无。

已决策：

- 不保留 `@repo/deploy-types` 的短期兼容导出，迁移时直接更新所有引用到 `@repo/types`。
- 不保留现有 `TABLE_PREFIX` 机制，Drizzle 迁移后的表名保持稳定；环境隔离由部署数据库配置承担。
