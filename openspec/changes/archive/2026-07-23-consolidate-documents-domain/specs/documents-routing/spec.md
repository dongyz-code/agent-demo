## ADDED Requirements

### Requirement: documents 域路由收敛
所有文件、文档、上传、文件处理任务、知识库相关 route 文件 MUST 放置在 `router/routes/documents/` 目录下，MUST NOT 散落在 `router/routes` 顶层。

#### Scenario: route 文件归位
- **WHEN** 开发者查看 `router/routes` 目录
- **THEN** 文件、文档、上传、任务、知识库相关 route 文件 MUST 位于 `documents/` 子目录
- **THEN** `router/routes` 顶层 MUST NOT 存在 `file.*`、`document.*`、`upload.*`、`file-processing.*` route 文件

### Requirement: documents 路由命名最多两层
documents 域路由名 MUST 以 `/documents/` 为前缀，且路径段最多两层，route 文件名 MUST 采用连字符 `<resource>-<action>.ts`（如 `file-detail.ts` → `/documents/file-detail`），MUST NOT 出现三层及以上路径。

#### Scenario: 路由命名规则
- **WHEN** 服务端注册 documents 域路由
- **THEN** 路由名 MUST 形如 `/documents/<resource-action>`
- **THEN** 路由路径 MUST NOT 超过两层

#### Scenario: 前端调用迁移
- **WHEN** 管理端调用文件相关接口
- **THEN** 调用路径 MUST 使用 `/documents/*` 前缀
- **THEN** 调用路径 MUST NOT 使用旧 `/file/*`、`/document/*`、`/upload/*`、`/file-processing/*` 路径

### Requirement: 旧路由下线
旧 `/file/*`、`/document/*`、`/upload/*`、`/file-processing/*` 路由 MUST 下线，不再注册；下线后访问这些路径 MUST 返回 404 或明确的已迁移提示。

#### Scenario: 旧路由不可达
- **WHEN** 客户端请求旧 `/file/detail` 路径
- **THEN** 系统 MUST NOT 返回文件详情业务结果
- **THEN** 系统 MUST 返回 404 或统一说明该接口已迁移

### Requirement: documents 路由权限声明
documents 域 route MUST 声明点路径形式的权限键，权限键 MUST 集中定义在 `@repo/shared/permission`，MUST NOT 使用散落字符串。

#### Scenario: route 权限声明
- **WHEN** 开发者定义 documents 域 route
- **THEN** 该 route MUST 通过 `adminPermissionKey` 声明权限
- **THEN** 权限键 MUST 引用 `@repo/shared/permission` 的集中定义
