## ADDED Requirements

### Requirement: 定义任务脚本和类型化入队
系统 MUST 提供 `defineTask`，声明 `script`、并发分组、重试和超时，并返回只包含
`enqueue` 的类型化句柄。任务脚本 MUST 默认导出 `(data, context) => Promise<Result>`。
`defineTask` MUST NOT 接收执行函数、prepare、onCancel 或 onFailure。

#### Scenario: 创建任务
- **WHEN** 调用方调用 `documentProcessTask.enqueue(data, { actorUserId })`
- **THEN** 框架保存脚本路径、data 和策略快照并返回任务 ID

#### Scenario: 类型不匹配
- **WHEN** 调用方给入队句柄传入错误 data 类型
- **THEN** TypeScript 在编译期拒绝该调用

### Requirement: 脚本路径是稳定任务标识
系统 MUST 将 `script: import.meta.url` 归一化为相对于 `hooks` 目录的无扩展名入口，
MUST 持久化到 `tasks.script_path`，MUST NOT 再单独保存任务类型或模块路径。入口 MUST
限制在 `hooks` 内，拒绝目录逃逸。

#### Scenario: 构建环境加载脚本
- **WHEN** 构建产物中的 Worker 领取任务
- **THEN** 加载器按持久化入口解析对应 `.js` 文件

#### Scenario: 脚本入口逃逸
- **WHEN** 记录中的脚本路径超出 `hooks` 根目录
- **THEN** 加载失败并记录稳定脚本错误

### Requirement: 业务准备由调用方显式完成
通用 `enqueue` MUST 只序列化并保存最终 data，MUST NOT 调用业务 prepare。需要和领域表
共享事务时，调用方 MUST 使用 `task.createId()` 预分配任务标识，并把领域写入和入队放入
同一事务。

#### Scenario: 原子创建文档任务
- **WHEN** documents 域需要同时更新预览状态和创建通用任务
- **THEN** 它在同一事务中更新领域状态并调用任务句柄入队

#### Scenario: 无需创建任务
- **WHEN** 目标文档版本已有可用预览
- **THEN** 领域入队函数直接返回 null，不调用通用 enqueue

### Requirement: 子进程执行默认导出函数
系统 MUST 由父 Worker 原子领取任务并启动独立 Node.js 子进程。子进程 MUST 按
`script_path` 动态加载模块并调用默认导出函数，MUST NOT 从数据库或 IPC 接收函数。

#### Scenario: 执行 CPU 密集任务
- **WHEN** Worker 领取任务
- **THEN** 脚本在独立子进程运行，HTTP 主进程继续处理请求

#### Scenario: 默认导出无效
- **WHEN** 脚本默认导出不是函数
- **THEN** 当前 attempt 失败并记录稳定脚本错误

### Requirement: 框架独占任务生命周期
任务状态 MUST 使用 `queued`、`running`、`retrying`、`succeeded`、`failed`、
`canceled` 和 `timed_out`。脚本正常返回 MUST 自动成功，抛出异常 MUST 自动失败或重试；
业务 MUST NOT 直接写通用任务状态。

#### Scenario: 脚本正常返回
- **WHEN** 默认导出函数正常返回
- **THEN** 当前 attempt 和任务标记为成功

#### Scenario: 脚本抛出异常
- **WHEN** 默认导出函数抛出异常
- **THEN** 当前 attempt 保存错误码和摘要，并按策略重试或失败

### Requirement: 每次执行形成不可覆盖的 attempt
系统 MUST 为每次领取创建从 1 开始递增的 attempt，保存 worker、PID、状态、开始时间、
结束时间、结果和错误。重试 MUST NOT 覆盖已有 attempt。

#### Scenario: 重试后成功
- **WHEN** 首次执行失败、第二次执行成功
- **THEN** 查询同时返回失败和成功两条 attempt

### Requirement: 任务支持自动重试和超时
任务策略 MUST 支持最大重试次数、固定重试间隔和单次执行超时。失败或超时后，系统 MUST
根据剩余重试次数进入 `retrying` 或最终失败态。

#### Scenario: 失败后重试
- **WHEN** 任务失败且仍有重试次数
- **THEN** 任务进入 retrying，间隔到期后创建新 attempt

#### Scenario: 执行超时
- **WHEN** 子进程超过配置的 timeoutMs
- **THEN** 父进程终止子进程并收敛 attempt 为 timed_out

### Requirement: 任务支持主动取消
系统 MUST 提供通用 `task.cancel(taskId, options?)` 取消 queued、retrying 或 running
任务。取消 running 任务 MUST 终止持有实例的子进程。通用取消 MUST NOT 加载业务回调；
领域取消由业务入口在共享事务中显式收敛。

#### Scenario: 取消运行中任务
- **WHEN** 调用方取消运行中任务
- **THEN** 任务和活动 attempt 进入 canceled，子进程被终止

#### Scenario: 文档取消
- **WHEN** documents 域取消处理任务
- **THEN** 领域函数在同一事务中取消通用任务并更新预览和 RAG 状态

### Requirement: 任务支持领域关联和自动重试恢复信息
任务 MUST 支持可选 `correlation_id` 供业务按领域对象查询。任务 MUST 支持可 JSON 序列化
的 checkpoint，并在同一任务的自动重试 attempts 之间保留。

#### Scenario: 按领域对象查询任务
- **WHEN** 业务需要查找某文档的活动任务
- **THEN** 使用 correlation_id 过滤通用任务，不读取文档专用任务表

#### Scenario: 自动重试读取 checkpoint
- **WHEN** 新 attempt 领取同一任务
- **THEN** Worker 上下文提供上次保存的 checkpoint

#### Scenario: checkpoint 序列化失败
- **WHEN** 脚本保存无法 JSON 序列化的 checkpoint
- **THEN** 当前执行失败并记录稳定错误

### Requirement: 日志结构化并持久化
系统 MUST 将时间、级别、任务 ID、attempt 和消息写入 `task_logs`。运行上下文、父 Worker、
stdout 和 stderr MUST 使用同一日志模型。

#### Scenario: 查询运行日志
- **WHEN** 任务仍在子进程执行
- **THEN** 已产生的日志可以从 PostgreSQL 查询

### Requirement: 提供统一任务查询
系统 MUST 提供通用 `task.get`、列表、计数和日志查询，返回脚本路径、并发分组、策略快照、
状态、时间、进度、错误和 attempt。

#### Scenario: 查看失败任务
- **WHEN** 授权用户查看失败任务
- **THEN** 返回脚本路径、关联标识、失败状态、错误摘要和全部 attempt

### Requirement: 全局和分组并发同时生效
父 Worker MUST 限制单实例总并发，并使用任务策略快照限制所有服务实例合计的同分组并发。
多实例 MUST 通过数据库原子领取和分组事务锁避免重复领取或突破上限。

#### Scenario: 文档任务共享并发
- **WHEN** documents 处理和清理脚本使用 document 分组且上限为 2
- **THEN** 所有实例合计最多同时执行两个文档脚本

### Requirement: PostgreSQL 保存状态和执行历史
`tasks`、`task_attempts` 和 `task_logs` MUST 保存于 PostgreSQL。Worker MUST 恢复 lease
过期的 running 任务，终结旧 attempt，并按策略重新调度或最终失败。

#### Scenario: 服务执行中崩溃
- **WHEN** 服务退出且 running 任务 lease 过期
- **THEN** 新 Worker 保留 interrupted attempt 并重新调度任务

### Requirement: 执行租约只保护当前 attempt
系统 MUST 为每次领取生成新的 lease。进度、日志和结果更新 MUST 校验任务 ID、running
状态和当前 lease。

#### Scenario: 丢失 lease
- **WHEN** 旧 Worker 使用已失效 lease 更新任务
- **THEN** 更新被拒绝且旧子进程被终止
