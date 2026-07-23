## ADDED Requirements

### Requirement: 文档版本是不可变内容
系统 MUST 将 DocumentVersion 视为不可变内容。版本创建后不得替换 `sourceFileId`、内容 Hash 或版本号，内容变化 MUST 创建新版本。

#### Scenario: 上传不同内容
- **WHEN** 用户为既有文档上传新文件
- **THEN** 系统创建新的 DocumentVersion，不覆盖任何历史版本

### Requirement: 版本号并发安全递增
系统 MUST 在单个 Document 内分配从 1 开始递增的版本号，并通过事务锁和 `(documentId, version)` 唯一约束避免并发重复。

#### Scenario: 并发上传新版本
- **WHEN** 两个请求同时为同一文档创建版本
- **THEN** 成功创建的版本获得不同且递增的版本号

### Requirement: 新版本上传必须幂等
系统 MUST 以用户、目标 Document 和上传幂等键识别重复请求。重复完成不得创建额外版本或跳号。

#### Scenario: 重复完成版本上传
- **WHEN** 客户端因超时重复提交新版本完成请求
- **THEN** 系统返回第一次创建的 `documentVersionId` 和版本号

### Requirement: 最新验证成功版本自动成为当前版本
系统 MUST 使用 `documents.activeVersionId` 表示默认展示版本。新源文件验证成功并创建版本后 MUST 在同一事务中更新该指针；验证失败不得改变当前版本。

#### Scenario: 新版本上传成功
- **WHEN** 新文件完成可信验证并成功创建版本
- **THEN** 文档当前版本立即指向新版本，不等待预览或 RAG

### Requirement: 支持查看和切换历史版本
系统 MUST 允许授权用户查看任意历史版本，并将属于该文档的任意有效版本重新设为当前版本。

#### Scenario: 将历史版本设为当前版本
- **WHEN** 用户选择同一文档的历史版本
- **THEN** 系统更新当前展示版本，并分别处理各知识库的 RAG 版本对齐

#### Scenario: 选择其他文档的版本
- **WHEN** 请求中的版本不属于目标文档
- **THEN** 系统拒绝请求且不改变当前版本

### Requirement: 默认和显式版本解析规则一致
系统 MUST 在下载、预览和详情中使用统一规则：未提供 `documentVersionId` 时读取 activeVersion，显式提供时校验归属并读取指定版本。响应 MUST 返回实际版本标识。

#### Scenario: 显式预览历史版本
- **WHEN** 用户提供属于该文档的历史 `documentVersionId`
- **THEN** 系统返回该历史版本的页面，不受当前版本变化影响

### Requirement: 展示版本与知识库生效版本相互独立
系统 MUST NOT 使用 Document activeVersion 直接覆盖知识库 activeVersion。知识库切换只能在目标版本 RAG 成功后发生。

#### Scenario: 新版本 RAG 尚未完成
- **WHEN** 新版本已成为展示版本但知识库仍在处理
- **THEN** 文档显示新版本，知识库继续检索旧成功版本
