## ADDED Requirements

### Requirement: documents 是单一文档业务域
服务端 MUST 将上传、文档生命周期、版本、预览、RAG 关系和文档处理任务集中在 `hooks/documents`，不得恢复独立的 `hooks/file`、`hooks/upload`、`hooks/document` 或 `hooks/rag` 业务目录及其兼容转发层。

#### Scenario: 检查 hooks 目录
- **WHEN** 开发者查看服务端文档相关实现
- **THEN** 相关复用业务和复杂流程位于 `hooks/documents`，旧顶层业务目录不存在

### Requirement: 子模块按真实功能划分
`hooks/documents` MUST 使用 document、upload、preview、rag、tasks 和 storage 子模块表达真实职责。文件拆分 MUST 以独立状态机、外部系统边界、多实现选择、纯算法或跨调用方复用为依据，不得为纯转发或单行逻辑机械增加目录和文件。

#### Scenario: 查看领域结构
- **WHEN** 开发者查看 `hooks/documents`
- **THEN** 各子模块与当前功能对应，且不存在只做 re-export 的根 barrel 或功能目录

### Requirement: 域内依赖保持单向
documents 子模块 MUST 保持可解释的单向依赖：storage 提供内部对象能力，document 提供聚合与版本规则，preview 和 rag 使用 document/storage，tasks 调度后台执行体。低层模块 MUST NOT 反向依赖 worker 控制面，任何模块 MUST NOT 依赖根 barrel。

#### Scenario: 上传完成创建文档
- **WHEN** upload 完成文件验证并进入文档业务
- **THEN** upload 精确调用 document、preview、rag 与 storage 的稳定实现，且这些模块不反向依赖 upload 流程

### Requirement: route 与 hooks 按复杂度分工
普通单表查询、分页和简单条件更新 MUST 由 route 直接使用 ORM。跨入口复用、复杂聚合、多表事务、状态迁移、对象存储编排和后台运行时 MUST 进入 `hooks/documents`，不得为普通 CRUD 创建薄 service，也不得在 route 中组合内部原语。

#### Scenario: 知识库基础查询
- **WHEN** route 查询知识库基础列表或详情
- **THEN** route 直接使用 ORM，不经过只转发查询的 hook

#### Scenario: 文档聚合搜索
- **WHEN** route 查询包含当前版本、预览和知识库摘要的文档列表
- **THEN** route 精确调用复用的复杂聚合查询，不自行拼接内部表查询

### Requirement: 调用方必须精确导入
`hooks/documents` MUST NOT 通过根 `index.ts` 聚合导出业务能力或内部原语。routes、server 与跨域任务中心 MUST 从功能明确的稳定文件精确导入；S3 client、File 行、parser 实例、worker claim、lease 和阶段持久化函数不得被 route 导入。

#### Scenario: route 使用上传能力
- **WHEN** documents route 初始化或完成上传
- **THEN** route 精确导入上传业务函数，且不导入对象存储命令或上传状态机内部 helper

### Requirement: 抽象必须有当前消费者
registry、provider 接口、共享类型和导出函数 MUST 至少满足多实现选择、跨文件复用、独立验证价值或外部系统隔离之一。静态检查确认只有声明而没有消费者的定义 MUST 删除，单个简单实现且没有注册需求的逻辑 MUST 使用直接函数。

#### Scenario: 无消费者导出
- **WHEN** 工作区引用检查确认某导出只有声明位置
- **THEN** 系统删除该导出及无效转发，不保留预想中的扩展点

### Requirement: documents 路由统一收口
所有上传、文档、预览、RAG 关系和文档处理 route MUST 位于 `router/routes/documents/`，公共路径 MUST 使用 `/documents/<resource-action>` 两层形式。旧 `/file/*`、`/document/*`、`/upload/*` 和 `/file-processing/*` 路径 MUST NOT 注册。

#### Scenario: 注册文档路由
- **WHEN** 服务端加载文档相关 route
- **THEN** 路径使用 `/documents/*` 前缀，且 route 文件位于 documents 子目录

### Requirement: documents 路由集中声明权限
受保护的 documents route MUST 通过 `adminPermissionKey` 声明来自 `@repo/shared/permission` 的权限键，不得在 handler 中散落通用权限字符串或重复认证守卫。

#### Scenario: 新增受保护 route
- **WHEN** 开发者增加文档操作接口
- **THEN** route 元数据引用集中权限定义，并由统一认证权限链在 handler 前校验

### Requirement: documents 域直接使用 ROOT_ERROR
documents 业务错误 MUST 直接创建项目统一 `ROOT_ERROR`，不得维护自定义 Error 子类或只转发 `ROOT_ERROR` 的领域错误工厂。固定业务错误 MUST 只传注册键；只有注册定义无法预先表达的运行时上下文才能作为详情传入。

#### Scenario: 抛出固定业务错误
- **WHEN** documents 代码报告文档不存在或非法参数
- **THEN** 调用只传对应 `ROOT_ERROR` 注册键，不重复固定错误码和说明

#### Scenario: 报告动态分片错误
- **WHEN** 错误排查需要实际分片编号或运行时状态
- **THEN** 调用可以把该动态上下文作为错误详情传入

### Requirement: 业务错误保留 HTTP 语义
documents 错误 MUST 通过 `ROOT_ERROR` 注册映射为正确 HTTP 状态；归一化层不得把已知的 400、403、404 或 409 业务错误塌缩为 500。

#### Scenario: 文档不存在
- **WHEN** route 抛出 `ROOT_ERROR('相关文件不存在')`
- **THEN** 响应状态为 404

### Requirement: 通用任务框架与 documents 解耦
通用任务查询 MUST NOT 在自身实现中硬编码 documents 的文件、版本、知识库或处理任务表。documents 任务筛选与摘要 MUST 由 documents 域提供，再由任务中心组合。

#### Scenario: 按文件名筛选任务
- **WHEN** 通用任务中心按文档文件名筛选
- **THEN** documents 域解析领域任务标识，通用任务查询只消费标识集合

### Requirement: 架构文档只描述当前实态
documents README 与主 specs MUST 只描述实际存在的目录、API 和恢复能力。历史路径、已删除表和未落地能力只能保留在归档 change 中，不得表述为当前实现。

#### Scenario: 核对架构说明
- **WHEN** 开发者核对 README 和主 specs
- **THEN** 文档列出的目录与稳定能力在仓库中存在，历史方案具有明确历史属性

### Requirement: 规范与代码具有可执行校验
服务端 lint、类型检查和 OpenSpec strict 校验 MUST 能验证 documents 当前实现和规范。任务清单不得把未执行或已经删除的测试命令标记为完成。

#### Scenario: 完成规范治理
- **WHEN** 本轮基线与归档操作完成
- **THEN** 服务端 lint、OpenSpec strict 校验和变更差异检查均返回成功
