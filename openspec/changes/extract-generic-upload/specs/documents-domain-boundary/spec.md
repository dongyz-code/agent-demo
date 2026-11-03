## MODIFIED Requirements

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

### Requirement: documents 路由统一收口

文档、预览、RAG 和文档处理 route MUST 位于 `router/routes/documents/` 并使用 `/documents/<resource-action>`。通用上传 route MUST 位于 `router/routes/upload/` 并使用 `/upload/<action>`，旧 `/documents/upload-*` MUST 移除。

#### Scenario: 注册文档路由

- **WHEN** 服务端加载文件与文档 route
- **THEN** 通用上传使用 upload 前缀，文档绑定使用 documents 前缀

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

## ADDED Requirements

### Requirement: 预览页面以文件句柄引用存储

快速与清晰预览页面 MUST 保存通用文件标识而非 bucket/object key。转换器 MUST 只接收元数据与流工厂，页面发布与清理 MUST 保留原有原子性和取消规则。

#### Scenario: 页面窗口读取

- **WHEN** 已授权用户读取预览页面窗口
- **THEN** documents 通过页面 file_id 调用 upload 生成短期地址，不拼接存储路径
