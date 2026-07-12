## Why

项目需要完整的 MinIO 上传、文档处理与 RAG 知识库能力，但上传、文件预览、文档解析和知识库关联属于不同生命周期。将通用文件能力抽取到 `hooks/upload`，文档内容能力收口到 `hooks/document`，再由 `hooks/rag` 通过稳定 `documentId` 消费 ready 文档，可以提高复用性、可读性并避免 routes、S3 协议、解析逻辑和知识库语义相互渗透。

## What Changes

- 新增 `apps/server/src/hooks/upload` 通用上传模块，统一封装普通上传、S3 Multipart、断点续传、验证、文件引用、下载、删除和清理，不包含 RAG 业务概念。
- 新增通用文件预览和在线查看能力：PDF、图片、音视频、纯文本直接查看；Office 文件通过可插拔转换器生成 PDF；不可信主动内容采用隔离或强制下载。
- 新增通用 upload/file routes，route handler 只负责 schema、认证、权限上下文和调用 hooks，不直接执行 S3 命令、数据库查询或状态迁移。
- 新增管理端可复用上传和文件查看组件，使用 Uppy Core + AWS S3 插件管理上传调度，同时复用项目现有 Vue UI 风格。
- 新增 `apps/server/src/hooks/document` 文档管理模块，只通过 `hooks/upload` 公开接口消费已验证文件，统一封装文档版本、解析器注册、标准化、Segment 和处理任务。
- `apps/server/src/hooks/rag` 只管理知识库与文档关联，并通过 `hooks/document/index.ts` 消费 ready 文档，为后续 Embedding、索引、检索和评估保留明确边界。
- 上传完成只返回通用 `fileId`；管理端显式创建文档并加入知识库，上传模块不主动触发文档处理或 RAG。
- 明确可读性约束：模块单向依赖、公开入口收口、routes 薄层、状态迁移显式、组件按交互单元拆分，并为新增函数和类型补充中文 TSDoc。
- 完善管理端文件中心与知识库页面：提供通用文件、上传会话、分页文档、处理进度和可恢复上传入口，并让“上传 → 创建文档 → 加入知识库”的业务失败能够回到上传队列展示与重试。

## Capabilities

### New Capabilities

- `generic-file-upload-management`: 定义通用文件上传、S3 Multipart、断点恢复、验证、文件引用、下载、删除、清理和权限能力。
- `file-preview-and-viewing`: 定义原文件直接预览、派生预览、缩略图、在线查看、安全响应和预览状态能力。
- `rag-document-ingestion`: 定义原 RAG 文档接入流程重构后的文档处理、知识库关联和 ready Segment 交接约束。
- `document-content-management`: 定义独立于知识库的文档、版本、解析、标准化、Segment 和处理任务能力。

### Modified Capabilities

无。

## Impact

- 服务端形成 `hooks/upload`、`hooks/document`、`hooks/rag` 三层及对应 route 文件。
- PostgreSQL 新增通用文件、上传会话、上传分片、文件引用、派生文件、通用文档处理及知识库关联表。
- `@repo/types` 新增上传、文件、预览、文档处理和知识库共享类型。
- 管理端新增可复用上传队列、文件预览、在线查看、文件中心、上传会话和 RAG 文档管理组件。
- 服务端新增 AWS SDK v3 S3 客户端与签名依赖；管理端新增 Uppy Core 和 AWS S3 插件；Office 预览与复杂文档解析通过独立适配器或 Worker 接入。
- MinIO 保持私有 Bucket，并增加浏览器 Endpoint、CORS、生命周期和派生物存储配置。
