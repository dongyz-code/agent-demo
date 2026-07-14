## ADDED Requirements

### Requirement: documents 域直接使用 ROOT_ERROR
documents 域所有业务错误 MUST 直接创建项目统一 `ROOT_ERROR` 实例；MUST NOT 为 documents 域维护独立的自定义 `Error` 子类或只包一层 `ROOT_ERROR` 的领域错误工厂。

#### Scenario: 错误统一创建
- **WHEN** documents 域代码抛出业务错误
- **THEN** 该错误 MUST 是 `ROOT_ERROR` 实例
- **THEN** 仓库 MUST NOT 存在 `FileProcessingError` 或同类绕开 `ROOT_ERROR` 的自定义错误类
- **THEN** 仓库 MUST NOT 存在同类只转发 `ROOT_ERROR` 的领域错误工厂

### Requirement: documents 域错误 HTTP 语义正确
documents 域错误 MUST 通过 `ROOT_ERROR` 注册键映射到正确 HTTP 状态码：`相关文件不存在`→404、`非法参数`→400、`认证: 权限不足`→403、`数据异常`→409、`服务异常`→500。fastify 归一化层 MUST 能从错误对象读取状态码，MUST NOT 将业务错误塌缩为 500。

#### Scenario: not-found 返回 404
- **WHEN** documents 域 route 抛出 `ROOT_ERROR('相关文件不存在', ...)`
- **THEN** 响应 HTTP 状态码 MUST 为 404

#### Scenario: bad-request 返回 400
- **WHEN** documents 域 route 抛出 `ROOT_ERROR('非法参数', ...)`
- **THEN** 响应 HTTP 状态码 MUST 为 400

#### Scenario: conflict 返回 409
- **WHEN** documents 域 route 抛出 `ROOT_ERROR('数据异常', ...)`
- **THEN** 响应 HTTP 状态码 MUST 为 409
