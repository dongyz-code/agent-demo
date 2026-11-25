# 通用文件模块

统一从 `@/hooks/upload/index.js` 导入 `upload`。本模块管理文件传输、可信验证、存储位置和短期访问地址，不依赖 documents，不创建文档版本或处理任务。

## 文件引用

- `key`：对外稳定句柄，对应 `files.file_id`；业务保存此值，不保存访问 URL。
- `objectKey`：内部 S3 路径，只在模块内部使用，不是公共句柄。
- `url`：经业务授权后临时生成的访问地址，与 `expiresAt` 一起短期缓存。

key 不是访问凭证。`getInfo`、`getUrl`、`getUrls`、`open`、`getReadableSource` 是可信服务端能力，调用方必须先完成业务授权。`requireOwned` 用于业务绑定前校验文件归属；系统管理员不受创建人范围限制。模块不提供裸 key 换取 URL 或物理删除的公共 route。

## 能力

| 方法                             | 用途                                                         |
| -------------------------------- | ------------------------------------------------------------ |
| `put(input, userId)`             | 上传 Buffer、Uint8Array 或受大小限制的流，返回已验证文件描述 |
| `initialize(input, userId)`      | 初始化或恢复一次直传会话，普通与 Multipart 自动选择          |
| `signPart`、`listParts`          | 分片签名与从 S3 恢复真实分片                                 |
| `complete(sessionId, userId)`    | 固化、验证并幂等返回 key，不进行业务绑定                     |
| `abort`、`getStatus`             | 取消传输与查询会话状态                                       |
| `getInfo`、`requireOwned`        | 查询可信元数据与绑定前所有权校验                             |
| `getUrl`、`getUrls`              | 生成单个或批量短期访问地址，避免列表逐条查询文件表           |
| `open`、`getReadableSource`      | 打开新流或获取可重复打开的源文件描述                         |
| `removeObjects`、`deleteRecords` | 对象清理后，由业务事务解除引用并删除文件记录                 |
| `remove`                         | 清理服务端已经确认无引用的文件，例如未发布预览页面           |
| `cleanupExpired`                 | 每批读取 100 个失效且未验证的会话，逐批回收并返回成功总数    |

文件用途保存在 `files.purpose`。attachment 和 document 上限 200 MiB，avatar 上限 10 MiB 且只允许注册图片格式，preview 仅允许可信服务端写入图片。格式来源统一使用 `@repo/shared`；用途只约束内容，不代替业务权限。

## HTTP 与业务接入

通用 HTTP 接口为 `/upload/init`、`/upload/sign-parts`、`/upload/list-parts`、`/upload/complete`、`/upload/abort`、`/upload/status`，均使用现有认证链；会话操作必须通过所有权校验。接口不会暴露 S3 uploadId、Bucket 或对象路径字段。

普通文件使用客户端直传：初始化、上传字节、完成后取得 `{ key, filename, extension, contentType, size, purpose }`。服务端收到或生成的内容可直接调用 `put`，无需会话。

文档上传完成后调用 `/documents/document-version-create`，请求 `{ key, documentId? }`。文档绑定与预览入队共享领域事务，失败时保留上传结果。读取文档或页面时，documents 校验权限后调用 upload 生成 URL。

## 一致性与清理

- 初始化使用用户与幂等键的事务锁，重复请求必须保持文件声明和用途一致。
- 客户端只能写入 `temporary/` 对象；完成时复制到独立最终位置，再验证最终对象大小与可信 MIME，防止旧 PUT 地址覆盖已验证文件。
- 文件 verified 和会话 completed 同事务发布，完成后不再签发上传地址。数据库提交回执不确定时，先检查当前状态，不能删除已经发布的对象。
- 已发布文件不可修改；重新上传产生新 key。Multipart ETag 不作为完整文件摘要。
- 内置失效上传清理计划默认每天凌晨 3 点执行（`0 3 * * *`，`Asia/Shanghai`），可在定时任务页面调整。超过会话期限后额外等待最长签名有效时间，只回收 pending/rejected 且不在 confirming 流程中的对象。一次任务每批读取 100 个会话，按游标继续至本轮候选处理完或触发任务超时；单条失败不会阻塞后续批次，保留记录供后续执行重试。
- 已验证但尚未绑定业务的文件暂不自动回收。完成后旧 PUT 仍可重建临时对象，生产存储需要配置 `temporary/` 生命周期清理；该目录不得用于业务读取。
- 业务负责确认文件可释放，先幂等删除对象，再在解除引用的同一事务中删除通用文件记录；禁止从客户端直接转发 key 执行物理删除。

## 部署与验证

本次表结构变化：`files` 新增非空 `purpose`；`file_upload_sessions` 移除 `document_id`；双层 `document_preview_*_pages` 以 `file_id` 替换 Bucket/对象路径，并调整唯一索引。服务端启动只报告列漂移，不自动迁移。保留历史数据时需补齐用途并转换页面引用；否则备份后按项目既有 reset 流程重建相关数据。代码变更不会执行 reset。

服务端与管理端必须同步发布。管理端升级 IndexedDB 命名空间，旧上传队列不按新语义恢复。

验证：`pnpm --filter @repo/server lint`、`pnpm --filter @repo/admin lint`、`pnpm --filter @repo/types lint` 与 `git diff --check`。真实 S3、PostgreSQL 与浏览器上传仍需部署环境联调。
