## Context

当前数据库访问入口已经从旧 helper、通用类型和多层转发收敛为 `database/index.ts` 的 `db` 与 `schemas`。表定义由 `tables/index.ts` 汇总，表管理和启动同步使用的 registry 已独立到 `tables/registry.ts`。这些改动是 `simplify-database-schema` 中仅有的三个已完成任务，与删表、历史数据处理和外键生命周期没有实施依赖。

## Goals / Non-Goals

**Goals:**

- 把当前已经落地的最小数据库访问边界形成独立可归档规范。
- 保证 `schemas`、registry、连接池和业务类型各自只有一个职责。
- 让业务查询直接使用 Drizzle 原生 API，避免重新出现改名式 helper。

**Non-Goals:**

- 不删除或增加数据库表、列、索引、trigger 或外键。
- 不改变连接池参数、事务语义、API DTO 或业务查询结果。
- 不处理 `file_upload_parts` 和其他数据库生命周期工作。

## Decisions

### 1. 公共入口只保留 db 与 schemas

`database/index.ts` 只导出 `db` 和 `schemas`。`db` 是唯一 Drizzle 客户端，`schemas` 是表定义 namespace，不额外导出 pool、sql、表达式、helper 或客户端类型。

备选方案是转发常用 Drizzle 表达式以减少 import。该方案只改变命名并模糊依赖来源，不采用。

### 2. 表定义汇总与 registry 分离

`tables/index.ts` 只汇总真实表定义。`managedTableRegistry` 和 `bootstrappedTableRegistry` 位于 `tables/registry.ts`，由表管理和启动同步精确导入，业务代码不得把 registry 当作 schema 或类型来源。

### 3. 业务类型绑定具体表

调用方使用 `schemas.<table>.$inferSelect` 和 `$inferInsert`。不保留绑定表管理白名单的 `SqlData`、`SqlInsertData` 或宽泛 `Db` 类型。

### 4. 连接池保持 client 内部实现

`client.ts` 负责配置 Pool 并创建 `db`，连接池不从公共入口导出。需要事务的调用方使用 `db.transaction`，不直接操作 pool。

## Risks / Trade-offs

- [调用方为了少写 import 重新增加 helper] → 以零引用静态审计和 capability 规范约束公共出口。
- [schemas 被混入 registry 常量] → `tables/index.ts` 与 `tables/registry.ts` 保持独立，启动和表管理精确导入 registry。
- [已完成代码在归档前发生漂移] → apply 阶段重新运行 server lint、出口搜索和差异检查，不假设历史勾选即可验收。

## Migration Plan

1. 对照当前工作区确认入口、调用方、类型和 registry 已满足 spec。
2. 搜索旧 helper、`Db`、通用数据类型和 pool 转发，确认零运行时引用。
3. 运行服务端 lint、OpenSpec strict 和差异检查。
4. 无偏差时完成任务并正常归档；发现偏差时只修复访问边界，不扩大到表结构。

该 change 不涉及数据迁移，回滚只需恢复代码出口。

## Open Questions

无。
