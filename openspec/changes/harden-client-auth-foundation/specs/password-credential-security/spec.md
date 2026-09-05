## ADDED Requirements

### Requirement: 普通用户密码单向存储
server SHALL 使用 Argon2id 单向哈希存储普通用户密码，任何创建或更新普通用户的写入路径 MUST NOT 把请求中的原文密码保存到数据库。

#### Scenario: 创建普通用户
- **WHEN** 管理员使用非空密码创建普通用户
- **THEN** server MUST 在写入 user 表前生成 Argon2id 哈希
- **THEN** 数据库字段 MUST NOT 等于请求原文

#### Scenario: 更新普通用户密码
- **WHEN** 管理员为一个或多个普通用户提交新密码
- **THEN** server MUST 为新密码生成 Argon2id 哈希后写入
- **THEN** 未提供密码时 MUST 保持原密码哈希不变

#### Scenario: 空密码写入
- **WHEN** 创建用户或显式更新密码时提交空字符串
- **THEN** server MUST 拒绝请求
- **THEN** server MUST NOT 写入空密码或其哈希

### Requirement: 应用层密码验证
server SHALL 先按用户名和启用状态读取普通用户，再使用 Argon2id verify 在应用层验证密码，SQL 查询 MUST NOT 通过原文密码等值条件认证用户。

#### Scenario: 正确密码登录
- **WHEN** 启用的普通用户提交与 Argon2id 哈希匹配的密码
- **THEN** server MUST 建立 Cookie 会话

#### Scenario: 错误密码登录
- **WHEN** 普通用户提交不匹配的密码
- **THEN** server MUST 返回统一身份校验失败
- **THEN** 响应 MUST NOT 暴露用户是否存在或哈希细节

#### Scenario: 禁用用户登录
- **WHEN** 密码正确但普通用户已被禁用
- **THEN** server MUST 拒绝登录

### Requirement: 历史明文密码迁移
server SHALL 在服务开始监听请求前，把 user 表中所有非空且不是 Argon2id 编码的密码转换为 Argon2id 哈希；迁移任一记录失败时服务 MUST NOT 接流量。

#### Scenario: 首次升级启动
- **WHEN** user 表存在历史明文密码
- **THEN** server MUST 在启动阶段完成全部哈希更新
- **THEN** 迁移日志 MUST 只记录统计信息，不得记录明文或哈希

#### Scenario: 重复启动
- **WHEN** user 表密码已经全部为 Argon2id 编码
- **THEN** 迁移 MUST 不重复哈希已有哈希
- **THEN** 服务 MUST 正常继续启动

#### Scenario: 多实例并发迁移
- **WHEN** 多个 server 实例同时迁移同一历史密码
- **THEN** 数据库更新 MUST 仅在字段仍等于扫描到的旧值时生效
- **THEN** 最终密码 MUST 是可验证原凭据的单层 Argon2id 哈希

### Requirement: 密码哈希保密
server SHALL 把密码哈希视为敏感数据，登录响应、用户详情、用户列表和日志 MUST NOT 返回或记录密码原文或哈希。

#### Scenario: 查询用户资料
- **WHEN** 管理端查询用户详情、名称或列表
- **THEN** API 响应 MUST 不包含 password 字段

#### Scenario: 密码处理失败
- **WHEN** 密码哈希或验证抛出错误
- **THEN** server 日志和 API 错误 MUST NOT 包含密码原文或完整哈希
