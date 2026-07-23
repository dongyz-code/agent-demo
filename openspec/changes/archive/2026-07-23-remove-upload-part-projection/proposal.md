## Why

当前 22 张启动注册表中，原退役清单只有 `file_upload_parts` 仍然存在；该表只复制对象存储 `ListParts` 结果并被写入、清理，没有独立读取消费者。需要把这一个真实剩余投影独立移除，避免继续沿用已经失效的“五表退役”基线。

Supersedes: `simplify-database-schema` 中“删除无效运行时投影”与“收敛 Drizzle 注册表”部分。

## What Changes

- Multipart 分片签名和恢复只以 S3/MinIO `ListParts` 返回为分片事实来源，不再写入 PostgreSQL 分片投影。
- 删除 `file_upload_parts` 的写入、清理、Drizzle 定义、汇总导出和启动注册。
- 保持上传会话、普通上传、Multipart 恢复、幂等完成和主动取消的公共行为不变。
- 当前已确认无存量文件，不设计历史业务数据导出或兼容读路径；物理表清理由现有受控 reset/维护流程处理，普通启动不得自动 DROP 未注册表。
- 不处理已经从运行时代码消失的旧任务表、文件引用表、解析块表或 `file_variants`。

## Capabilities

### New Capabilities

- `database-schema-lifecycle`: 定义运行时表必须具有独立事实和读取消费者、外部事实投影的退役以及物理结构受控清理规则。

### Modified Capabilities

无。

## Impact

- 影响 `apps/server/src/hooks/documents/upload/multipart.ts`、文档清理流程、`database/tables/file.ts`、表汇总与启动 registry。
- 启动注册表预计从当前 22 张变为 21 张；不改变上传接口 DTO 或对象存储布局。
