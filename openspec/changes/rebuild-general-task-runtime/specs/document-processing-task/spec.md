## ADDED Requirements

### Requirement: 文档任务使用通用自动重试
documents 域 MUST 只创建一个名为 `document.process` 的整体任务，并通过 data 的有序 `parts` 选择内容、预览和清理部分。统一脚本 MUST 在同一任务实例内顺序执行选中的 part 并跳过未选择 part；内容和预览可以组合，清理只能单独执行。该任务 MUST 使用统一的最大重试次数、固定间隔、超时与同名并发。单次执行失败由通用任务运行时自动创建新 attempt，重试期间领域状态 MUST 保持 processing 或 pending，只有最终失败、最终超时或取消才收敛为失败。

#### Scenario: 解析调用暂时失败
- **WHEN** 内容任务第一次解析失败且仍有自动重试次数
- **THEN** 同一任务保留失败 attempt 并等待重试，RAG 关系不得提前进入最终 failed

#### Scenario: 创建文档整体任务
- **WHEN** documents 域调用 task.add 创建后台处理
- **THEN** 只创建一个 name 为 `document.process` 且 script 指向统一 runtime 的任务，内容、预览和清理不得分别创建通用任务

#### Scenario: 组合执行文档处理
- **WHEN** 创建 `parts: ['content', 'preview']` 的文档任务
- **THEN** 同一任务 ID 和 attempt 内依次执行内容与预览部分，并在全部完成后进入 succeeded

#### Scenario: 指定单个处理部分
- **WHEN** 创建 `parts: ['preview']` 的文档任务
- **THEN** 统一脚本只执行预览部分并跳过内容处理，不创建第二个任务

## MODIFIED Requirements

### Requirement: 任务状态与当前阶段分离
文档处理任务 MUST 独立记录通用任务状态和当前业务阶段。任务状态 MUST 至少支持等待执行、执行中、等待重试、执行成功、执行失败、已取消和执行超时，当前阶段 MUST 表示正在执行的具体步骤。

#### Scenario: 解析失败
- **WHEN** 文档在解析阶段发生错误且自动重试次数已经耗尽
- **THEN** 任务标记为执行失败，并保留解析阶段、全部 attempt、稳定错误码和可理解的错误摘要

### Requirement: 执行历史不可覆盖
同一 DocumentVersion 的每次人工预览或内容处理 MUST 使用递增业务执行序号。单次任务内的自动重试 MUST 追加通用 attempt 和阶段 attempt，不得覆盖已有记录；终态后的人工重试和成功后再次执行 MUST 创建业务执行序号递增的新任务。

#### Scenario: 自动重试后成功
- **WHEN** 内容任务首次执行失败并由框架自动重试成功
- **THEN** 系统在同一任务下保留失败和成功 attempt，业务执行序号不变

#### Scenario: 终态后人工重试
- **WHEN** 用户人工重试一个已经最终失败的内容任务
- **THEN** 系统保留原任务并创建业务执行序号递增的新任务

### Requirement: 进程失效后必须从 reading 阶段重试
lease 过期的文档内容任务 MUST 由通用运行时终结旧 attempt 并重新调度，新 attempt MUST 从 reading 阶段重新执行。阶段记录中的审计摘要 MUST NOT 作为跳过 reading、parsing、normalizing 或 segmenting 的 checkpoint。

#### Scenario: 服务恢复 stale 内容任务
- **WHEN** 周期恢复发现 lease 已过期且仍在执行的内容任务
- **THEN** 系统终结遗留活动阶段和旧 attempt，并让下一次执行从 reading 开始

### Requirement: 任务运行时保持内部边界
领取、续租、重试、超时、日志和进程监督 MUST 位于通用任务运行时内部。documents 域只能使用公共 `task` API 和脚本运行参数；route 只能调用稳定文档业务操作，不得控制单任务 claim、lease、attempt 或阶段底层状态迁移。

#### Scenario: route 调用任务能力
- **WHEN** route 创建、取消、人工重试或查询文档任务
- **THEN** route 调用对应稳定业务函数，documents 业务函数只通过公共 task API 操作通用任务
