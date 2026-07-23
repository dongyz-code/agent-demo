## ADDED Requirements

### Requirement: documents 域直接使用 ROOT_ERROR
documents 域所有业务错误 MUST 直接创建项目统一 `ROOT_ERROR` 实例；MUST NOT 为 documents 域维护独立的自定义 `Error` 子类或只包一层 `ROOT_ERROR` 的领域错误工厂。

#### Scenario: 错误统一创建
- **WHEN** documents 域代码抛出业务错误
- **THEN** 该错误 MUST 是 `ROOT_ERROR` 实例
- **THEN** 仓库 MUST NOT 存在 `FileProcessingError` 或同类绕开 `ROOT_ERROR` 的自定义错误类
- **THEN** 仓库 MUST NOT 存在同类只转发 `ROOT_ERROR` 的领域错误工厂

### Requirement: ROOT_ERROR 详情只承载动态上下文
固定业务错误 MUST 只传已注册的 `ROOT_ERROR` 键；调用点 MUST NOT 在第二参数重复固定错误码或固定说明。只有错误定义无法预先表达、且排查确实需要的运行时数据 MAY 作为第二参数传入。

#### Scenario: 固定错误不传详情
- **WHEN** documents 域抛出文档不存在等固定业务错误
- **THEN** 调用 MUST 只传对应的 `ROOT_ERROR` 注册键

#### Scenario: 动态上下文可以传入详情
- **WHEN** 错误说明需要包含实际状态、分片编号、内容类型或解析位置
- **THEN** 调用 MAY 将该运行时上下文作为第二参数传入

### Requirement: documents 域错误 HTTP 语义正确
documents 域错误 MUST 通过 `ROOT_ERROR` 注册键映射到正确 HTTP 状态码：`相关文件不存在`→404、`非法参数`→400、`认证: 权限不足`→403、`数据异常`→409、`服务异常`→500。fastify 归一化层 MUST 能从错误对象读取状态码，MUST NOT 将业务错误塌缩为 500。

#### Scenario: not-found 返回 404
- **WHEN** documents 域 route 抛出 `ROOT_ERROR('相关文件不存在')`
- **THEN** 响应 HTTP 状态码 MUST 为 404

#### Scenario: bad-request 返回 400
- **WHEN** documents 域 route 抛出 `ROOT_ERROR('非法参数')`
- **THEN** 响应 HTTP 状态码 MUST 为 400

#### Scenario: conflict 返回 409
- **WHEN** documents 域 route 抛出 `ROOT_ERROR('数据异常')`
- **THEN** 响应 HTTP 状态码 MUST 为 409
