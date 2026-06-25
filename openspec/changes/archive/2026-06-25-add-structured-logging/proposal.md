## Why

服务端当前已有 `initPinoLogger` 入口，但 `logDir` 没有真正形成稳定的本地日志落地策略。排查线上或本地长时间运行问题时，仍依赖零散 stdout 或人工截取日志，不利于按日期定位和保留。

本阶段先只做本地 Pino 日志落地：把 Fastify logger 和系统 logger 写入本地日期目录，并支持跨日轮换和过期清理。requestId、请求上下文、请求完成摘要、错误响应关联、脱敏截断和审计日志联动先不进入本次实现。

## What Changes

- 新增独立 logger 模块承载 `initPinoLogger`，避免把日志轮换逻辑放进 Fastify 插件。
- 支持 `fastify` 和 `system` 两类 Pino logger，兼容 Fastify `loggerInstance` 和项目系统日志调用。
- 开发环境 stdout 输出可读文本，生产环境 stdout 输出结构化 JSON，本地文件始终保持 Pino JSON 行。
- 启用文件日志时写入 `logDir/YYYY-MM-DD/{fastify,system}.log`。
- 支持通过项目调度器每日轮换；未传入调度器时使用进程内兜底定时器检查日期变化。
- 支持按保留天数清理过期日期目录，文件创建或轮换失败时保留 stderr 兜底输出。
- 服务端配置读取日志级别、文件开关和保留天数。

## Capabilities

### New Capabilities

- `server-local-pino-logging`: 定义服务端 Pino 本地文件日志、日期轮换、保留清理和 Fastify/system logger 兼容策略。

### Modified Capabilities

无。

## Impact

- 新增 `packages/utils/node/src/plugins/logger/`，并从 `@repo/utils-node` 导出本地 logger 能力。
- `packages/utils/node/src/plugins/fastify/index.ts` 不承载日志轮换实现，仅继续负责 Fastify 相关工具。
- 影响 `apps/server/src/configs/logger.ts` 和 `apps/server/src/server.ts`，将服务端启动、监听和进程异常输出接入本地 logger。
- 不修改 `api_logs`、`user_logs`、路由错误响应契约或请求上下文。
