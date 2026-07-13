## ADDED Requirements

### Requirement: 独立文档内容层
系统 MUST 使用独立 `hooks/document` 管理文档、版本、解析、标准化、Segment 和处理任务。文档模块 MAY 依赖 `hooks/upload/index.ts`，但 MUST NOT 依赖知识库、Embedding、Elasticsearch、检索或回答模型。

#### Scenario: 创建通用文档
- **WHEN** 授权用户提交已验证 `fileId`
- **THEN** 文档模块创建与任何知识库无关的文档版本、文件引用和处理任务

### Requirement: 文档可被多个知识库复用
RAG MUST 使用独立关联表维护知识库与文档关系，不得把 `datasetId` 保存到通用文档主表。移除知识库关联不得删除文档或释放其源文件引用。

#### Scenario: 复用文档
- **WHEN** 同一文档加入两个知识库
- **THEN** 系统只保留一个文档及处理产物，并创建两条知识库关联

### Requirement: Ready 文档公共接口
文档模块 MUST 通过公共入口返回版本化 `DocumentSegment`，包含确定性标识、内容、Embedding 输入、标题路径、页码、位置和内容 Hash。RAG 不得查询文档内部表。

#### Scenario: RAG 消费文档
- **WHEN** RAG 需要为知识库建立索引
- **THEN** RAG 通过 `hooks/document/index.ts` 获取 ready 文档，不导入 parser、processing 或文档数据表

### Requirement: 三层路由分离
上传 routes MUST 只调用上传模块，文档 routes MUST 只调用文档模块，RAG routes MUST 只调用 RAG 模块。管理端上传知识文档时 MUST 依次完成上传、创建文档和加入知识库。

#### Scenario: 完整知识文档接入
- **WHEN** 管理端上传文件并加入知识库
- **THEN** 客户端依次获得 `fileId`、`documentId`，再创建 `datasetId + documentId` 关联

### Requirement: 管理端文档分页与进度刷新
管理端 MUST 对知识库文档和处理任务提供分页或有限范围查询；运行中的处理任务 MUST 定期刷新，并在任务进入终态或抽屉关闭时停止轮询。

#### Scenario: 大知识库浏览文档
- **WHEN** 知识库文档数量超过单页大小
- **THEN** 用户可以翻页且页面使用服务端返回总数维护分页状态

#### Scenario: 查看运行中任务
- **WHEN** 用户打开包含 pending 或 running 任务的处理抽屉
- **THEN** 页面定期刷新任务，所有任务进入终态或抽屉关闭后停止自动请求
