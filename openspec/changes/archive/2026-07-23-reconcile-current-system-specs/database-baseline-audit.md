# 数据库变更基线审计

## 当前注册实态

`bootstrappedTableRegistry` 当前注册 22 张表，而不是 `simplify-database-schema` proposal/design 中假设的 26 张：

| 分组 | 当前表 |
|---|---|
| 表管理白名单（11） | `sys_conf`、`user`、`role`、`user_role`、`apps`、`tasks`、`file_upload_sessions`、`api_logs`、`user_logs`、`agent_conversations`、`agent_messages` |
| 内部及领域表（11） | `table_structure_ops`、`files`、`file_upload_parts`、`documents`、`document_versions`、`document_preview_pages`、`document_segments`、`rag_datasets`、`rag_dataset_documents`、`file_processing_tasks`、`file_processing_task_stage_runs` |

## 原退役清单核对

| 原 change 目标 | 当前状态 | 后续处理 |
|---|---|---|
| `document_processing_jobs` | Drizzle 定义、注册和运行时引用均已不存在 | 不再创建删除任务 |
| `document_processing_stage_runs` | Drizzle 定义、注册和运行时引用均已不存在 | 不再创建删除任务 |
| `file_upload_parts` | 仍有定义、注册、Multipart 写入和文档清理删除路径 | 由 `remove-upload-part-projection` 独立处理 |
| `file_references` | Drizzle 定义、注册和运行时引用均已不存在 | 不再创建删除任务 |
| `document_parsed_blocks` | Drizzle 定义、注册和运行时引用均已不存在 | 不再创建删除任务 |

原设计明确保留的 `file_variants` 当前也不存在；预览派生物已经使用 `document_preview_pages`。因此“26 张删除 5 张后剩 21 张”的数字虽然与当前删除 `file_upload_parts` 后的 21 张巧合相同，但表集合、起始基线和理由完全不同，不能继续沿用旧任务。

## 已完成 3 项任务核对

原 change 的 8.1、8.2、8.3 已真实落地：

- `database/index.ts` 只导出 `db` 与 `schemas`。
- `client.ts` 内部持有连接池，只导出 Drizzle `db`。
- `tables/index.ts` 汇总真实表定义，`managedTableRegistry` 与 `bootstrappedTableRegistry` 已移到 `tables/registry.ts`。
- 业务调用方使用 `schemas.<table>`、Drizzle 原生表达式和表 `$inferSelect/$inferInsert`。
- `tableNames`、筛选/排序/count helper、`SqlData`、`SqlInsertData` 与 `Db` 公共类型在服务端运行时零引用。

这些已完成工作由 `simplify-database-access` change 独立承接和验收，不与删表或外键实现重新绑定。

## 外键能力核对

当前 `database/structure` 的 descriptor、DDL、catalog diff 与 startup sync 没有目标外键描述和受控 apply 能力。启动同步仍逐表创建缺失表，不执行“先创建全部表、再创建外键”的两阶段流程。该工作由 `add-drizzle-foreign-key-lifecycle` 独立承接。

## 拆分边界

- `simplify-database-access`：只描述并验证数据库公共访问边界，不删除表、不改 DDL。
- `remove-upload-part-projection`：只移除 `file_upload_parts` 运行时投影、注册和表定义，Multipart 恢复继续以 S3/MinIO `ListParts` 为事实来源。
- `add-drizzle-foreign-key-lifecycle`：只扩展外键 descriptor、DDL、catalog diff 和受控同步，不夹带表删除。

三个后继 change 使用不同 capability，避免同时修改同一 capability：`server-database-access-boundary`、`database-schema-lifecycle`、`server-drizzle-database`。
