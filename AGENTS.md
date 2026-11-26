# 仓库协作规范

## 项目结构与模块组织

这是一个 pnpm/Turbo monorepo。应用放在 `apps/`：`apps/client` 是 React/Vite 客户端，`apps/admin` 是 Vue/Vite 管理端，`apps/server` 是 TypeScript Node 服务。共享包放在 `packages/`，包括 `types`、`shared`、`configs`、`ui`、`eslint-config`、`typescript-config`，以及 `packages/utils/*` 下的工具包。各包源码放在自己的 `src/` 下；资源文件放在 `src/assets`、`src/static` 或 `apps/server/static`。不要编辑生成目录 `dist/`、`build/`、`.turbo/` 或 `node_modules/`。

## 构建与开发命令

使用 Node `>=20.19` 和 pnpm `11.7.0`。

- `pnpm install` 安装工作区依赖。
- `pnpm turbo build` 按依赖顺序构建工作区包。
- `pnpm turbo lint` 运行各包的 lint 和类型检查任务。
- `pnpm --filter @repo/client dev` 启动 React 客户端。
- `pnpm --filter @repo/admin dev` 启动 Vue 管理端。
- `pnpm --filter @repo/server dev` 使用 `tsx` 启动服务端。
- 服务端无独立迁移命令：启动时自动建缺失表并报漂移；已有表的索引/trigger 同步走前端 sync 操作，列结构变更走 reset。

## 代码风格与命名约定

以下规则统一适用于服务端、React、Vue 和共享包中的 JS/TS 代码，包括 JSX 与 Vue 模板中的表达式。组件、Hook 和组合式函数按各框架惯例组织。

使用 TypeScript ESM、两个空格缩进、单引号和分号。应用内部优先使用 `@` 别名，工作区包使用 `@repo/*`。React/Vue 组件和导出类型使用 `PascalCase`，函数和变量使用 `camelCase`，已有约定的路由名使用点分隔小写形式，例如 `sys.user`。ESLint flat config 来自 `@repo/eslint-config`；许多 `lint` 脚本也会运行 `tsc`、`vue-tsc` 或构建。

### 条件与控制流程

- `if`、`else`、`for`、`for...of`、`for...in`、`while` 和 `do...while` 的语句体一律使用大括号，即使只有一行 `return` 或 `throw`。允许使用 `else if` 串联分支。
- 禁止使用三元表达式 `condition ? a : b`，简单二选一也使用明确分支。优先通过提前返回减少嵌套；复杂条件使用含义明确的具名变量或函数。
- 保留 `??` 处理 `null` / `undefined` 默认值、`?.` 处理可选访问；合法的 `0`、`false` 和空字符串不能因宽泛的兜底被替换。

```ts
if (!user) {
  throw new Error('用户不存在');
}
```

### 类、函数与封装

- 需要维护状态、资源或生命周期的模块使用类，例如缓存空间、任务执行器；纯计算、校验和数据转换使用普通函数。React/Vue 的状态组织沿用框架惯例。
- 类使用私有字段保护内部状态，通过职责明确的业务方法操作状态；优先组合。引入继承时，应有实际存在的共同契约与实现复用需求。
- 抽取函数、类或模块时，必须承担明确职责：维护状态、集中业务规则、隐藏底层细节或消除实际重复。独立且复杂的流程即使只有一个调用方，也可以封装。
- 只有转发调用、改名或补类型的包装不单独成层；直接使用现有能力。不要为尚未出现的多种实现预先引入工厂、基类或策略体系。

前端不要为了类型或转发再额外拆一层 service。现有请求函数已提供 TypeScript 类型，直接复用或按原有调用方式使用，避免产生只做包装的 service 层。

### 输入校验与数据转换

- 外部数据在入口解析和校验，进入内部流程后使用明确类型；内部函数按已声明的输入契约工作。
- 无效数据按约定报错，缺省值按明确的业务规则处理。避免在各层重复做隐式类型转换、补默认值和猜测式兼容。
- 数据标准化必须有具体业务依据，例如邮箱去首尾空格。转换函数用具体名称表达职责，例如 `parsePageSize`、`trimEmail`；避免用宽泛的 `normalize` / `normalizeOptions` 函数同时承担校验、转换、补默认值和旧格式兼容。

### 注释

新增或修改注释使用中文，外部 API 名称、协议字段、库类型或错误码保留原文。公开接口必须提供清晰的中文 TSDoc 或属性注释；业务约束、数值单位、副作用和不明显的行为必须在对应位置说明，例如 TTL 的时间单位、清理缓存后的并发回填行为。内部直观代码无需逐项注释，参数和返回值仅在含义、约束或行为需要解释时补充说明。注释应解释业务规则和设计原因，避免只复述标识符或代码。

## 系统管理员权限

ROOT.SYS_ADMIN_USER_ID 拥有全部权限，可查看和操作全部业务数据。

## 组件拆分原则

- 页面组件应优先承担路由、筛选、列表数据、入口状态和跨组件刷新，不要把复杂表单、弹窗、抽屉和异步流程全部堆在同一个文件里。
- 弹窗、抽屉、侧边面板等独立交互单元应拆成聚焦组件；默认按“每个弹窗一个组件”拆分，由组件内部维护本流程的表单状态、加载状态、校验和提交动作。
- 多个组件复用的展示文案、纯计算函数、类型别名和静态选项，应放在邻近的 `utils.ts` 或 `types.ts` 中；通用工具只承载可复用逻辑，不隐藏页面专属流程。
- 拆分以边界清晰和可维护为目标，避免为了单行模板、一次性静态片段或没有独立状态的内容过度抽象。
- `apps/admin` 中的搜索表单优先使用 `VSchemaForm` 的 `mode="search"`，字段通过 `columns` schema 声明，搜索、重置、展开收起和额外动作优先走 schema-form 内置能力；只有 schema-form 明确无法覆盖场景时，才使用自定义表单或旧 `useFormItems`，并在代码中保持原因清晰。

## 提交与 Pull Request 规范

Git 历史使用 Conventional Commit 风格，例如 `feat: init`。提交信息保持简短、祈使语气，并在有帮助时加 scope，例如 `fix(client): handle api errors`。Pull Request 应描述变更、列出验证命令、关联 issue，UI 变更需要附截图。涉及迁移、生成路由或依赖变更时要明确说明。

## Agent 专用说明

客户端路由变更时，同时更新 `apps/client/src/router/routes.tsx` 和路由类型。页面组件使用 `lazyRouteComponent` 和动态导入声明。路由元信息放在 `meta` 中；跳转使用 `apps/client/src/router/methods.ts` 中的 helper，不要手写 URL。
