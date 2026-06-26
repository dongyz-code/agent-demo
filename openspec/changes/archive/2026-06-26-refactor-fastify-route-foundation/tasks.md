## 1. 共享 API 类型契约

- [x] 1.1 新增或整理共享 API 类型工具，支持 `req/resp` 兼容契约和新的 `body/query/params/resp` 契约
- [x] 1.2 将 `APISource`、`APIRoutes` 改为基于小型 helper 类型组合实现，并保留现有导出名称
- [x] 1.3 为 route body、query、params、response 增加命名清晰的推导类型，并隐藏复杂递归 flatten 实现
- [x] 1.4 更新 `packages/utils/browser/src/http.ts` 的 `getAxios<API>` 类型推导，保持现有调用方式可用并支持 GET query
- [x] 1.5 增加类型级验证用例或最小编译用例，覆盖旧 `req`、新 `body/query/params`、默认 `resp: 'ok'`

## 2. Fastify 工具模块拆分

- [x] 2.1 拆分 `packages/utils/node/src/plugins/fastify`，将创建实例、类型导出、路由加载、错误处理、响应包裹分到职责明确的文件
- [x] 2.2 新增拼写正确的 `createFastify`，并将 `creatFastify` 保留为兼容别名
- [x] 2.3 调整基础插件注册配置，使 cors、cookie、formbody、multipart 可传入选项并支持按需关闭
- [x] 2.4 为 multipart 设置可配置 limits，避免上传接口默认无边界接收文件
- [x] 2.5 清理重复或过时导出，包括重复 multipart side-effect import 和不再使用的 hook helper

## 3. 路由定义与 schema

- [x] 3.1 升级 `apps/server/src/router/utils.ts` 的 `routerHandler`，支持 `schema`、`body`、`query`、`params` 和 `auth`
- [x] 3.2 保留旧 handler 的 `body`、`__token`、`operator` 兼容参数，来源改为新的请求上下文
- [x] 3.3 移除 `body ?? query` 合并逻辑，新契约 route 必须按请求部位读取数据
- [x] 3.4 将 route 传入的 Fastify `schema` 原样注册到 route options
- [x] 3.5 增加代表性 route 的类型检查覆盖，验证旧 route 不改业务 handler 仍可编译

## 4. 认证上下文

- [x] 4.1 调整认证插件，在 Fastify request 上声明并初始化 `auth` 装饰字段
- [x] 4.2 将 JWT 认证结果写入 `request.auth`，停止写入 `request.headers.__token`
- [x] 4.3 将 Basic Auth 结果写入 `request.auth`，并能区分用户身份和接口 client 身份
- [x] 4.4 更新 `apps/server/src/router/authentication.ts` 和相关 handler，使用 `request.auth` 派生兼容参数
- [x] 4.5 验证登录、鉴权忽略列表、Basic Auth 接口调用路径在新认证上下文下行为一致

## 5. 错误响应与响应包裹

- [x] 5.1 实现统一错误归一化函数，将认证失败、schema 校验失败、权限错误和未知错误映射到合适 HTTP 状态码
- [x] 5.2 调整 Fastify error handler 和 onRequest 鉴权失败处理，返回非 200 状态码和 `{ error: { code, msg } }`
- [x] 5.3 更新前端 Axios 拦截器，使非 2xx 响应也能读取 `response.data.error`
- [x] 5.4 将响应包裹改为统一 hook 或插件，普通成功响应返回 `{ data: payload }`
- [x] 5.5 确保 `{ data }`、`{ error }`、string、Buffer、stream、null 和已发送 reply 不被重复包裹
- [x] 5.6 删除逐个 route 注入 `preSerialization` 的逻辑，并允许业务 route 自定义 `preSerialization`

## 6. 路由加载与生成步骤移除

- [x] 6.1 新增 `getAPIByDir`，递归加载 routes 目录中的 `.ts/.js` route 文件并按稳定顺序返回 route 列表
- [x] 6.2 为路由加载器增加默认导出结构校验，并跳过 `.d.ts`、测试文件和明确约定的非 route 文件
- [x] 6.3 更新 `apps/server/src/router/index.ts`，直接从 routes 目录加载 route，不再查找 `routes-single-file`
- [x] 6.4 从 `apps/server/package.json` 的 `build` 和 `lint` 中移除 `route:make` 依赖
- [x] 6.5 删除或停止维护生成产物 `apps/server/src/router/routes-single-file.ts` 和 `make.ts`
- [x] 6.6 验证开发环境和构建产物环境都能加载同一批 route

## 7. 高风险接口 schema 接入

- [x] 7.1 按最新要求移除登录相关接口 schema 接入，暂缓业务 schema
- [x] 7.2 为 `main/app-upload` 补充 multipart 字段校验、文件数量校验、hash/size/name/id 校验和缺失 info 错误
- [x] 7.3 按最新要求移除表结构管理 plan/apply schema 接入，暂缓业务 schema
- [x] 7.4 按最新要求移除列表类接口 schema 接入，暂缓业务 schema
- [x] 7.5 确保未补 schema 的旧 route 仍可通过类型检查

## 8. 验证与收尾

- [x] 8.1 运行 `pnpm --filter @repo/utils-node lint`，验证工具包类型检查和构建
- [x] 8.2 运行 `pnpm --filter @repo/deploy-server lint`，验证服务端类型检查和路由加载
- [x] 8.3 运行受影响前端包的类型检查或测试，验证 Axios 错误处理和 API 类型推导兼容
- [x] 8.4 手动或脚本验证认证失败返回 401、schema 失败返回 400、未知错误返回 500
- [x] 8.5 手动或脚本验证成功响应包裹、业务 `preSerialization`、上传接口和目录路由加载
- [x] 8.6 更新必要的开发说明，记录新 route 推荐写法、schema 写法和旧 `req` 兼容期规则
