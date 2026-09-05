## MODIFIED Requirements

### Requirement: 共享权限定义
系统 SHALL 通过通用 `@repo/shared` 运行时包提供 admin、server 和 client 共享的权限定义，以单一 `adminPermissionTree` 维护权限 key、展示名称、层级关系和可选 route 绑定，并从该树派生类型和校验函数。

#### Scenario: admin 渲染授权树
- **WHEN** admin 角色编辑页面加载权限配置
- **THEN** 页面 MUST 使用共享权限定义生成权限树
- **THEN** 页面 MUST NOT 维护另一份独立的权限 key 白名单

#### Scenario: server 校验权限 key
- **WHEN** 服务端处理角色创建或角色更新请求中的权限列表
- **THEN** 服务端 MUST 使用共享权限定义校验每个权限 key
- **THEN** 请求包含未知权限 key 时 MUST 被拒绝

#### Scenario: client 声明页面权限
- **WHEN** client 业务路由需要权限控制
- **THEN** 路由 MUST 使用共享权限树中注册的权限 key
- **THEN** client MUST NOT 维护本地权限字符串联合或常量表

#### Scenario: 共享包运行时可用
- **WHEN** admin、server 和 client 导入权限定义
- **THEN** 三端 MUST 从 `@repo/shared/permission` 读取权限树、派生类型和校验函数
- **THEN** `@repo/types` MUST 只复用该公共包导出的类型，不得维护另一份权限 key 联合类型

#### Scenario: shared 包边界
- **WHEN** 后续新增其他前后端共享能力
- **THEN** 共享能力 MUST 通过 `@repo/shared` 子路径导出
- **THEN** shared 包 MUST NOT 依赖 admin、server、数据库访问或 UI 组件状态

## ADDED Requirements

### Requirement: client 页面访问控制
client SHALL 根据路由 `meta` 和当前已认证用户权限同时决定页面访问与工作区导航可见性，两处 MUST 复用共享的全部权限判断语义。

#### Scenario: 显示有权限导航
- **WHEN** 普通用户拥有 client 路由要求的全部共享权限
- **THEN** 工作区导航 MUST 展示该路由入口
- **THEN** 路由守卫 MUST 允许直接访问该页面

#### Scenario: 隐藏无权限导航
- **WHEN** 普通用户缺少 client 路由要求的任一权限
- **THEN** 工作区导航 MUST 不展示该路由入口
- **THEN** 直接访问该页面 MUST 被路由守卫阻止

#### Scenario: client 系统管理员访问
- **WHEN** 当前 client 用户标记为系统管理员
- **THEN** 工作区导航 MUST 展示全部未隐藏的工作区入口
- **THEN** 路由守卫 MUST 允许访问全部已注册 client 页面
