## Context

当前启动 registry 有 22 张表。原 `simplify-database-schema` 的五张退役目标中，只有 `file_upload_parts` 仍存在；它在分片签名时写入，在文档清理时删除，但恢复和完成流程始终以对象存储 `ListParts` 返回为事实来源，没有 PostgreSQL 读路径。

用户已经确认没有存量文件，因此本 change 不需要设计业务数据迁移或兼容读取。仓库普通启动只允许补建缺失表和报告漂移，不能因为表退出 registry 就自动删除已有物理表。

## Goals / Non-Goals

**Goals:**

- 删除 `file_upload_parts` 的运行时写入、清理、表定义和启动注册。
- 保持 Multipart 签名、恢复、完成、取消和进度语义不变。
- 明确外部系统事实不应复制成没有独立消费者的数据库投影。

**Non-Goals:**

- 不删除或修改其他 21 张保留表。
- 不实现通用删表工具、历史数据导出或数据库外键。
- 不改变上传 API、对象 key、分片大小或并发策略。

## Decisions

### 1. ListParts 是唯一分片事实

分片实际存在状态、ETag 和大小以 S3/MinIO `ListParts` 为准。签名只返回短期上传地址，不再为“计划中的分片”插入数据库行。

备选方案是保留表作为缓存。当前没有读取路径、缓存失效规则或性能证据，保留只会形成双事实源，因此不采用。

### 2. 同一 change 删除全部运行时投影边界

删除 `multipart.ts` 插入、`cleanup.ts` 清理、`file.ts` 表定义、`tables/index.ts` 汇总导出和 `bootstrappedTableRegistry` 注册。不得留下只为兼容而存在的空定义或 re-export。

### 3. 不在普通启动中物理 DROP

代码退出注册后，已有物理表只通过仓库现有 reset 或明确维护流程清理。当前无存量数据，因此不新增 plan/export/apply 基建；普通服务启动仍不得删除未注册表。

### 4. 验证不恢复已删除服务端测试

本 change 通过类型检查、lint、静态零引用审计和现有上传实现评审验证，不为了单一删表变更重新建立用户已要求删除的服务端 tests。

## Risks / Trade-offs

- [签名后未上传分片缺少数据库记录] → 其本来就不代表对象事实；恢复时由 ListParts 返回实际状态。
- [对象存储暂时不可用时无法从数据库恢复] → PostgreSQL 投影没有可靠读路径且可能过期，不能作为降级事实源。
- [遗漏清理引用导致类型失败] → 在删除表定义后运行服务端 lint，并静态确认 `file_upload_parts` 在运行时代码零引用。
- [物理旧表仍存在] → 按现有 reset/维护流程显式清理；启动不做破坏性操作。

## Migration Plan

1. 删除 Multipart 写入和文档清理中的投影操作。
2. 删除 Drizzle 表定义、汇总导出和启动注册。
3. 静态确认只剩归档历史中的名称，不存在运行时引用。
4. 运行服务端 lint、OpenSpec strict 和差异检查。
5. 需要清理开发数据库时使用现有 reset/明确维护入口，不随本 change 自动执行。

回滚代码即可恢复表定义和写入；本 change 不自动物理删除数据。

## Open Questions

无。
