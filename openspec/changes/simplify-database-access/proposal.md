## Why

`simplify-database-schema` 把数据库出口收敛、删表和外键生命周期放在同一个大 change 中，但数据库出口部分已经独立完成，继续与未实施工作绑定会掩盖真实进度。需要把它单独建模为稳定访问边界，便于立即验收和归档。

Supersedes: `simplify-database-schema` 中“数据库访问入口收敛”部分。

## What Changes

- 数据库公共入口只导出 Drizzle 客户端 `db` 和汇总表定义 `schemas`。
- `schemas` 只聚合真实 Drizzle 表定义；表管理白名单和启动注册表保留在独立 `tables/registry.ts`。
- 调用方直接使用 Drizzle 原生条件、排序、SQL 和 `$count`，不维护改名式查询 helper。
- 业务类型从具体表的 `$inferSelect`、`$inferInsert` 推导，不依赖表管理 registry 或通用 `Db` 类型。
- 连接池和客户端构造保持在 `client.ts` 内部，不从数据库公共入口转发。
- 本 change 以当前已完成代码为基线，只做审计、校验和规范归档，不包含删表或外键实现。

## Capabilities

### New Capabilities

- `server-database-access-boundary`: 定义服务端数据库公共出口、表定义汇总、registry 隔离和 Drizzle 原生查询边界。

### Modified Capabilities

无。

## Impact

- 影响 `apps/server/src/database/index.ts`、`client.ts`、`tables/index.ts`、`tables/registry.ts` 及数据库调用方的静态访问约定。
- 不修改数据库表结构、数据、公共 API 或运行时依赖。
