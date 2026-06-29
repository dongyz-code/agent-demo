## Why

当前 admin 角色管理可以保存权限树，但权限定义只在前端静态维护，普通用户页面权限被临时放开，服务端多数系统管理接口也缺少业务权限守卫。角色权限因此没有形成从配置、登录聚合、前端展示到服务端强制校验的闭环，角色启停、授权和高风险操作都存在一致性与安全风险。

## What Changes

- 新增通用 admin 权限能力，以单一 `adminPermissionTree` 统一描述后台权限 key、展示名、层级和可选路由绑定。
- 新增前后端共享的运行时 `@repo/shared` 包，admin 和 server 都从 `@repo/shared/permission` 读取权限树、派生类型和校验函数。
- admin 页面权限注册到路由 `meta` 中，由统一路由守卫读取并过滤菜单/阻止跳转。
- server 接口权限注册到 `routeHandler` 中，由 `apps/server/src/router/authentication.ts` 中的统一认证权限拦截链读取 route config 并在业务 handler 前拦截。
- 调整权限聚合逻辑，只聚合启用角色的有效权限，并让角色禁用在登录和 token 校验刷新时生效。
- 为角色管理、用户管理、接口管理、任务管理、日志查看等系统管理接口补充声明式权限规则，角色管理自身增加新增、编辑、删除、启停、授权等操作权限。
- 优化角色授权交互，使权限选择能清晰表达父子层级、半选状态、搜索和分组，避免隐藏无效 key 或误选。

## Capabilities

### New Capabilities

- `admin-access-control`: 定义 admin 权限模型、角色授权、权限聚合、前端可见性控制和服务端强制校验的行为契约。

### Modified Capabilities

- 无。现有 `schema-table-management` 的表管理权限要求保持不变，本次变更会在实现层复用新的通用权限上下文承载它。

## Impact

- `packages/shared`：新增通用跨端运行时共享包，首个子模块承载 admin 权限树、派生类型、校验函数和规则工具，后续可继续放置其他前后端共享的轻量常量与纯函数。
- `packages/types`: 引用公共权限包导出的类型，收窄登录响应和角色 DTO 的权限字段。
- `apps/server`: 扩展 `routeHandler` 权限注册能力，在 `authentication.ts` 组合身份认证与权限校验，调整登录权限聚合和角色权限 payload 校验。
- `apps/admin`: 在路由 `meta` 注册页面权限，恢复菜单/路由权限过滤，调整角色管理权限树、按钮可见性和权限编辑流程。
- 数据库：优先复用现有 `role.permission` 字段，不引入表结构变更；如实现阶段确认需要审计或版本化权限定义，再单独提出后续变更。
- 验证：需要覆盖权限聚合、角色禁用、未知权限 key 拒绝、普通用户访问受限接口、admin 菜单/路由过滤和角色授权 UI 行为。
