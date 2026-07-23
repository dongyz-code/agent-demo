## ADDED Requirements

### Requirement: worker 必须原子领取任务
文件处理 worker MUST 通过带预期状态条件的数据库更新原子领取 `to-be-started` 任务。多实例同时看到同一任务时，只有一个实例可以进入执行流程。

#### Scenario: 两个实例同时领取
- **WHEN** 两个 worker 实例同时尝试领取同一等待任务
- **THEN** 只有一个条件更新 MUST 返回成功
- **THEN** 另一个实例 MUST 放弃该任务且不得创建阶段记录

### Requirement: 执行期间必须续租
worker MUST 在任务执行期间按小于 `staleTaskSeconds` 的固定间隔更新 `tasks.last_update_timestamp`，续租更新 MUST 同时校验任务仍为当前实例可执行的 pending 状态。worker 无法续租或发现任务已取消、重置时 MUST 标记 lease 丢失，并在外部调用返回后阻止继续持久化阶段和文档结果。

#### Scenario: 长时间远程解析
- **WHEN** parsing 阶段执行时间超过一次 heartbeat 间隔但未超过外部调用超时
- **THEN** worker MUST 周期性刷新任务更新时间
- **THEN** 其他实例的 stale 恢复 MUST NOT重新领取该任务

#### Scenario: 续租条件不再满足
- **WHEN** heartbeat 更新发现任务不再是可执行 pending 状态
- **THEN** 当前 worker MUST 视为丢失 lease
- **THEN** 当前 worker MUST NOT 在动作完成后写入 Segment、知识库关联或 completed 状态

### Requirement: 进程失效后从头重试
文件处理任务 MUST 明确采用进程失效后从 reading 阶段重新执行的恢复策略。阶段记录中的 checkpoint MUST NOT 被描述或使用为解析块、Segment 或远程调用的断点恢复数据。

#### Scenario: 服务启动恢复 stale 任务
- **WHEN** 服务启动发现超过 stale 阈值且仍为 pending 的文件处理任务
- **THEN** 系统 MUST 把任务重置为 `to-be-started` 和 `queued`
- **THEN** 下一次领取 MUST 从 reading 阶段开始

#### Scenario: 完成阶段统计
- **WHEN** 阶段成功结束
- **THEN** 阶段记录 MAY 保存处理数量等审计摘要
- **THEN** 系统 MUST NOT 将该摘要用于跳过 reading、parsing、normalizing 或 segmenting

### Requirement: 遗留阶段记录必须终结
恢复 stale 任务时，系统 MUST 在同一恢复操作中把该任务仍为 pending 的 stage run 标记为 failed，写入稳定的 worker 失效错误码和结束时间。新执行 MUST 创建递增 attempt，不得复用旧 stage run。

#### Scenario: parsing 期间进程退出
- **WHEN** stale 恢复发现任务存在 pending parsing stage run
- **THEN** 旧 stage run MUST 标记为 failed 并记录 worker 失效原因
- **THEN** 新执行的 reading 和 parsing MUST 使用新的 stage run 与 attempt

#### Scenario: 任务没有 pending stage
- **WHEN** stale 任务只存在已经完成或失败的阶段记录
- **THEN** 恢复 MUST 保留这些历史记录
- **THEN** 恢复 MUST 仍从 reading 创建新的执行记录

### Requirement: 取消与 lease 必须一致
任务取消 MUST 通过任务状态使当前 worker 的后续续租或阶段边界校验失败。昂贵外部调用无法立即中止时，worker MUST 在调用返回后重新校验 lease 和取消状态，再决定是否写入结果。

#### Scenario: 阶段开始前取消
- **WHEN** 用户在新阶段开始前取消任务
- **THEN** worker MUST NOT 创建该阶段的 pending 记录
- **THEN** 任务 MUST 保持 killed 状态

#### Scenario: 远程解析期间取消
- **WHEN** 用户在远程解析请求执行期间取消任务
- **THEN** worker MUST 在请求返回后检测取消或 lease 丢失
- **THEN** worker MUST NOT 保存解析结果或启动后续阶段

### Requirement: worker 内部控制面不得公开
域外调用方 MUST 只能精确导入 worker 启动函数或通过业务任务创建通知调度，不得调用 stale 恢复、单任务执行、claim、runStage 或持久化函数。

#### Scenario: 检查根出口
- **WHEN** 开发者查看 server 与 routes 的 import
- **THEN** server MAY 从 worker 文件导入 `startFileProcessingWorker`
- **THEN** routes MUST NOT 导入 `recoverStaleFileProcessingTasks`、`runFileProcessingTask` 或其他内部控制函数

### Requirement: worker runtime 必须覆盖并发与恢复测试
服务端测试 MUST 覆盖原子领取、周期 heartbeat、lease 丢失、stale 恢复、pending stage 终结、取消和从头重试。测试 MUST 使用可控时钟或短 heartbeat 配置，不能依赖长时间真实等待。

#### Scenario: 执行 worker 聚焦测试
- **WHEN** 运行 documents worker 测试
- **THEN** 测试 MUST 验证多实例只有一个 claim 成功
- **THEN** 测试 MUST 验证 stale 与非 stale 任务得到不同处理
- **THEN** 测试 MUST 验证丢失 lease 的 worker 不提交最终结果
