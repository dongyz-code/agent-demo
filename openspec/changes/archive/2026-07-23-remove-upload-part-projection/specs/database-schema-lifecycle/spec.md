## ADDED Requirements

### Requirement: 运行时表必须具有独立事实价值
加入启动注册表的业务表 MUST 具有当前业务所有者、写路径、独立读路径或明确的持久化事实价值。仅复制外部系统结果且没有消费者的投影 MUST NOT 长期保留。

#### Scenario: 评审外部事实投影
- **WHEN** 一张表只复制对象存储返回值且业务从不读取该表
- **THEN** 系统不得把它作为独立事实继续注册，并应直接读取权威外部来源

### Requirement: Multipart 分片以对象存储为事实来源
Multipart 已上传分片、ETag、大小和缺失编号 MUST 由 S3/MinIO `ListParts` 结果计算。系统 MUST NOT 把计划分片或 ListParts 镜像持久化到 `file_upload_parts`。

#### Scenario: 刷新后恢复 Multipart
- **WHEN** 用户恢复有效上传会话
- **THEN** 系统通过 ListParts 返回实际已上传分片并只补传缺失部分，不查询 PostgreSQL 分片投影

### Requirement: 退役投影必须完整退出运行时
退役 `file_upload_parts` 时，系统 MUST 删除其写入、清理、Drizzle 定义、汇总导出和启动注册，不得保留空转发或兼容写路径。

#### Scenario: 检查运行时引用
- **WHEN** 投影退役完成
- **THEN** 服务端运行时代码对 `file_upload_parts` 零引用，启动 registry 只包含 21 张当前有效表

### Requirement: 物理清理必须受控
表退出启动 registry 后，普通服务启动 MUST NOT 自动 DROP 现有物理表。物理清理 MUST 使用明确的 reset 或维护操作，并与运行时代码退役分离。

#### Scenario: 启动遇到未注册旧表
- **WHEN** 数据库仍存在已退出 registry 的 `file_upload_parts`
- **THEN** 服务启动不删除或改写该表，清理由显式操作完成

### Requirement: 上传公共行为保持不变
移除分片数据库投影 MUST NOT 改变上传初始化、分片签名、恢复、幂等完成、取消和公共 DTO 语义。

#### Scenario: 完成 Multipart 上传
- **WHEN** 客户端提交与 ListParts 一致的完整分片清单
- **THEN** 系统按现有规则合并、验证并创建文档版本，且不依赖分片数据库行
