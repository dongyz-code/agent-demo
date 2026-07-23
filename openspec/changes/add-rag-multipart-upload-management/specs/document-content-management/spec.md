## ADDED Requirements

### Requirement: 文档内容能力按功能归位
系统 MUST 在单一 `hooks/documents` 域内按功能管理文档、版本、解析、标准化、Segment 和处理任务。文档聚合读写归 `document`，解析、标准化和 Segment 归 `rag/pipeline`，上传编排归 `upload`；普通单表查询和简单更新直接由 route 使用 ORM，不得恢复独立 `hooks/document` 或根 barrel。

#### Scenario: 创建通用文档
- **WHEN** 授权用户提交已验证 `fileId`
- **THEN** 文档模块创建与任何知识库无关的文档版本、文件引用和处理任务

### Requirement: 文档可被多个知识库复用
RAG MUST 使用独立关联表维护知识库与文档关系，不得把 `datasetId` 保存到通用文档主表。移除知识库关联不得删除文档或释放其源文件引用。

#### Scenario: 复用文档
- **WHEN** 同一文档加入两个知识库
- **THEN** 系统只保留一个文档及处理产物，并创建两条知识库关联

### Requirement: RAG 通过内部源文件边界生成版本化 Segment
RAG pipeline MUST 通过 `storage/source` 的内部源文件能力读取已验证版本，并生成版本化 `DocumentSegment`，包含确定性标识、内容、Embedding 输入、标题路径、页码、位置和内容 Hash。该内部能力不得通过根 barrel 或 route 暴露。

#### Scenario: RAG 消费文档
- **WHEN** RAG 需要为知识库建立索引
- **THEN** RAG runner 精确导入源文件和 pipeline 能力，不经过根公共入口，也不让 route 读取源文件或 parser 内部实现

### Requirement: 路由与复杂业务分离
普通单表查询和更新 MUST 在 route 中直接使用 ORM；上传、文档版本和 RAG 关系的复杂状态流程 MUST 调用对应业务函数。route 不得通过模块名机械分层，也不得自行组合 S3、File 行和任务内部原语。

#### Scenario: 完整知识文档接入
- **WHEN** 管理端上传文件并加入知识库
- **THEN** 服务端完成上传后创建 DocumentVersion，并按本次选择建立 `datasetId + documentId` 关系

### Requirement: 管理端文档分页与进度刷新
管理端 MUST 对知识库文档和处理任务提供分页或有限范围查询；运行中的处理任务 MUST 定期刷新，并在任务进入终态或抽屉关闭时停止轮询。

#### Scenario: 大知识库浏览文档
- **WHEN** 知识库文档数量超过单页大小
- **THEN** 用户可以翻页且页面使用服务端返回总数维护分页状态

#### Scenario: 查看运行中任务
- **WHEN** 用户打开包含 pending 或 running 任务的处理抽屉
- **THEN** 页面定期刷新任务，所有任务进入终态或抽屉关闭后停止自动请求
