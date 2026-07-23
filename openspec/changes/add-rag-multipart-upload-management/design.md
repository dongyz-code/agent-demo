## Context

项目是 TypeScript ESM 的 pnpm/Turbo monorepo，服务端使用 Fastify route、Drizzle/PostgreSQL 和 `hooks` 业务模块，管理端使用 Vue/Vite。完整上传需要覆盖 MinIO 普通上传、Multipart、续传、文件验证、预览和清理；文档层需要完成解析、标准化和 Segment，RAG 再消费 ready 文档。

上传、预览、文档版本和 RAG 属于同一文档业务域中的不同功能边界。复杂或复用流程统一放在 `hooks/documents` 下的功能目录，普通单表查询和简单更新由 route 直接使用 ORM；File、S3、parser 和 worker 控制面只作为域内实现存在。

## Goals / Non-Goals

**Goals:**

- 在 `hooks/documents/upload` 建立上传初始化、完成、Multipart、验证和文档版本绑定能力。
- 支持 Uppy + AWS S3 Multipart 浏览器直传、断点恢复、取消和幂等完成。
- 对 PDF、图片、音视频、文本和 Office 文件提供安全在线查看路径。
- 在 `hooks/documents/document` 管理复杂文档读取、版本、删除及 `document/content` 版本内容处理。
- 在 `hooks/documents/rag` 管理知识库文档关系与 active/pending 版本发布；知识库基础 CRUD 直接归 route。
- 按查询复杂度划分 route 与 hooks，保持调用方精确导入、组件职责清晰和完整中文 TSDoc。

**Non-Goals:**

- 不让上传模块理解知识库、头像或附件等业务规则。
- 不在 route handler 中组合 S3、File 行、预览转换、文档内容处理或 worker 控制流程；普通局部 ORM 查询不受此限制。
- 不允许前端持有 MinIO 长期凭证或拼接对象 URL。
- 首期不实现 Office 在线编辑、复杂视频转码和跨区域对象存储容灾。
- 本 change 不实现混合检索、Reranker 和回答评估闭环，只建立其上游文件、文档处理与知识库关联基础。

## Decisions

### 1. 固定 route 与 documents 功能边界

```text
普通 CRUD route ─────────────▶ Drizzle ORM
复杂文档 route ──────────────▶ hooks/documents/document
上传 route ──────────────────▶ hooks/documents/upload
预览 route ──────────────────▶ hooks/documents/preview
知识库文档 route ────────────▶ hooks/documents/rag
server ──────────────────────▶ hooks/documents/tasks/worker

routes ─X storage / File 行 / parser / worker 控制面
```

`hooks/documents` 不提供根 barrel。调用方精确导入功能明确的业务文件；出现复用、多表状态迁移、对象存储编排、复杂批量聚合或后台运行时才进入 hooks，不为普通 CRUD 建立同名 service。

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

`hooks/documents/upload/policies.ts` 注册技术策略，例如：

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

### 5. 上传与存储按真实职责拆分

```text
apps/server/src/hooks/documents/
├── upload/
│   ├── init.ts
│   ├── complete.ts
│   ├── multipart.ts
│   ├── session.ts
│   ├── policies.ts
│   ├── object-key.ts
│   └── validators.ts
└── storage/
    ├── client.ts
    ├── objects.ts
    ├── presign.ts
    └── source.ts
```

纯计算函数只在确有复用时独立保存。上传业务函数负责完整状态流程，storage 只提供域内对象能力；不建立根或子模块 barrel，也不把 S3 编排散落到 route。

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

### 10. 上传完成以文档为中心接入

```text
管理端初始化文档上传并选择知识库
  ↓
hooks/documents/upload 完成并验证 File
  ↓
事务创建或追加 DocumentVersion
  ↓
更新 Document.activeVersionId
  ↓
创建预览任务
  ↓
按本次选择建立知识库关系并创建唯一版本内容任务
```

File 只作为 DocumentVersion 的内部源文件。客户端不再用 `fileId` 继续拼接文档流程；完成请求幂等返回 Document 与 Version，预览和 RAG 失败各自重试，不回滚已验证版本。

### 11. `document/content` 统一版本内容处理流程

```text
apps/server/src/hooks/documents/
├── document/content/
│   ├── parsers/
│   ├── normalize.ts
│   ├── segment.ts
│   ├── task.ts
│   └── runner.ts
└── rag/
    ├── assignment.ts
    └── relations.ts
```

内容 runner 通过 `storage/source` 接收可信文件描述和可读取流，解析器输出统一 `ParsedBlock[]`。Docling、LibreOffice 或具体库类型不得越过 parser 边界。同一 DocumentVersion 与处理配置只创建一个内容任务；任务生成一套版本级 Segment 后，批量发布所有仍以该版本为 pending 的知识库关系。

处理阶段：

```text
queued → reading → parsing → normalizing → segmenting → content-publishing → completed
```

每阶段记录配置版本、统计、产物和错误。Segment ID 由文档版本、策略版本、位置和内容 Hash 确定，重试不会重复插入。Embedding 和索引消费关系的 activeVersion 对应 Segment，不通过根公共接口，也不在解析器或 route 内调用。

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

- routes 可以直接包含局部 Drizzle 查询，但不出现 S3 命令、File 行映射、parser、worker 控制面或跨阶段流程。
- `hooks/documents` 不建立根 barrel；routes、server 和域内调用方精确导入 document、upload、preview、rag、tasks 或 storage 中所需实现。
- 页面负责入口和刷新；上传、预览、文档创建及任务详情拆成独立组件。
- 共享文案、纯函数和类型放在邻近 `utils.ts`、`types.ts`，不使用通用工具隐藏页面专属流程。
- 新增函数、方法、类、hook、常量、接口、类型、参数、返回值和字段添加清晰中文 TSDoc 或属性注释。
- 状态迁移使用命名函数或映射，不散落字符串判断。
- 对外错误使用稳定错误码，内部异常保留 cause 和上下文。
- 文件职责变大时按流程边界拆分，避免巨型 service、index 和 Vue 页面。

### 14. Documents 单域的功能边界

```text
hooks/documents/
├── document/   复杂读取、版本、删除、清理与版本内容处理
├── upload/     上传初始化、完成和 Multipart 编排
├── preview/    页面查询、转换任务和 runner
├── rag/        知识库文档关系与版本发布
├── tasks/      任务详情、worker、lease 和阶段运行时
└── storage/    模块内部对象与源文件能力
```

- `upload` 回答“上传如何安全完成并绑定文档版本”。
- `document` 回答“文档如何聚合读取、形成版本、解析为 Segment 和完成生命周期操作”。
- `rag` 回答“文档属于哪些知识库，以及哪个版本参与检索”。
- 普通知识库、上传会话和简单状态查询直接留在 route，不为目录对称建立薄函数。
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

1. 增加通用文件表、S3 配置和 `hooks/documents/upload` 业务流程，先通过无业务消费者的上传集成验证。
2. 完成 upload/file routes、管理端 Uppy 组件、文件列表、下载和直接预览。
3. 接入缩略图和 Office 预览 Worker，启用派生物状态与清理。
4. 建立 `hooks/documents/document` 的文档版本能力，通过域内源文件边界接入已验证 File。
5. 在 `hooks/documents/document/content` 实现解析器、统一块模型、标准化和 Segment，在 `hooks/documents/rag` 实现知识库文档关系与版本发布。
6. 启用过期 Multipart、未绑定文件、派生物和失败文档处理产物的定时清理与一致性巡检。
7. 灰度开放上传与 RAG 入口；出现问题时关闭新 routes，保留已上传对象与任务状态用于恢复。

## Open Questions

- Office 预览首期采用宿主机 LibreOffice 还是独立容器 Worker；推荐独立容器。
- PDF/Office 解析首期采用 Docling 服务还是 Node 解析库组合；推荐先定义 parser 接口再接 Docling。
- 通用文件租户标识如何映射当前 app/user 权限关系，需要实现前根据现有认证模型确定。
- 文件引用一致性巡检是否独立于清理任务；推荐独立巡检，清理只消费已确认状态。
