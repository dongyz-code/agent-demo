## Context

服务端当前通过 `bootstrappedTableRegistry` 在启动时遍历 26 张 Drizzle 表：缺失表会自动创建，已有表只报告列结构漂移，索引和 trigger 由表管理同步。现状中有五张表不再提供独立价值：两张旧文档任务表已被统一文件任务替代；上传分片表只复制 MinIO `ListParts` 后从不读取；通用文件引用表只保存文档版本源文件这一种关系；解析块表只在处理结束时写入且没有消费者。`agent_conversations` 与 `agent_messages` 按产品范围明确保留，不纳入本次退役。

另一方面，保留表存在大量应用层 UUID 关联，但本地结构描述只归一化列、主键、索引和 trigger，`createTableSql` 不生成外键，catalog 还会把外键视为无法自动重建的复杂约束。表拆分没有对应数据库完整性，是比表数量更实质的维护风险。

本变更接续 `consolidate-documents-domain`。其未完成的集成测试应先通过；本变更不再维持该 change 中“旧任务表长期只读保留”的过渡状态。

## Goals / Non-Goals

**Goals:**

- 将启动注册表从 26 张收敛到 21 张，删除已经有运行时证据证明冗余的结构。
- 保持 Multipart 恢复、文件删除保护、任务详情、文件预览和 Segment 产出等用户行为不变。
- 把代码退役与物理删表解耦，非空历史数据必须先导出和校验。
- 让 Drizzle 目标描述、启动建表和表管理差异能够表达外键。
- 为保留表增加第一批稳定外键，并把无法安全声明的关系记录为显式技术债。

**Non-Goals:**

- 本次不合并 `documents` 与 `document_versions`，不删除 `document_segments`、`file_processing_task_stage_runs` 或 `file_variants`。
- 不实现 Embedding、检索、Agent 会话业务入口或真正的阶段 checkpoint 恢复；现有 Agent 两表及类型保持不变。
- 不在普通服务启动中自动删除表或修改已有表外键。
- 不一次性修复所有历史 ID 类型差异；`baseCols` 中字符串用户 ID 与 `user.user_id` 的 UUID 差异留待单独变更。
- 不新增面向管理端的通用“删除任意表”功能。

## Decisions

### 决策 1：以可验证重复事实决定五张表退役

退役清单固定为：

| 表 | 现状 | 替代方式 |
| --- | --- | --- |
| `document_processing_jobs` | 旧流水线，无运行时引用 | `tasks` + `file_processing_tasks` |
| `document_processing_stage_runs` | 旧流水线，无运行时引用 | `file_processing_task_stage_runs` |
| `file_upload_parts` | `ListParts` 后只写不读 | MinIO/S3 `ListParts` |
| `file_references` | 只有 `document.version/source` | `document_versions.source_file_id` |
| `document_parsed_blocks` | 处理完成时只写不读 | 流水线内存对象 |

备选方案是只删除两张完全无引用的旧任务表。否决原因是另外三张表同样没有独立事实或读取消费者，继续保留会让代码看起来支持并不存在的分片投影、通用引用和解析块查询能力。Agent 两表由产品范围明确要求保留，不使用“当前无入口”作为本次删除依据。

### 决策 2：保留五类有独立生命周期的数据

`agent_conversations/agent_messages` 按产品方向保留；`documents/document_versions` 暂时保留，以维持逻辑文档与版本化处理结果的产品契约；`document_segments` 是 RAG 的最终持久化产物；`file_processing_task_stage_runs` 支持用户可见的阶段时间线与重试审计；`file_variants` 是缩略图和 Office 预览缓存。这些表已经有明确产品决策、对外行为或近期契约，不与本次五张表处于同一证据级别。

备选方案是进一步合并到 17 张以内。否决原因是这会把“删除无效投影”扩大成产品行为重写，并要求同步重做版本、预览和任务中心语义。

### 决策 3：代码退役与物理删除分两次部署

第一次部署删除五张表的 Drizzle 导出、注册和所有写入，改变文件删除检查与解析结果持久化，但不执行 `DROP TABLE`。随后运行只读预演，记录目标表存在状态、精确行数、依赖对象和导出要求。第二次维护操作只在预演仍有效且非空表导出校验通过后执行幂等删除。

备选方案是在服务启动时删除所有未注册表。否决原因是未注册表可能属于其他版本、人工维护或回滚路径，启动时破坏数据不可接受。

### 决策 4：历史数据导出使用显式维护产物

预演为每张非空表生成机器可读清单；导出采用 PostgreSQL 可重放的数据文件或 CSV 加元数据，至少记录 schema、表名、列清单、行数、生成时间和 SHA-256。代码仓库不保存包含业务数据的导出文件，只保存命令、格式和校验结果。物理删除要求操作者提交预演 ID/摘要和确认文本。

备选方案是把旧表重命名到 archive schema。否决原因是它没有真正减少物理表数量，还会继续进入备份、权限和 catalog 管理范围。

### 决策 5：外键在全部表创建后单独生成

扩展 `TableTargetDescriptor`，从 Drizzle `getTableConfig(table).foreignKeys` 归一化外键。`createTableSql` 继续只创建列和主键；启动初始化先创建全部缺失表，再统一执行缺失表对应的外键 DDL，因此不会受到注册顺序、自引用或 `documents.active_version_id` 循环关系影响。

已有表的外键只进入差异报告和表管理 sync plan，不在启动时自动 `ALTER TABLE`。sync apply 在事务与 advisory lock 内重新读取 catalog，并对每个目标关系执行孤儿检查。

备选方案是把外键内联到 `CREATE TABLE`。否决原因是当前注册顺序不是拓扑顺序，而且文档与当前版本存在天然循环关系。

### 决策 6：第一批外键只覆盖稳定、同类型关系

第一批覆盖：`user_role` 到用户/角色、上传会话和派生物到文件、文档版本到文档/文件、Segment 到文档版本及父 Segment、知识库文档关联到知识库/文档、文件任务扩展到任务及领域实体、阶段记录到文件任务。日志用户、审计操作者和 `baseCols` 用户字段的删除语义或类型尚不稳定，本次不强行建立外键。

删除动作按生命周期选择：纯子记录使用 `CASCADE`；文件被文档版本引用时使用 `RESTRICT`；可选知识库目标原则上使用 `SET NULL` 或 `RESTRICT`，在实现前由关系清单逐项固定。任何无法明确删除语义的关系不得进入首批 apply。

### 决策 7：规格与实现证据同时成为表准入门槛

新增表评审必须同时回答业务所有者、写路径、读路径、唯一事实、保留期和清理方式。仅有“未来可能需要”的 spec 不足以进入启动注册；可以先定义 DTO、内存模型或适配接口，待持久化需求出现后再建表。

### 决策 8：数据库公共入口只保留 db 与 schemas

`database/index.ts` 只导出数据库客户端 `db` 和汇总表定义 `schemas`。调用方通过 `schemas.<table>` 显式选择表，通过 `drizzle-orm` 直接使用 `and`、`asc`、`desc`、`sql` 等表达式，并通过 `db.$count` 完成计数。`schemas` 只聚合真实表定义；`managedTableRegistry` 与 `bootstrappedTableRegistry` 保留在独立的 `tables/registry.ts`，仅供表管理和启动同步使用。

删除 `tableNames`、`listFilter`、`rangeFilter`、`searchFilter`、`whereAll`、`orderByAsc`、`orderByDesc` 和 `countRows`。这些封装要么只是 Drizzle API 的改名，要么以 `AnyColumn` 丢失列类型，并且 `countRows` 固定全局客户端后不适用于事务。筛选条件留在具体查询中，避免为简单 ORM 条件建立新的公共工具层。

`SqlData`、`SqlInsertData` 不再根据 `managedTableRegistry` 生成；业务代码使用对应表的 `$inferSelect`、`$inferInsert`。表管理白名单与业务数据类型因此保持独立。连接池继续由 `client.ts` 内部持有，不作为数据库公共入口的一部分。

## Risks / Trade-offs

- [旧任务表存在尚未查看的历史记录] → 物理删除前强制精确计数、导出和摘要校验，代码退役与删除分开部署。
- [移除 `file_references` 后未来出现第二种文件消费者] → 新消费者出现时按真实生命周期重新引入引用模型，不保留当前只有一个命名空间的抽象。
- [移除解析块后排障信息减少] → 任务阶段保留错误与统计；真正需要块级审计时定义保留期、查询入口和访问控制后再持久化。
- [外键应用被历史孤儿阻塞] → sync plan 展示每条关系的孤儿数量和样例，先修复数据再应用，不使用 `NOT VALID` 掩盖问题。
- [外键级联误删] → 每条关系显式记录删除动作并加集成测试；默认使用 `RESTRICT`，只对纯子记录采用 `CASCADE`。
- [与尚未归档的 documents 变更产生规格冲突] → 本变更声明接续关系，先完成其剩余集成测试，再按本变更 delta 替代过渡性保留要求。
- [Agent 表当前没有运行时入口] → 将其记录为产品明确保留的预留结构，本变更不删除、不改列、不改类型；后续 Agent 功能负责补齐读写和生命周期。
- [表数量指标诱导继续合并] → 验收关注事实来源、消费者和完整性，不把 19 作为未来不可变化的硬上限。
- [迁移筛选条件时改变空数组语义] → 按各接口现有契约显式处理空数组，并通过类型检查和静态审计确认旧 helper 零引用。

## Migration Plan

1. 完成 `consolidate-documents-domain` 剩余集成测试，记录当前 26 张表的 catalog、精确行数和依赖基线。
2. 移除五张退役表的运行时写入、Drizzle 导出和注册；调整 Multipart 恢复、文件删除检查及解析结果持久化测试，同时断言 Agent 两表仍在注册表中。
3. 部署代码退役版本，观察一个完整上传、处理、预览、删除保护和任务查询周期；此时旧物理表仍保留以支持代码回滚。
4. 生成退役预演并导出所有非空目标表；验证行数与摘要后，在维护窗口显式删除五张表。
5. 扩展结构 descriptor、DDL、catalog diff 与 sync plan 的外键能力，补充空 schema 初始化和已有 schema 漂移测试。
6. 对第一批保留关系生成孤儿报告；清理阻塞数据后分批应用外键，每批执行读写与删除语义回归。
7. 运行服务端类型检查、数据库结构测试、documents 集成测试和全仓 lint，确认启动注册表为 21 张、Agent 两表仍存在且 catalog 无意外漂移。

回滚分两级：物理删除前直接回滚代码即可重新注册旧表；物理删除后必须先从已校验导出恢复旧表及数据，再回滚代码。任何缺少可验证导出的非空表都不得进入第二级操作。

## Open Questions

- 物理删除维护操作采用仓库内一次性 `tsx` 脚本，还是扩展现有表管理 plan/apply；实现前根据复用价值选择，但两者都必须满足预演、确认和审计要求。
- `documents.active_version_id` 的循环外键是否纳入第一批，取决于现有数据能否保证 active version 必然属于同一 document；若不能，先保留应用层校验。
