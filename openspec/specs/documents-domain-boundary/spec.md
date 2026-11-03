## Purpose

定义服务端 documents 单一文档业务域的目录职责、单向依赖、抽象准入、精确导入、路由组织、错误语义以及规范与代码的可执行验证边界。

## Requirements

### Requirement: documents 是单一文档业务域

服务端 MUST 将文档生命周期、版本、预览、RAG 关系和处理任务集中在 `hooks/documents`；文件传输、验证、存储与访问地址生成 MUST 独立位于 `hooks/upload`，且不得反向依赖 documents。

#### Scenario: 检查 hooks 目录

- **WHEN** 开发者查看文件与文档实现
- **THEN** 通用文件能力位于 upload，文档业务位于 documents，且不存在纯兼容转发层

### Requirement: 子模块按真实功能划分

`hooks/documents` MUST 使用 document、preview、rag 和 tasks 表达领域职责，Action 承载复杂业务。通用 upload MUST 按存储边界、会话状态机和文件校验拆分，不得恢复 documents/file 或 documents/storage。

#### Scenario: 查看领域结构

- **WHEN** 开发者查看文档模块
- **THEN** 文档源文件与页面产物通过 upload 管理，域内不包含 S3 适配器

### Requirement: 域内依赖保持单向

upload MUST 只依赖通用配置、数据库与共享类型；documents MUST 通过 upload 的稳定入口使用文件能力。上传完成 MUST 不创建文档版本或任务，文档绑定 MUST 自行组织领域事务。

#### Scenario: 上传完成创建文档

- **WHEN** 文件传输与验证成功
- **THEN** upload 返回 key，documents 在独立业务操作中创建版本并调度预览

### Requirement: route 与 hooks 按复杂度分工

普通单表查询、分页和简单条件更新 MUST 由 route 直接使用 ORM。文档复杂聚合、多表事务、领域状态迁移和后台运行时 MUST 进入 `hooks/documents`；通用文件传输、校验与存储编排 MUST 进入 `hooks/upload`。不得为普通 CRUD 创建薄 service，也不得在 route 中组合内部原语。

#### Scenario: 文档聚合搜索

- **WHEN** route 查询当前版本、预览和知识库摘要
- **THEN** route 调用文档复杂聚合能力，文件 URL 由 upload 批量签发

### Requirement: 调用方必须精确导入

`hooks/documents` MUST NOT 通过根 index 聚合业务能力。文档 routes MUST 从稳定 Action 文件导入，通用上传 routes MUST 从 `hooks/upload/index` 导入统一实例。S3 client、物理文件位置、parser 实例和任务状态机内部原语 MUST NOT 被 route 使用。

#### Scenario: route 使用上传能力

- **WHEN** upload route 初始化或完成上传
- **THEN** route 调用 upload 的公开方法，不导入存储命令或会话状态机 helper

### Requirement: 抽象必须有当前消费者

registry、provider 接口、共享类型和导出函数 MUST 至少满足多实现选择、跨文件复用、独立验证价值或外部系统隔离之一。静态检查确认只有声明而没有消费者的定义 MUST 删除，单个简单实现且没有注册需求的逻辑 MUST 使用直接函数。

#### Scenario: 无消费者导出

- **WHEN** 工作区引用检查确认某导出只有声明位置
- **THEN** 系统删除该导出及无效转发，不保留预想中的扩展点

### Requirement: documents 路由统一收口

文档、预览、RAG 和文档处理 route MUST 位于 `router/routes/documents/` 并使用 `/documents/<resource-action>`。通用上传 route MUST 位于 `router/routes/upload/` 并使用 `/upload/<action>`，旧 `/documents/upload-*` MUST 移除。

#### Scenario: 注册文档路由

- **WHEN** 服务端加载文件与文档 route
- **THEN** 通用上传使用 upload 前缀，文档绑定使用 documents 前缀

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

### Requirement: 预览页面以文件句柄引用存储

快速与清晰预览页面 MUST 保存通用文件标识而非 bucket/object key。转换器 MUST 只接收元数据与流工厂，页面发布与清理 MUST 保留原有原子性和取消规则。

#### Scenario: 页面窗口读取

- **WHEN** 已授权用户读取预览页面窗口
- **THEN** documents 通过页面 file_id 调用 upload 生成短期地址，不拼接存储路径
