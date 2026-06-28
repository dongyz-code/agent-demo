# 仓库协作规范

## 项目结构与模块组织

这是一个 pnpm/Turbo monorepo。应用放在 `apps/`：`apps/client` 是 React/Vite 客户端，`apps/admin` 是 Vue/Vite 管理端，`apps/server` 是 TypeScript Node 服务。共享包放在 `packages/`，包括 `types`、`ui`、`configs`、`openid`、`scripts`，以及 `packages/utils/*` 下的工具包。各包源码放在自己的 `src/` 下；资源文件放在 `src/assets`、`src/static` 或 `apps/server/static`。不要编辑生成目录 `dist/`、`build/`、`.turbo/` 或 `node_modules/`。

## 构建、测试与开发命令

使用 Node `>=20.19` 和 pnpm `11.7.0`。

- `pnpm install` 安装工作区依赖。
- `pnpm turbo build` 按依赖顺序构建工作区包。
- `pnpm turbo lint` 运行各包的 lint 和类型检查任务。
- `pnpm --filter @repo/deploy-client dev` 启动 React 客户端。
- `pnpm --filter @repo/deploy-admin dev` 启动 Vue 管理端。
- `pnpm --filter @repo/deploy-server dev` 使用 `tsx` 启动服务端。
- `pnpm --filter @repo/deploy-client test` 运行 Vitest。
- `pnpm --filter @repo/deploy-server db:generate` 和 `db:migrate` 用于处理 Drizzle schema 变更。
- 修改依赖后运行 `pnpm pkg:sort` 排序工作区 `package.json`。

## 代码风格与命名约定

使用 TypeScript ESM、两个空格缩进、单引号和分号。应用内部优先使用 `@` 别名，工作区包使用 `@repo/*`。React/Vue 组件和导出类型使用 `PascalCase`，函数和变量使用 `camelCase`，已有约定的路由名使用点分隔小写形式，例如 `sys.user`。ESLint flat config 来自 `@repo/eslint-config`；许多 `lint` 脚本也会运行 `tsc`、`vue-tsc` 或构建。

新增或修改注释时必须使用中文，除非是在保留外部 API 名称、协议字段、库类型或错误码。新增或修改函数、方法、类、hook、导出常量、接口、类型别名、泛型参数、函数参数、返回值或类型字段时，添加清晰的中文 TSDoc 或属性注释。注释应说明用途、输入含义、返回值、副作用、约束条件和不明显的业务规则。避免只复述标识符的空洞翻译式注释，例如“设置值”；优先写能帮助后续维护者理解为什么存在、如何使用的说明。

## 组件拆分原则

- 页面组件应优先承担路由、筛选、列表数据、入口状态和跨组件刷新，不要把复杂表单、弹窗、抽屉和异步流程全部堆在同一个文件里。
- 弹窗、抽屉、侧边面板等独立交互单元应拆成聚焦组件；默认按“每个弹窗一个组件”拆分，由组件内部维护本流程的表单状态、加载状态、校验和提交动作。
- 多个组件复用的展示文案、纯计算函数、类型别名和静态选项，应放在邻近的 `utils.ts` 或 `types.ts` 中；通用工具只承载可复用逻辑，不隐藏页面专属流程。
- 拆分以边界清晰和可维护为目标，避免为了单行模板、一次性静态片段或没有独立状态的内容过度抽象。

## 测试规范

当前启用的测试配置在 `apps/client`，使用 Vitest、jsdom、Testing Library 和 `apps/client/src/test/setup.ts`。测试文件放在被覆盖代码附近，命名为 `*.test.ts` 或 `*.test.tsx`。客户端测试运行 `pnpm --filter @repo/deploy-client test`，交付前运行 `pnpm turbo lint`。仓库没有强制覆盖率目标；对变更行为和边界情况添加聚焦测试。

## 提交与 Pull Request 规范

Git 历史使用 Conventional Commit 风格，例如 `feat: init`。提交信息保持简短、祈使语气，并在有帮助时加 scope，例如 `fix(client): handle api errors`。Pull Request 应描述变更、列出验证命令、关联 issue 或 OpenSpec change，UI 变更需要附截图。涉及迁移、生成路由或依赖变更时要明确说明。

## Agent 专用说明

客户端路由变更时，同时更新 `apps/client/src/router/routes.tsx` 和路由类型。页面组件使用 `lazyRouteComponent` 和动态导入声明。路由元信息放在 `meta` 中；跳转使用 `apps/client/src/router/methods.ts` 中的 helper，不要手写 URL。
