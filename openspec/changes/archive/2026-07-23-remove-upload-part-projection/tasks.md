## 1. 删除运行时投影

- [x] 1.1 删除 Multipart 分片签名流程对 `file_upload_parts` 的插入，保留现有签名、并发和会话状态逻辑
- [x] 1.2 删除文档清理流程对 `file_upload_parts` 的删除，确保上传会话和源文件清理顺序不发生无关变化

## 2. 删除表定义与注册

- [x] 2.1 从 `database/tables/file.ts` 删除 `file_upload_parts` 表定义及专属索引
- [x] 2.2 从表汇总导出和 `bootstrappedTableRegistry` 删除该表，确认 managed registry 不受影响
- [x] 2.3 静态确认运行时代码对 `file_upload_parts` 零引用，启动 registry 包含 21 张且无重复表

## 3. 行为与文档核对

- [x] 3.1 核对上传初始化、sign-parts、list-parts、complete、abort DTO 与路由行为未改变，恢复仍只读取 S3/MinIO ListParts
- [x] 3.2 更新数据库与 documents 当前说明，只描述 ListParts 事实来源，不修改归档历史

## 4. 验收

- [x] 4.1 运行 `pnpm --filter @repo/deploy-server lint`
- [x] 4.2 运行 OpenSpec strict、运行时零引用搜索和 `git diff --check`
