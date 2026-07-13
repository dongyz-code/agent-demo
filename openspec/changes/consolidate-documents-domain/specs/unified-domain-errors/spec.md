## ADDED Requirements

### Requirement: 单一 documents 域错误工厂
documents 域所有业务错误 MUST 通过单一 `createDomainError(code, message, kind)` 工厂创建，该工厂 MUST 返回项目统一 `ROOT_ERROR` 实例；MUST NOT 为 documents 域维护独立的自定义 `Error` 子类。

#### Scenario: 错误统一创建
- **WHEN** documents 域代码抛出业务错误
- **THEN** 该错误 MUST 由 `createDomainError` 创建并返回 `ROOT_ERROR` 实例
- **THEN** 仓库 MUST NOT 存在 `FileProcessingError` 或同类绕开 `ROOT_ERROR` 的自定义错误类

### Requirement: documents 域错误 HTTP 语义正确
documents 域错误的 `kind` MUST 映射到正确 HTTP 状态码：`not-found`→404、`bad-request`→400、`forbidden`→403、`conflict`→409、`internal`/`unavailable`→500 或 503。fastify 归一化层 MUST 能从错误对象读取状态码，MUST NOT 将业务错误塌缩为 500。

#### Scenario: not-found 返回 404
- **WHEN** documents 域 route 抛出 `kind: 'not-found'` 的业务错误
- **THEN** 响应 HTTP 状态码 MUST 为 404

#### Scenario: bad-request 返回 400
- **WHEN** documents 域 route 抛出 `kind: 'bad-request'` 的业务错误
- **THEN** 响应 HTTP 状态码 MUST 为 400

#### Scenario: conflict 返回 409
- **WHEN** documents 域 route 抛出 `kind: 'conflict'` 的业务错误
- **THEN** 响应 HTTP 状态码 MUST 为 409

### Requirement: 错误 kind 枚举集中
documents 域错误 `kind` 枚举 MUST 定义在 `@repo/types`，MUST NOT 在各子模块重复定义局部的 kind 类型。

#### Scenario: kind 单一定义
- **WHEN** 开发者引用错误 kind
- **THEN** 该 kind MUST 来自 `@repo/types` 的集中枚举
- **THEN** 仓库 MUST NOT 在 documents 子模块内重复定义互不一致的 kind 枚举

### Requirement: documents 域错误码集中枚举
documents 域稳定业务错误码 MUST 集中定义在 `@repo/types` 的枚举中，MUST NOT 以字符串字面量散落在各 route 与领域函数内。

#### Scenario: 错误码引用
- **WHEN** 代码抛出或比对 documents 域错误码
- **THEN** 该错误码 MUST 引用 `@repo/types` 的集中枚举常量
- **THEN** 代码 MUST NOT 使用裸字符串字面量表达错误码

### Requirement: 错误码不依赖消息前缀约定
documents 域 MUST NOT 通过错误消息文本前缀（如 `CODE: 文案`）传递错误码再以正则提取；错误码 MUST 通过错误对象的字段传递。

#### Scenario: 底层错误携带结构化错误码
- **WHEN** 解析器、标准化器或存储层抛出错误
- **THEN** 该错误 MUST 通过 `createDomainError` 携带结构化错误码与 kind
- **THEN** 系统 MUST NOT 依赖正则从错误消息文本提取错误码
