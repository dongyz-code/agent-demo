## 1. 本地 Logger 模块

- [x] 1.1 新增独立 `plugins/logger` 模块，承载 `initPinoLogger`，不放入 Fastify 插件。
- [x] 1.2 创建真实 `fastify` 和 `system` 两类 Pino logger，并返回稳定的 `fastifyLogger` 和 system `logger`。
- [x] 1.3 支持开发环境 stdout pretty、生产环境 stdout JSON 和可选本地文件 JSON 输出。
- [x] 1.4 实现日期轮换逻辑，跨日替换文件 writer，并保持 Pino logger 引用不变。
- [x] 1.5 实现本地日志过期目录清理，轮换失败时降级到 stderr。

## 2. 服务端接入

- [x] 2.1 扩展服务端日志配置类型，增加运行日志级别、文件日志开关和文件保留天数默认值。
- [x] 2.2 在 `apps/server/src/configs/logger.ts` 传入 `DIRS.LOG` 和 `ROOT_SCHEDULE`。
- [x] 2.3 替换服务端启动、监听成功、未捕获异常和进程退出中的零散 `console` 输出。

## 3. 请求相关回退

- [x] 3.1 回退 requestId 生成、请求上下文、Fastify hook 和错误响应体改动。
- [x] 3.2 确认 `packages/utils/node/src/plugins/fastify/index.ts` 不再承载日志轮换实现。
- [x] 3.3 确认不修改 `api_logs` 或 `user_logs` 的 schema、写入字段和查询契约。

## 4. 验证

- [x] 4.1 检索确认 requestId/request-context 相关实现不在本次变更中残留。
- [x] 4.2 运行 `pnpm --filter @repo/utils-node lint` 验证通用包构建。
- [x] 4.3 运行 `pnpm --filter @repo/deploy-server lint` 验证服务端类型检查和构建。
- [x] 4.4 使用 `/tmp` 临时目录运行 logger，确认当天 `fastify.log` 和 `system.log` 实际创建。
- [x] 4.5 运行 devPretty stdout 验证，确认开发环境输出可读文本。
