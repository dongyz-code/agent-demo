## MODIFIED Requirements

### Requirement: 上传基础设施与文档主体分层

系统 MUST 以独立的 `hooks/upload` 管理文件存储、上传会话和验证，完成后返回稳定 key 与可信元数据。key MUST 对应 `files.file_id`，不得暴露物理对象路径或作为访问凭证。文档版本绑定 MUST 由 documents 独立完成。

#### Scenario: 通用上传完成

- **WHEN** 用户完成合法上传
- **THEN** 系统返回 key、filename、contentType 与 size，且不创建文档或预览任务

### Requirement: 上传完成原子表达业务结果

通用上传完成 MUST 幂等地产生同一已验证文件结果。文档业务 MUST 通过独立绑定操作幂等创建版本，绑定失败时 MUST 能使用同一 key 重试而无需重新传输文件。

#### Scenario: 文档绑定失败重试

- **WHEN** 上传成功后文档绑定失败
- **THEN** 文件仍可用，客户端保留 key 并仅重试文档绑定

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

## ADDED Requirements

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
