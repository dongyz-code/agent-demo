## ADDED Requirements

### Requirement: documents 只依赖公共任务 API
documents 域 MUST 只从通用任务模块导入 `defineTask`、`task`、任务上下文、公开查询类型和
`TaskCanceledError`，不得导入任务存储、调度器、进程监督、lease、attempt 状态迁移、
脚本加载器内部实现或日志持久化实现，也不得直接写 `tasks`、`task_attempts` 或
`task_logs` 表。

#### Scenario: 新增文档后台任务
- **WHEN** documents 域新增一种后台脚本
- **THEN** 使用 `defineTask` 声明脚本路径和策略，默认导出执行函数，不修改集中注册表

### Requirement: documents 提供显式领域入口
routes、文档内容、预览和删除流程 MUST 从 `document-process-action` 或 cleanup 模块导入
文档处理入口，不得自行拼装脚本路径、展示名称、重试、超时、并发或持久化 data。

#### Scenario: 业务代码创建文档任务
- **WHEN** 内容、预览或删除流程需要创建后台任务
- **THEN** 调用领域入队函数，并传入业务输入和 actorUserId

#### Scenario: 查询或取消文档任务
- **WHEN** route 查询或取消文档后台任务
- **THEN** 调用文档详情或取消函数，不维护 detail、control 或 create 包装模块

## MODIFIED Requirements

### Requirement: 通用任务框架与 documents 解耦
通用任务查询、调度和执行 MUST NOT 在自身实现中硬编码 documents 的文件、版本、知识库、
专用任务表或业务回调。documents 的输入解析、关联标识、结果和取消收敛 MUST 由 documents
领域函数或默认执行脚本提供。

#### Scenario: 按文件名筛选任务
- **WHEN** 通用任务中心按文档文件名筛选
- **THEN** documents 域解析领域任务标识，通用任务查询只消费 script_path 或任务标识集合
