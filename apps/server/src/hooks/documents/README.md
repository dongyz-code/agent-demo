# documents 域

`hooks/documents` 是文件上传、文件管理、文档实体、内容处理、知识库与文件处理任务的单一业务域。原 `hooks/upload`、`hooks/document`、`hooks/rag`、`hooks/file` 已全部物理迁入并下线删除。

## 子模块

- `storage/` 对象存储原语（S3 client/commands/presign/object-key）
- `upload/` 上传会话生命周期（init/finish/sign/cancel/session）与文件管理上传编排（orchestration）
- `files/` 文件行 CRUD、流、下载、引用、清理、文件管理列表与处理选项
- `preview/` 文件预览 provider 与服务
- `content/` 文档解析、标准化、Segment 算法（单一一份）
- `documents/` 逻辑文档实体与版本（`ensureDocumentForFile` 等）
- `processing/` 文件处理任务流水线（runner/service/definition/legacy）与任务中心文件域富化（task-center）
- `knowledge/` 知识库实体与文档关联
- `task-runtime/` 任务阶段编排公共 helper（领取/阶段记录/状态机）

## 边界

- 域外代码只能从 `hooks/documents/index.ts` 导入，不得直接导入子模块内部实现。
- 子模块之间不得直接导入对方内部实现，只走各自公共入口。
- routes 放在 `router/routes/documents/`，路由名 `/documents/<resource>-<action>` 最多两层。
- route handler 直接编写业务逻辑，不引入 service 中间层；仅≥2 处复用才提取领域函数。
- 处理流水线 runner/worker 作为 runtime 保留，不视为 service 层。
- 任务中心查询层（`hooks/task/lib.ts`）领域无关，仅查 `tasks` 主表；文件域字段由 `processing/task-center.ts` 富化，不反向依赖文件表。

## 错误处理

所有 documents 域业务错误通过 `createDomainError(code, message, kind)` 创建，返回统一 `ROOT_ERROR`，携带正确 HTTP 状态码（`not-found`→404、`bad-request`→400、`forbidden`→403、`conflict`→409、`internal`/`unavailable`→500）。错误 `kind` 与错误码集中定义在 `@repo/types`。原 `createUploadError`/`createDocumentError`/`createRagError`/`FileProcessingError` 已全部收敛为该单一工厂。

## 路由约定

`file.*`/`upload.*`/`file-processing.*`/`rag.*` 路由已收敛到 `/documents/<resource>-<action>`：`file.*`→`file-*`、`upload.*`→`upload-*`、`file-processing.*`→`processing-*`、`rag.dataset-*`/`rag.dataset-document-*`→`dataset-*`/`dataset-document-*`（如 `/documents/processing-create`、`/documents/upload-init`、`/documents/dataset-create`）。旧 `/file/*`、`/upload/*`、`/file-processing/*`、`/document/*`、`/rag/*` 路径已删除。任务中心查询路由 `sys/task.{list,counts,logs}` 保留在 `/sys/task/*`。

详见 `openspec/changes/consolidate-documents-domain`。
