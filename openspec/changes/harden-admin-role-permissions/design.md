## Context

仓库原本的 admin 权限链路分散在三个位置：admin 本地静态权限定义、`apps/server/src/router/routes/login/login.ts` 聚合角色权限，业务页面和部分服务端模块自行决定是否校验权限。表管理已经有后端权限 helper，但角色、用户、接口、任务和日志等系统管理能力仍主要依赖登录态和前端页面入口。

现状的核心问题是“能配置权限”不等于“权限会被执行”：普通用户页面权限在 store 中被临时放开，角色禁用不影响权限聚合，后端角色接口直接接收权限数组并序列化，缺少统一白名单校验和业务动作守卫。角色管理是权限系统的控制面，必须先把这条链路收紧，后续再扩展更细的数据权限才有基础。

这次设计不采用“每个接口 handler 内手写权限判断”的方式。接口权限应在接口定义处声明，实际鉴权由统一拦截逻辑执行；前端页面权限也应在路由定义处声明，实际菜单过滤和跳转拦截由统一路由守卫执行。

## Goals / Non-Goals

**Goals:**

- 建立前后端共享的运行时 admin 权限定义，保证权限 key、标签、类型和层级只有一个维护源。
- 前端页面权限注册在 admin route `meta`，后端接口权限注册在 `routeHandler`，新增页面和接口时使用方式简单且不需要改拦截器。
- 让角色启停、权限新增/修改、登录和 token 校验返回的权限集合保持一致。
- 恢复 admin 菜单和路由的页面权限过滤，并保留系统管理员全权限行为。
- 在服务端把权限守卫接入 `apps/server/src/router/authentication.ts` 的统一认证权限链，把前端隐藏按钮降级为体验层优化，而不是安全边界。
- 优化角色授权 UI，使授权人能看清权限分组、父子关系和半选状态，并只能提交有效权限 key。
- 兼容现有表管理权限 key 和表范围权限判断，不破坏已经完成的表管理能力。

**Non-Goals:**

- 不引入组织、租户、数据行级权限或 ABAC 策略引擎。
- 不新增权限版本表、权限审计表或角色继承模型。
- 不改造普通 client 的权限体系。
- 不改变现有登录 token 结构；权限仍由登录和 verify 接口实时返回。
- 不一次性重写所有 admin 页面 UI，只处理权限相关入口、按钮和授权组件。

## Decisions

### 1. 权限定义放到通用 shared 运行时包，admin 和 server 同源消费

新增通用公共运行时包，命名为 `@repo/shared`，放在 `packages/shared`。首版通过 `@repo/shared/permission` 子模块导出 admin 权限能力。该子模块只有一个手写源：`adminPermissionTree`。每个树节点都是一个可校验、可保存的权限 key；`route` 只是节点上的可选路由绑定，用于前端路由 `meta` 就近注册页面入口权限。

`@repo/shared/permission` 从权限树派生权限 key 联合类型、有效 key 集合、页面 route 映射、`isAdminPermissionKey`、`normalizeAdminPermissionKeys`、`adminPermissionKey` 和简单 all/any 判断函数。不维护按页面、动作、分组、数据范围拆开的并行常量或类型模型。

`@repo/shared` 是跨端运行时共享能力的承载包，不依赖 admin、server 或 `@repo/types`。admin 用它渲染授权树和进行路由/按钮判断，server 用它校验请求体权限 key、过滤历史脏数据和执行 guard。`@repo/types` 只 type-only 引用该包导出的类型，用于收窄 `LOGIN_RESPONSE.permission` 和 `RoleItem.permission`，不承载运行时权限定义。

包边界上，`@repo/shared` 只放前后端都能安全消费的常量、类型、轻量规则和纯函数；服务端数据库访问、Fastify 请求对象、admin 组件状态都不得进入该包。后续如果需要共享其他领域能力，使用子路径导出隔离，例如 `@repo/shared/permission`、`@repo/shared/constants`，避免再次形成一个混杂的工具包。

备选方案一是继续由 admin 定义权限树，server 复制一份白名单。这个方案短期改动少，但权限 key 漂移会继续发生，尤其是表管理已经在 server 侧硬编码了 `pages.sys.sys.table` 和 `actions.table.*`。备选方案二是把运行时权限树塞进 `@repo/types`，但当前 `@repo/types` 是偏 `.d.ts` 的类型契约包，改成运行时包会扩大影响面。最终选择通用 shared 公共运行时包。

### 2. 权限聚合以“启用角色 + 有效 key”为准

`getPermission` 和统一权限上下文只读取 `available = true` 的角色权限。聚合时使用 `Set` 去重，未知权限 key 不授予；角色保存和更新时遇到未知 key 直接拒绝，避免新脏数据进入。历史数据库里如果已有未知 key，读取授权详情时可以忽略它们，但不得把它们作为有效权限返回给登录态或 guard。

备选方案是只在前端过滤未知 key。这个方案不能防止绕过前端直接写入，也不能保护服务端 guard，所以不采用。

### 3. 前端权限注册在路由 meta，路由守卫统一执行

扩展 `apps/admin/src/router/type.ts` 的 `Meta`，增加页面权限字段，例如 `permissions?: readonly AdminPermissionKey[]`。每个需要页面权限的业务路由在 `apps/admin/src/router/routes.ts` 的 `meta` 中直接声明对应权限 key，例如 `sys.role` 使用 `adminPermissionKey('pages.sys.sys.role')`。

菜单和路由守卫不再依赖硬编码 route name 到权限 key 的映射，而是遍历 route meta 和当前用户权限集合判断。系统管理员仍拥有全部页面。没有 `meta.permission(s)` 的壳路由和公开路由保持兼容，由子路由权限决定是否显示入口。

备选方案是继续在 `store.userPage` 中用共享包维护“权限 key -> route name”映射。它能工作，但新增路由时容易忘记同步映射；把权限注册放在路由 `meta` 更贴近 Vue Router 的使用方式，也符合用户提出的约束。

### 4. 后端权限注册在 routeHandler，authentication.ts 统一执行

扩展 `apps/server/src/router/utils.ts` 的 `routerHandler` 入参，增加 `permission` 字段。该字段支持：

- 单个权限 key。
- 多个权限 key，默认全部满足。
- `{ anyOf: [...] }` 和 `{ allOf: [...] }`。
- 函数式规则，根据 `body/query/params` 返回权限规则，用于 `role/update`、`user/update`、`app/update` 这类按字段区分权限的接口。

`routeHandler` 只把权限规则写入 Fastify route config，不在业务 handler 中执行鉴权。现有 `initRoutes` 已经把 `authentication.authentication(req)` 注册为 Fastify `onRequest`，所以实现时优先在 `apps/server/src/router/authentication.ts` 对认证函数做组合：先完成身份认证并写入 `request.auth`，再从 `request.routeOptions.config` 读取权限规则，结合当前认证用户的权限上下文执行断言。这样权限声明跟接口定义在一起，执行入口跟身份认证在一起，业务 handler 保持干净。

不再从 `apps/server/src/router/index.ts` 额外注册 `useAdminPermissionGuard(fastify)`。如果实现时发现某些 Fastify 版本在 `onRequest` 阶段无法稳定读取 route config，再只调整 `initRoutes` 或认证插件的内部生命周期，而不是把权限逻辑分散到业务路由或每个 handler 中。权限不足必须抛出 `ROOT_ERROR('认证: 权限不足')` 并映射为 403，不能被身份认证失败逻辑统一压成 401。

备选方案是在每个 handler 内手写 `assert...`。这个方案已经被否定：它会污染业务逻辑、重复上下文读取、增加漏加风险，也不符合后续使用简单的目标。

### 5. 服务端提供统一 admin 权限上下文和断言 helper

在 `apps/server` 增加统一 helper，例如 `getAdminPermissionContext(user_id)`、`hasAdminPermission(context, key)`、`assertPermissionRule(context, rule)` 和 `assertRoutePermission(request)`。系统管理员根据 `ROOT.SYS_ADMIN_USER_ID` 直接通过；普通用户按启用角色聚合后的权限集合判断。guard 抛出的权限错误应映射为 403，并且在拒绝时不返回受保护数据或执行写入副作用。

读取类接口通常声明页面权限，写入类接口声明动作权限。角色管理至少拆出 `actions.role.create`、`actions.role.update`、`actions.role.delete`、`actions.role.toggle`、`actions.role.assign-permission`。用户、接口、任务、日志等模块也需要最小可用动作权限，避免拥有页面入口就能执行全部高风险操作。

### 6. 前端菜单、路由和按钮只做体验层限制

admin store 和菜单从 route meta 推导可访问页面；系统管理员返回所有页面。页面内的新增、编辑、删除、启停、授权等按钮使用动作权限控制可见或禁用，但任何按钮控制都不作为最终安全边界。

备选方案是只依赖服务端 guard，不恢复前端过滤。这样安全上可行，但用户体验差，且不满足已有表管理 spec 中“无页面权限不显示菜单并阻止路由”的要求。

### 7. 角色授权 UI 使用标准树控件表达层级和半选

角色编辑弹窗中的自定义递归 checkbox 可以替换为 Element Plus `ElTree` 的 checkbox 模式，或封装一个邻近的权限树组件。组件输入为共享权限树，输出为共享权限树中存在的有效 key 集合。UI 需要支持展开/折叠、搜索、半选态，并按 `adminPermissionTree` 的自然层级展示，不在 UI 层重新定义权限分类。

备选方案是在现有 checkbox 上补半选和搜索。现有组件没有稳定的父子状态模型，继续手写会让授权规则散落在 UI 层，不如用成熟树控件承载交互。

### 8. 表管理权限迁移到统一上下文，但保留表范围规则

表管理现有 `actions.table.view|preview|rename|reset`、`actions.table.*.<action>` 和 `actions.table.<table>.<action>` 规则保留。统一上下文只负责提供当前用户权限集合和系统管理员判定，表管理仍由自己的 helper 解释表范围权限。这样不会扩大本次变更范围，也不破坏已完成的表管理需求。

## Risks / Trade-offs

- [公共包引入运行时依赖影响构建顺序] → `@repo/shared` 只依赖 TypeScript，不依赖 admin/server，作为底层包被 Turbo 先构建。
- [权限 key 同源迁移影响类型引用] → admin 本地只保留实际使用的权限判断和路由过滤 helper，授权树直接消费公共权限树。
- [服务端接口漏声明 permission] → 通过代码评审和类型检查关注 `/api/sys/**` route config，允许显式标记公开/跳过，否则需要补声明。
- [前端路由漏声明 meta.permission] → 通过代码评审和类型检查关注 admin 业务路由，允许壳路由和公开路由跳过，业务页必须声明。
- [历史角色存在未知权限 key] → 聚合时忽略未知 key，保存时拒绝未知 key；必要时在角色详情 UI 中提示存在已失效权限。
- [恢复页面权限可能导致测试账号看不到页面] → 系统管理员保持全权限；普通测试账号需要显式角色权限，迁移说明里列出最小权限集合。
- [按钮隐藏和服务端拒绝短期不一致] → 以服务端 guard 为准，前端按钮只是体验层；接口返回 403 时前端显示统一错误。
- [权限模型继续扩展可能变复杂] → 本次只保留单一权限树和必要派生 helper，不引入策略表达式、角色继承或并行分类模型。

## Migration Plan

1. 清理此前尝试中散落到 route handler 内的权限断言，只保留公共包、payload 校验和计划内需要的结构改动。
2. 新增 `@repo/shared` 公共运行时包，并让 admin、server、`@repo/types` 通过 `@repo/shared/permission` 共享权限树、派生类型和校验函数。
3. 扩展 admin route `meta` 并在业务路由上声明页面权限，恢复菜单和路由守卫的统一判断。
4. 扩展 server `routeHandler` 的 `permission` 字段，在 `authentication.ts` 中组合身份认证和权限校验。
5. 修改权限聚合，过滤禁用角色和未知 key，并通过受影响包 lint/build 验证类型契约。
6. 在系统管理接口定义处声明权限规则，优先覆盖角色、用户、接口、任务、设置、日志和表管理。
7. 替换角色授权 UI，保证保存 payload 只包含有效权限 key。
8. 回归表管理权限，确认现有表范围权限和页面权限不受影响。

回滚策略：共享权限树可保留；若 guard 影响线上账号，可临时只给系统管理员开放或通过角色补齐权限后恢复。数据库结构不变，回滚代码不会要求迁移数据。

## Open Questions

- 前端路由 meta 字段命名使用 `permission`、`permissions` 还是 `access`？首版建议 `permissions?: readonly AdminPermissionKey[]`，语义清晰且可扩展。
- 系统管理各模块是否需要 read/list 与 write 分离到同一粒度，还是首版只拆高风险写操作？
- 历史未知权限 key 是否只静默忽略，还是在角色详情中展示“已失效权限”提示？
- 是否需要把角色权限变更写入用户操作日志？这不是本次闭环的必要条件，但对安全审计有价值。
