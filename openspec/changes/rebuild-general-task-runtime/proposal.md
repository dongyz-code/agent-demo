## Why

现有任务运行时把任务句柄、执行函数、prepare、取消和失败生命周期都塞进
`defineTask`，使用方需要理解任务框架内部概念。实际需求是一个统一任务中心：
通过脚本路径执行代码，把任务、执行尝试和日志持久化到 PostgreSQL。

## What Changes

- **BREAKING**：`defineTask` 只声明脚本入口、并发分组、重试和超时，并返回只含
  `enqueue` 的类型化句柄，不再接收执行函数或业务生命周期回调。
- **BREAKING**：任务脚本默认导出 `(data, context) => Promise<Result>`；子进程按持久化
  `script_path` 动态导入并调用默认导出函数。
- **BREAKING**：删除 `prepare`、`onCancel`、`onFailure`、`TaskHandle.get/cancel`、
  `definition-store` 和默认句柄反向查找。
- **BREAKING**：任务类型不再单独存储；脚本路径就是稳定任务标识和并发策略来源。
- 业务需要领域事务时显式生成任务 ID，并把领域写入和 `enqueue` 放入同一事务。
- 任务通过可选 `correlation_id` 关联领域对象，通过通用 checkpoint 在自动重试间恢复。
- 任务详细查询、取消、列表、统计和日志统一通过 `task` 对象使用。
- 保留 PostgreSQL 任务状态机、自动重试、超时、分组并发、lease、attempt 和日志。
- **BREAKING**：删除 `file_processing_tasks` 和 `file_processing_task_stage_runs`，文档
  任务状态、结果、attempt、日志和 checkpoint 统一使用通用任务表。
- documents 域把输入解析、取消收敛和查询保留为显式领域入口，任务脚本只执行。

## Capabilities

### New Capabilities

- `general-task-runtime`: 定义脚本路径执行、类型化入队、子进程加载、状态机、attempt、
  自动重试、取消、超时、日志、分组并发和异常恢复契约。

### Modified Capabilities

- `business-task-center`: 任务中心查询改用 `script_path`，继续提供状态、策略、attempt 和日志。
- `document-processing-task`: 文档处理和清理使用显式领域入队函数与默认导出脚本。
- `documents-domain-boundary`: documents 只依赖 `defineTask`、`task`、脚本上下文和公开类型。

## Impact

- 重写 `apps/server/src/hooks/tasks` 的公共 API、脚本加载、数据库字段和调度收敛逻辑。
- 调整 `apps/server/src/hooks/documents` 的任务准备、取消和调用方式。
- `tasks` 表以 `script_path` 替代 `task_type` 和 `module_path`，部署前需要 reset 任务表。
- 删除文档专用任务表与阶段包装层，部署前需要 reset 相关文档任务数据。
- 不新增 Redis、测试文件或独立检验脚本。
