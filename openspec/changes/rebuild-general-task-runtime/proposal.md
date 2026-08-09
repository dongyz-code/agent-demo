## Why

现有 `hooks/tasks` 只完成了从文档处理代码抽离的 PostgreSQL Worker 内核，业务接入仍需理解数据库字段、lease、生命周期函数、日志存储、子进程模块定位和 worker 通知，无法满足统一后台任务模块的低接入成本、自动重试、按类型并发、完整执行历史与结构化日志要求。继续在现有接口上叠加兼容层会固化错误边界，因此本次直接进行不兼容重建。

## What Changes

- **BREAKING**：删除注册表、`task.register()`、`task.define()`、业务事务参数和拆分式 add 参数，改为统一 `task.add({ name, script, data, retry?, timeout?, concurrency? })`、`task.get()`、`task.list()`、`task.logs()`、`task.cancel()` 契约。
- **BREAKING**：重建任务状态为等待、执行、等待重试、成功、失败、取消、超时，并将每次执行保存为不可覆盖的 attempt 记录。
- **BREAKING**：删除业务幂等键，执行 lease 只承担 Worker 执行权校验，不再与业务去重概念混用。
- 任务框架统一包装脚本默认导出函数，自动负责成功、异常失败、重试调度、超时终止、取消检测、进度更新和日志上下文；业务脚本不再写任务状态表。
- 默认使用独立 Node.js 子进程执行任务，`script` 模块 URL 随任务持久化，子进程直接动态导入，不再维护父子进程注册清单。
- 为任务实例保存重试次数、重试间隔、执行超时和同名任务并发上限快照；全局并发与同名任务并发同时生效。
- 新增结构化持久化日志，记录时间、级别、任务 ID、attempt 和消息，不再把全部日志压缩写入任务主表，也不截断历史日志。
- 周期恢复异常中断的执行任务，并保留旧 attempt 的失败原因后重新调度。
- 将文档内容、预览和清理能力汇总为一个 `document.process` 任务，通过 `data.parts` 选择整体流程中的部分，并删除文档域对任务内部生命周期原语的依赖。
- 收敛 documents 任务接入为单一领域入口，删除只承载单个函数的 create、detail、control、definition 和 register 文件，业务调用方不得拼装任务内部步骤。
- 任务中心查询返回任务摘要、执行次数、重试配置、超时信息、进度、错误和 attempt 历史；HTTP 控制继续执行权限和业务数据范围校验。

## Capabilities

### New Capabilities

- `general-task-runtime`: 定义通用任务注册、入队、子进程执行、状态机、执行尝试、自动重试、取消、超时、日志、并发和异常恢复契约。

### Modified Capabilities

- `business-task-center`: 查询与日志切换到新任务及 attempt 模型，补充统一详情、重试信息和严格的数据范围控制。
- `document-processing-task`: 文档任务改用通用任务运行时，自动重试保留在同一任务的 attempt 历史，终态后的人工重试仍创建新任务。
- `documents-domain-boundary`: documents 域只能调用公共 task API，不得依赖任务框架数据库结构、lease、日志和状态迁移内部实现。

## Impact

- 重写 `apps/server/src/hooks/tasks`、任务相关数据库表、共享任务类型、任务中心路由和服务启动流程。
- 迁移 `apps/server/src/hooks/documents` 的任务创建、运行、取消、阶段和失败处理代码。
- 任务相关表需要 reset；旧任务状态、压缩日志和调用接口不保证兼容。
- 不新增 Redis 等外部基础设施，继续使用现有 PostgreSQL、Drizzle 与 Node.js 子进程。
