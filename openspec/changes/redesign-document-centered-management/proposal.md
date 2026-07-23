## Why

当前实现虽然已有 `documents` 与 `document_versions`，但管理入口仍是 File，版本创建固定为版本 1，预览存在多种返回形式，知识库关系也不知道当前使用哪个版本。需要用最少的表和流程把业务收回到 Document：Document 是主体，DocumentVersion 是内容，File 只是版本的内部源文件。

## What Changes

- **BREAKING** 管理入口与公共用例从文件中心调整为文档中心；上传、预览、下载、删除、RAG 状态和任务摘要均通过 `documentId` 与可选 `documentVersionId` 表达，`fileId` 降为服务端内部源对象标识。
- 支持首次上传创建文档、向既有文档上传不可变新版本、并发安全分配递增版本号、浏览全部历史版本，以及把任一历史版本重新设为当前版本。
- 新版本完成服务端文件验证后立即成为文档当前展示版本；预览状态保存在版本上，RAG 状态保存在知识库文档关系上，二者互不影响。
- 后端把每个文档版本转换为有序页面图片；前端统一通过页面窗口获取短期图片地址，不再理解 PDF、Office、文本或原始对象地址。
- 文档默认进入 RAG，可由授权用户按文档或单次版本上传关闭；一个文档可以加入多个知识库，每个知识库分别记录当前生效版本与处理状态。
- `searchDocuments` 一次返回文档、当前版本及其源文件信息、封面、版本数量、预览状态和知识库摘要；知识库文档列表复用同一查询并增加 `datasetId` 筛选。
- 文档删除采用逻辑删除与异步清理：先阻止新版本和新任务、撤销知识库生效关系，再清理版本源文件、页面图片和 RAG 产物；首期不提供单独删除历史版本。
- 服务端不引入 Repository 或“所有 route 必须经过 hooks”的强制层级：单路由普通 CRUD 直接使用 ORM，只有复用业务、多表状态迁移、对象存储编排、后台任务和复杂聚合查询进入 `hooks/documents`。
- 只新增 `document_preview_pages` 业务表；改造现有 `documents`、`document_versions` 和 `rag_dataset_documents`，复用 `files`、上传会话、通用任务、Segment 和对象存储，不新增预览批次、RAG 结果等中间实体。
- 为未来审批流、上下架和分发保留独立“发布快照”扩展边界：未来发布记录固定引用某个文档版本，审批与渠道分发不直接修改不可变版本；本变更不提前实现审批、发布或分发表及接口。

## Capabilities

### New Capabilities

- `document-lifecycle-management`: 定义文档作为聚合根的创建、搜索、详情、权限、逻辑删除、异步清理和聚合返回要求。
- `document-version-management`: 定义不可变版本、并发版本号、当前版本、历史查看、版本切换和版本级源文件生命周期。
- `document-image-preview`: 定义版本到有序页面图片的后端转换、版本级状态、安全访问、失败重试和前端统一预览契约。
- `document-rag-versioning`: 定义文档默认 RAG、多知识库关系、关系级 active/pending 版本、旧版本保留和成功后原子切换语义。

### Modified Capabilities

无。当前主规格尚未归档文档领域能力；本变更以新的文档中心契约接替未归档历史 change 中互相冲突的通用文件、独立文档和文件中心过渡设计。

## Impact

- 服务端：`apps/server/src/hooks/documents` 的文档、上传、预览、RAG、任务和存储边界及 `apps/server/src/router/routes/documents`；普通知识库和上传会话查询直接归 route。
- 数据库：`documents` 增加默认 RAG；`document_versions` 增加预览状态；新增 `document_preview_pages`；`rag_dataset_documents` 增加 active/pending 版本与处理状态。`files`、`document_segments` 和通用任务继续复用。
- 共享类型：文档列表、详情、版本、页面预览、RAG 摘要、版本上传与版本切换 DTO；文件管理 DTO 降级或迁移。
- 管理端：文件管理页面改为文档管理，上传组件支持首次上传与新版本上传，查看器改为版本选择与页面图片预览。
- 对象存储：保留原始版本文件，新增按文档版本、转换器版本和页码组织的页面图片对象；删除流程需要清理全部版本派生物。
- 任务运行时：复用现有任务与 worker，预览和 RAG 任务都绑定 `documentVersionId`，通过任务类型区分并独立重试。
- API 与权限：现有 `/documents/file-*`、`dataset-document-*` 及文件处理接口需要迁移或下线，属于对管理端和潜在外部调用方的兼容性变更。
