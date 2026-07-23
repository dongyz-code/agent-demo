## ADDED Requirements

### Requirement: 上传基础设施与文档主体分层
系统 MUST 使用内部 File 和上传会话承载对象存储传输，使用 Document 与 DocumentVersion 承载公共业务。管理端文档流程 MUST 使用 `documentId` 和可选 `documentVersionId`，不得要求客户端使用 `fileId` 拼装文档业务。

#### Scenario: 首次上传完成
- **WHEN** 用户完成合法的文档上传
- **THEN** 系统验证内部源文件、创建 Document 与初始版本，并向客户端返回文档和版本标识

### Requirement: 上传策略由服务端控制
系统 MUST 通过服务端策略配置用途、允许类型、大小上限、Multipart 阈值、分片大小和预览能力。客户端不得扩大 MIME 白名单、大小上限或对象存储范围。

#### Scenario: 客户端覆盖安全限制
- **WHEN** 客户端尝试提高文件大小上限或扩大允许类型
- **THEN** 系统忽略或拒绝该覆盖，并按服务端策略校验

### Requirement: 支持普通上传与 Multipart
系统 MUST 根据策略和文件大小选择预签名 PutObject 或 S3 Multipart Upload，并支持分片签名、有限并发、失败重试、ListParts 恢复、幂等完成和主动取消。

#### Scenario: 小文件上传
- **WHEN** 文件小于 Multipart 阈值
- **THEN** 系统返回只允许写入指定对象的短期 PutObject 地址

#### Scenario: 恢复分片上传
- **WHEN** 用户恢复有效期内的 Multipart 会话
- **THEN** 系统根据对象存储中的真实分片只补传缺失部分

### Requirement: 服务端控制对象位置
系统 MUST 生成不可猜测的 bucket/object key 组合，不得接受客户端提交完整对象路径。原文件名只能作为经过清洗的显示元数据，不得影响对象位置。

#### Scenario: 上传恶意文件名
- **WHEN** 文件名包含路径穿越或控制字符
- **THEN** 系统安全保存显示名称，并生成不受文件名影响的对象标识

### Requirement: 文件必须验证后才能创建版本
系统 MUST 在源文件进入 DocumentVersion 前验证对象存在性、大小、可信 MIME、Magic Number 和服务端完整性信息。Multipart ETag 不得被当作完整文件 MD5，未验证文件不得成为正式文档版本。

#### Scenario: 声明类型伪造
- **WHEN** 声明 MIME 与实际内容签名不匹配
- **THEN** 系统拒绝文件且不得创建或切换文档版本

### Requirement: 上传完成原子表达业务结果
同一上传会话的完成请求 MUST 幂等地产生同一 DocumentVersion。首次上传创建 Document 与版本，新版本上传绑定既有 Document；公共响应 MUST 返回实际 `documentId`、`documentVersionId` 与版本号。

#### Scenario: 重复完成上传
- **WHEN** 客户端因超时重复完成同一会话
- **THEN** 系统返回第一次创建的文档版本，且不增加 Document、DocumentVersion 或源文件数量

### Requirement: 上传会话状态并发安全
系统 MUST 持久化上传会话状态，并使用显式状态迁移、幂等标识和条件更新避免重复初始化、并发合并、重复取消或完成后回退。

#### Scenario: 并发完成同一会话
- **WHEN** 两个请求同时完成同一上传会话
- **THEN** 只有一个请求执行对象合并与业务绑定，另一个返回进行中或相同完成结果

### Requirement: 存储访问保持私有
系统 MUST 在初始化、恢复、签名、取消、完成、下载和预览前校验用户与业务数据范围。对象存储必须保持私有，客户端不得获得长期凭证、bucket 或 object key。

#### Scenario: 跨用户访问会话
- **WHEN** 用户请求不属于自己的上传会话
- **THEN** 系统拒绝请求且不泄露 uploadId、对象位置或签名地址

### Requirement: 上传路由按复杂度分工
上传会话列表与状态等普通查询 MUST 由 route 直接使用 ORM。初始化、完成、Multipart、对象验证和取消等具有状态迁移或对象存储副作用的流程 MUST 调用上传业务函数，route 不得自行组合存储原语。

#### Scenario: 完成上传 route
- **WHEN** 上传完成请求到达 handler
- **THEN** handler 把已验证输入和用户上下文交给完成业务函数，并返回文档版本结果

### Requirement: 上传日志必须脱敏
系统 MUST 记录初始化、签名、恢复、完成、验证和取消的结构化日志与耗时，不得记录密钥、完整预签名 URL、签名查询参数或文件正文。

#### Scenario: 分片签名失败
- **WHEN** 对象存储签名发生错误
- **THEN** 日志记录会话、阶段和错误类型，但不记录凭证或完整 URL

### Requirement: 中止与清理不得破坏有效版本
取消未完成上传 MUST 终止对应对象传输并收敛会话状态。清理临时对象或孤儿源文件前 MUST 再次确认它未被有效 DocumentVersion 使用，且不得删除已发布文档版本的源对象。

#### Scenario: 清理被版本使用的源文件
- **WHEN** 清理流程发现源文件仍属于有效 DocumentVersion
- **THEN** 系统跳过物理删除并保留文档版本可下载性
