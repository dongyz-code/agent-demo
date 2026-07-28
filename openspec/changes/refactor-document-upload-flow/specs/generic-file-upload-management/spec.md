## MODIFIED Requirements

### Requirement: 上传完成原子表达业务结果
同一上传会话的完成请求 MUST 幂等地产生同一 DocumentVersion。首次上传创建 Document 与版本，新版本上传绑定既有 Document；公共响应 MUST 返回实际 `documentId`、`documentVersionId` 与版本号。DocumentVersion 创建成功即为上传业务成功，预览任务、知识库关系、内容任务或客户端刷新失败不得把该上传回退为失败。

#### Scenario: 重复完成上传
- **WHEN** 客户端因超时重复完成同一会话
- **THEN** 系统返回第一次创建的文档版本，且不增加 Document、DocumentVersion 或源文件数量

#### Scenario: 后置预览调度失败
- **WHEN** DocumentVersion 已创建但预览任务创建发生错误
- **THEN** 完成接口仍返回文档版本成功结果，并记录可独立重试的预览失败信息或日志

### Requirement: 上传会话状态并发安全
系统 MUST 持久化上传会话状态，并使用显式状态迁移、上传尝试标识和条件更新避免重复初始化、并发合并、重复取消或完成后回退。同一次上传尝试的重复初始化 MUST 复用活动会话；失败、取消或过期后发起的新上传尝试 MUST 能够创建新会话。

#### Scenario: 并发完成同一会话
- **WHEN** 两个请求同时完成同一上传会话
- **THEN** 只有一个请求执行对象合并与业务绑定，另一个返回进行中或相同完成结果

#### Scenario: 取消后重新选择同一文件
- **WHEN** 用户取消一个上传会话后重新选择相同文件
- **THEN** 客户端使用新的上传尝试标识，服务端创建新会话且不触发旧幂等唯一键冲突

#### Scenario: 重复初始化同一活动尝试
- **WHEN** 初始化响应丢失后客户端使用相同上传尝试标识再次请求
- **THEN** 服务端返回原 initialized 或 uploading 会话及可用的最新签名

## ADDED Requirements

### Requirement: 完成会话禁止再次写入源对象
服务端 MUST 将 completed 上传会话视为对象写入终态，不得再签发 PutObject、UploadPart 或 Multipart 完成写能力。恢复 completed 会话只能取回同一 DocumentVersion 结果。

#### Scenario: 重复初始化已完成普通上传
- **WHEN** 客户端以同一上传尝试标识初始化 completed 会话
- **THEN** 服务端返回已完成恢复状态且不返回 PutObject URL

#### Scenario: 元数据指纹相同但内容不同
- **WHEN** 新选择文件与历史文件具有相同文件名、大小、MIME 和修改时间
- **THEN** 新上传尝试使用新对象或复用经过可信内容 Hash 验证的存储，不得覆盖历史 DocumentVersion 的源对象

