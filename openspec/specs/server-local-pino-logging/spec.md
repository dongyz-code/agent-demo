## Purpose

定义服务端 Pino 本地运行日志的 Fastify 接入、开发与生产输出格式、本地日期目录轮换、保留清理和模块边界约束。

## Requirements

### Requirement: 本地 Pino 日志
服务端 SHALL 通过统一 logger 输出本地 Pino 运行日志，并区分 Fastify 日志和系统日志。

#### Scenario: 初始化双 logger
- **WHEN** 服务端初始化 logger
- **THEN** 系统 MUST 创建可传入 Fastify `loggerInstance` 的 `fastifyLogger`
- **THEN** 系统 MUST 创建供项目代码调用的 system `logger`

#### Scenario: 开发环境 stdout 可读
- **WHEN** 开发环境开启 `devPretty`
- **THEN** stdout SHOULD 输出便于人工阅读的文本日志
- **THEN** 本地文件日志 MUST 继续保持 Pino JSON 行

#### Scenario: 生产环境结构化输出
- **WHEN** 生产环境关闭 `devPretty`
- **THEN** stdout MUST 输出 Pino JSON 行

#### Scenario: 写入当天日志目录
- **WHEN** 文件日志开启且服务端输出运行日志
- **THEN** 系统 MUST 将 Fastify 日志写入当天目录下的 `fastify.log`
- **THEN** 系统 MUST 将系统日志写入当天目录下的 `system.log`

### Requirement: 本地日志日期轮换
服务端 SHALL 在启用文件日志时按日期目录写入本地日志，并定期轮换和清理过期目录。

#### Scenario: 跨日轮换
- **WHEN** 系统日期进入新一天
- **THEN** 系统 MUST 创建新日期目录
- **THEN** 系统 MUST 将后续日志写入新日期目录下的角色日志文件
- **THEN** 外部持有的 `fastifyLogger` 和 `logger` 引用 MUST 继续可用

#### Scenario: 清理过期文件日志
- **WHEN** 本地日志目录超过配置的文件保留天数
- **THEN** 系统 MUST 删除过期日期目录或记录清理失败事件

### Requirement: Logger 模块边界
服务端 SHALL 将本地日志实现放在独立 logger 模块，并避免耦合 Fastify 工具职责。

#### Scenario: Fastify 模块不承载日志轮换
- **WHEN** 查看 `packages/utils/node/src/plugins/fastify/index.ts`
- **THEN** 该模块 MUST NOT 包含 Pino 文件 stream、日期轮换或日志保留清理实现

#### Scenario: 请求相关能力不在本阶段实现
- **WHEN** 本变更完成
- **THEN** 系统 MUST NOT 新增 requestId 生成、请求上下文 hook 或错误响应体 requestId 字段
- **THEN** 系统 MUST NOT 修改 `api_logs` 或 `user_logs` 的数据库结构、写入字段或查询契约

### Requirement: 日志故障降级
服务端 SHALL 保证 Pino 文件写入或轮换失败不影响主服务启动。

#### Scenario: 文件轮换失败
- **WHEN** 本地日志目录创建、轮换或清理失败
- **THEN** 系统 MUST 保持 stdout 或 stderr 日志输出可用
- **THEN** 系统 MUST 记录轮换失败状态
