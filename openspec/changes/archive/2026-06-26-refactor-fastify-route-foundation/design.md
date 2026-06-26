## Context

当前服务端路由由 `packages/types` 提供共享契约，后端通过 `routerHandler` 编写业务处理，启动时从生成的 `routes-single-file.ts` 导入 route，再由 `creatFastify` 注册到 Fastify。这个模式降低了新增接口成本，但几个基础行为已经偏离 Fastify 生态：

- 类型契约只有 `req/resp`，工具层把 `POST` 固定映射到 `body`，把其他方法固定映射到 `query`，无法表达 `params`，也无法同时表达 `body + query`。
- route 基本没有 `schema`，共享类型只在编译期有效，运行时非法请求会进入业务代码。
- 认证信息写入 `request.headers.__token`，污染 headers 且类型不自然。
- 错误响应统一 HTTP 200，依赖响应体里的 `error` 表达失败。
- 响应包裹通过逐个 route 注入 `preSerialization`，并禁止业务 route 自己使用 `preSerialization`。
- `route:make` 生成单文件聚合路由，增加了构建脚本和生成产物维护成本。

约束：必须保留现有类型能力和大部分 route 写法；不引入 DDD、CQRS、IOC 容器或复杂模式；优先可读性、低迁移风险和 Fastify 原生能力。

## Goals / Non-Goals

**Goals:**

- 保留 `api('/path', data)`、`RoutesSource[T]['req']`、`RoutesSource[T]['resp']` 等现有类型使用能力。
- 扩展 API 契约，使单个 route 可以声明 `body`、`query`、`params`，并兼容旧 `req`。
- 支持 Fastify `schema` 校验，route 可以用原生 JSON Schema 或 TypeBox 产物。
- 拆分 Fastify 工具库职责，让创建实例、插件注册、路由加载、错误处理、响应包裹、认证上下文各自清晰。
- 错误响应返回合适的 HTTP 状态码，同时保留统一错误体 `{ error: { code, msg } }`。
- 移除 `route:make` 和 `routes-single-file.ts` 生成步骤，改用目录动态加载 route 文件。
- 认证信息改为 Fastify request 装饰字段，例如 `request.auth`，并补充类型。
- 响应包裹改为统一策略，不禁止业务 route 自定义 `preSerialization`。

**Non-Goals:**

- 不重写所有业务路由的业务逻辑。
- 不引入新的应用分层模型、命令总线、依赖注入容器或仓储模式。
- 不在本变更中重做前端 HTTP 客户端，只做必要兼容。
- 不强制所有接口一次性补齐 schema；高风险接口优先，其他接口可逐步补齐。
- 不改变数据库结构、任务系统或日志表结构。

## Decisions

### 1. API 契约采用兼容扩展，而不是替换 `req`

新增轻量契约形态：

```ts
type ApiItem = {
  method: Method;
  req?: unknown;
  body?: unknown;
  query?: unknown;
  params?: unknown;
  resp?: unknown;
};
```

兼容规则：

- 如果声明了 `body/query/params`，优先使用这些字段。
- 如果只声明旧 `req`，则保持现有行为：默认 POST 作为 `body`，GET 作为 `query`。
- `resp` 未声明时仍默认 `'ok'`。

理由：现有 `packages/types` 的契约和大量 route 已经基于 `req/resp`，直接替换成本高。兼容扩展可以先支持新能力，再渐进迁移旧类型。

替代方案：彻底移除 `req`，只保留 `body/query/params`。这个方案类型更干净，但会一次性影响前后端调用和所有 route，迁移风险不符合当前目标。

### 2. 类型工具集中到共享类型层，Node 和浏览器工具复用同一组概念

把 `ApiTreeToList`、`JoinPath`、`ApiSource`、请求参数推导等类型命名和实现收敛到一个清晰的公共类型模块，Node 侧导出 `APISource/APIRoutes` 兼容别名，浏览器 `getAxios` 使用同一套契约推导。

类型优化方向：

- 保留必要的递归 flatten，但减少 `UnionToIntersection` 暴露面，把它藏在内部 `FlattenApiRoutes<T>`。
- 增加 `RouteBody<T>`、`RouteQuery<T>`、`RouteParams<T>`、`RouteResponse<T>` 等小类型，避免在 `APIRoutes` 内部嵌套复杂条件类型。
- `APIRoutes` 继续作为兼容导出，内部改成组合小类型。

理由：现有 API 树结构本身需要从嵌套对象推导完整路径，完全去掉递归类型不现实；但可以把“难懂的部分”封装起来，让业务侧看到更直观的类型。

替代方案：改为扁平 API 契约表。这个方案类型最简单，但会改变 `@repo/types` 当前组织方式，不适合本轮。

### 3. route 定义新增 `defineRoute/routerHandler` 兼容层

保留现有 `routerHandler({ url, method, handler })` 入口，同时升级参数：

- 支持 `schema?: FastifySchema`。
- 支持 handler 参数中分别读取 `body`、`query`、`params`。
- 保留 `body` 作为旧写法兼容，旧 route 继续拿到旧 `req` 对应数据。
- 新增 `auth` 或 `operator?: string`，不再依赖 headers。

新 route 可逐步使用更明确的写法：

```ts
routerHandler({
  url: '/sys/user/detail',
  method: 'POST',
  schema,
  handler: async ({ body, auth }) => {}
});
```

理由：route 文件数量较多，兼容层能降低迁移风险，并让团队新人继续使用一个简单入口。

替代方案：每个 route 直接导出原生 `RouteOptions`。这个方案最贴近 Fastify，但会重复鉴权、响应、类型胶水逻辑。

### 4. schema 校验使用 Fastify 原生 `schema`

基础库只要求 route 可传入 `FastifySchema`，不强制引入新的 schema 库。现有 `@repo/utils-swagger` 的 TypeBox 产物可以作为可选调用方能力接入，但 `@repo/utils-node` 不依赖它。

理由：Fastify 已内置基于 JSON Schema 的校验与序列化能力；保持基础库依赖简单，更符合内部工具库定位。

替代方案：强制使用 TypeBox 或 Zod。TypeBox 和 Fastify 契合较好，但会把所有 route schema 写法绑定到一个库；Zod 需要额外转换，复杂度更高。

### 5. 错误处理回归 HTTP 状态码

错误处理统一输出：

```ts
reply.code(statusCode).send({
  error: {
    code,
    msg
  }
});
```

默认规则：

- 认证失败返回 401。
- schema 校验失败返回 400。
- 未授权返回 403。
- 未知业务错误默认 500，明确业务错误可携带 `statusCode`。
- 保留前端读取 `response.data.error` 的能力，但前端需要允许非 2xx 响应进入统一错误处理。

理由：HTTP 状态码是网关、浏览器、监控、Fastify 日志和 Axios 的共同语义，不应全部伪装成 200。

替代方案：继续 HTTP 200，仅调整错误体。这个方案兼容性最高，但会继续损害可观测性。

### 6. 认证信息使用 request 装饰字段

基础库通过 `fastify.decorateRequest('auth', null)` 或类型声明扩展，在认证 hook 中写入 `request.auth`。业务代码通过 `request.auth` 或 `routerHandler` 注入的 `auth/__token/operator` 读取。

兼容期可以保留 `__token` handler 参数，但来源改为 `request.auth`，不再写入 headers。

理由：Fastify 推荐通过 decorate 扩展 request/reply；headers 应保留为外部输入，不适合放内部状态。

替代方案：只放到 `request.user`。这个命名常见，但当前 token 也支持 Basic Auth 的 app client，`auth` 比 `user` 更中性。

### 7. 响应包裹使用全局 onSend 策略

不再给每个 route 写入 `preSerialization`。改为全局 `onSend` hook 或 Fastify 插件，规则为：

- 普通对象/数组响应包裹为 `{ data: payload }`。
- 已经是 `{ data: ... }` 或 `{ error: ... }` 的响应不重复包裹。
- string、Buffer、stream、null、文件下载等响应不包裹。
- route 自定义 `preSerialization` 可以继续生效，响应包裹在更靠后的统一阶段处理。

理由：把统一响应行为放在统一插件中，减少 route 级副作用，也不阻止业务使用 Fastify hook。

替代方案：使用全局 `preSerialization`。这仍会和业务 `preSerialization` 顺序耦合，且当前痛点正来自该 hook 被路由层占用。

### 8. 路由加载改为目录动态导入，移除生成步骤

新增 `getAPIByDir({ dir, prefix, log })`，递归读取 `routes` 目录下的 `.ts/.js` route 文件，按稳定顺序动态 import 默认导出的 `RouteOptions` 或 route 数组。`apps/server/src/router/index.ts` 直接传入 `routes` 目录，不再通过 `findFileByNameSync` 找 `routes-single-file`。

构建后运行时读取编译产物目录中的 `.js` 文件；开发时由 `tsx` 读取 `.ts` 文件。`collectFiles` 需要排除 `.d.ts`、测试文件和非 route 辅助文件。

理由：当前已经有递归收集文件能力，生成单文件只是绕一圈；运行时目录加载更少脚本、更少生成产物，也更容易理解。

替代方案：维护显式 `routes/index.ts` 手工导出。这个方案最稳定，但新增 route 时需要改两个文件，容易遗漏。

## Risks / Trade-offs

- 非 200 错误会改变 Axios reject 路径 -> 更新前端拦截器，让 HTTP 错误也读取 `response.data.error`，并保留兼容测试。
- 目录动态导入可能误导入非 route 文件 -> 约定 route 目录只放 route 文件，或文件名过滤并校验默认导出结构。
- schema 一次性补齐成本较高 -> 分阶段处理，先覆盖登录、上传、认证、表结构管理等高风险接口。
- `request.auth` 类型扩展需要处理包边界 -> 在 `@repo/utils-node` 暴露声明合并类型，并在 server 侧补充具体 auth 泛型。
- 响应包裹 hook 可能影响文件下载或 multipart 响应 -> 明确跳过 string、Buffer、stream、null、已发送响应和显式 opt-out。
- 兼容旧 `req` 会让类型系统短期存在两种写法 -> 文档和新 route 示例只推荐 `body/query/params`，旧写法仅用于迁移。

## Migration Plan

1. 调整共享类型工具，新增 `body/query/params` 契约并保留 `req/resp` 兼容。
2. 在 `@repo/utils-node` 中拆分 Fastify 工具模块，新增 `createFastify`，保留 `creatFastify` 兼容导出。
3. 升级 `routerHandler`，让旧 route 不改业务代码也能通过类型检查，同时新 route 可使用 `query/params/schema/auth`。
4. 实现统一错误处理和响应包裹插件，前端拦截器兼容非 2xx 错误体。
5. 实现目录动态路由加载，移除 `routes-single-file.ts` 依赖，再从 `build/lint` 脚本移除 `route:make`。
6. 将认证信息迁移到 `request.auth`，保留 handler 参数 `__token` 的兼容期映射。
7. 业务 route 的 schema 接入按当前要求暂缓；本阶段只保留基础设施对 Fastify `schema` 的支持，并确保未声明 schema 的 route 可继续运行。

回滚策略：保留旧 `creatFastify`、旧 `req` 契约、旧 `routerHandler` 参数和旧前端错误体解析；如果目录动态加载出现问题，可以临时恢复 `routes-single-file.ts` 路径作为 fallback。

## Open Questions

- 是否需要在本变更中让 `@repo/utils-swagger` 的 TypeBox helper 同步支持 `query/params`，还是仅保留 Fastify `schema` 接口后续接入？
- 错误对象是否统一增加 `statusCode` 字段到 `ROOT_ERROR`，还是在错误处理器中维护错误码到 HTTP status 的映射？
- 响应包裹是否需要为个别 route 提供显式 opt-out，例如文件下载或健康检查？
