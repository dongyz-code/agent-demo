# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` 仓库协作规范是本仓库的权威约定来源，包含代码风格、组件拆分、注释、提交与 PR 等详细规则。下文只补充架构与命令速查；与 `AGENTS.md` 冲突时以 `AGENTS.md` 为准。所有新增/修改注释必须使用中文（保留外部 API 名称、协议字段、库类型、错误码除外）。

## 工具链

pnpm/Turbo monorepo，Node `>=20.19`，pnpm `11.7.0`，TypeScript ESM，两个空格缩进、单引号、分号。

```bash
pnpm install                       # 安装工作区依赖
pnpm turbo build                   # 按依赖顺序构建所有包（outputs: dist/ build/）
pnpm turbo lint                    # 各包 lint + 类型检查；多数包的 lint 会跑 tsc/vue-tsc
pnpm pkg:sort                      # 修改任一 package.json 后排序工作区 package.json
pnpm build:prune                   # 生成 turbo prune 部署子集（packages/scripts）

# 启动单个应用（用 --filter 指定 @repo/* 包名）
pnpm --filter @repo/deploy-client dev   # React + Vite 客户端
pnpm --filter @repo/deploy-admin  dev   # Vue 3 + Vite 管理端
pnpm --filter @repo/deploy-server dev   # Node 服务端（tsx 直跑）

# 测试
pnpm --filter @repo/deploy-client test                 # Vitest 全量
pnpm --filter @repo/deploy-client test -- path/to/file # 单个测试文件
pnpm --filter @repo/deploy-client test -- -t "name"    # 按用例名过滤

# 数据库（apps/server，Drizzle + pg）
pnpm --filter @repo/deploy-server db:migrate    # 显式执行自管迁移（不要在启动时自动跑 DDL）
```

仓库无强制覆盖率目标；服务端没有测试 runner，测试仅配置在 `apps/client`（Vitest + jsdom + Testing Library，setup 在 `apps/client/src/test/setup.ts`）。交付前跑 `pnpm turbo lint`。

## 工作区结构

- `apps/client` — React 19 + TanStack Router/Query + zustand + Tailwind v4。路由声明在 `apps/client/src/router/routes.tsx`，页面用 `lazyRouteComponent` 动态导入；跳转走 `router/methods.ts` 的 helper，不要手写 URL；改路由要同步更新 `routes.tsx` 与路由类型。
- `apps/admin` — Vue 3 + vue-router + Pinia + Element Plus + Tailwind v4 + `@repo/ui`。视图在 `src/views`，API 聚合在 `src/api/index.ts`，路由在 `src/router`。搜索表单优先用 `VSchemaForm` 的 `mode="search"`（字段经 `columns` schema 声明），仅在 schema-form 覆盖不了时才自定义或用旧 `useFormItems`。
- `apps/server` — Fastify（经 `@repo/utils-node` 的 `createFastify`）+ Drizzle ORM + pg。入口 `src/index.ts` → `src/server.ts`；配置经 `@repo/configs` 的 `getSysConf` 加载（`src/configs`），数据库在 `src/database`（schema 拆成 `access/columns/log/main/structure/system/task`）。服务端不内置测试。
- `packages/*` — `types`（路由/通用类型）、`shared`（**跨端共享**的权限常量/类型/纯函数，禁止引入 DB、Fastify、浏览器等单端副作用，见 `packages/shared/src/index.ts` 顶部注释）、`configs`（运行时配置加载）、`ui`（Vue 组件库）、`openid`、`eslint-config`、`typescript-config`、`scripts`。
- `packages/utils/*` — 按运行环境拆分：`browser`、`node`、`common`、`redis`、`duckdb`、`elasticsearch`、`swagger`。客户端只引 `@repo/utils-browser`，服务端只引 `@repo/utils-node`。
- 不要编辑生成目录：`dist/`、`build/`、`.turbo/`、`node_modules/`，以及 `docker/temp/`。

## 服务端路由约定（关键）

详见 `apps/server/src/router/README.md`。启动时递归加载 `src/router/routes/**` 下的 route 文件，辅助/测试/类型/schema 文件被加载器跳过。

- 每个接口一个文件，文件名即路由（如 `routes/sys/app.create.ts` → `POST /sys/app/create`）。路由名用点分隔小写，如 `sys.user`。
- 用 `routerHandler({ url, method, permission, handler })` 定义；`handler` 分别解构 `body`/`query`/`params`/`auth`，不要再用 `body ?? query` 合并。
- 认证结果写入 `request.auth`（兼容期内 `routerHandler` 仍派生 `__token`/`operator`）。
- 权限用 `adminPermissionKey('pages.sys.sys.app')` / `'actions.table.view'` 这类点路径，键定义在 `@repo/shared/permission`。管理端权限校验由 `router/permission.ts` 的 `installRouteAdminPermission` 安装。
- AI 能力走 Vercel AI SDK（`ai` + `@ai-sdk/google` + `@ai-sdk/openai-compatible`）。

## OpenSpec

需求/变更走 OpenSpec（`openspec/`，spec-driven schema）。所有产出物必须用简体中文撰写；PR 应关联对应 OpenSpec change。
