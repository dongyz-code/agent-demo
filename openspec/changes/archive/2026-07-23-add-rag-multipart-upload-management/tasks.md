## 1. 配置、依赖与模块骨架

- [x] 1.1 在服务端配置类型和读取逻辑中增加 MinIO 内部 Endpoint、浏览器 Endpoint、区域、凭证、Bucket、签名时长、文件限制、Multipart 参数和清理周期，并补齐中文注释与启动校验
- [x] 1.2 为服务端添加 AWS SDK v3 S3 客户端、预签名、文件类型检测、Hash、图片缩略图及安全文本处理依赖，为管理端添加 Uppy Core 与 AWS S3 插件，并运行 `pnpm pkg:sort`
- [x] 1.3 在 `apps/server/src/hooks/documents` 下建立 upload、document、preview、rag、tasks、storage 功能目录和 README，不创建根 barrel
- [x] 1.4 增加 MinIO 部署说明，配置私有 Bucket、受限 CORS、Range 暴露、未完成 Multipart 生命周期和浏览器可达域名

## 2. 通用文件共享类型与数据模型

- [x] 2.1 在共享类型包定义文件、上传策略、上传模式、会话状态、文件状态、预览状态、派生文件、引用和稳定错误码，并为所有类型与字段添加中文 TSDoc
- [x] 2.2 定义 upload/file routes 的请求响应类型，客户端不得提交 Bucket、完整 Object Key 和服务端安全限制
- [x] 2.3 使用 Drizzle 新增 `files` 表，保存租户、创建人、显示名称、可信 MIME、大小、Hash、对象位置、状态和删除信息
- [x] 2.4 使用 Drizzle 新增 `file_upload_sessions` 表，保存策略、幂等键、模式、uploadId、分片参数、状态、有效期和错误信息
- [x] 2.5 使用 Drizzle 新增 `file_upload_parts` 表，使用 sessionId 与 partNumber 唯一约束保存 MinIO 分片投影
- [x] 2.6 使用 Drizzle 新增 `file_references` 表，使用 namespace、ownerId、role 与 fileId 唯一约束维护业务引用
- [x] 2.7 使用 Drizzle 新增 `file_variants` 表，保存预览类型、生成器版本、源 Hash、派生对象位置、状态和错误
- [x] 2.8 注册新增表与索引并验证启动建表、结构检查和数据库类型推导

## 3. 上传策略与 S3 基础封装

- [x] 3.1 实现上传策略注册表及 `default-attachment`、`image`、`rag-document` 初始策略，策略只包含技术限制且不得调用 RAG
- [x] 3.2 实现安全 Object Key、文件显示名称清洗、扩展名规范化、文件指纹、分片大小和分片数量纯函数，并覆盖边界测试
- [x] 3.3 实现内部 S3 命令客户端与公共 Endpoint 签名客户端，强制 path-style 并避免在日志输出凭证
- [x] 3.4 封装 PutObject、CreateMultipartUpload、UploadPart 签名、ListParts、CompleteMultipartUpload、AbortMultipartUpload、HeadObject、GetObject 和 DeleteObject
- [x] 3.5 实现 Bucket 健康检查和公共 Endpoint 启动检查，错误信息必须可定位但不得暴露 Secret Key

## 4. `hooks/documents/upload` 上传流程

- [x] 4.1 实现上传初始化服务，校验策略、权限上下文、文件名称、大小和类型，按阈值返回普通或 Multipart 模式
- [x] 4.2 实现初始化幂等，同一调用者、策略、文件指纹和幂等键重复请求返回原有效会话
- [x] 4.3 实现 Multipart 分片窗口签名，校验会话状态、有效期、uploadId、partNumber 范围和单次签名数量
- [x] 4.4 实现 ListParts 恢复，以 MinIO 为事实源同步分片投影并返回已上传字节和缺失分片
- [x] 4.5 实现普通上传完成确认与 Multipart 完成服务，使用条件状态迁移防止并发合并
- [x] 4.6 实现完成接口幂等，重复请求返回同一 fileId 且不重复创建文件记录
- [x] 4.7 实现上传取消和过期处理，Abort 后禁止继续签名与完成
- [x] 4.8 实现上传会话列表、详情和状态查询，按租户和创建人权限过滤

## 5. 文件验证、读取与引用服务

- [x] 5.1 实现 HeadObject 同步验证，检查对象存在性、大小、会话绑定和声明 Content-Type
- [x] 5.2 实现 validator 注册表、Magic Number 检测和可信 MIME 解析，非法类型进入明确 rejected 状态
- [x] 5.3 实现服务端流式 SHA-256 计算，明确 Multipart ETag 不作为完整文件 Hash
- [x] 5.4 实现文件查询和可重复打开流工厂，公开接口返回文件描述与流而不暴露 S3 客户端
- [x] 5.5 实现 bindFile、releaseFile 和引用列表服务，校验 verified 状态并使用唯一约束保证幂等
- [x] 5.6 实现附件下载签名，使用可信 Content-Type、清洗文件名和短期 attachment Content-Disposition
- [x] 5.7 实现逻辑删除与异步物理删除，在删除对象前重新检查有效引用
- [x] 5.8 实现过期 Multipart、未绑定文件、失败文件和孤儿对象报告清理任务，重复执行保持幂等

## 6. 文件预览与在线查看

- [x] 6.1 定义 PreviewProvider 接口、预览注册表和统一预览描述类型，业务调用方不得判断 Object Key
- [x] 6.2 实现 PDF、常见图片、音频和视频的直接内联预览签名，并验证 Range 请求配置
- [x] 6.3 实现纯文本限长读取和安全转义，Markdown 渲染后执行 HTML 清洗
- [x] 6.4 使用 Sharp 实现图片缩略图派生物，按源 Hash、类型和生成器版本复用缓存
- [x] 6.5 定义 OfficePreviewProvider 并接入独立 LibreOffice Worker 或可配置适配器，将 DOCX、PPTX、XLSX 转换为 PDF
- [x] 6.6 对 HTML、SVG 和其他主动内容实现禁止同源直接渲染策略，返回隔离预览或强制下载
- [x] 6.7 实现派生预览任务状态、超时、重试、错误和旧版本清理
- [x] 6.8 实现文件预览服务，统一返回 direct、generated、text、pending、failed 或 unsupported 状态

## 7. 通用 upload/file routes

- [x] 7.1 新增上传初始化、分片签名、ListParts、完成、取消、状态和列表 routes，补齐 schema、共享类型和权限键
- [x] 7.2 新增文件详情、预览、下载和删除 routes，验证租户、创建人或文件引用权限
- [x] 7.3 确认上传列表/状态等普通 route 直接 ORM，初始化、完成和 Multipart 流程调用上传业务函数且不组合 S3 内部原语
- [x] 7.4 将 routes 纳入自动加载与路由类型生成，并验证错误响应不泄露 Object Key、uploadId、内部 Endpoint 和完整签名 URL

## 8. 管理端通用上传与文件查看组件

- [x] 8.1 封装 Uppy adapter 和 `useUploader` composable，接入初始化、普通上传、Multipart 签名、ListParts、Complete 与 Abort 接口
- [x] 8.2 创建独立 UploadDialog、UploadQueue 和 UploadItem 组件，支持多文件、进度、暂停、继续、取消和失败重试
- [x] 8.3 实现刷新后的上传恢复，使用文件指纹匹配会话并通过 ListParts 跳过完成分片
- [x] 8.4 创建通用 FileViewer 及 PDF、图片、音视频、文本和状态子组件，业务页面只传 fileId
- [x] 8.5 实现预览 pending 轮询、失败原因、不支持提示和权限受控下载入口
- [x] 8.6 补充上传组件和文件查看组件的使用示例、props、事件和资源释放说明，组件卸载时清理 Uppy 实例与对象 URL

## 9. RAG 共享类型与数据模型

- [x] 9.1 在共享类型包定义知识库、文档、文档版本、摄取任务、阶段、解析块、Chunk 和处理配置类型，并补齐中文 TSDoc
- [x] 9.2 使用 Drizzle 新增 `rag_datasets`、`rag_documents` 和 `rag_document_versions`，文档版本只保存 source_file_id 而不复制 S3 字段
- [x] 9.3 新增 `rag_ingestion_jobs` 与 `rag_ingestion_stage_runs`，保存显式阶段、配置版本、统计、checkpoint 和稳定错误
- [x] 9.4 新增 `rag_parsed_blocks` 与 `rag_chunks`，为确定性标识、内容 Hash、父子关系和来源定位建立唯一约束与索引
- [x] 9.5 注册 RAG 表并验证数据库结构、关系和类型检查

## 10. `hooks/documents/rag` 文档与摄取流程

- [x] 10.1 在 route 使用 ORM 实现知识库创建、列表、详情、更新和停用，知识库普通 CRUD 不建立薄 service
- [x] 10.2 在上传完成流程中使用 verified File 创建 DocumentVersion，并建立内部源文件引用
- [x] 10.3 实现创建失败的文件引用补偿和文档删除时的引用释放，避免悬挂引用
- [x] 10.4 实现摄取状态机、幂等任务创建、阶段 checkpoint 和失败重试入口
- [x] 10.5 定义统一 RagParser 接口、ParsedBlock 类型与 parser 注册表，解析库专属类型不得越过适配层
- [x] 10.6 通过 `hooks/documents/storage/source` 的内部文件描述与流实现 PDF、Markdown/TXT、Office 和表格解析器适配器
- [x] 10.7 实现版本化标准化流程，处理 Unicode、空白、页眉页脚、OCR 噪声和主动内容，同时保留标题、表格及代码语义
- [x] 10.8 实现版本化 Chunk profile 和结构化切分，支持 token 兜底、overlap、父块和确定性 Chunk ID
- [x] 10.9 实现解析块与 Chunk 的幂等写入、旧处理版本保留和重建入口
- [x] 10.10 定义 ready Chunk 向后续 Embedding/索引交接的公开接口，不在 parser 或 route 中直接执行模型和 ES 操作

## 11. RAG routes 与管理端页面

- [x] 11.1 新增知识库创建、列表、详情、更新和停用 routes，普通 CRUD 直接使用 ORM
- [x] 11.2 新增通过 fileId 创建文档、文档列表、详情、删除和重新摄取 routes
- [x] 11.3 新增摄取任务列表、详情、阶段日志、重试和取消 routes，并补齐权限与共享路由类型
- [x] 11.4 新增管理端知识库页面，搜索表单优先使用 `VSchemaForm mode="search"`，页面只管理筛选、列表和跨组件刷新
- [x] 11.5 将知识库编辑、文档上传、文件预览、摄取详情和重新处理分别拆成聚焦弹窗或抽屉组件
- [x] 11.6 在 RAG 文档上传流程中先调用通用上传取得 fileId，再显式调用 RAG 创建文档接口
- [x] 11.7 增加管理端路由、权限元信息和路由类型，使用项目路由 helper 跳转且不手写 URL

## 12. 可读性、测试与交付验证

- [x] 12.1 增加依赖边界检查或静态审计，确认普通 route 直接 ORM、复杂流程精确导入业务文件，且 routes 不导入 S3、File 行或 worker 内部原语
- [x] 12.2 为分片计算、Object Key、状态迁移、上传幂等、文件引用、预览选择、Parser 选择和 Chunk 确定性添加聚焦测试
- [x] 12.3 使用本地 MinIO 验证普通上传、Multipart、签名续期、刷新恢复、取消、重复完成、下载、Range 和删除
- [x] 12.4 验证 PDF、图片、Markdown、Office、不可信 HTML/SVG 和不支持类型的预览行为及权限撤销
- [x] 12.5 验证未验证文件不能进入 RAG，摄取重试不会重复创建文档版本、解析块和 Chunk
- [x] 12.6 审查新增函数、类型、参数、返回值、状态字段和非显然规则的中文 TSDoc，拆分巨型 service、index 和 Vue 页面
- [x] 12.7 运行服务端、管理端及共享包 lint/typecheck、相关测试和 `pnpm turbo lint`，修复本次变更问题
- [x] 12.8 补充部署和开发文档，说明 MinIO、Uppy、预览 Worker、上传策略、模块公共接口、RAG parser 扩展和故障排查

## 13. 文档域功能收敛

- [x] 13.1 更新 OpenSpec proposal、design 和 capability，固定 documents 单域的功能边界与数据所有权
- [x] 13.2 新增 document 共享类型和 routes 类型，将文档、版本、处理阶段、解析块与 Segment 从 RAG 类型中解耦
- [x] 13.3 将文档数据表重构为通用 `documents`、`document_versions`、`document_processing_*`、`document_parsed_blocks`、`document_segments`，并新增 `rag_dataset_documents` 关联表
- [x] 13.4 将复杂文档读取、版本和删除归入 `hooks/documents/document`，不建立根公共入口
- [x] 13.5 将版本内容任务和 pipeline 归入 `hooks/documents/document/content`，知识库关系与版本发布归入 `hooks/documents/rag`，知识库基础 CRUD 由 route 直接使用 ORM
- [x] 13.6 新增 document routes，并将 RAG routes 调整为知识库与文档关联接口；普通 CRUD 直接 ORM，复杂流程精确导入业务函数
- [x] 13.7 调整管理端流程为“上传取得 fileId → 创建文档取得 documentId → 加入知识库”，保持弹窗组件职责清晰
- [x] 13.8 更新依赖边界、确定性处理、文档复用、知识库关联和删除语义测试，并运行全部 lint、构建与 MinIO/PostgreSQL 集成测试

## 14. 管理端操作闭环

- [x] 14.1 新增通用文件分页查询 route 与共享类型，并创建独立文件中心页面，支持筛选、上传、预览、下载和删除
- [x] 14.2 创建上传会话管理视图，支持状态与策略筛选、分页、进度展示、详情刷新和取消有效会话
- [x] 14.3 为 Uppy 接入浏览器持久恢复，并保持重新选择同一文件时通过稳定指纹和 ListParts 续传
- [x] 14.4 让上传完成回调等待文档创建与知识库关联，失败时在队列展示错误并支持幂等重试
- [x] 14.5 为知识库文档增加独立分页，为文档处理任务增加有终止条件的轮询，为重新处理补齐跨组件刷新
- [x] 14.6 为文件预览增加最大自动轮询次数、手动刷新和错误恢复，并运行管理端、服务端、共享类型检查与构建
- [x] 14.7 将文件中心和 RAG 管理加入管理端硬编码菜单，并保持系统管理员全量可见、普通用户按页面权限过滤
