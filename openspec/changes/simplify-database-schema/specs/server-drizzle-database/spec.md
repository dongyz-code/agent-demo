## ADDED Requirements

### Requirement: Drizzle 目标结构包含外键
服务端自管 Drizzle 结构描述 MUST 从表定义中读取外键名称、本地列、引用 schema、引用表、引用列以及更新和删除动作。DDL 生成器和 catalog 差异比较 MUST 消费同一目标描述。

#### Scenario: 描述包含外键的表
- **WHEN** Drizzle 表通过 `.references()` 或 `foreignKey()` 声明关系
- **THEN** `describeTableTarget` MUST 返回规范化外键描述
- **THEN** 表管理详情 MUST 展示该外键的目标态和数据库实态

#### Scenario: 比较缺失外键
- **WHEN** Drizzle 目标结构声明外键而 PostgreSQL catalog 中不存在对应约束
- **THEN** schema 差异 MUST 报告缺失外键
- **THEN** 差异结果 MUST 包含约束名和关联列，而不是笼统标记为未知复杂约束

### Requirement: 外键 DDL 在表创建后独立应用
自管 DDL MUST 在所有缺失表创建完成后再创建外键约束，以支持任意注册顺序、自引用和循环关系。外键创建 MUST 使用确定性约束名并支持幂等检查。

#### Scenario: 空 schema 启动
- **WHEN** 多张互相引用的表均不存在
- **THEN** 启动同步 MUST 先创建所有表、索引和 trigger
- **THEN** 启动同步 MUST 在被引用表全部存在后创建外键

#### Scenario: 外键已经存在
- **WHEN** 目标外键已以相同定义存在
- **THEN** 同步 MUST 跳过重复创建
- **THEN** 同步结果 MUST 报告该约束已一致

### Requirement: 已有表外键变更走受控同步
已有表新增、修改或删除外键 MUST 通过表管理预演与显式应用完成，普通启动只能报告漂移，MUST NOT 自动修改已有表约束。

#### Scenario: 已有表缺少目标外键
- **WHEN** 启动自检发现已有表缺少 Drizzle 声明的外键
- **THEN** 服务 MUST 记录结构漂移
- **THEN** 服务 MUST NOT 在启动期间直接执行 `ALTER TABLE`

#### Scenario: 应用外键同步计划
- **WHEN** 有权限操作者应用仍有效的外键同步计划
- **THEN** 系统 MUST 在 advisory lock 内重新检查 catalog 和孤儿数据
- **THEN** 校验通过后系统 MUST 执行确定的 `ALTER TABLE ... ADD CONSTRAINT`
