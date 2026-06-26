# 服务端路由约定

## Route 定义

服务端业务接口继续使用 `routerHandler` 定义。新代码可以分别读取 `body`、`query`、`params` 和 `auth`，旧代码继续使用 `body`、`__token`、`operator` 的兼容参数。

```ts
const { api } = routerHandler({
  url: '/sys/example/detail',
  method: 'POST',
  handler: async ({ body, auth, operator }) => {
    return 'ok';
  },
});
```

## 请求数据

- `body` 只表示请求体。
- `query` 只表示查询字符串。
- `params` 只表示路径参数。
- 不再使用 `body ?? query` 这类合并逻辑，新接口应按请求部位读取数据。

## 认证上下文

认证结果写入 `request.auth`，不再写入 `request.headers.__token`。兼容期内，`routerHandler` 会继续从 `request.auth` 派生 `__token` 和 `operator`。

## Schema

Fastify `schema` 能力保留在 `routerHandler` 入参中，但当前业务 route schema 接入按最新要求暂缓。后续恢复时，schema 应放在对应路由分组旁边，例如 `routes/login/schema.ts` 或 `routes/sys/table.schema.ts`，不要集中放在 `router/schemas.ts`。

## 路由加载

服务启动时会递归加载 `routes` 目录中的 route 文件。辅助文件、测试文件、类型文件和 schema 文件会被路由加载器跳过。
