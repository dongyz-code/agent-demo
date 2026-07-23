## ADDED Requirements

### Requirement: 数据库公共入口保持最小
服务端数据库公共入口 MUST 只暴露数据库客户端 `db` 和汇总表定义 `schemas`。调用方 MUST 直接使用 Drizzle 原生查询表达式，MUST NOT 为简单条件、排序、计数或 SQL 表达式维护二次封装。

#### Scenario: 业务代码访问数据库
- **WHEN** route 或复杂业务流程构造 Drizzle 查询
- **THEN** 调用方 MUST 从数据库入口读取 `db` 与 `schemas`
- **THEN** 调用方 MUST 从 `drizzle-orm` 直接读取查询表达式

#### Scenario: 业务代码推导表数据类型
- **WHEN** 调用方需要某张表的读取或写入类型
- **THEN** 调用方 MUST 使用对应表的 `$inferSelect` 或 `$inferInsert`
- **THEN** 类型 MUST NOT 依赖表管理白名单 `managedTableRegistry`

#### Scenario: 数据库入口静态审计
- **WHEN** 数据库访问入口收敛完成
- **THEN** `tableNames`、筛选 helper、排序 helper 和 `countRows` MUST 零引用
- **THEN** 连接池 MUST NOT 通过数据库公共入口暴露
- **THEN** 无调用方使用的数据库客户端类型 MUST NOT 预留导出
- **THEN** `schemas` MUST 只聚合表定义，表管理和启动注册表 MUST 从独立模块导入

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
