## ADDED Requirements

### Requirement: 通用文件模型与业务解耦
系统 MUST 使用通用文件、上传会话、上传分片和文件引用模型管理对象，不得在通用上传表、类型和服务中依赖 RAG 知识库、文档版本或解析状态。上传完成后系统 MUST 返回稳定 `fileId`，由具体业务模块决定是否及如何引用该文件。

#### Scenario: 通用上传完成
- **WHEN** 用户通过已注册上传策略完成并验证文件
- **THEN** 系统返回与具体业务无关的 `fileId`、文件元数据和状态

#### Scenario: 其他业务复用上传
- **WHEN** 非 RAG 业务使用通用上传接口上传附件
- **THEN** 上传模块无需增加 RAG 字段或调用 RAG 服务即可完成上传

### Requirement: 上传策略注册
系统 MUST 通过服务端策略配置控制用途键、允许类型、最大大小、Multipart 阈值、分片大小、预览能力、未绑定保留期和访问范围。客户端不得覆盖策略安全限制。

#### Scenario: 使用合法策略
- **WHEN** 用户使用有权访问的策略键初始化满足限制的文件
- **THEN** 系统根据策略创建上传会话并返回上传模式

#### Scenario: 覆盖安全限制
- **WHEN** 客户端试图提高最大大小、扩大 MIME 白名单或修改 Bucket
- **THEN** 系统拒绝或忽略覆盖值并执行服务端策略

### Requirement: 普通上传与 Multipart
系统 MUST 根据文件大小自动选择预签名 PutObject 或 S3 Multipart Upload，并支持分片签名、有限并发、失败重试、ListParts 恢复、幂等完成和主动取消。

#### Scenario: 小文件上传
- **WHEN** 文件大小低于 Multipart 阈值
- **THEN** 系统返回仅允许写入指定对象的短期 PutObject URL

#### Scenario: 大文件上传
- **WHEN** 文件大小达到 Multipart 阈值
- **THEN** 系统创建 Multipart Upload 并返回 uploadId、分片大小和分片数量

#### Scenario: 中断恢复
- **WHEN** 用户恢复有效期内的 Multipart 会话
- **THEN** 系统使用 MinIO ListParts 返回真实分片并仅补传缺失部分

### Requirement: 服务端控制对象位置
系统 MUST 生成不可猜测的 Bucket/Object Key，不得接受客户端提交完整路径。原始文件名 MUST 仅作为清洗后的元数据保存。

#### Scenario: 同名文件
- **WHEN** 多个用户上传同名文件
- **THEN** 系统生成不同对象标识且不会互相覆盖

#### Scenario: 恶意文件名
- **WHEN** 文件名包含路径穿越或控制字符
- **THEN** 系统安全保存显示名称并生成不受文件名影响的 Object Key

### Requirement: 上传验证与可信状态
系统 MUST 在文件可引用前验证对象存在性、大小、可信 MIME、Magic Number 和服务端完整性信息。Multipart ETag 不得作为完整文件 MD5，未验证文件不得成为正式业务资源。

#### Scenario: 验证成功
- **WHEN** 对象大小、类型和内容签名满足策略
- **THEN** 系统将文件标记为 `verified` 并允许创建业务引用

#### Scenario: 类型伪造
- **WHEN** 声明类型与实际文件签名不一致
- **THEN** 系统拒绝文件并禁止业务引用

### Requirement: 文件引用生命周期
系统 MUST 提供基于 `namespace`、`ownerId`、`role` 和 `fileId` 的引用创建与释放服务。业务模块不得直接修改通用文件引用表，上传模块不得解释业务 owner 的内部含义。

#### Scenario: 文档版本绑定源文件
- **WHEN** 文档模块使用已验证文件创建文档版本
- **THEN** 系统创建对应文件引用并防止孤儿清理

#### Scenario: 释放最后引用
- **WHEN** 业务释放文件最后一个有效引用
- **THEN** 系统按保留策略进入待清理状态而不立即阻塞业务事务

### Requirement: 权限与私有存储
系统 MUST 在上传、恢复、取消、引用、下载、预览和删除前验证租户、创建人和业务引用权限。MinIO Bucket MUST 保持私有，客户端不得获得长期存储凭证。

#### Scenario: 授权访问
- **WHEN** 用户拥有文件或业务引用读取权限
- **THEN** 系统允许返回受限文件信息或短期地址

#### Scenario: 跨租户访问
- **WHEN** 用户请求其他租户的文件或上传会话
- **THEN** 系统拒绝请求且不泄露 Object Key、uploadId 和签名地址

### Requirement: 状态、幂等和并发安全
系统 MUST 持久化文件与上传会话状态，并使用显式状态迁移、幂等键和条件更新避免重复初始化、完成、引用和物理删除。

#### Scenario: 重复完成
- **WHEN** 客户端重复完成已经成功的上传
- **THEN** 系统返回相同文件结果且不创建第二条文件记录

#### Scenario: 并发完成
- **WHEN** 两个请求同时完成同一会话
- **THEN** 只有一个请求执行合并，另一个返回进行中或已完成结果

### Requirement: 下载、删除与清理
系统 MUST 支持权限受控下载、逻辑删除、异步物理删除、过期 Multipart 清理、未绑定文件清理和孤儿对象报告。物理删除前 MUST 再次检查有效引用。

#### Scenario: 下载文件
- **WHEN** 授权用户下载已验证文件
- **THEN** 系统返回短期有效的附件下载地址

#### Scenario: 清理过期会话
- **WHEN** Multipart 会话超过有效期仍未完成
- **THEN** 清理任务终止 Multipart 并标记会话过期

#### Scenario: 保护引用文件
- **WHEN** 清理任务发现文件仍有有效引用
- **THEN** 系统跳过物理删除并记录保护原因

### Requirement: 上传路由按复杂度分工
上传会话列表、状态等普通查询 MUST 由 route 直接使用 ORM。初始化、完成、Multipart、对象验证和取消等涉及状态迁移或 S3 副作用的流程 MUST 调用上传业务函数，route 不得自行组合内部存储原语。

#### Scenario: 初始化上传路由
- **WHEN** 初始化请求到达 route handler
- **THEN** handler 将已验证请求与调用者上下文交给上传初始化业务函数并返回结果

### Requirement: 可观测性和脱敏
系统 MUST 记录初始化、签名、恢复、完成、验证、引用、取消和清理的结构化日志与耗时，不得记录密钥、完整预签名 URL 或签名查询参数。

#### Scenario: 签名失败
- **WHEN** S3 签名发生错误
- **THEN** 系统记录会话、阶段和错误码，但不记录 Secret Key 或完整 URL

### Requirement: 管理端文件与会话闭环
管理端 MUST 提供通用文件和上传会话管理入口，支持按名称、状态和策略筛选、分页、查看、下载、删除以及取消有效会话。刷新后恢复上传 MUST 复用服务端会话和 MinIO `ListParts`，不得重新上传已确认分片。

#### Scenario: 查看通用文件
- **WHEN** 用户进入文件管理页
- **THEN** 页面分页展示当前用户可访问的文件，并提供权限受控的预览、下载和删除操作

#### Scenario: 恢复 Multipart
- **WHEN** 页面刷新后恢复未完成 Multipart 上传
- **THEN** 管理端恢复本地队列或提示重新选择原文件，并通过稳定指纹和 `ListParts` 跳过已完成分片

#### Scenario: 业务接入失败
- **WHEN** 文件验证成功但后续创建文档或加入知识库失败
- **THEN** 上传队列展示失败原因，并允许重试后续业务接入而不重复创建对象
