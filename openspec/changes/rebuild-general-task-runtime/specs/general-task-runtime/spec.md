## ADDED Requirements

### Requirement: 业务代码通过统一 API 添加任务
系统 MUST 只提供 `task.add({ name, script, data, retry?, timeout?, concurrency? })` 单对象入队接口，原子持久化等待任务和初始日志并返回新任务 ID，不阻塞当前请求等待任务执行。框架 MUST 自动填写状态、策略默认值、attempt、lease 和时间字段，MUST NOT 要求调用方注册、定义任务、传入 transaction 或填写任务表字段。

#### Scenario: 添加 PDF 任务
- **WHEN** 业务代码传入名称、服务端脚本 URL 和 PDF 数据调用 task.add
- **THEN** task 包使用自己的事务创建任务和初始日志，并返回新任务 ID

#### Scenario: 使用默认策略
- **WHEN** 调用方只传入 name、script 和 data
- **THEN** 系统使用统一默认重试、超时和并发策略，不要求调用方补充其他参数

### Requirement: 任务脚本随任务持久化
系统 MUST 把规范化后的服务端脚本模块 URL 保存到任务记录，MUST NOT 使用内存注册表、统一注册清单或函数序列化解析执行函数。script MUST 是当前服务源码或构建目录内的 `file:` URL，HTTP 请求参数不得直接成为 script。

#### Scenario: 服务重启后执行等待任务
- **WHEN** 创建任务的服务进程已经重启且新 Worker 领取该任务
- **THEN** Worker 仍能从持久化 script 直接加载执行模块，不依赖创建进程的内存状态

### Requirement: 任务默认在独立子进程执行
系统 MUST 由父 Worker 原子领取任务并默认启动独立 Node.js 子进程执行 script 默认导出函数。父进程 MUST 监督进程、维护 lease、收集退出结果并限制进程资源，业务执行函数不得在 HTTP 主进程中执行。

#### Scenario: 执行 CPU 密集任务
- **WHEN** Worker 领取 CPU 密集型任务
- **THEN** 任务在独立 Node.js 子进程执行，HTTP 主进程继续处理请求

#### Scenario: 子进程异常退出
- **WHEN** 子进程没有返回执行结果便异常退出
- **THEN** 父 Worker 将本次 attempt 记录为失败并按任务重试策略收敛任务

### Requirement: 框架独占任务生命周期
任务状态 MUST 使用 `queued`、`running`、`retrying`、`succeeded`、`failed`、`canceled` 和 `timed_out`。脚本默认导出函数正常返回 MUST 自动成功，抛出异常 MUST 自动失败或等待重试；业务代码 MUST NOT 直接写任务状态。

#### Scenario: 执行函数正常返回
- **WHEN** 已领取任务的脚本默认导出函数正常返回
- **THEN** 当前 attempt 和任务自动标记为成功并记录完成时间

#### Scenario: 执行函数抛出异常
- **WHEN** 脚本默认导出函数抛出安全业务错误
- **THEN** 当前 attempt 保存错误码和摘要，任务按剩余重试次数进入 retrying 或 failed

### Requirement: 每次执行形成不可覆盖的 attempt
系统 MUST 为每次领取创建从 1 开始递增的 attempt 记录，保存任务 ID、attempt 序号、worker、PID、状态、开始时间、结束时间和错误；后续重试不得覆盖已有 attempt。

#### Scenario: 第二次执行成功
- **WHEN** 任务第一次失败并在重试后成功
- **THEN** 查询返回 attempt 1 的失败记录和 attempt 2 的成功记录

### Requirement: 任务支持自动重试
任务实例 MUST 可配置最大重试次数和固定重试间隔。失败或异常中断后，框架 MUST 根据已执行次数决定进入 `retrying` 并设置下次运行时间，或者进入最终 `failed`；最大重试次数表示首次执行之外允许的次数。

#### Scenario: 失败后等待重试
- **WHEN** 最大重试次数为 3、重试间隔为 5 秒的任务首次失败
- **THEN** 任务进入 retrying，至少等待 5 秒后创建第二个 attempt

#### Scenario: 重试次数耗尽
- **WHEN** 同一任务第四次执行仍失败
- **THEN** 任务进入 failed，不再被 Worker 自动领取

### Requirement: 任务支持主动取消
系统 MUST 提供 `task.cancel(taskId, options?)` 取消 queued、retrying 或 running 任务。取消 running 任务时 MUST 持久化 canceled，通知持有任务的父 Worker 发送 SIGTERM，并在宽限期后仍未退出时发送 SIGKILL；脚本提供取消生命周期导出时 MUST 由 task 包在状态事务内调用。

#### Scenario: 取消等待任务
- **WHEN** 调用方取消 queued 任务
- **THEN** 任务进入 canceled 且不会创建 attempt

#### Scenario: 取消运行中任务
- **WHEN** 调用方取消另一个服务实例正在执行的任务
- **THEN** 持有 lease 的实例在检测周期内终止子进程，attempt 记录为 canceled

### Requirement: 任务支持按实例超时
任务实例 MUST 可配置执行超时时间。父 Worker MUST 对每个 attempt 独立计时，超时后终止子进程、把 attempt 记录为 timed_out、记录超时日志，并按剩余重试次数进入 retrying 或最终 timed_out。

#### Scenario: 超时后重试
- **WHEN** 尚有重试次数的任务超过配置执行时间
- **THEN** 当前 attempt 记录超时，子进程被终止，任务进入 retrying

#### Scenario: 最终超时
- **WHEN** 已耗尽重试次数的任务再次超时
- **THEN** 任务进入 timed_out 并保存稳定超时错误码和摘要

### Requirement: 日志结构化并完整持久化
系统 MUST 以独立日志记录保存时间、级别、任务 ID、attempt 和消息，级别至少支持 debug、info 和 error。脚本运行参数、父 Worker、stdout 与 stderr MUST 写入同一日志模型；系统 MUST NOT 因固定行数上限静默截断任务历史。

#### Scenario: 查询失败任务日志
- **WHEN** 任务第二个 attempt 失败且写入普通、调试和错误日志
- **THEN** `task.logs(taskId)` 按时间返回包含 attempt 2 和对应级别的完整日志

#### Scenario: 查询运行中日志
- **WHEN** 任务脚本仍在子进程执行并持续输出日志
- **THEN** 已产生的日志可以从任意服务实例查询，不依赖父进程内存

### Requirement: 提供统一任务查询
系统 MUST 提供 `task.get(taskId)`、`task.list(options)` 和 `task.logs(taskId, options?)`，返回任务名称、状态、创建/开始/完成时间、当前及最大执行次数、重试时间、进度、错误和 attempt；list MUST 支持分页及状态、名称和时间过滤。

#### Scenario: 查询单个任务
- **WHEN** 调用方使用任务 ID 调用 task.get
- **THEN** 系统返回任务摘要及按序排列的全部 attempt，不要求调用方直接查询任务表

### Requirement: 全局和同名任务并发同时生效
父 Worker MUST 限制单实例总并发，并使用任务策略快照限制同名任务单实例并发。调度时只有总并发和同名任务并发均有空位的任务可以被领取，多个实例仍 MUST 通过数据库原子条件避免重复领取同一任务。

#### Scenario: PDF 与邮件并发
- **WHEN** PDF 并发为 1、邮件并发为 10、全局并发为 8
- **THEN** 单实例最多同时运行 1 个 PDF、最多 8 个总任务，并可用剩余容量执行邮件任务

### Requirement: 任务状态和运行历史持久化恢复
tasks、attempts 和 logs MUST 保存于 PostgreSQL。Worker MUST 在启动时及运行期间周期扫描 lease 过期的 running 任务，把旧 attempt 终结为 interrupted，并按重试策略重新调度或最终失败；queued 和 retrying 任务 MUST 在进程重启后继续执行。

#### Scenario: 服务执行中崩溃
- **WHEN** 服务在子进程执行期间退出且 lease 过期
- **THEN** 新 Worker 保留旧 attempt 的 interrupted 结果并重新调度尚有重试次数的任务

### Requirement: 执行租约只保护当前 attempt
系统 MUST 为每次领取生成新的 `lease_id`，所有进度、日志与结果更新 MUST 同时校验任务 ID、running 状态和当前 lease。首期 MUST NOT 在 task.add 暴露通用去重参数。

#### Scenario: 领取等待任务
- **WHEN** Worker 成功领取 queued 或到期 retrying 任务
- **THEN** 系统生成新的 leaseId，只有该 lease 可以更新本次运行结果
