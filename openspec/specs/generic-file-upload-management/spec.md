## Purpose

定义独立于业务的通用文件上传基础设施，包括服务端策略、普通与分片传输、对象验证、幂等状态迁移、私有存储访问、日志脱敏和安全清理规则。

## Requirements

### Requirement: 上传基础设施与文档主体分层

系统 MUST 以独立的 `hooks/upload` 管理文件存储、上传会话和验证，完成后返回稳定 key 与可信元数据。key MUST 对应 `files.file_id`，不得暴露物理对象路径或作为访问凭证。文档版本绑定 MUST 由 documents 独立完成。

#### Scenario: 通用上传完成

- **WHEN** 用户完成合法上传
- **THEN** 系统返回 key、filename、contentType 与 size，且不创建文档或预览任务

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

通用上传完成 MUST 幂等地产生同一已验证文件结果。文档业务 MUST 通过独立绑定操作幂等创建版本，绑定失败时 MUST 能使用同一 key 重试而无需重新传输文件。

#### Scenario: 文档绑定失败重试

- **WHEN** 上传成功后文档绑定失败
- **THEN** 文件仍可用，客户端保留 key 并仅重试文档绑定

### Requirement: 上传会话状态并发安全

系统 MUST 持久化上传会话状态，并使用显式状态迁移、幂等标识和条件更新避免重复初始化、并发合并、重复取消或完成后回退。

#### Scenario: 并发完成同一会话

- **WHEN** 两个请求同时完成同一上传会话
- **THEN** 只有一个请求执行对象合并与业务绑定，另一个返回进行中或相同完成结果

### Requirement: 存储访问保持私有

系统 MUST 在上传操作前校验会话所有权，在业务文件读取前校验业务数据范围。upload MUST 统一通过 key 打开文件流和签发短期 URL；客户端不得获得长期凭证或物理存储位置，也不得仅凭 key 绕过业务授权。

#### Scenario: 文档下载

- **WHEN** 用户请求文档下载
- **THEN** documents 先校验文档访问权限，再调用 upload 生成带失效时间的 URL

### Requirement: 上传路由按复杂度分工

通用上传 route MUST 位于 `router/routes/upload`，调用 upload 的公开能力。文档绑定 route MUST 位于 documents 并调用真实业务动作；route 不得直接组合 S3 原语。

#### Scenario: 上传完成 route

- **WHEN** 通用上传完成请求到达 handler
- **THEN** handler 返回通用文件描述，文档绑定由单独请求执行

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

### Requirement: 已验证文件内容不可被上传签名覆盖

客户端 MUST 只获得临时对象写入地址。完成时 MUST 固化到独立最终对象并验证后发布句柄，旧上传地址不得改变已发布文件内容。

#### Scenario: 旧 PUT 地址仍有效

- **WHEN** 文件完成后客户端再次使用原 PUT 地址
- **THEN** 写入只影响临时对象，业务通过 key 读取的最终文件保持不变

### Requirement: 服务端用途策略可恢复

系统 MUST 持久化上传用途并按服务端白名单和大小限制验证。重复初始化 MUST 校验用途、文件声明与幂等键对应的已有会话一致。

#### Scenario: 幂等键用于不同文件

- **WHEN** 用户使用同一幂等键提交不同用途或文件声明
- **THEN** 系统拒绝请求，不返回另一文件的上传入口
