## ADDED Requirements

### Requirement: 单一 documents 域边界
服务端 MUST 把文件上传、文件管理、文档内容处理、知识库与文件处理任务的全部实现收口到单一 `hooks/documents` 域，MUST NOT 在 `hooks/upload`、`hooks/document`、`hooks/rag` 维护业务实现。

#### Scenario: 旧目录下线
- **WHEN** 服务端代码迁移完成
- **THEN** 仓库 MUST NOT 存在 `hooks/upload`、`hooks/document`、`hooks/rag` 三个目录
- **THEN** 仓库 MUST NOT 存在以 `re-export` 形式转发旧目录实现的兼容出口

#### Scenario: 新代码导入边界
- **WHEN** documents 域外的代码需要使用文件能力
- **THEN** 该代码 MUST 从 `hooks/documents` 公共入口导入
- **THEN** 该代码 MUST NOT 直接导入 `hooks/documents` 子模块的内部实现文件

### Requirement: documents 域子模块划分
`hooks/documents` MUST 按职责划分稳定子模块：存储原语、上传会话、文件管理、预览、文档内容、处理流水线、知识库。每个子模块只暴露公共入口，内部实现不跨子模块直接引用。

#### Scenario: 子模块边界
- **WHEN** 开发者查看 `hooks/documents` 目录
- **THEN** 该目录 MUST 包含 storage、upload、files、preview、content、processing、knowledge 子模块
- **THEN** 每个子模块 MUST 通过自身 `index.ts` 暴露公共能力
- **THEN** 子模块之间 MUST NOT 直接导入对方内部实现文件

### Requirement: 知识库并入 documents 域
rag 知识库（dataset 实体与文档关联）MUST 作为 `hooks/documents/knowledge` 子模块纳入 documents 域，MUST NOT 保留独立 `hooks/rag` 目录或跨域 `re-export` 转发。

#### Scenario: 知识库能力归属
- **WHEN** 业务需要查询或管理知识库
- **THEN** 系统 MUST 通过 `hooks/documents` 的 knowledge 子模块提供能力
- **THEN** 仓库 MUST NOT 存在独立的 `hooks/rag` 业务目录

### Requirement: route 内联业务逻辑
documents 域 route handler MUST 直接编写业务逻辑（数据库查询、对象存储调用、任务编排），MUST NOT 为每个接口维护一个仅被该 route 单处引用的 service 方法作为中间层。

#### Scenario: route 直接处理业务
- **WHEN** 开发者查看 `router/routes/documents/` 下的 route 文件
- **THEN** route handler MUST 直接包含业务逻辑或调用被多处复用的领域函数
- **THEN** route handler MUST NOT 仅转发调用一个单处引用的 service 方法

#### Scenario: 跨接口复用仍允许
- **WHEN** 多个 route 共享同一段业务逻辑
- **THEN** 该逻辑 MUST 提取为领域函数并被多处引用
- **THEN** 该领域函数 MUST NOT 仅为单个 route 存在

### Requirement: 处理流水线作为 runtime 保留
有状态的文件处理流水线（worker 领取、阶段编排、心跳恢复、checkpoint）MUST 作为 runtime 保留在 `hooks/documents/processing`，不视为 route 的 service 中间层；route 只负责任务的创建、查询、取消、重试用例。

#### Scenario: route 与 runtime 分离
- **WHEN** 用户创建或取消文件处理任务
- **THEN** route handler MUST 直接执行创建或取消的业务逻辑
- **THEN** 后台 worker MUST 独立于 route 异步执行阶段编排

### Requirement: 旧文档处理流水线下线
旧 `document/processing` 的 runner 与 service（基于 `document_processing_jobs` 表）MUST 退役，统一走 documents 域处理流水线；旧表仅保留只读投影供历史审计，不被新 worker 重新领取。

#### Scenario: 不再写入旧任务表
- **WHEN** 新的文件处理任务执行
- **THEN** 系统 MUST NOT 向 `document_processing_jobs` 表写入新记录
- **THEN** 系统 MUST 通过统一 `tasks` 与 `file_processing_tasks` 表承载任务

### Requirement: documents 域内部边界校验
`dependency-boundaries.test.ts` MUST 覆盖 `hooks/documents` 内部边界，断言子模块不跨吃内部实现、不绕过公共入口。

#### Scenario: 边界测试覆盖新域
- **WHEN** 运行依赖边界测试
- **THEN** 测试 MUST 校验 `hooks/documents` 子模块不直接导入其他子模块内部实现
- **THEN** 测试 MUST 校验 documents 域 routes 只从 `hooks/documents` 公共入口导入

### Requirement: 通用任务框架与 documents 解耦
`hooks/task` 通用任务查询能力 MUST NOT 硬编码 documents 域的 `file_processing_tasks`、`files`、`rag_datasets` 表结构与字段；documents 处理任务的领域字段 MUST 由 documents 域自行提供，通用任务框架保持领域无关。

#### Scenario: 通用任务列表不耦合领域字段
- **WHEN** 通用任务中心查询任务列表
- **THEN** 通用任务框架 MUST NOT 在自身查询中硬编码 documents 域表与字段
- **THEN** documents 域领域字段 MUST 由 documents 域补充提供
