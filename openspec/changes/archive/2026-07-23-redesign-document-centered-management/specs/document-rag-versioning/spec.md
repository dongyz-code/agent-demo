## ADDED Requirements

### Requirement: 文档默认进入 RAG 且可单次关闭
系统 MUST 在 Document 保存默认 RAG 开关且默认启用。首次上传或单次版本上传可以覆盖本次行为，但不得隐式修改文档默认值。

#### Scenario: 单次关闭 RAG
- **WHEN** 文档默认启用 RAG但本次版本上传明确关闭
- **THEN** 系统创建版本但不更新任何知识库 pendingVersion，默认值保持启用

### Requirement: 一个文档可以关联多个知识库
系统 MUST 使用 Dataset-Document 多对多关系，每个知识库独立记录该文档的 RAG 版本和状态，同一知识库与文档只能存在一条关系。

#### Scenario: 加入多个知识库
- **WHEN** 用户把同一文档加入多个启用知识库
- **THEN** 每个知识库分别创建关系，但同一 DocumentVersion 与处理配置只解析和切分一次

### Requirement: 知识库关系记录生效和待处理版本
`rag_dataset_documents` MUST 保存 `activeVersionId`、`pendingVersionId`、RAG 状态和错误摘要。activeVersion 是当前检索版本，pendingVersion 是正在等待或处理的目标版本。

#### Scenario: 首次加入知识库
- **WHEN** 文档首次加入知识库
- **THEN** activeVersion 为空，pendingVersion 为文档当前版本，状态为 pending

### Requirement: 新版本成功前继续使用旧版本
系统 MUST 在处理 pendingVersion 时保持 activeVersion 不变。处理成功后 MUST 使用条件更新将 activeVersion 切换为 pendingVersion；失败时 MUST 保留旧 activeVersion。

#### Scenario: 新版本处理成功
- **WHEN** 某知识库的 pendingVersion 完成 RAG
- **THEN** 系统原子设置 activeVersion 为该版本、清空 pendingVersion 并标记 ready

#### Scenario: 新版本处理失败
- **WHEN** pendingVersion 处理失败
- **THEN** 系统记录 failed 和错误摘要，旧 activeVersion 继续参与检索

### Requirement: 迟到内容任务不得覆盖最新目标
版本内容任务发布关系时 MUST 使用 `pendingVersionId` 条件更新。用户连续上传或切换版本后，旧任务即使成功也不得覆盖更新后的 pendingVersion。

#### Scenario: 连续上传两个版本
- **WHEN** 版本 2 尚在处理时版本 3 成为新的 pendingVersion
- **THEN** 版本 2 的迟到任务不能把 activeVersion 切换为版本 2

### Requirement: 历史版本切换按知识库独立对齐
用户把历史版本设为文档当前版本时，系统 MUST 检查该 DocumentVersion 与配置是否已有成功内容任务；已有结果可批量切换仍匹配的关系，否则把各关系设为 pendingVersion 并继续使用旧 activeVersion，同时只创建一个版本内容任务。

#### Scenario: 历史版本需要重新处理
- **WHEN** 当前展示版本切换到尚无成功 RAG 结果的历史版本
- **THEN** 各知识库关系复用同一个版本内容任务，旧 activeVersion 保持服务直到成功

### Requirement: 文档内容任务按版本和配置幂等
系统 MUST 复用现有任务机制，以 DocumentVersion 和处理配置作为活动内容任务幂等边界。解析、标准化和 Segment 不得因同一版本关联多个 Dataset 而重复执行；各 Dataset 只独立维护 active/pending 关系和后续索引状态。

#### Scenario: 多知识库同时触发同一版本
- **WHEN** 多个知识库同时把同一 DocumentVersion 设为 pending
- **THEN** 系统只创建或复用一个版本内容任务，并在成功后发布所有仍匹配该版本的关系

### Requirement: 移除关系和删除文档立即停止检索
系统 MUST 在移除 Dataset-Document 关系或删除 Document 时立即使 activeVersion 失效。后续完成的任务不得恢复该关系。

#### Scenario: 处理期间移除知识库关系
- **WHEN** pendingVersion 处理完成前关系已被删除
- **THEN** 任务不能发布，且该知识库不再检索此文档
