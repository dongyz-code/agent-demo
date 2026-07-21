## Why

服务端当前启动注册 26 张 PostgreSQL 表，其中部分表只保存可由 MinIO 或其他业务表直接得到的重复投影，旧流水线表也仍在注册；同时大量跨表 UUID 只靠应用层约定维持，现有自管 DDL 又不能表达外键。继续保留这些结构会扩大启动同步、表管理、查询和数据一致性成本，应在继续建设 documents/RAG 能力前先收敛数据库模型。

## What Changes

- **BREAKING** 退役旧流水线遗留的 `document_processing_jobs`、`document_processing_stage_runs`；执行前盘点并导出非空历史数据，新任务继续只使用 `tasks`、`file_processing_tasks` 与 `file_processing_task_stage_runs`。
- **BREAKING** 删除只写不读的 `file_upload_parts` 数据库投影；Multipart 恢复继续以对象存储 `ListParts` 结果为事实来源。
- **BREAKING** 删除当前仅用于 `document.version/source` 的通用 `file_references` 重复关系；文件占用判断直接使用 `document_versions.source_file_id`，不改变文件删除保护语义。
- **BREAKING** 删除仅在处理完成时写入、没有任何消费者的 `document_parsed_blocks` 中间产物表；解析块保留为单次流水线内存对象，最终 `document_segments` 继续持久化。
- 按产品范围明确保留 `agent_conversations`、`agent_messages` 及其 Drizzle 注册，当前变更不调整 Agent 会话数据模型。
- 保留 `documents`/`document_versions`、`document_segments`、`file_processing_task_stage_runs`，本次不以减表为由删除版本追溯、RAG 最终产物或任务时间线。
- 为数据库表建立“业务所有者、写路径、读路径、保留理由、清理策略”清单；新增表必须由当前需求和可验证读写路径支撑。
- 扩展自管 Drizzle 结构描述与 DDL，使稳定关系可以声明、创建和核对外键；对保留表先执行孤儿数据检查，再分批增加外键约束。
- 提供幂等、可预演的退役流程：先停止注册和写入，再盘点/导出，最后由显式维护命令物理删除；服务启动不得自动删除数据库对象。

## Capabilities

### New Capabilities

- `database-schema-lifecycle`: 定义表的准入、运行时证据、退役预演、历史数据保护、物理删除和保留表关系完整性要求。

### Modified Capabilities

- `server-drizzle-database`: 扩展自管 Drizzle schema、结构描述、DDL 和差异检查，使其能够表达并维护外键关系，而不是只维护列、主键和索引。

## Impact

- 服务端数据库定义：`apps/server/src/database/tables`、`apps/server/src/database/structure` 与启动注册顺序。
- documents 域：Multipart 分片恢复、文件删除保护、文档结果持久化和旧任务兼容代码。
- PostgreSQL：目标注册表由 26 张收敛为 21 张；物理删除属于显式维护操作，不随普通服务启动执行。
- 管理端/API：不删除现有用户接口；Multipart 恢复、文件删除保护、任务中心时间线和 Segment 结果的对外行为保持不变。
- 规范衔接：本变更接续 `consolidate-documents-domain`，并取代早期变更中“长期保留旧处理表”“持久化上传分片镜像”和“所有文件引用均经过通用引用表”的实现假设。
