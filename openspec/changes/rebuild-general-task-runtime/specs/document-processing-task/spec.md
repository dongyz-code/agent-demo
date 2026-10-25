## ADDED Requirements

### Requirement: 文档处理和清理使用独立任务脚本
documents 域 MUST 定义 `documentProcessTask` 和 `documentCleanupTask` 两个类型化任务句柄，
并分别默认导出预览/RAG 执行函数和物理清理函数。两个脚本 MUST 使用 `document` 并发分组。

#### Scenario: 创建文档处理任务
- **WHEN** documents 域需要生成预览或执行 RAG
- **THEN** 调用 `enqueueDocumentProcess(input, userId)` 创建组合或单操作任务

#### Scenario: 删除文档
- **WHEN** documents 域需要物理清理已逻辑删除的文档
- **THEN** 调用 `enqueueDocumentCleanup(documentId, userId)` 创建独立清理任务

### Requirement: 文档入口只写通用任务
`enqueueDocumentProcess` MUST 在业务事务内解析文档、版本和源文件，更新预览状态并调用
任务句柄入队。任务 data MUST 只保存执行所需的文档、版本、文件、操作和审计用户，
MUST NOT 再写文档专用任务表。任务 MUST 使用 `document-process:<documentId>` 作为关联标识。

#### Scenario: 预览已就绪
- **WHEN** 请求只要求预览且目标版本已有同版本预览
- **THEN** `enqueueDocumentProcess` 返回 null，不创建重复任务

#### Scenario: 组合预览和 RAG
- **WHEN** 输入 operations 为 `['preview', 'rag']`
- **THEN** 同一任务按预览、RAG 的固定顺序执行

### Requirement: 文档脚本只消费持久化数据和通用上下文
默认导出执行函数 MUST 只使用任务 data、日志、进度、取消和 checkpoint 上下文。预览与
RAG 结果 MUST 作为脚本返回值写入通用 `tasks.result`。系统 MUST NOT 维护文档阶段 attempt
表或独立结果摘要字段。

#### Scenario: Worker 执行文档任务
- **WHEN** 子进程加载 `documents/tasks/process`
- **THEN** 直接执行预览和 RAG，不读取入队请求或文档专用任务扩展表

#### Scenario: 自动重试续跑 RAG
- **WHEN** 第一次 attempt 已保存 TextIn jobId
- **THEN** 下一次 attempt 从 `context.checkpoint` 读取并继续等待同一远程任务

### Requirement: 文档任务使用通用自动重试
两个文档任务 MUST 使用任务定义中的重试次数、固定间隔、超时和分组并发。单次执行失败
MUST 由通用运行时创建新 attempt；同一任务的自动重试 MUST NOT 创建新的业务任务。

#### Scenario: 自动重试后成功
- **WHEN** 文档任务首次执行失败并由框架自动重试成功
- **THEN** 同一任务保留失败和成功 attempt

#### Scenario: 重试耗尽
- **WHEN** 文档任务耗尽自动重试次数
- **THEN** 通用任务进入 failed 或 timed_out，并保留最后错误和领域失败状态

### Requirement: 文档取消由领域函数显式收敛
`cancelDocumentProcessingTask` MUST 在同一事务内取消通用任务并更新预览和 RAG 状态，
MUST NOT 依赖任务定义的取消回调。删除文档 MUST 先取消该文档全部活动处理任务，再创建
清理任务。

#### Scenario: 用户取消文档任务
- **WHEN** 取消 queued、retrying 或 running 的文档处理任务
- **THEN** 任务进入 canceled，预览和 RAG 的 pending/processing 状态收敛为失败

#### Scenario: 删除正在处理的文档
- **WHEN** 文档仍有活动的预览或 RAG 任务
- **THEN** 先取消这些任务，再创建物理清理任务

### Requirement: 任务状态与当前阶段分离
文档处理任务 MUST 使用通用任务状态表示生命周期，并使用 `current_stage` 表示预览、RAG
或完成阶段。通用 `task_attempts` 是唯一执行历史。

#### Scenario: 解析失败
- **WHEN** 文档在 RAG 阶段失败且自动重试耗尽
- **THEN** 任务显示失败、当前阶段和全部通用 attempt

### Requirement: 进程失效后重新调度
lease 过期的文档任务 MUST 由通用运行时终结旧 attempt 并重新调度。checkpoint 只用于恢复
可安全续接的远程解析任务，MUST NOT 跳过尚未完成的本地处理步骤。

#### Scenario: 服务恢复 stale 内容任务
- **WHEN** 恢复流程发现 lease 已过期且仍在执行的内容任务
- **THEN** 终结旧 attempt 并按策略重新执行

### Requirement: 任务运行时保持内部边界
领取、续租、重试、超时、日志和进程监督 MUST 位于通用任务运行时内部。documents 域只能
使用任务定义、通用 `task`、脚本上下文和显式领域入口，不得控制 claim、lease、attempt
或脚本加载器内部状态。

#### Scenario: route 调用任务能力
- **WHEN** route 创建、取消、人工重试或查询文档任务
- **THEN** 调用文档业务函数，不接触通用任务表和脚本路径拼接
