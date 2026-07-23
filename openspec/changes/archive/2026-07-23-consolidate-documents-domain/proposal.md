## Why

`refactor-file-processing-task-management` 的 tasks 虽已全部标记完成，但实际停在中间态：`hooks/file` 只是 `re-export` 转发壳，实现仍分散在 `hooks/upload`、`hooks/document`、`hooks/rag` 三个旧目录；新旧两套处理流水线都在跑（runner/service 逐字重复）；`file/errors.ts` 的 `FileProcessingError` 绕开统一 `ROOT_ERROR`，导致该域业务错误在 HTTP 层塌缩成 500。需要做真物理迁移，把实现归入单一 `documents` 域并下线旧目录，同时让普通 CRUD 直接使用 ORM、复杂流程进入 hooks，并统一错误处理。

## What Changes

- **BREAKING** 把 `hooks/upload`、`hooks/document`、`hooks/rag` 三目录的实现物理迁移到单一 `hooks/documents` 域，按子模块（storage/upload/files/preview/content/processing/knowledge）归位，删除三个旧目录与所有 `re-export` 兼容出口。
- **BREAKING** 把散落在 `router/routes` 顶层的 `file.*`、`document.*`、`upload.*`、`file-processing.*` 路由全部收敛到 `router/routes/documents/` 下，路由名统一以 `/documents/` 为前缀且最多两层，route 文件名采用连字符 `<resource>-<action>.ts`（如 `file-detail.ts` → `/documents/file-detail`、`task-create.ts` → `/documents/task-create`）；前端与管理端一次性切换，不保留兼容代理层。
- 取消 route→service 薄封装：普通单表查询和简单更新由 route 直接使用 ORM；多表状态迁移、对象存储编排、复杂聚合和 runner/worker 作为 hooks 业务能力保留。
- 统一错误处理：删除 `FileProcessingError`，所有 documents 域错误直接使用统一 `ROOT_ERROR`；不再维护额外领域错误工厂；修复 file 侧业务错误从 500 塌缩为正确 HTTP 状态码。
- 退役旧 `document/processing` 流水线编排层（runner/service），统一走 file worker；抽取 `stableParsedBlockId`、`getErrorCode`、`runStage` 等重复函数为公共 helper。
- 把 rag（知识库 dataset + 文档关联）并入 documents 域作为 `knowledge` 子模块，消除跨域转发。
- 彻底删除 `hooks/task` 的 `InitTaskRun` 子进程执行框架（`scripts` 为空的死基建），查询层剥离 `file_processing_tasks` 领域字段后保留为领域无关的 `tasks` 主表查询。
- 重写 `dependency-boundaries.test.ts` 覆盖新的 `hooks/documents` 内部边界，子域不得跨吃内部实现。

## Capabilities

### New Capabilities

- `documents-domain`: documents 单一边界——upload/document/rag 实现归入单一域、旧三目录下线、普通 route 直接 ORM、复杂流程和处理 runtime 保留。
- `documents-routing`: documents 域路由组织——所有文件/文档/上传/任务/知识库路由收敛到 `routes/documents/` 下、路由名以 `/documents/` 为前缀且最多两层、命名约定、前端 BREAKING 迁移。
- `unified-domain-errors`: documents 域统一错误——直接使用 `ROOT_ERROR`、删除 `FileProcessingError` 与额外工厂层、HTTP 状态码语义正确传递。

### Modified Capabilities

无。`server-fastify-route-foundation` 的目录路由加载机制不变（仍递归加载、文件路径即路由），documents 域路由命名约定作为新 capability `documents-routing` 独立描述。

## Impact

- 服务端：删除 `hooks/upload`、`hooks/document`、`hooks/rag`，新建 `hooks/documents`；重写 `router/routes/documents/`；重写 `dependency-boundaries.test.ts`；调整 `hooks/task`。
- `@repo/types`：新增统一错误 `kind` 枚举与 documents 域错误码集中枚举；路由类型从 `file.*`/`document.*`/`upload.*`/`file-processing.*` 迁移到 `documents.*`。
- 管理端 `apps/admin`：所有 API 调用从 `/file/*`、`/document/*`、`/upload/*`、`/file-processing/*` 改为 `/documents/*`；上传组件、文件管理、任务中心、知识库页面同步。
- PostgreSQL：无表结构变化（纯代码迁移）；`document_processing_jobs` 旧表随旧流水线下线后可后续清理。
- **BREAKING**：路由名变化，旧 `/file/*`、`/document/*`、`/upload/*`、`/file-processing/*` 接口下线。
- 本提案接续并完成 `refactor-file-processing-task-management`：该 change 已完成的任务（统一任务数据模型、文件域目录与公共入口、文件处理任务、管理端页面等）作为基线保留，本提案补完其未落地的“真物理迁移与下线旧目录”，并新增 routes 收敛、去薄 service、统一错误三项要求。

## Superseded

本 change 的有效目录、路由、错误和任务解耦规则已由 `reconcile-current-system-specs` 的 `documents-domain-boundary` 与 `business-task-center` 承接。历史命名、目录假设和已被删除的 integration tests 不再代表当前系统事实。本 change 仅作为演进历史使用 `--skip-specs` 归档。
