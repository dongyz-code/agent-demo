## ADDED Requirements

### Requirement: 数据表准入必须有运行时证据
所有加入 `bootstrappedTableRegistry` 的产品表 MUST 有明确业务所有者、读写路径或产品批准的预留理由、数据生命周期和清理策略。系统 MUST NOT 在没有当前用例且没有明确产品决策时提前注册空表。

#### Scenario: 新增只有 schema 定义的表
- **WHEN** 开发者新增一张只有 Drizzle 定义、没有当前业务读写路径的表
- **THEN** 该表 MUST NOT 加入启动注册表
- **THEN** 评审 MUST 要求先明确实际用例、数据生命周期和查询方式

#### Scenario: 产品明确保留预留表
- **WHEN** 产品范围明确要求在业务入口落地前保留某张预留表
- **THEN** 表清单 MUST 记录保留决策、预期所有者和后续激活条件
- **THEN** 自动清理 MUST NOT 仅因当前缺少读写路径而退役该表

#### Scenario: 中间结果只在单次流水线使用
- **WHEN** 某个中间结果只在一次进程内流水线的后续步骤消费
- **THEN** 系统 MUST 默认以内存对象传递
- **THEN** 只有恢复、审计或独立查询需求有可验证消费者时才能新增持久化表

### Requirement: 明确退役无业务入口和旧流水线表
系统 MUST 从 Drizzle 导出、表管理白名单和启动注册表中移除 `document_processing_jobs`、`document_processing_stage_runs`。新任务 MUST 继续只写入统一任务模型。`agent_conversations` 与 `agent_messages` MUST 保留在 Drizzle 导出和启动注册表中。

#### Scenario: 服务启动自检
- **WHEN** 服务执行启动期表结构自检
- **THEN** 系统 MUST NOT 创建或同步上述两张退役任务表
- **THEN** 系统 MUST 继续创建或同步 `agent_conversations` 与 `agent_messages`

#### Scenario: 创建文件处理任务
- **WHEN** 用户创建、重试或重新执行文件处理任务
- **THEN** 系统 MUST 只写入 `tasks`、`file_processing_tasks` 和 `file_processing_task_stage_runs`
- **THEN** 系统 MUST NOT 读取或写入 `document_processing_jobs` 与 `document_processing_stage_runs`

### Requirement: Multipart 分片以对象存储为事实来源
系统 MUST 使用 S3/MinIO `ListParts` 结果恢复 Multipart 上传状态，MUST NOT 把同一分片列表重复持久化到 `file_upload_parts`。

#### Scenario: 恢复 Multipart 会话
- **WHEN** 客户端请求恢复有效的 Multipart 上传会话
- **THEN** 服务端 MUST 从对象存储读取已上传分片并计算上传字节数和缺失分片
- **THEN** 服务端 MUST NOT 插入或更新 `file_upload_parts`

#### Scenario: 服务启动自检
- **WHEN** 服务执行启动期表结构自检
- **THEN** 系统 MUST NOT 创建或同步 `file_upload_parts`

### Requirement: 文件占用关系保持单一事实来源
在当前唯一引用类型为文档版本源文件的前提下，系统 MUST 以 `document_versions.source_file_id` 作为文件占用关系的唯一事实来源，MUST NOT 同时维护 `file_references` 镜像关系。

#### Scenario: 文档绑定源文件
- **WHEN** 系统为已验证文件创建文档版本
- **THEN** 系统 MUST 在 `document_versions.source_file_id` 保存源文件关系
- **THEN** 系统 MUST NOT 写入 `file_references`

#### Scenario: 删除被文档使用的文件
- **WHEN** 用户请求删除仍被任一有效文档版本引用的文件
- **THEN** 系统 MUST 根据 `document_versions.source_file_id` 拒绝删除
- **THEN** 对外错误语义 MUST 与变更前一致

### Requirement: 解析块保持为流水线临时结果
文件处理流水线 MUST 在解析、标准化和切分期间以内存对象传递解析块，MUST NOT 把解析块写入 `document_parsed_blocks`。处理成功仍 MUST 持久化版本化 `document_segments`。

#### Scenario: 文件处理成功
- **WHEN** 文件完成解析、标准化和切分
- **THEN** 系统 MUST 写入对应文档版本的 `document_segments`
- **THEN** 系统 MUST NOT 插入、更新或删除 `document_parsed_blocks`

#### Scenario: 文件处理失败
- **WHEN** 文件在解析或标准化阶段失败
- **THEN** 系统 MUST 通过任务及阶段记录保存错误
- **THEN** 系统 MUST NOT 依赖持久化解析块恢复任务

### Requirement: 退役操作必须可预演且保护历史数据
物理删除退役表前，系统 MUST 生成包含表存在状态、精确行数、依赖对象和导出结果的预演报告。服务普通启动 MUST NOT 自动执行 `DROP TABLE`。

#### Scenario: 退役表仍有历史数据
- **WHEN** 预演发现任一退役表非空
- **THEN** 维护操作 MUST 在删除前导出该表数据并记录导出位置、行数和校验摘要
- **THEN** 导出失败或行数不一致时 MUST 阻止物理删除

#### Scenario: 显式执行物理删除
- **WHEN** 操作者提交与最新预演匹配的确认信息
- **THEN** 维护操作 MUST 按依赖顺序幂等删除目标表
- **THEN** 已不存在的目标表 MUST 被报告为已完成而不是导致整个操作失败

#### Scenario: 普通服务启动
- **WHEN** 服务执行启动期 schema 自检
- **THEN** 服务 MUST 只创建缺失的注册表和报告结构漂移
- **THEN** 服务 MUST NOT 自动删除未注册的物理表

### Requirement: 保留表必须维护关系完整性
系统 MUST 为已经稳定且可由同类型键表达的保留表关系声明数据库外键。增加约束前 MUST 检查孤儿数据；存在孤儿数据时 MUST 阻止约束应用并输出明细统计。

#### Scenario: 新数据库初始化
- **WHEN** 服务在空 schema 中初始化全部注册表
- **THEN** 系统 MUST 在被引用表存在后创建声明的外键
- **THEN** 初始化完成后的 catalog MUST 与 Drizzle 目标外键一致

#### Scenario: 已有数据库增加外键
- **WHEN** 操作者为已有表生成结构同步计划
- **THEN** 系统 MUST 先执行对应关系的孤儿检查
- **THEN** 只有孤儿数量为零时才能应用外键约束

#### Scenario: 关系无法安全声明外键
- **WHEN** 关系存在类型不一致、跨域生命周期冲突或循环创建约束
- **THEN** 设计清单 MUST 记录暂缓原因和应用层保护方式
- **THEN** 系统 MUST NOT 静默把该关系标记为已受数据库保护

### Requirement: 保留可验证的独立生命周期表
本次精简 MUST 保留 `agent_conversations`、`agent_messages`、`documents`、`document_versions`、`document_segments`、`file_processing_task_stage_runs` 和 `file_variants`，不得仅为降低表数量而删除产品明确保留的结构，或合并不同生命周期与查询模型的数据。

#### Scenario: 校验精简后的启动注册表
- **WHEN** 本次表退役完成
- **THEN** `bootstrappedTableRegistry` MUST 包含 21 张有当前用途、明确产品契约或明确保留决策的表
- **THEN** Agent 会话表、文档版本、最终 Segment、文件派生物和任务阶段时间线能力 MUST 保持可用
