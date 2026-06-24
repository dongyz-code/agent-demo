## Purpose

定义管理端基于 Drizzle schema 的表管理能力，包括有权限表清单、结构详情、demo 数据预览、受控重命名、无损 schema 重置、操作审计和管理端入口。

## Requirements

### Requirement: 有权限表清单
系统 SHALL 只向用户返回其有权限访问且已在 Drizzle `schemaTables` 注册的表。

#### Scenario: 普通用户查看表清单
- **WHEN** 用户请求 `/sys/table/list`
- **THEN** 系统返回该用户具有表范围权限的注册表，并排除未注册数据库表、迁移表、临时表和备份表

#### Scenario: 管理员查看表清单
- **WHEN** 系统管理员请求 `/sys/table/list`
- **THEN** 系统返回所有已在 Drizzle `schemaTables` 注册的可管理表

### Requirement: 表结构详情和差异
系统 SHALL 基于 Drizzle schema 返回目标结构，并基于 Postgres catalog 返回数据库实态和二者差异。

#### Scenario: 查看结构详情
- **WHEN** 用户请求有权限表的 `/sys/table/detail`
- **THEN** 系统返回字段、字段类型、可空性、默认值、主键、索引、唯一约束、物理存在状态和 schema 差异摘要

#### Scenario: 查看无权限表详情
- **WHEN** 用户请求无权限表的 `/sys/table/detail`
- **THEN** 系统拒绝请求并返回权限错误

### Requirement: Demo 数据预览
系统 SHALL 支持有权限用户查看受限且脱敏的 demo 数据。

#### Scenario: 查看 demo 数据
- **WHEN** 用户请求有权限表的 `/sys/table/preview`
- **THEN** 系统最多返回 100 行数据，只包含注册字段，并对敏感字段、二进制字段和大字段返回脱敏值或摘要

#### Scenario: 缺少预览权限
- **WHEN** 用户没有 demo 数据预览权限但请求 `/sys/table/preview`
- **THEN** 系统拒绝请求并且不返回任何表数据

### Requirement: 重命名预演和执行
系统 SHALL 对表名和字段名重命名提供预演计划，并只允许执行已保存且仍然有效的计划。

#### Scenario: 生成重命名计划
- **WHEN** 用户提交目标 Drizzle 表和旧表/旧字段映射到 `/sys/table/rename-plan`
- **THEN** 系统验证权限、目标表、物理旧名、命名冲突和类型兼容性，并保存包含 SQL 摘要、风险、阻塞项的计划

#### Scenario: 执行重命名计划
- **WHEN** 用户对有效 plan id 提交 `/sys/table/rename-apply` 并完成确认文本
- **THEN** 系统在事务和 advisory lock 内重新验证实态后执行重命名，并记录操作状态

#### Scenario: 拒绝过期计划
- **WHEN** 数据库实态在 plan 生成后发生变化
- **THEN** 系统拒绝执行该计划并要求重新预演

### Requirement: Schema 无损重置
系统 SHALL 支持根据 Drizzle schema 重置表结构，并以无损优先流程保护原数据。

#### Scenario: 生成重置计划
- **WHEN** 用户请求 `/sys/table/reset-plan`
- **THEN** 系统返回新表结构、字段复制映射、不可安全处理的阻塞项、估算行数、锁表风险和备份表名

#### Scenario: 执行重置计划
- **WHEN** 用户对有效 plan id 提交 `/sys/table/reset-apply` 并完成确认文本
- **THEN** 系统创建临时新表、复制兼容字段数据、校验行数和关键约束、将旧表重命名为备份表、将新表重命名为目标表，并保留备份表

#### Scenario: 重置过程失败
- **WHEN** 重置过程任一步在事务内失败
- **THEN** 系统回滚所有 DDL 和数据复制操作，原表保持可用，并记录失败原因

#### Scenario: 存在不可安全复制字段
- **WHEN** 新 schema 包含 `NOT NULL` 且无默认值的新字段，或存在无法安全生成的复杂约束
- **THEN** 系统将计划标记为阻塞，拒绝执行 reset apply

### Requirement: 操作审计
系统 SHALL 记录所有结构变更计划和执行结果。

#### Scenario: 保存计划记录
- **WHEN** 用户生成 rename 或 reset 计划
- **THEN** 系统保存操作者、目标表、计划类型、计划内容、风险、阻塞项、创建时间和过期时间

#### Scenario: 保存执行记录
- **WHEN** 用户执行 rename 或 reset
- **THEN** 系统保存执行状态、开始时间、结束时间、备份表名、错误信息和用户操作日志

### Requirement: 管理端页面
管理端 SHALL 在系统管理中提供表管理页面，并且不在普通 client 中暴露该能力。

#### Scenario: 进入表管理页面
- **WHEN** 用户拥有表管理页面权限
- **THEN** admin 菜单在系统管理下显示“表管理”，并允许进入 `sys.table` 页面

#### Scenario: 使用表管理页面
- **WHEN** 用户进入表管理页面
- **THEN** 页面提供表搜索、表清单、结构详情、demo 数据、差异、操作记录、重命名预演和重置预演入口

#### Scenario: 无页面权限
- **WHEN** 用户缺少表管理页面权限
- **THEN** admin 菜单不显示“表管理”，并且路由守卫阻止访问该页面
