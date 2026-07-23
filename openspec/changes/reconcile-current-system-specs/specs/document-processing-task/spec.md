## ADDED Requirements

### Requirement: 文档版本处理使用一级任务
系统 MUST 将一个 DocumentVersion 与处理配置的一次预览或内容处理记录为一个一级任务。读取、解析、标准化、切分和发布等步骤 MUST 作为该任务的阶段记录，不得平铺成多个一级任务。

#### Scenario: 查看内容任务详情
- **WHEN** 用户查看文档版本内容处理任务
- **THEN** 系统返回一条任务及其阶段时间线、状态、进度、结果摘要和错误

### Requirement: 任务状态与当前阶段分离
文档处理任务 MUST 独立记录任务状态和当前阶段。任务状态 MUST 至少支持等待执行、执行中、执行成功、执行失败和已取消，当前阶段 MUST 表示正在执行的具体步骤。

#### Scenario: 解析失败
- **WHEN** 文档在解析阶段发生不可恢复错误
- **THEN** 任务标记为执行失败，并保留解析阶段、稳定错误码和可理解的错误摘要

### Requirement: 执行历史不可覆盖
同一 DocumentVersion 的预览和内容任务 MUST 使用递增执行序号。失败重试和成功后再次执行 MUST 创建新任务，不得覆盖已有任务、阶段、结果或错误历史。

#### Scenario: 失败后重试
- **WHEN** 用户重试一个失败的内容任务
- **THEN** 系统保留失败记录并创建执行序号递增的新任务

### Requirement: 等价活动任务必须幂等
同一 DocumentVersion、任务类型和处理配置 MUST 最多存在一个等待执行或执行中的活动任务。重复触发 MUST 返回或复用已有活动任务。

#### Scenario: 多知识库同时触发内容处理
- **WHEN** 多个知识库同时需要同一版本和配置的内容结果
- **THEN** 系统只创建或复用一个内容任务，不重复解析和切分

### Requirement: 文档任务支持取消
等待执行或执行中的文档任务 MUST 支持取消。取消 MUST 收敛任务、活动阶段以及尚未发布的预览或 RAG 状态，不得删除历史成功结果。

#### Scenario: 取消等待任务
- **WHEN** 授权用户取消尚未领取的任务
- **THEN** 系统将任务标记为已取消且不执行处理阶段

#### Scenario: 外部调用期间取消
- **WHEN** 用户在远程解析或转换调用期间取消任务
- **THEN** worker 在调用返回后检测取消状态，并且不得提交该调用的派生结果或启动后续阶段

### Requirement: worker 必须原子领取并持续续租
worker MUST 通过带预期状态条件的数据库更新原子领取任务，并在执行期间以小于 stale 阈值的间隔续租。无法续租或任务状态不再允许执行时，worker MUST 视为失去 lease 并停止提交后续结果。

#### Scenario: 多实例同时领取
- **WHEN** 两个 worker 同时尝试领取同一等待任务
- **THEN** 只有一个实例领取成功，另一个实例不得创建阶段记录

#### Scenario: 长时间外部调用
- **WHEN** 单次解析或转换超过一个续租间隔
- **THEN** 当前 worker 持续刷新租约，使其他实例不得把任务判定为 stale

### Requirement: 进程失效后必须从 reading 阶段重试
stale 文档内容任务 MUST 重置为可重新领取状态，并从 reading 阶段重新执行。阶段记录中的审计摘要 MUST NOT 作为跳过 reading、parsing、normalizing 或 segmenting 的 checkpoint。

#### Scenario: 服务恢复 stale 内容任务
- **WHEN** 服务发现超过 stale 阈值且仍在执行的内容任务
- **THEN** 系统终结遗留活动阶段、递增 attempt，并让下一次执行从 reading 开始

### Requirement: 遗留活动阶段必须终结
恢复 stale 任务时，系统 MUST 将该任务仍为 pending 的阶段记录标记为 failed，写入稳定的 worker 失效错误码与结束时间；新执行 MUST 创建新的阶段记录。

#### Scenario: parsing 阶段进程退出
- **WHEN** stale 恢复发现 pending 的 parsing 阶段
- **THEN** 旧阶段标记为失败，新的 reading 和 parsing 使用新的 attempt

### Requirement: 内容处理结果不得夸大
在尚未实现 Embedding 与检索索引时，内容任务 MUST 将最终动作描述为 Segment 和内容结果发布，不得宣称已经完成向量索引。后续新增索引 MUST 通过明确的配置版本和阶段表达。

#### Scenario: 当前内容任务成功
- **WHEN** 文档版本完成解析、标准化、切分和关系发布
- **THEN** 任务记录 Segment 数量与实际发布关系数量，并标记为内容处理成功

### Requirement: 任务运行时保持内部边界
领取、续租、阶段持久化和单任务执行函数 MUST 保持在 documents 域内部。域外调用方只能精确导入 worker 启动能力或稳定业务操作，不得控制单任务 claim、stale 恢复或阶段写入。

#### Scenario: route 调用任务能力
- **WHEN** route 创建、取消、重试或查询文档任务
- **THEN** route 调用对应稳定业务函数，且不得导入 worker 内部控制函数
