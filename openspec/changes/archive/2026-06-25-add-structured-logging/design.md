## Context

当前服务端通过 `initPinoLogger` 创建 Pino logger，并把 `fastifyLogger` 传给 Fastify。原有入口过薄，`logDir` 没有真正驱动本地文件落地、日期轮换和保留清理。

本阶段目标收缩为“先做本地日志”。请求链路相关能力先不进入本次变更：不生成或传播 requestId，不安装 Fastify 请求上下文 hook，不改变错误响应体，不新增请求完成摘要日志，也不修改 `api_logs` 或 `user_logs`。

## Goals / Non-Goals

**Goals:**

- 提供独立 logger 模块，承接 `initPinoLogger` 的本地文件落地和轮换实现。
- 创建 `fastify` 和 `system` 两类 Pino logger，并保持外部引用在轮换后稳定。
- 开发环境 stdout 使用可读文本，生产环境 stdout 和本地文件使用结构化 JSON。
- 文件日志写入 `logDir/YYYY-MM-DD/{fastify,system}.log`。
- 文件输出目标在写入时按本地日期懒轮换，不依赖项目调度器或进程内定时器。
- 支持过期日期目录清理，文件写入或清理失败时不影响服务启动和 stdout/stderr 输出。

**Non-Goals:**

- 不实现 requestId 生成、校验、传播或响应头回写。
- 不安装请求级 AsyncLocalStorage 或 Fastify 请求完成日志 hook。
- 不改变路由错误响应体，不在错误响应中增加 requestId。
- 不修改 `api_logs` 或 `user_logs` 的数据库结构、写入流程和查询 API。
- 不在本阶段实现 ES 同步、日志后台、审计日志保留清理或跨服务分布式追踪系统。

## Decisions

### 1. Logger 与 Fastify 模块分离

`packages/utils/node/src/plugins/fastify/index.ts` 只保留 Fastify 创建、插件注册、路由辅助和 cookie 辅助。Pino 初始化、输出目标、日期轮换和清理逻辑放到 `packages/utils/node/src/plugins/logger/`。

### 2. `initPinoLogger` 管理 fastify/system 双 logger

`initPinoLogger` 返回：

- `fastifyLogger`：给 Fastify `loggerInstance` 使用。
- `logger`：给项目系统代码使用，提供 `trace/debug/info/warn/error/fatal/log` 等方法。

内部创建真实 Pino logger，并通过 `pino.multistream` 写入 stdout 和按天懒轮换的文件输出目标。跨天后的第一条文件日志会替换内部文件 writer，不重建 Pino logger，因此 Fastify 持有的 `loggerInstance` 引用保持稳定。

### 3. stdout 和文件输出分离

开发环境 stdout 可读文本由 `pino-pretty` 完成；生产环境 stdout 直接输出 Pino JSON。本地文件始终写 Pino JSON 行，方便后续 grep、采集器或离线处理。

### 4. 本地文件采用日期目录

配置开启文件落地时，写入：

```text
static/logs/
  YYYY-MM-DD/
    fastify.log
    system.log
```

文件输出目标维护下一次本地零点时间；每次写入只做 `Date.now()` 与阈值比较。跨天后的第一条日志会创建当天目录、替换角色文件 writer、关闭旧文件 writer，并按配置保留天数清理过期日期目录。轮换失败时继续保持 stdout/stderr 兜底输出可用。

### 5. 请求相关能力本阶段回退

本次不新增 requestId、请求上下文、请求完成摘要或错误响应字段。Fastify 继续使用自身 logger 机制，应用层仅通过 `loggerInstance: fastifyLogger` 接入本地文件日志。

## Risks / Trade-offs

- [Risk] 写入时懒轮换可能让跨天目录在第一条日志到来时才创建。→ Mitigation：没有日志时无需创建空目录；Pino logger 保持稳定，只替换底层文件 writer，并为轮换失败提供 stderr fallback。
- [Risk] 同时写 stdout 和文件会增加 I/O。→ Mitigation：文件落地作为配置开关，可通过配置关闭本地文件输出。
- [Risk] 开发环境 pretty 输出增加一个运行时依赖。→ Mitigation：仅 stdout 开启 `devPretty` 时使用，文件和生产输出仍保持标准 JSON。
- [Risk] 后续又把请求上下文塞回 Fastify 工具模块。→ Mitigation：设计中明确 logger 模块独立，Fastify 模块不承载轮换或请求链路实现。

## Migration Plan

1. 新增独立 logger 模块，迁移并简化 `initPinoLogger`。
2. 从 Fastify 模块移除 logger 初始化实现。
3. 扩展服务端日志配置类型，提供日志级别、文件开关和保留天数。
4. 服务端 logger 配置传入 `DIRS.LOG`，文件输出目标自行按写入日期懒轮换。
5. 回退 requestId、请求上下文和错误响应体相关改动。
6. 运行 utils-node 和 deploy-server lint，并用临时目录验证文件实际创建。

回滚时可关闭文件落地配置，保留 stdout Pino 输出；由于不修改数据库 schema，回滚不涉及数据迁移。
