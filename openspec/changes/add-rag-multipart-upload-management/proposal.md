## Why

项目需要完整的 MinIO 上传、文档处理与 RAG 知识库能力，但上传、文件预览、文档解析和知识库关联属于不同生命周期。相关复杂流程统一收敛在 `hooks/documents` 内并按功能分目录，普通单表查询和简单更新留在 route 直接使用 ORM，以避免 routes、S3 协议、解析逻辑和知识库语义相互渗透，也避免为普通 CRUD 增加薄封装。

## What Changes

- 在 `apps/server/src/hooks/documents/upload` 收敛普通上传、S3 Multipart、断点续传、验证及文档版本绑定等复杂流程；上传会话列表和状态等普通查询直接归 route。
- 新增通用文件预览和在线查看能力：PDF、图片、音视频、纯文本直接查看；Office 文件通过可插拔转换器生成 PDF；不可信主动内容采用隔离或强制下载。
- 新增通用 upload/file routes：会话列表、状态等普通查询直接使用 ORM；初始化、完成、Multipart 和对象验证等复杂状态流程调用 hooks，route 不直接执行 S3 内部命令。
- 新增管理端可复用上传和文件查看组件，使用 Uppy Core + AWS S3 插件管理上传调度，同时复用项目现有 Vue UI 风格。
- 在 `apps/server/src/hooks/documents/document` 收敛复杂文档读取、版本切换和删除；解析、标准化与 Segment 归 `rag/pipeline`，不建立根公共入口。
- 在 `apps/server/src/hooks/documents/rag` 收敛知识库文档关系、RAG 任务与 pipeline；知识库基础 CRUD 直接由 route 使用 ORM。
- 上传完成只返回通用 `fileId`；管理端显式创建文档并加入知识库，上传模块不主动触发文档处理或 RAG。
- 明确可读性约束：普通 CRUD 直接 ORM，复杂或复用流程进入功能 hook，调用方精确导入、状态迁移显式、组件按交互单元拆分，并为新增函数和类型补充中文 TSDoc。
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

- 服务端形成单一 `hooks/documents` 域及 document、upload、preview、rag、tasks、storage 功能目录；route 按复杂度选择直接 ORM 或精确导入业务函数。
- PostgreSQL 新增通用文件、上传会话、上传分片、文件引用、派生文件、通用文档处理及知识库关联表。
- `@repo/types` 新增上传、文件、预览、文档处理和知识库共享类型。
- 管理端新增可复用上传队列、文件预览、在线查看、文件中心、上传会话和 RAG 文档管理组件。
- 服务端新增 AWS SDK v3 S3 客户端与签名依赖；管理端新增 Uppy Core 和 AWS S3 插件；Office 预览与复杂文档解析通过独立适配器或 Worker 接入。
- MinIO 保持私有 Bucket，并增加浏览器 Endpoint、CORS、生命周期和派生物存储配置。
