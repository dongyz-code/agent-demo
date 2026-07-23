## ADDED Requirements

### Requirement: 共享权限定义
系统 SHALL 通过通用 `@repo/shared` 运行时包提供前后端共享的 admin 权限定义，以单一 `adminPermissionTree` 维护权限 key、展示名称、层级关系和可选 route 绑定，并从该树派生类型和校验函数。

#### Scenario: admin 渲染授权树
- **WHEN** admin 角色编辑页面加载权限配置
- **THEN** 页面 MUST 使用共享权限定义生成权限树
- **THEN** 页面 MUST NOT 维护另一份独立的权限 key 白名单

#### Scenario: server 校验权限 key
- **WHEN** 服务端处理角色创建或角色更新请求中的权限列表
- **THEN** 服务端 MUST 使用共享权限定义校验每个权限 key
- **THEN** 请求包含未知权限 key 时 MUST 被拒绝

#### Scenario: 共享包运行时可用
- **WHEN** admin 和 server 导入权限定义
- **THEN** 两端 MUST 从 `@repo/shared/permission` 读取权限树、派生类型和校验函数
- **THEN** `@repo/types` MUST 只复用该公共包导出的类型，不得维护另一份权限 key 联合类型

#### Scenario: shared 包边界
- **WHEN** 后续新增其他前后端共享能力
- **THEN** 共享能力 SHOULD 通过 `@repo/shared` 子路径导出
- **THEN** shared 包 MUST NOT 依赖 admin、server、数据库访问或 UI 组件状态

### Requirement: admin 路由权限声明
admin SHALL 在路由 `meta` 中声明页面访问所需权限，菜单过滤和路由守卫 SHALL 统一读取该声明。

#### Scenario: 业务路由声明权限
- **WHEN** 新增或修改 admin 业务页面路由
- **THEN** 路由 MUST 在 `meta` 中声明所需页面权限
- **THEN** 路由 MUST 使用公共权限包从权限树派生的权限 key

#### Scenario: 壳路由兼容
- **WHEN** 路由仅作为布局、分组、登录页或 404 页存在
- **THEN** 路由 MAY 不声明页面权限
- **THEN** 系统 MUST 通过子路由权限或公开路由配置决定访问行为

### Requirement: 权限聚合
系统 SHALL 基于当前用户拥有的启用角色聚合有效权限，并在登录和 token 校验时返回一致的权限集合。

#### Scenario: 聚合启用角色权限
- **WHEN** 普通用户登录且拥有多个启用角色
- **THEN** 系统 MUST 返回这些启用角色权限 key 的去重集合

#### Scenario: 忽略禁用角色
- **WHEN** 普通用户只拥有禁用角色或角色在登录后被禁用
- **THEN** 下一次登录或 token 校验 MUST 不再返回该禁用角色的权限

#### Scenario: 忽略历史未知权限
- **WHEN** 历史角色数据中包含共享权限定义之外的权限 key
- **THEN** 系统 MUST NOT 将未知权限 key 授予用户
- **THEN** 系统 MUST NOT 在登录或 token 校验响应中返回未知权限 key

#### Scenario: 系统管理员权限
- **WHEN** 当前用户是系统管理员
- **THEN** 系统 MUST 视为拥有全部 admin 页面和操作权限
- **THEN** 登录和 token 校验响应 MAY 继续返回空权限数组并通过 `sys_admin` 标记表达管理员身份

### Requirement: admin 页面访问控制
admin SHALL 根据路由 `meta` 和当前用户权限过滤菜单和路由，页面权限不足时不得展示入口或允许直接访问页面。

#### Scenario: 显示有权限菜单
- **WHEN** 普通用户拥有某个 admin 页面权限
- **THEN** admin 菜单 MUST 展示该页面入口
- **THEN** 路由守卫 MUST 允许进入该页面

#### Scenario: 阻止无权限页面
- **WHEN** 普通用户缺少某个 admin 页面权限
- **THEN** admin 菜单 MUST 不展示该页面入口
- **THEN** 用户直接访问该页面路由时 MUST 被路由守卫阻止

#### Scenario: 系统管理员访问页面
- **WHEN** 系统管理员进入 admin
- **THEN** admin 菜单 MUST 展示全部已注册管理页面
- **THEN** 路由守卫 MUST 允许访问全部已注册管理页面

### Requirement: 服务端权限守卫
服务端 SHALL 通过 `routeHandler` 注册 admin 接口权限，并由唯一的集中式权限 `preHandler` 在身份认证完成后执行业务权限守卫。

#### Scenario: 接口声明权限
- **WHEN** 新增或修改受保护 admin 接口
- **THEN** 接口 MUST 通过 `routeHandler` 的权限字段声明唯一权限 key
- **THEN** 业务 handler MUST NOT 手写通用权限断言

#### Scenario: 复合写接口权限
- **WHEN** 一个现有写接口根据 payload 更新同一资源的多个字段
- **THEN** 服务端 MUST 以该 route 声明的单个操作权限校验整个请求
- **THEN** 系统 MUST NOT 声明当前实现不存在的动态、多权限或策略规则

#### Scenario: 认证入口统一
- **WHEN** 服务端注册 admin 权限守卫
- **THEN** 身份认证 MUST 在 `onRequest` 阶段完成，权限守卫 MUST 作为唯一的集中式 `preHandler` 在认证后执行
- **THEN** 业务 route 和 handler MUST NOT 再注册第二套通用权限守卫
- **THEN** 权限不足 MUST 保持 403 语义，不得被身份认证失败逻辑映射为 401

#### Scenario: 允许有权限请求
- **WHEN** 普通用户请求受保护 admin 接口且拥有该接口要求的权限
- **THEN** 服务端 MUST 执行业务处理并返回正常响应

#### Scenario: 拒绝无权限请求
- **WHEN** 普通用户请求受保护 admin 接口但缺少该接口要求的权限
- **THEN** 服务端 MUST 拒绝请求
- **THEN** 服务端 MUST NOT 返回受保护数据或执行写入副作用

#### Scenario: 系统管理员绕过守卫
- **WHEN** 系统管理员请求任意受保护 admin 接口
- **THEN** 服务端 MUST 允许请求通过权限守卫

#### Scenario: 未声明接口检查
- **WHEN** 系统执行代码评审或 lint 辅助检查
- **THEN** 检查 MUST 能发现未声明权限的 `/sys/**` 管理接口
- **THEN** 允许公开或特殊接口时 MUST 通过显式配置说明原因

### Requirement: 角色管理路由权限
角色管理 SHALL 在页面入口、角色新增、复合更新和删除路由上声明权限。角色授权与启停的前端动作 key 用于交互控制，服务端现有复合更新路由统一使用角色编辑权限。

#### Scenario: 新增角色
- **WHEN** 用户提交新增角色请求
- **THEN** 服务端 MUST 要求用户拥有角色新增权限
- **THEN** 请求携带权限列表时服务端 MUST 校验全部权限 key 有效

#### Scenario: 更新角色
- **WHEN** 用户通过现有角色更新路由修改名称、描述、权限列表或启用状态
- **THEN** 服务端 MUST 要求用户拥有角色编辑权限
- **THEN** 修改权限列表时服务端 MUST 校验提交的权限 key 全部有效
- **THEN** 被禁用角色 MUST 不再参与普通用户权限聚合

#### Scenario: 删除角色
- **WHEN** 用户删除角色
- **THEN** 服务端 MUST 要求用户拥有角色删除权限
- **THEN** 系统 MUST 同步移除该角色和用户的绑定关系

### Requirement: 角色授权交互
admin 角色授权 UI SHALL 清晰表达权限层级和选择状态，并只提交有效权限 key。

#### Scenario: 展示权限分组
- **WHEN** 用户打开角色新增或编辑弹窗
- **THEN** UI MUST 按 `adminPermissionTree` 展示权限节点的父子层级
- **THEN** UI MUST NOT 维护另一份并行权限分类

#### Scenario: 半选状态
- **WHEN** 用户只选择某个分组下的部分子权限
- **THEN** UI MUST 将父节点展示为半选状态
- **THEN** 保存结果 MUST 能反映最终选中的有效权限 key

#### Scenario: 搜索权限
- **WHEN** 用户在权限树中输入搜索文本
- **THEN** UI MUST 过滤或高亮匹配的权限节点
- **THEN** UI MUST 保留匹配节点的必要父级上下文

#### Scenario: 提交有效权限
- **WHEN** 用户确认保存角色权限
- **THEN** admin MUST 只提交共享权限定义中存在的权限 key
- **THEN** admin MUST NOT 提交 UI 分组节点作为业务授权，除非该节点本身是有效权限 key

### Requirement: 表管理权限兼容
系统 SHALL 保持现有表管理页面权限、全局操作权限、表范围权限和 wildcard 权限语义不变。

#### Scenario: 表管理页面权限
- **WHEN** 用户拥有表管理页面权限
- **THEN** admin MUST 继续允许用户进入 `sys.table` 页面

#### Scenario: 表范围操作权限
- **WHEN** 用户拥有表管理页面权限和某张表的表范围操作权限
- **THEN** 服务端表管理接口 MUST 继续按目标表和操作类型判断权限

#### Scenario: wildcard 表权限
- **WHEN** 用户拥有表管理 wildcard 权限
- **THEN** 服务端 MUST 继续按 wildcard 规则允许对应表操作
