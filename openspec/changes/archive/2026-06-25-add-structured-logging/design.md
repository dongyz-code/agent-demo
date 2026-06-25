## Context

当前服务端通过 `initPinoLogger` 创建 Pino logger，并把 `fastifyLogger` 传给 Fastify。原有入口过薄，`logDir` 没有真正驱动本地文件落地、日期轮换和保留清理。

本阶段目标收缩为“先做本地日志”。请求链路相关能力先不进入本次变更：不生成或传播 requestId，不安装 Fastify 请求上下文 hook，不改变错误响应体，不新增请求完成摘要日志，也不修改 `api_logs` 或 `user_logs`。

## Goals / Non-Goals

**Goals:**

- 提供独立 logger 模块，承接 `initPinoLogger` 的本地文件落地和轮换实现。
- 创建 `fastify` 和 `system` 两类 Pino logger，并保持外部引用在轮换后稳定。
- 开发环境 stdout 使用可读文本，生产环境 stdout 和本地文件使用结构化 JSON。
- 文件日志写入 `logDir/YYYY-MM-DD/{fastify,system}.log`。
- 支持项目调度器触发每日轮换，未接入调度器时用进程内定时器兜底。
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
- `rotate`：手动触发文件轮换，便于测试或运维命令。
- `close`：关闭当前文件流，便于测试和优雅退出。
- `getLogFiles`：获取当前角色日志文件路径快照。

内部创建真实 Pino logger，并把日志写入可替换的角色 sink。日期轮换时只替换 sink 后面的文件 writer，不重建 Pino logger，因此 Fastify 持有的 `loggerInstance` 引用保持稳定。

### 3. stdout 和文件输出分离

开发环境 stdout 可读文本由轻量 pretty writer 完成，不引入额外依赖；生产环境 stdout 直接输出 Pino JSON。本地文件始终写 Pino JSON 行，方便后续 grep、采集器或离线处理。

### 4. 本地文件采用日期目录

配置开启文件落地时，写入：

```text
static/logs/
  YYYY-MM-DD/
    fastify.log
    system.log
```

每天 00:00:01 执行一次轮换：创建当天目录、替换角色文件 writer、关闭旧文件 writer。过期日期目录根据配置保留天数清理。轮换失败时继续保持 stdout/stderr 兜底输出可用。

### 5. 请求相关能力本阶段回退

本次不新增 requestId、请求上下文、请求完成摘要或错误响应字段。Fastify 继续使用自身 logger 机制，应用层仅通过 `loggerInstance: fastifyLogger` 接入本地文件日志。

## Risks / Trade-offs

- [Risk] 应用内替换文件 writer 时可能存在短暂文件句柄问题。→ Mitigation：Pino logger 保持稳定，只替换底层 sink，并为轮换失败提供 stderr fallback。
- [Risk] 同时写 stdout 和文件会增加 I/O。→ Mitigation：文件落地作为配置开关，可通过配置关闭本地文件输出。
- [Risk] 自定义 pretty writer 功能不如 `pino-pretty` 完整。→ Mitigation：仅用于开发 stdout 可读性，文件和生产输出仍保持标准 JSON。
- [Risk] 后续又把请求上下文塞回 Fastify 工具模块。→ Mitigation：设计中明确 logger 模块独立，Fastify 模块不承载轮换或请求链路实现。

## Migration Plan

1. 新增独立 logger 模块，迁移并简化 `initPinoLogger`。
2. 从 Fastify 模块移除 logger 初始化实现。
3. 扩展服务端日志配置类型，提供日志级别、文件开关和保留天数。
4. 服务端 logger 配置传入 `DIRS.LOG` 和 `ROOT_SCHEDULE`。
5. 回退 requestId、请求上下文和错误响应体相关改动。
6. 运行 utils-node 和 deploy-server lint，并用临时目录验证文件实际创建。

回滚时可关闭文件落地配置，保留 stdout Pino 输出；由于不修改数据库 schema，回滚不涉及数据迁移。
