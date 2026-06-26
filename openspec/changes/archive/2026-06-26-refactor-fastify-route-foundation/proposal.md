## Why

当前 Fastify 基础工具库已经提供了统一路由、认证和响应包裹能力，但类型设计和运行时行为存在脱节：请求类型只区分 `POST body` 和 `非 POST query`，缺少 `params` 与 schema 校验，错误响应固定返回 HTTP 200，认证信息写入 headers，响应包裹通过逐个 route 注入 `preSerialization` 并禁止业务自定义 hook。现在需要在不引入 DDD、CQRS、IOC 容器或复杂设计模式的前提下，把这套内部基础设施整理成更符合 Fastify 生态、易读且可维护的形态。

## What Changes

- 保留现有共享 API 类型能力，并扩展路由契约以支持 `body`、`query`、`params` 的独立类型。
- 支持 Fastify `schema` 校验，让 route 定义可以同时拥有请求/响应类型与运行时校验。
- 优化 `APIRoutes`、`APISource` 等类型工具，降低类型体操复杂度，同时不破坏现有 `req/resp` 契约和 `routerHandler` 使用方式。
- 重构 Fastify 工具库文件结构，拆分创建服务、路由加载、响应包裹、错误处理、认证上下文等职责。
- 将错误响应改为返回合适的非 200 HTTP 状态码，并保持前端仍可通过统一错误体读取业务错误码和消息。
- 评估并移除 `route:make` 生成步骤，优先改为运行时或构建期可直接维护的显式/自动路由加载方式，不再依赖生成 `routes-single-file.ts`。
- 将认证信息从 `request.headers.__token` 改为 Fastify 友好的 request 装饰字段，并提供类型支持。
- 将响应包裹从逐个 route 注入 `preSerialization` 改为统一 hook 或 reply serializer 策略，允许业务 route 使用自己的 `preSerialization`。
- 保持改造兼容现有 route 文件，分阶段迁移，不要求一次性重写所有业务接口。

## Capabilities

### New Capabilities

- `server-fastify-route-foundation`: 定义服务端 Fastify 基础工具库的路由定义、schema 校验、认证上下文、错误响应、响应包裹和路由加载行为。

### Modified Capabilities

- `shared-types-package`: 扩展共享 API 路由契约，使前后端类型能够表达 `body`、`query`、`params`，同时保持现有 `req/resp` 使用兼容。

## Impact

- 影响 `packages/utils/node/src/plugins/fastify`、`packages/utils/node/src/plugins/routes`、`packages/utils/node/src/plugins/authorization` 的公共 API 和内部职责拆分。
- 影响 `apps/server/src/router` 下的 `routerHandler`、认证接入、route 定义方式和上传等高风险接口的 schema 校验接入。
- 影响 `packages/types/src/routes` 与公共 API 类型工具，前端 `apps/client`、`apps/admin` 的 `getAxios<API>` 类型推导需要继续兼容。
- 影响 `apps/server/package.json` 中 `route:make`、`build`、`lint` 脚本，若移除生成步骤，需要同步更新服务启动和构建流程。
- 不新增 DDD、CQRS、IOC 容器或复杂设计模式，不为了抽象牺牲可读性。
