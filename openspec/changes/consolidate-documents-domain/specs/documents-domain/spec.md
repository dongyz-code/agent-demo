## ADDED Requirements

### Requirement: 单一 documents 域边界
服务端 MUST 把文件上传、文件管理、文档内容处理、知识库与文件处理任务的全部实现收口到单一 `hooks/documents` 域，MUST NOT 在 `hooks/upload`、`hooks/document`、`hooks/rag` 维护业务实现。

#### Scenario: 旧目录下线
- **WHEN** 服务端代码迁移完成
- **THEN** 仓库 MUST NOT 存在 `hooks/upload`、`hooks/document`、`hooks/rag` 三个目录
- **THEN** 仓库 MUST NOT 存在以 `re-export` 形式转发旧目录实现的兼容出口

#### Scenario: 新代码导入边界
- **WHEN** documents 域外的代码需要使用文件能力
- **THEN** 该代码 MUST 精确导入对应的稳定业务文件
- **THEN** 该代码 MUST NOT 导入 File 行、S3、worker claim 或阶段持久化等内部原语

### Requirement: documents 域子模块划分
`hooks/documents` MUST 按职责划分 document、upload、preview、rag、tasks 和 storage 子模块。子模块可以精确引用完成当前业务所需的实现文件，MUST NOT 通过多层 barrel 转发或公开内部原语。

#### Scenario: 子模块边界
- **WHEN** 开发者查看 `hooks/documents` 目录
- **THEN** 该目录 MUST 包含 document、upload、preview、rag、tasks、storage 子模块
- **THEN** route 与域内调用方 MUST 精确导入所需业务文件
- **THEN** 目录 MUST NOT 为纯转发目的增加子模块 `index.ts`

### Requirement: 知识库并入 documents 域
RAG 文档关系与处理 MUST 作为 `hooks/documents/rag` 子模块纳入 documents 域；知识库基础 CRUD 作为普通 route 查询直接使用 ORM，MUST NOT 为其维护薄 service。

#### Scenario: 知识库能力归属
- **WHEN** 业务需要查询或管理知识库
- **THEN** 复杂关系与处理流程 MUST 通过 `hooks/documents/rag` 提供能力
- **THEN** 仓库 MUST NOT 存在独立的 `hooks/rag` 业务目录

### Requirement: route 与 hooks 按复杂度分工
documents 域的普通单表查询、分页和简单条件更新 MUST 由 route 直接使用 ORM。复用业务、多表事务与状态迁移、对象存储编排、复杂聚合查询和后台运行时 MUST 放在 `hooks/documents`，不得为普通 CRUD 建立薄 service，也不得把复杂流程全部内联到 route。

#### Scenario: route 直接处理业务
- **WHEN** 开发者查看 `router/routes/documents/` 下的 route 文件
- **THEN** 普通 CRUD MUST 直接使用 ORM
- **THEN** 复杂流程 MUST 精确调用对应业务函数，不得组合内部原语

#### Scenario: 跨接口复用仍允许
- **WHEN** 多个入口共享同一业务逻辑，或单个流程包含多表状态与外部副作用
- **THEN** 该逻辑 MUST 提取为领域函数并被多处引用
- **THEN** 单入口复杂流程 MAY 作为独立业务函数存在

### Requirement: 处理流水线作为 runtime 保留
有状态的文档处理流水线（worker 领取、阶段编排、心跳恢复）MUST 作为 runtime 保留在 `hooks/documents/tasks`，预览与 RAG 执行逻辑分别归属对应功能目录。

#### Scenario: route 与 runtime 分离
- **WHEN** 用户创建或取消文件处理任务
- **THEN** 简单条件取消 MAY 由 route 直接更新任务状态，复杂任务创建与重试 MUST 调用对应业务函数
- **THEN** 后台 worker MUST 独立于 route 异步执行阶段编排

### Requirement: 旧文档处理流水线下线
旧 `document/processing` 的 runner 与 service（基于 `document_processing_jobs` 表）MUST 退役，统一走 documents 域处理流水线；旧表仅保留只读投影供历史审计，不被新 worker 重新领取。

#### Scenario: 不再写入旧任务表
- **WHEN** 新的文件处理任务执行
- **THEN** 系统 MUST NOT 向 `document_processing_jobs` 表写入新记录
- **THEN** 系统 MUST 通过统一 `tasks` 与 `file_processing_tasks` 表承载任务

### Requirement: documents 域内部边界校验
静态检查和类型检查 MUST 覆盖 `hooks/documents` 调用边界，确认 route 不导入内部 File、S3 或 worker 原语。

#### Scenario: 边界测试覆盖新域
- **WHEN** 运行服务端校验
- **THEN** route MUST 只精确导入稳定业务文件或直接使用 ORM
- **THEN** route MUST NOT 通过根 barrel 获得内部原语

### Requirement: 通用任务框架与 documents 解耦
`hooks/task` 通用任务查询能力 MUST NOT 硬编码 documents 域的 `file_processing_tasks`、`files`、`rag_datasets` 表结构与字段；documents 处理任务的领域字段 MUST 由 documents 域自行提供，通用任务框架保持领域无关。

#### Scenario: 通用任务列表不耦合领域字段
- **WHEN** 通用任务中心查询任务列表
- **THEN** 通用任务框架 MUST NOT 在自身查询中硬编码 documents 域表与字段
- **THEN** documents 域领域字段 MUST 由 documents 域补充提供
