## Context

项目是 TypeScript ESM 的 pnpm/Turbo monorepo，服务端使用 Fastify route、Drizzle/PostgreSQL 和 `hooks` 业务模块，管理端使用 Vue/Vite。完整上传需要覆盖 MinIO 普通上传、Multipart、续传、文件验证、预览和清理；文档层需要完成解析、标准化和 Segment，RAG 再消费 ready 文档。

上传与预览是通用基础设施。如果直接建在 `hooks/rag` 中，其他附件、头像、导入文件无法复用，RAG 也会被迫理解 uploadId、Bucket、签名和预览转换。设计最终采用三个清晰模块：`hooks/upload` 管理文件生命周期，`hooks/document` 管理文档内容生命周期，`hooks/rag` 管理知识库与后续检索语义。三者通过稳定 `fileId`、`documentId` 和公开 ready 文档接口连接。

## Goals / Non-Goals

**Goals:**

- 在 `hooks/upload` 建立与业务无关的上传、验证、引用、预览、查看和清理能力。
- 支持 Uppy + AWS S3 Multipart 浏览器直传、断点恢复、取消和幂等完成。
- 对 PDF、图片、音视频、文本和 Office 文件提供安全在线查看路径。
- 在 `hooks/document` 建立统一解析器、标准化、Segment 和处理状态边界。
- 在 `hooks/rag` 管理知识库及其文档关联，并为后续索引、检索和评估消费 ready 文档提供边界。
- 保持 routes 薄层、模块单向依赖、组件职责清晰和完整中文 TSDoc。

**Non-Goals:**

- 不让上传模块理解知识库、头像或附件等业务规则。
- 不在 route handler 中实现 S3、预览或 RAG 流程。
- 不允许前端持有 MinIO 长期凭证或拼接对象 URL。
- 首期不实现 Office 在线编辑、复杂视频转码和跨区域对象存储容灾。
- 本 change 不实现混合检索、Reranker 和回答评估闭环，只建立其上游文件、文档处理与知识库关联基础。

## Decisions

### 1. 固定模块单向依赖

```text
routes/upload   ─▶ hooks/upload
routes/file     ─▶ hooks/upload
routes/document ─▶ hooks/document ─▶ hooks/upload/index.ts
routes/rag      ─▶ hooks/rag      ─▶ hooks/document/index.ts

hooks/upload   ─X hooks/document / hooks/rag
hooks/document ─X hooks/rag
routes         ─X S3 client / Drizzle tables
hooks/rag      ─X hooks/upload / document internals
```

`hooks/upload/index.ts` 只暴露初始化、签名、完成、查询、打开文件流、引用、下载、预览和删除等稳定入口。RAG 只能从该入口导入，不允许跨目录访问 `storage`、`validators` 或上传数据库实现。

### 2. 通用文件与不透明引用

通用表：

```text
files
file_upload_sessions
file_upload_parts
file_references
file_variants
```

`files` 保存租户、创建人、显示名称、可信 MIME、大小、Hash、对象位置和状态。`file_references` 使用：

```text
namespace + ownerId + role + fileId
```

例如文档版本的源文件引用：

```text
namespace = document.version
ownerId   = documentVersionId
role      = source
```

上传模块只负责引用存在性和清理保护，不解释 owner。`document_versions` 同时保留 `source_file_id` 便于文档查询和数据库约束，并通过引用服务维护通用生命周期。

### 3. 上传策略替代业务条件分支

`hooks/upload/policies.ts` 注册技术策略，例如：

```text
default-attachment
image
rag-document
```

策略只定义允许 MIME、扩展名、最大大小、Multipart 阈值、分片大小、是否生成预览和未绑定保留期。新增用途时增加策略配置，不在上传流程加入 `if (purpose === 'rag')`。

业务 route 负责判断调用者能否使用策略，上传服务再次确认策略存在和输入满足限制。

### 4. Uppy 作为 Headless 上传引擎

管理端使用 Uppy Core 和 `@uppy/aws-s3` 管理文件队列、切片并发、进度、重试、暂停、继续和取消。最终 UI 使用项目现有 Vue、Element Plus 和共享组件，不直接采用独立风格 Dashboard。

```text
apps/admin/src/components/upload/
├── UploadDialog.vue
├── UploadQueue.vue
├── UploadItem.vue
├── useUploader.ts
├── uppy-adapter.ts
├── types.ts
└── utils.ts
```

Uppy API 只存在于 adapter 和 composable，业务页面传入策略键及完成回调，避免依赖升级扩散。

### 5. `hooks/upload` 按真实职责拆分

```text
apps/server/src/hooks/upload/
├── index.ts
├── types.ts
├── policies.ts
├── errors.ts
├── object-key.ts
├── upload-service.ts
├── file-service.ts
├── reference-service.ts
├── validation-service.ts
├── preview-service.ts
├── cleanup-service.ts
├── storage/
│   ├── client.ts
│   ├── commands.ts
│   └── presign.ts
├── validators/
│   ├── registry.ts
│   ├── magic-number.ts
│   └── checksum.ts
└── preview/
    ├── registry.ts
    ├── direct.ts
    ├── image.ts
    ├── office.ts
    └── text.ts
```

纯计算函数独立保存，service 聚焦一个流程，公开入口在 `index.ts` 收口。不会为单行调用过度抽象，也不会把上传全流程放进巨型 `index.ts` 或 route 文件。

### 6. S3 Multipart 与双 Endpoint

服务端使用 `@aws-sdk/client-s3` 和 `@aws-sdk/s3-request-presigner`，MinIO 配置 `forcePathStyle: true`。内部 Endpoint 用于服务端命令，公共 Endpoint 用于浏览器签名；签名 Host 必须与实际浏览器请求一致。

通用 routes：

```text
/upload/init
/upload/sign-parts
/upload/list-parts
/upload/complete
/upload/abort
/upload/status
/upload/list

/file/detail
/file/preview
/file/download
/file/remove
```

路由文件使用点分隔命名。handler 只做 schema、认证上下文和 hook 调用，不出现 S3 命令或状态迁移。

### 7. 上传状态与文件状态分离

上传会话：

```text
initialized → uploading → completing → completed
      │            │             │
      ├────────────┴────────────▶ failed
      ├─────────────────────────▶ canceled
      └─────────────────────────▶ expired
```

文件状态：

```text
pending → verifying → verified → deleting → deleted
                │
                └──────────────▶ rejected
```

Multipart 完成只代表对象合并，不代表文件可信。只有 `verified` 文件可以建立正式引用。初始化与完成使用幂等键，完成通过条件更新获取唯一执行权。

### 8. 预览属于通用文件模块

`file_variants` 保存缩略图和派生预览：

```text
variantType
sourceFileId
generator
generatorVersion
contentHash
status
bucket/objectKey
error
```

预览注册表按可信 MIME 选择实现：

- PDF：原文件短期内联 URL。
- JPEG/PNG/WebP：原图内联，使用 Sharp 生成缩略图。
- TXT/Markdown：限长读取，转义或清洗后展示。
- DOCX/PPTX/XLSX：独立 Worker 调用 LibreOffice headless 转 PDF。
- 音频/视频：短期内联 URL并支持 Range。
- HTML/SVG：不在同源页面直接执行，使用隔离沙箱或强制下载。
- 未支持类型：返回元数据和下载入口。

统一预览接口返回：

```text
mode
status
contentType
url
expiresAt
variant
reason
```

预览缓存键由源文件 Hash、variantType 和生成器版本构成。转换器未部署时返回明确 `unavailable`，不伪造成功状态。

### 9. 在线查看与下载分离

下载签名使用附件 Content-Disposition，预览签名使用内联 Content-Disposition。Content-Type 取自服务端验证结果。音视频保留 Range；Markdown 输出必须清洗；预签名 URL 不持久化且不写日志。

管理端提供通用文件查看组件：

```text
apps/admin/src/components/file-viewer/
├── FileViewer.vue
├── PdfViewer.vue
├── ImageViewer.vue
├── MediaViewer.vue
├── TextViewer.vue
├── PreviewPending.vue
└── types.ts
```

业务页面只传 `fileId` 和关闭事件，不复制预览状态机。

### 10. 文档与 RAG 分两步显式接入

```text
管理端完成通用上传
  ↓
hooks/upload 返回 verified fileId
  ↓
管理端调用 /document/create(fileId)
  ↓
hooks/document 创建 documentVersion
  ↓
hooks/upload.bindFile(document.version, versionId, source, fileId)
  ↓
创建 document_processing_job 并产出 ready Segment
  ↓
管理端调用 /rag/dataset-document/add(datasetId, documentId)
  ↓
hooks/rag 创建知识库与文档关联
```

通用上传成功不会自动创建文档或触发 RAG。若文档创建失败，文件保持未绑定并由保留期清理；若知识库关联失败，文档及处理产物仍可独立存在并重试关联。

### 11. `hooks/document` 统一处理流程

```text
apps/server/src/hooks/document/
├── index.ts
├── types.ts
├── errors.ts
├── documents/
├── processing/
│   ├── service.ts
│   └── runner.ts
├── parsers/
│   ├── registry.ts
│   ├── types.ts
│   ├── pdf.ts
│   ├── office.ts
│   ├── markdown.ts
│   └── tabular.ts
├── normalization/
│   ├── normalize.ts
│   └── types.ts
└── segmentation/
    ├── chunk.ts
    ├── profiles.ts
    └── types.ts
```

解析器接收通用文件描述和可重复读取的流工厂，输出统一 `ParsedBlock[]`。Docling、LibreOffice 或具体库类型不得越过 parser 边界。

处理阶段：

```text
queued → reading → parsing → normalizing → segmenting → ready
```

每阶段记录配置版本、统计、产物和错误。Segment ID 由文档版本、策略版本、位置和内容 Hash 确定，重试不会重复插入。Embedding 和索引通过文档公共接口消费 ready Segment，不在解析器内部调用。

### 12. 数据表边界

通用文件表：

```text
files
file_upload_sessions
file_upload_parts
file_references
file_variants
```

文档表：

```text
documents
document_versions
document_processing_jobs
document_processing_stage_runs
document_parsed_blocks
document_segments
```

RAG 表：

```text
rag_datasets
rag_dataset_documents
```

文档表不复制 Bucket、Object Key 和 uploadId，只保存 `source_file_id` 及自己的处理配置与状态；RAG 只保存知识库及其文档关联。

### 13. 可读性作为验收条件

- routes 不出现 S3 命令、Drizzle 查询和跨阶段流程。
- `hooks/upload` 不导入文档或 RAG；文档只从 `hooks/upload/index.ts` 导入；RAG 只从 `hooks/document/index.ts` 导入。
- 页面负责入口和刷新；上传、预览、文档创建及任务详情拆成独立组件。
- 共享文案、纯函数和类型放在邻近 `utils.ts`、`types.ts`，不使用通用工具隐藏页面专属流程。
- 新增函数、方法、类、hook、常量、接口、类型、参数、返回值和字段添加清晰中文 TSDoc 或属性注释。
- 状态迁移使用命名函数或映射，不散落字符串判断。
- 对外错误使用稳定错误码，内部异常保留 cause 和上下文。
- 文件职责变大时按流程边界拆分，避免巨型 service、index 和 Vue 页面。

### 14. 上传、文档与 RAG 三层边界

```text
routes/upload   ─▶ hooks/upload
routes/file     ─▶ hooks/upload
routes/document ─▶ hooks/document ─▶ hooks/upload/index.ts
routes/rag      ─▶ hooks/rag      ─▶ hooks/document/index.ts

hooks/upload   ─X hooks/document / hooks/rag
hooks/document ─X hooks/rag
hooks/rag      ─X hooks/upload internals / document internals
```

- `upload` 只回答“文件如何安全存储和访问”。
- `document` 只回答“文件内容是什么、如何形成稳定版本与 Segment”。
- `rag` 只回答“哪些文档属于知识库，以及如何索引、检索、生成和评估”。
- 文档可加入多个知识库；知识库删除关联不得删除文档本身。
- 解析块与 Chunk 从 RAG 命名空间移出，统一命名为文档块与 `DocumentSegment`，供摘要、审核和 RAG 等多个消费者复用。
- PostgreSQL 文档表使用 `documents`、`document_versions`、`document_processing_jobs`、`document_processing_stage_runs`、`document_parsed_blocks` 和 `document_segments`；RAG 仅保留 `rag_datasets` 与 `rag_dataset_documents` 等知识库表。

### 15. 管理端形成可恢复的操作闭环

- 文件中心分别展示通用文件与上传会话，页面只通过 `/file/*` 和 `/upload/*` 公共 routes 操作，不读取对象位置。
- 上传队列使用 Uppy 持久恢复能力保存浏览器可恢复的本地文件；浏览器无法恢复文件句柄时，用户重新选择同一文件，稳定指纹与服务端幂等会话继续完成上传。
- `onUploaded` 允许返回 Promise。知识库接入必须等待“创建文档 + 建立关联”完成后才把队列项标记成功，失败时保留错误与重试入口。
- 知识库文档列表使用独立分页状态，不与知识库分页共享；处理任务仅在存在未终结任务时轮询，并在组件关闭或卸载时释放定时器。
- 文件预览限制自动轮询次数，超限后保留手动刷新，避免转换 Worker 不可用时无限请求。

## Risks / Trade-offs

- [不透明文件引用缺少跨业务强外键] → 文档版本表保留 `source_file_id` 外键，引用服务使用唯一约束、补偿和一致性巡检。
- [通用上传继续膨胀为万能模块] → 只保留文件生命周期能力，业务解析和权限规则留在消费者。
- [Office 预览运行不可信文件] → 独立 Worker、超时、资源限制和临时目录隔离，缺少转换器时安全降级。
- [Uppy 与 Vue 状态重复] → Uppy 作为唯一上传状态源，由 composable 映射只读视图模型。
- [公共 Endpoint 配置错误导致签名失败] → 启动校验与 MinIO 集成测试覆盖真实 Host。
- [上传完成到业务绑定之间存在未绑定文件] → 策略保留期和未绑定文件清理。
- [解析库输出差异] → parser 适配层统一 ParsedBlock，库专属类型不外泄。
- [拆分过度增加跳转] → 按真实流程边界拆分，不为单行包装建文件，并在模块 README 说明调用路径。

## Migration Plan

1. 增加通用文件表、S3 配置和 `hooks/upload` 公共接口，先通过无业务消费者的上传集成验证。
2. 完成 upload/file routes、管理端 Uppy 组件、文件列表、下载和直接预览。
3. 接入缩略图和 Office 预览 Worker，启用派生物状态与清理。
4. 建立 `hooks/document` 数据表和处理服务，通过 `fileId` 接入已验证文件。
5. 实现解析器注册、统一块模型、标准化和 Segment，并建立 `hooks/rag` 知识库与文档关联。
6. 启用过期 Multipart、未绑定文件、派生物和失败文档处理产物的定时清理与一致性巡检。
7. 灰度开放上传与 RAG 入口；出现问题时关闭新 routes，保留已上传对象与任务状态用于恢复。

## Open Questions

- Office 预览首期采用宿主机 LibreOffice 还是独立容器 Worker；推荐独立容器。
- PDF/Office 解析首期采用 Docling 服务还是 Node 解析库组合；推荐先定义 parser 接口再接 Docling。
- 通用文件租户标识如何映射当前 app/user 权限关系，需要实现前根据现有认证模型确定。
- 文件引用一致性巡检是否独立于清理任务；推荐独立巡检，清理只消费已确认状态。
