## 1. 骨架与统一底座

- [x] 1.1 创建 `hooks/documents` 目录、`index.ts`、`types.ts`、`README`，声明子模块边界与公共出口
- [x] 1.2 不维护 documents 专属错误 `kind` 枚举，HTTP 语义直接由 `ROOT_ERROR` 注册键表达
- [x] 1.3 保留 documents 域现有错误码字符串值兼容日志与管理端排查
- [x] 1.4 不新增额外错误工厂，documents 域业务错误直接抛 `ROOT_ERROR`
- [x] 1.5 创建 `hooks/documents/task-runtime`，抽取 `hashToUuid`、`stableParsedBlockId`、`getErrorCode` 为公共 helper（`runStage`/`assertNotCanceled` 依赖 stage_runs 表统一，留阶段 3）

## 2. 物理迁移实现

- [x] 2.1 把 `hooks/upload/storage` 迁入 `hooks/documents/storage`，调整 import
- [x] 2.2 把 `hooks/upload` 上传会话实现迁入 `hooks/documents/upload`，抽 `toUploadSessionInfo`/`getOwnedSession`/`getInternalFile` 到 shared.ts 消除三处重复（保留分文件，避免单文件过大）
- [x] 2.3 把 `hooks/upload` 的 files/reference/cleanup 迁入 `hooks/documents/files`，抽 `upsertFileVariant`/`findReadyVariant`/流→Buffer 工具为单份
- [x] 2.4 把 `hooks/upload/preview` 迁入 `hooks/documents/preview`（registry 内联与死代码删除随 2.5 降级一并处理）
- [x] 2.5 把 `hooks/upload/validators` 降级为直接调用，删 registry 机制
- [x] 2.6 把 `hooks/document` 的 parsers/normalization/segmentation 迁入 `hooks/documents/content`
- [x] 2.7 把 `hooks/rag` 的 datasets/dataset-documents 迁入 `hooks/documents/knowledge`
- [x] 2.8 将旧 `hooks/upload`、`hooks/document`、`hooks/rag` 改为 `re-export` 到 `hooks/documents`（方向反转，过渡期双端可用）
- [x] 2.9 删除 `hooks/file` 转发壳，把 `orchestration`/`management`/`processing-options` 迁入 `hooks/documents` 对应子模块

## 3. 流水线统一

- [x] 3.1 把 `file/tasks/file-processing` 迁入 `hooks/documents/processing`
- [x] 3.2 退役 `document/processing` 的 runner/service，由 `processing` worker 统一承载
- [x] 3.3 `processing` runner 改用 `task-runtime` 公共 helper，消除 `stableParsedBlockId`/`getErrorCode`/`runStage` 重复
- [x] 3.4 内联或瘦身 `stages/` 五个转发壳，runner 直接调用 `content` 函数
- [x] 3.5 保留 `legacy.ts` 旧表只读投影，确认不被新 worker 重新领取
- [x] 3.6 处理旧流水线独有用例（`getReadyDocument` 等）：迁移到 documents 域或确认无消费方后移除

## 4. routes 收敛与前端迁移

- [x] 4.1 按 `<resource>-<action>` 连字符规则确定 `file.*`/`document.*`/`upload.*`/`file-processing.*` → `documents/<resource>-<action>` 路由命名映射表（如 `file.detail`→`file-detail`、`file-processing.create`→`task-create`），补充到 design.md
- [x] 4.2 把上述 route 文件迁入 `router/routes/documents/`
- [x] 4.3 route handler 内联业务逻辑，删除仅被单处引用的 service 方法薄封装
- [x] 4.4 route 直接改用 `ROOT_ERROR`，替换所有 `FileProcessingError`/`createDocumentError`/`createUploadError` 调用
- [x] 4.5 `@repo/types` 路由类型从 `file.*`/`document.*`/`upload.*`/`file-processing.*` 迁移到 `documents.*`
- [x] 4.6 管理端 API 调用一次性从 `/file/*`、`/document/*`、`/upload/*`、`/file-processing/*` 切换为 `/documents/*`，不保留兼容代理层
- [x] 4.7 上传组件、文件管理、任务中心、知识库页面与后端同批迁移 API 路径，旧路径直接删除
- [x] 4.8 route 权限键迁移到 `documents.*` 点路径，集中定义在 `@repo/shared/permission`

## 5. 下线与解耦

- [x] 5.1 删除 `hooks/upload`、`hooks/document`、`hooks/rag` 三个旧目录
- [x] 5.2 删除旧 `file.*`/`document.*`/`upload.*`/`file-processing.*` route 文件
- [x] 5.3 确认 `hooks/file` 目录已彻底移除
- [x] 5.4 `hooks/task/lib.ts` 剥离 `file_processing_tasks`/`files`/`rag_datasets` 硬编码字段，查询层保留为领域无关 `tasks` 主表查询供任务中心；documents 域任务详情由 documents route 自行补充
- [x] 5.5 彻底删除 `InitTaskRun` 子进程执行框架（`scripts`/`add`/`handle`/`kill`/`types`/spawn），移除 `sys/task.add`、`task.kill`、`task.types` 路由
- [x] 5.6 重写 `dependency-boundaries.test.ts` 覆盖 `hooks/documents` 子模块边界与 routes 导入约束
- [x] 5.7 移除 `document_processing_jobs` 旧表写入路径，仅保留只读投影

## 6. 验证与文档

- [x] 6.1 运行 `pnpm turbo lint`，修复类型与 lint 错误
- [ ] 6.2 运行 `upload-rag.integration.test.ts` 与 `minio.integration.test.ts`，确认迁移无回归
- [x] 6.3 验证 documents 域错误 HTTP 状态码正确（`not-found`→404、`bad-request`→400、`conflict`→409）
- [x] 6.4 验证旧 `/file/*`、`/document/*`、`/upload/*`、`/file-processing/*` 路由返回 404
- [x] 6.5 更新 `hooks/documents/README`，说明子模块职责、边界、路由约定与错误处理
- [x] 6.6 运行 OpenSpec 校验命令验证 change artifacts 格式
- [x] 6.7 运行 `git diff --check`
