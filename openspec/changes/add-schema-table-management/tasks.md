## 1. 类型和数据模型

- [x] 1.1 在 `packages/types` 新增表管理相关请求/响应类型，并把 `/sys/table/*` 合并进 `Sys` 路由类型。
- [x] 1.2 在服务端 Drizzle schema 中新增 `table_structure_ops` 操作记录表，字段覆盖计划内容、状态、操作者、备份表、错误信息和时间戳。
- [x] 1.3 生成并检查数据库迁移，确保只新增审计表，不修改现有业务表。
- [x] 1.4 扩展用户操作日志类型，记录表管理计划生成和执行事件。

## 2. 后端权限和元数据

- [x] 2.1 新增表管理权限 helper，支持系统管理员、页面/操作权限、表范围权限和 wildcard 权限判断。
- [x] 2.2 新增 Drizzle schema 解析服务，基于 `schemaTables` 和 `getTableConfig` 输出目标表结构。
- [x] 2.3 新增 Postgres catalog 读取服务，查询真实表、字段、索引、约束、估算行数和物理存在状态。
- [x] 2.4 新增 schema diff 服务，生成字段、索引、约束和物理状态差异摘要。
- [x] 2.5 新增敏感字段识别与 demo 数据脱敏工具，默认处理密码、密钥、token、hash、二进制和大字段。

## 3. 后端 API

- [x] 3.1 实现 `/sys/table/list`，只返回当前用户有权限访问的注册表。
- [x] 3.2 实现 `/sys/table/detail`，返回目标结构、数据库实态、约束摘要和 diff。
- [x] 3.3 实现 `/sys/table/preview`，返回限量、稳定排序、脱敏后的 demo 数据。
- [x] 3.4 实现 `/sys/table/operation-list` 和 `/sys/table/operation-detail`，支持查看计划和执行记录。
- [x] 3.5 更新 `apps/server/src/router/routes-single-file.ts` 生成流程，确保新路由被自动聚合。

## 4. DDL 计划和执行器

- [x] 4.1 实现 rename plan，验证权限、目标 schema、旧名映射、命名冲突、类型兼容和阻塞项。
- [x] 4.2 实现 rename apply，使用事务、advisory lock、超时控制和执行前实态复核。
- [x] 4.3 实现 reset plan，生成新表结构、字段复制映射、阻塞项、估算行数、锁风险和备份表名。
- [x] 4.4 实现 reset apply，按新建表、复制数据、校验、旧表备份、新表改回目标名的流程执行。
- [x] 4.5 对复杂对象建立阻塞策略，遇到外键、复杂 default、表达式索引、RLS、分区表等首版不安全对象时拒绝执行。
- [x] 4.6 为计划过期、实态漂移、执行失败和事务回滚补齐状态更新与错误记录。

## 5. 管理端集成

- [x] 5.1 在 `apps/admin/src/router/type.ts` 增加 `sys.table` 路由名称和中文标题。
- [x] 5.2 在 `apps/admin/src/router/routes.ts` 增加 `/main/table` 子路由，组件指向 `@/views/sys.table/index.vue`。
- [x] 5.3 在 `apps/admin/src/views/main/index.vue` 的系统管理菜单中加入表管理入口。
- [x] 5.4 在 `apps/admin/src/permission/index.ts` 增加表管理页面权限和 preview/rename/reset 操作权限。
- [x] 5.5 新增 `apps/admin/src/views/sys.table/` 页面，实现表搜索、状态筛选、表清单、结构详情、diff、demo 数据和操作记录 tabs。
- [x] 5.6 新增重命名计划和 schema 重置计划对话框，展示服务端 plan、阻塞项、风险、SQL 摘要和确认输入。
- [x] 5.7 根据服务端权限和 plan 状态控制高风险按钮可见性和禁用状态。

## 6. 验证

- [x] 6.1 为元数据解析、权限判断、demo 数据脱敏、rename plan、reset plan 添加后端单元测试或可执行测试用例。
- [x] 6.2 在测试库验证 list/detail/preview 对系统管理员和普通角色的权限差异。
- [x] 6.3 在测试库对小表演练 rename apply，并验证事务失败时不会留下半完成状态。
- [x] 6.4 在测试库对小表演练 reset apply，验证行数一致、备份表保留、目标表结构符合 Drizzle schema。
- [x] 6.5 运行 `pnpm --filter @repo/deploy-server lint`、`pnpm --filter @repo/deploy-admin lint` 和 `pnpm turbo lint`。
