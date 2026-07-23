## ADDED Requirements

### Requirement: Document 是文件管理的业务主体
系统 MUST 使用 `documentId` 作为上传内容在列表、详情、版本、预览、知识库和删除场景中的公共标识。`fileId` MUST 只用于服务端上传和源文件存储，不得成为管理端文档业务的必需参数。

#### Scenario: 首次上传文档
- **WHEN** 用户完成合法的首次上传
- **THEN** 系统创建 Document 和版本 1，并返回 `documentId` 与 `documentVersionId`

### Requirement: 文档创建必须原子且幂等
系统 MUST 在一次业务事务中创建 Document、初始 DocumentVersion、源文件引用和当前版本指针。相同上传幂等键的重复完成请求 MUST 返回同一结果。

#### Scenario: 重复完成首次上传
- **WHEN** 客户端重复提交同一个首次上传完成请求
- **THEN** 系统返回已创建文档，且不增加文档或版本数量

### Requirement: 提供统一文档搜索
系统 MUST 提供 `searchDocuments`，以 Document 为分页主体，一次返回当前版本及源文件摘要、版本数量、封面、预览状态、RAG 状态和知识库摘要。知识库文档列表 MUST 复用该查询并通过 `datasetId` 筛选，不得再从处理任务反推文件列表。

#### Scenario: 搜索包含多版本和多知识库的文档
- **WHEN** 用户按名称、状态、知识库或创建时间搜索文档
- **THEN** 每个 Document 只返回一行，并包含当前版本和去重后的知识库摘要

### Requirement: 文档详情返回完整版本历史
系统 MUST 提供文档详情查询，返回文档元数据、当前版本和按版本号倒序的版本历史，使客户端无需使用 `fileId` 或逐版本查询拼装页面。

#### Scenario: 查看文档详情
- **WHEN** 授权用户请求未删除文档详情
- **THEN** 系统返回当前版本、全部历史版本及各版本的源文件和预览摘要

### Requirement: 所有文档操作统一校验数据范围
系统 MUST 在搜索、详情、上传版本、切换版本、下载、预览、知识库配置和删除入口校验权限及数据范围。

#### Scenario: 越权访问历史版本
- **WHEN** 用户请求不在其数据范围内的文档或版本
- **THEN** 系统拒绝请求且不返回源文件、页面或知识库信息

### Requirement: 删除以整个文档为单位
系统 MUST 逻辑删除 Document，立即将其从普通查询和所有知识库检索中移除，再使用现有任务机制异步清理全部版本、页面、Segment 和源文件。删除 MUST 幂等，首期 MUST NOT 提供单独删除历史版本的接口。

#### Scenario: 删除文档
- **WHEN** 授权用户删除一个文档
- **THEN** 文档立即不可见、知识库关系失效，并异步清理其全部内容

#### Scenario: 重复删除文档
- **WHEN** 客户端重复提交同一删除请求
- **THEN** 系统返回幂等成功且不创建冲突清理任务
