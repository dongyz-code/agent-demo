## Context

仓库是 pnpm/Turbo monorepo，当前要落地的入口主要在 `apps/server` 和 `apps/admin`。后端使用 Fastify、Drizzle ORM、Postgres，所有业务表已经通过 `apps/server/src/database/schema/index.ts` 的 `schemaTables` 显式注册；API 类型集中在 `packages/types`；管理端使用 Vue、Vue Router、Pinia、Element Plus 和 `@repo/ui` 组件。

当前认证只保证用户已登录，前端路由会按 `permission` 隐藏入口，但后端没有逐接口权限守卫。表结构管理属于高风险能力，必须在后端再次校验权限，并且所有 DDL 操作必须可预演、可审计、可失败恢复。

## Goals / Non-Goals

**Goals:**

- 基于 Drizzle `schemaTables` 构建可管理表白名单，只展示当前用户有权限访问的表。
- 支持查看表结构、字段、索引/约束摘要、数据库实态差异和少量 demo 数据。
- 支持根据 Drizzle schema 对表名、字段名进行受控重命名，先预演再执行。
- 支持根据 Drizzle schema 重置表结构，采用新建表、复制数据、交换表名、保留备份表的无损优先流程。
- 支持高风险操作审计、执行状态追踪、失败原因记录和人工恢复线索。
- 不引入新的前端 UI 框架，沿用 admin 现有 Vue/Element Plus/`@repo/ui`/Tailwind 结构。

**Non-Goals:**

- 不做任意 SQL 控制台，不允许用户输入自由 DDL。
- 不做大规模数据导出，demo 数据只提供小批量预览。
- 不自动推断不可证明安全的 rename；Drizzle 无法可靠区分“删除再新增”和“重命名”，需要管理员确认映射。
- 不在首版支持复杂数据转换、跨库迁移、视图/物化视图管理、分区表重建。
- 不自动清理备份表；备份清理必须作为后续显式能力处理。

## Decisions

### 1. Drizzle schema 是目标态和白名单，Postgres catalog 是实态

后端新增 `table-management` 服务，使用 `schema.schemaTables` 遍历注册表，通过 Drizzle 的 `getTableConfig(table)`、`getTableName(table)` 提取目标结构，包括表名、schema、字段、主键、索引、唯一约束等。数据库实态通过 `information_schema` 和 `pg_catalog` 查询，获取真实表、字段、索引、约束、估算行数和物理存在状态。

选择这个方案是因为它不需要解析 TypeScript 源码字符串，也不会把未注册的数据库对象暴露到管理页。直接扫描数据库更完整，但会泄漏临时表、迁移表或历史备份表；只看 Drizzle 又无法知道线上结构是否偏移。

### 2. 权限拆成路由入口权限、表范围权限、操作权限

新增 admin 权限 key：

- 页面权限 `pages.sys.sys.table`: 允许进入系统管理下的表管理页面。
- 操作权限 `actions.table.preview`: 允许查看 demo 数据。
- 操作权限 `actions.table.rename`: 允许执行表/字段重命名。
- 操作权限 `actions.table.reset`: 允许执行 schema 重置。

后端再支持表范围权限，例如 `actions.table.user.preview`、`actions.table.user.rename`、`actions.table.user.reset`，以及管理员或显式 wildcard 权限 `actions.table.*.preview`。表清单接口按表范围权限过滤；执行接口必须同时满足操作权限和目标表范围权限。admin 路由和菜单只校验页面权限，后端校验作为最终边界。

### 3. API 采用“plan/apply”双阶段

新增 `/sys/table/*` 接口：

- `list`: 返回当前用户可见表、物理状态、字段数量、估算行数、最近操作状态。
- `detail`: 返回 Drizzle 目标结构、数据库实态结构、diff、索引/约束摘要。
- `preview`: 返回 demo 数据，默认 20 行，最大 100 行，支持按主键或创建时间稳定排序。
- `rename-plan`: 根据目标 Drizzle 表和管理员提供的旧表/旧字段映射生成重命名计划。
- `rename-apply`: 使用 plan id 和确认文本执行重命名。
- `reset-plan`: 对比目标 schema 和当前物理表，生成无损重建计划、字段复制映射、阻塞项和警告。
- `reset-apply`: 使用 plan id 和确认文本执行无损重建。
- `operation-list` / `operation-detail`: 查看结构操作记录、SQL 摘要、状态、备份表名、错误信息。

计划结果保存到新表 `table_structure_ops`，避免前端持有未审计的 SQL。apply 阶段只接受后端生成的 plan id，不接受任意 SQL。

### 4. demo 数据默认脱敏和限量

preview 接口只读取注册字段，默认按主键、`create_timestamp` 或物理字段顺序排序。二进制、日志详情、密码、密钥、token、hash 等敏感字段默认返回 `{ masked: true }` 或摘要字符串；需要展示原文的字段必须在后端维护显式 allowlist。这样既满足“查看 demo 数据”，也避免把日志详情、密码哈希和密钥当作普通表格数据泄漏。

### 5. 重命名只处理明确映射，失败即回滚

rename 支持两个层级：

- 表名：`ALTER TABLE <old_table> RENAME TO <target_table>`。
- 字段名：`ALTER TABLE <target_table> RENAME COLUMN <old_column> TO <target_column>`。

计划生成会验证目标表来自 `schemaTables`、目标名不存在冲突、旧名在同 schema 内真实存在、映射没有重复、字段类型兼容。执行时使用事务、`pg_advisory_xact_lock`、`lock_timeout`、`statement_timeout`，并在事务内重新验证实态，避免预演和执行之间的漂移。

### 6. schema 重置采用保守的无损重建流程

reset 执行器按以下流程工作：

1. 获取会话级 advisory lock，并在事务内锁定目标表 `ACCESS EXCLUSIVE`，避免复制期间产生写入漂移。
2. 创建临时新表 `__tm_<table>_<op>_new`，结构来自 Drizzle 目标态。
3. 按 plan 中的字段映射执行 `INSERT INTO new (...) SELECT ... FROM old`。同名且兼容字段自动复制；重命名字段必须显式映射；新字段如果 `NOT NULL` 且无默认值会阻塞执行。
4. 校验源表和新表行数、关键字段非空约束、主键/唯一约束创建结果。
5. 将旧表重命名为 `__tm_<table>_<op>_backup`，将新表重命名为 Drizzle 目标表名。
6. 提交后保留备份表和操作记录；如事务内任一步失败，Postgres 自动回滚，不改变原表。

首版 DDL 生成只支持当前仓库实际使用的安全子集：常见 Postgres 字段类型、`NOT NULL`、主键、唯一约束、普通索引。遇到外键、生成列、RLS、复杂 default、表达式索引、分区表等无法安全生成的对象时，plan 标记为 blocking，要求人工迁移或后续扩展。

### 7. admin 做密集型管理页，不放入普通 client

新增 admin 子路由 `/main/table`，路由名 `sys.table`，页面目录建议 `apps/admin/src/views/sys.table/`，并在系统管理菜单和权限树中增加“表管理”。页面结构：

- 顶部筛选区：表名搜索、物理状态筛选、权限状态筛选。
- 主区域：使用 `v-table` 展示表清单，右侧或弹窗展示表详情，包含 “结构 / Demo 数据 / 差异 / 操作记录” tabs。
- 操作区：刷新、查看详情、生成重命名计划、生成重置计划。
- 计划对话框：使用现有 `v-dialog`/Element Plus 组件展示变更摘要、SQL 预览、阻塞项、风险警告、备份表名策略和确认输入。

所有高风险按钮由服务端权限和 plan 状态共同决定是否可点。前端不拼 SQL，只展示服务端返回的计划摘要。

## Risks / Trade-offs

- [Drizzle 无法可靠自动识别 rename] → plan 必须让管理员提供旧名到新名的映射；系统可以给候选建议，但不自动执行猜测。
- [重建大表会长时间锁表] → 首版用于管理型小表和受控场景；plan 返回估算行数、锁风险和超时配置，超过阈值时阻塞或要求维护窗口。
- [外键/复杂索引处理不完整] → 首版遇到复杂对象直接阻塞，避免生成半正确 DDL。
- [备份表长期堆积] → reset 不自动删除备份，后续可以增加备份清理策略；首版在操作记录里明确备份表名。
- [权限仅靠前端会被绕过] → 所有 `/sys/table/*` 接口必须调用后端权限 helper，前端只做体验层限制。
- [demo 数据可能包含敏感字段] → 默认脱敏并限制行数，敏感字段策略由后端统一维护。

## Migration Plan

1. 新增 `table_structure_ops` Drizzle schema 和迁移，用于记录 plan、执行状态、操作者、备份表、错误信息。
2. 新增 `packages/types` 表管理 API 类型，扩展 `Sys` 路由类型。
3. 新增后端元数据服务、权限 helper、DDL plan/apply 服务和 `/sys/table/*` 路由。
4. 新增 admin 表管理路由、菜单项、权限树、页面、计划对话框和操作记录视图。
5. 为默认管理员保留全权限；普通角色需要在角色权限里显式配置表管理页面权限和操作权限。
6. 发布后先在测试库执行 list/detail/preview，再对低风险表演练 rename-plan/reset-plan 和 apply。

回滚策略：前端入口可通过权限隐藏；后端接口可回退代码；`table_structure_ops` 只记录审计数据。对于已执行的 reset，旧表备份仍保留，可由管理员按操作记录中的备份表名手动换回，或后续提供 rollback apply 能力。

## Open Questions

- 首版 admin 子路径使用 `/main/table`，路由名 `sys.table`，是否需要在菜单文案中标为“表结构管理”以强调风险？
- 是否需要按角色配置每张表的权限 UI？如果不做，首版可以先允许手写权限 key 或只给管理员使用。
- demo 数据是否需要支持用户自定义筛选条件？首版建议只做搜索/排序/分页，避免变成查询控制台。
