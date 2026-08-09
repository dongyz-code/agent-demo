## ADDED Requirements

### Requirement: documents 只依赖公共任务 API
documents 域 MUST 只从通用任务模块的公共入口导入 `task`、脚本运行参数及公开生命周期类型，不得导入任务存储、调度器、进程监督、lease、attempt 状态迁移或日志持久化内部文件，也不得直接写 tasks、task_attempts 或 task_logs 表。

#### Scenario: 新增文档任务
- **WHEN** documents 域新增一种后台任务
- **THEN** 该能力扩展 `document.process` 的 parts 与领域派发、调用单对象 task.add 并使用脚本运行参数，不新增注册任务键或任何通用生命周期代码

### Requirement: documents 提供单一任务领域入口
routes、文档内容、预览和删除流程 MUST 只从 `documents/tasks/task.ts` 调用任务创建、查询和取消能力，不得分别导入 create、detail、control、definition 或 register 模块。`documents/tasks` MUST 只保留领域入口、子进程运行时和阶段运行时三个文件。

#### Scenario: 业务代码创建文档任务
- **WHEN** 内容、预览或删除流程需要创建后台任务
- **THEN** 调用方只调用 `documents/tasks/task.ts` 暴露的领域函数，不接触 script、data 拼装或扩展表写入

## MODIFIED Requirements

### Requirement: 通用任务框架与 documents 解耦
通用任务查询、调度和执行 MUST NOT 在自身实现中硬编码 documents 的文件、版本、知识库、处理任务表或业务回调。documents 任务筛选、摘要、终态收敛和取消补偿 MUST 由 documents 域通过公共查询组合或脚本生命周期导出提供。

#### Scenario: 按文件名筛选任务
- **WHEN** 通用任务中心按文档文件名筛选
- **THEN** documents 域解析领域任务标识，通用任务查询只消费任务字段或标识集合
