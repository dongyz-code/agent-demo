## 1. 共享类型包迁移

- [x] 1.1 在 `packages/types/src` 下建立 `common` 与 `routes` 目录结构。
- [x] 1.2 将原 `packages/types/src/utils` 内容迁移到 `packages/types/src/common` 并更新导出入口。
- [x] 1.3 将 `apps/types/src/routes`、API 聚合类型和路由工具类型迁移到 `packages/types/src/routes`。
- [x] 1.4 去除 `packages/types` 中对 `apps/types` 或 `@repo/deploy-types` 的隐式依赖，并确保顶层 `index.d.ts` 导出公共类型和路由契约。
- [x] 1.5 将 `apps/client` 与 `apps/server` 中的 `@repo/deploy-types` 引用替换为 `@repo/types`。

## 2. Drizzle 基础设施

- [x] 2.1 为 `apps/server` 增加 Drizzle、PostgreSQL driver 适配和 drizzle-kit 所需依赖与脚本。
- [x] 2.2 在 `apps/server/src/database` 建立 Drizzle client 入口，并复用现有数据库配置来源。
- [x] 2.3 在 `apps/server/src/database` 建立事务与必要 raw SQL 的统一使用方式。
- [x] 2.4 配置 Drizzle migration 目录、配置文件和执行入口。

## 3. 数据库 Schema 迁移

- [x] 3.1 在 `apps/server/src/database/schema` 按现有表定义建立 Drizzle schema 文件。
- [x] 3.2 为用户、角色、用户角色、应用、任务、API 日志、用户日志、系统配置等现有表补齐列类型、索引、主键和可空约束。
- [x] 3.3 从 Drizzle schema 推导服务端内部数据库类型，并替换旧 `SqlData` 类型来源。
- [x] 3.4 生成或维护首批 Drizzle migration，并人工检查 SQL diff 与现有表结构一致。

## 4. 服务端数据库访问替换

- [x] 4.1 替换 `apps/server/src/database/index.ts` 中的 `PostgreSql`、`pgsqlHelper`、`tableInit` 和 helper 导出。
- [x] 4.2 按登录、系统管理、主应用、任务、日志模块逐步替换 `getHelper`、`insertHelper`、`updateHelper`、`removeHelper` 调用。
- [x] 4.3 将保留的自定义 SQL 查询改为 Drizzle `sql` template 或 Drizzle 查询 API。
- [x] 4.4 在 API 响应边界增加数据库 row 到 `@repo/types` DTO 的显式映射。
- [x] 4.5 确保服务端启动流程使用 Drizzle migration/health check 替代旧 `tableInit`。

## 5. 清理与验证

- [x] 5.1 删除 `apps/types` 包目录并更新 `pnpm-workspace.yaml`、根脚本和相关 package 依赖。
- [x] 5.2 删除 `apps/tables` 包目录并移除 `@repo/deploy-tables` 依赖。
- [x] 5.3 移除 `apps/server` 对 `@repo/tables` 数据库 helper 的运行时依赖；如 `packages/tables` 无其他用途则同步下线或标记废弃。
- [x] 5.4 运行类型检查、构建和相关 lint，确保 `apps/client`、`apps/server`、`packages/types` 均通过。
- [x] 5.5 在测试数据库执行 Drizzle migration，并验证核心路由的查询、写入、事务和日志流程。
