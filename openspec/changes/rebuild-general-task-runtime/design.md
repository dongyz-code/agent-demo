## Context

当前任务实现把 PostgreSQL 轮询、lease、子进程监督和文档业务状态拆进多个公共文件，但没有形成真正的公共产品接口。业务方需要直接调用 `createTask`、`notifyTaskWorker`、`updateTaskProgress`、`completeTask`、`failTask` 和日志函数，并声明子进程模块 URL；任务主表又把幂等键和 lease 共用为 `pending_uuid`。通用层缺少自动重试、attempt 历史、分类型并发、按任务超时和结构化日志。

本仓库是单体 Node.js 应用，使用 PostgreSQL、Drizzle、TypeScript ESM 和启动期表结构检查。任务必须支持多服务实例安全领取，但每次任务的业务代码默认运行在独立 Node.js 子进程。任务相关表允许 reset，因此本次不承担旧任务数据迁移。

## Goals / Non-Goals

**Goals:**

- 业务接入只使用一个稳定 `task` 对象，通过单对象 `add` 入队，并在脚本默认导出函数中使用运行参数记录日志、进度和取消检查。
- 框架独占任务状态迁移、attempt、lease、重试、超时、进程终止、日志和异常恢复。
- 全局并发、任务类型并发和多实例原子领取同时成立。
- 每次执行结果与完整结构化日志不可覆盖，可以按任务和 attempt 查询。
- documents 域完整迁移，删除所有对旧任务内部原语的依赖。

**Non-Goals:**

- 不实现跨任务 DAG、工作流编排、定时表达式、任务依赖或分布式事件总线。
- 不承诺 exactly-once；任务脚本按 at-least-once 语义设计，业务副作用必须幂等。
- 不引入 Redis、Temporal、Graphile Worker 或其他外部运行服务。
- 不迁移旧 `tasks.logs`、旧状态和旧 lease 数据；相关表由现有 reset 流程重建。

## Decisions

### 1. 公共 API 与内部实现物理分离

`hooks/tasks/task.ts` 是业务唯一允许导入的运行时入口，导出 `task.add/get/list/logs/cancel/start`。`task.add` 只接收一个完整对象，必填字段为稳定任务名称、服务端脚本模块 URL 和可序列化数据，可选字段只有重试、超时和并发。

脚本模块默认导出函数正常返回即成功，抛出异常即由框架决定重试或失败。业务方不再显式 complete/fail，也不能接触 leaseId。执行函数只接收一个对象，其中包含 `taskId`、`attempt`、`data`、`progress()`、分级 `log` 和 `throwIfCanceled()`。

`task.add` 内部独立开启事务并原子写入任务与初始日志，不接收调用方 transaction。脚本模块可以按约定提供内部生命周期导出，任务包在自己的状态事务中调用，用于文档扩展记录等领域收敛；调用方仍不写通用任务记录。

选择该方案而不是给现有 `createTask/lifecycle` 增加 facade，是因为旧接口把状态所有权暴露给业务，保留它们会继续产生双写和不完整收敛。

### 2. 任务直接持久化脚本模块 URL

Node.js 新子进程不继承父进程内存中的函数，因此 `task.add` 将规范化后的服务端 `file:` 模块 URL 保存到任务记录。Worker 领取任务后把 `script` 和 `data` 传给统一子进程入口，子进程动态导入模块并调用默认导出函数。服务启动不加载业务注册清单，新增任务也不修改中央文件。

不使用函数序列化、堆栈推断或内存注册表。`script` 只能由服务端内部代码构造且必须位于当前服务源码或构建目录下，HTTP 输入不得直接控制脚本地址。

### 3. 三张通用表保存任务、attempt 和日志

- `tasks`：稳定任务身份、名称、脚本 URL、data、当前状态、策略快照、进度、当前 lease 和最终结果摘要。
- `task_attempts`：每次领取的序号、worker、PID、开始/结束时间、结果和错误；历史只追加不覆盖。
- `task_logs`：任务、attempt、级别、消息和时间；按 `(task_id, timestamp, log_id)` 查询。

首期不提供通用任务去重参数。每次 `task.add` 都创建新任务；业务若需要判断是否跳过，先在自己的领域入口完成判断。`lease_id` 只用于限制当前 Worker 对运行任务的修改权。

日志使用行式结构化存储而不是主表压缩 blob。该方案增加行数，但满足完整历史、级别、attempt 过滤和运行中实时查询；后续保留策略应通过独立归档任务完成，而不是静默截断。

### 4. 状态机和重试策略由存储层原子执行

任务状态使用 `queued`、`running`、`retrying`、`succeeded`、`failed`、`canceled`、`timed_out`。attempt 状态使用 `running`、`succeeded`、`failed`、`canceled`、`timed_out`、`interrupted`。

领取通过带预期状态与到期时间条件的原子 UPDATE 完成，并在同一事务创建 attempt。失败时，若当前执行次数不超过 `maxRetries`，任务进入 `retrying` 并写 `next_run_at`；否则进入 `failed`。`maxRetries` 表示首次执行之外允许的重试次数。

固定重试间隔直接满足当前需求。暂不增加指数退避、抖动和错误分类，避免引入未要求的策略矩阵。

### 5. 父 Worker 监督进程，子进程执行脚本

父 Worker 负责领取、全局/同名任务并发、heartbeat、超时计时、取消检测、stdout/stderr 持久化和 SIGTERM→SIGKILL。子进程直接动态导入持久化的 `script`，以单对象参数运行默认导出函数，并通过 IPC 返回结构化成功或错误结果。

父进程是 attempt 最终状态的唯一写入者，因此正常异常、进程崩溃、取消和超时使用同一收敛路径。子进程上下文只允许带当前 lease 条件更新进度和日志，失去 lease 后抛出统一取消异常。

### 6. 并发限制按实例执行，领取保证多实例不重复

每个实例先计算全局空位，再按候选任务保存的 `concurrency` 计算同名任务空位。数据库原子领取保证不同实例不会执行同一任务。同名并发首期定义为单实例上限；多实例总上限等于各实例上限之和，并在配置和类型注释中明确。

不使用数据库全局 semaphore，是因为当前需求面向单体部署，跨实例严格配额会引入额外锁表、异常释放和公平性复杂度。任务不重复执行仍由 lease 保证。

### 7. 周期 stale sweep 与启动恢复共用同一流程

任务领取后写 `lease_expires_at`，heartbeat 周期延长。Worker 启动时立即执行恢复，运行期间也周期扫描过期 running 任务：旧 attempt 标记 `interrupted`，随后按同一重试次数规则进入 `retrying` 或 `failed`。数据库错误时当前实例主动终止受监督子进程，避免失去 lease 后继续提交。

### 8. 文档领域保留阶段表，只移除通用生命周期代码

`file_processing_tasks` 和阶段记录仍保存文档专属执行序号、阶段、checkpoint 和结果摘要。阶段运行时改用公共 `TaskRunInput` 更新进度、记录日志和检查取消，不再写通用任务状态。自动重试在同一通用任务中新增 attempt；终态后的人工重试创建新的通用任务与新的文档执行序号。

documents 域只创建一个名为 `document.process` 的任务。`data.parts` 使用有序数组选择内容、预览和清理部分，统一脚本在同一个任务实例内按顺序执行选中的部分并跳过其余部分；内容与预览允许组合执行，清理由物理删除语义决定只能单独执行。所有部分共享该任务的一次生命周期、attempt、取消、重试和超时策略，不得把 part 再创建为独立任务。

### 9. documents 任务只保留一个领域入口

`documents/tasks/task.ts` 承担领域任务入队、详情查询和取消，是 routes、内容、预览及删除流程唯一允许导入的任务入口。`runtime.ts` 是 `script` 指向的模块，只承载默认执行函数与必要生命周期导出；`stage.ts` 只承载内容和预览 runner 共用的阶段执行。删除仅包装一个函数或一组常量的 `create.ts`、`detail.ts`、`control.ts`、`definition.ts` 和 `register.ts`，不为单用途代码建立抽象层。

## Risks / Trade-offs

- [任务表 reset 会丢失旧历史] → 本次已明确不兼容，部署前导出需要保留的任务审计数据，并通过现有表 reset 操作重建三张表。
- [at-least-once 可能重复业务副作用] → 文档发布继续使用条件更新、业务锁和任务独占对象路径；新脚本契约明确要求幂等。
- [逐行日志增加数据库写入] → 上下文允许批量日志，stdout/stderr 按数据块写入；建立任务时间索引，暂不做无依据的静默截断。
- [父进程在业务成功后、状态收敛前崩溃] → stale 恢复会重试该 attempt，脚本必须幂等；attempt 保存 interrupted 原因便于审计。
- [类型并发不是集群严格上限] → 在配置与 API 中标明为每实例策略；若未来需要集群配额，另行设计 PostgreSQL semaphore。
- [业务生命周期导出失败导致状态无法收敛] → 生命周期导出由 task 包在自己的状态事务内调用，异常将使状态事务回滚并由现有恢复流程重试。

## Migration Plan

1. 重建共享任务类型与三张通用表，删除旧字段和压缩日志。
2. 实现单对象 task API、脚本校验、存储状态机、运行参数和查询。
3. 实现父 Worker、脚本子进程入口、heartbeat、超时、取消与周期恢复。
4. 迁移文档整体任务创建、脚本运行时和取消/失败生命周期。
5. 更新任务中心路由和共享 API 类型，移除通用 kill 路由对文档任务的越权入口。
6. 删除旧任务文件和所有内部原语引用，执行任务相关表 reset 后部署。

本次不存在代码级回滚兼容层。回滚只能恢复变更前代码并再次 reset 任务相关表。

## Open Questions

无。当前需求中的重试间隔按固定间隔实现，类型并发按单实例计算，旧任务数据不迁移。
