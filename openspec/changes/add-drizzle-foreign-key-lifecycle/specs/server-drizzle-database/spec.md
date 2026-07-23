## MODIFIED Requirements

### Requirement: 服务端 Drizzle schema 位置
服务端数据库 schema SHALL 放置在 `apps/server/src/database/tables`，并通过本地封装的 `pgTable` 定义产品表、列类型、索引、关系、trigger function 和 trigger。

#### Scenario: 开发者查看数据库 schema
- **WHEN** 开发者需要查看产品数据库表结构
- **THEN** 系统 MUST 在 `apps/server/src/database/tables` 下提供 Drizzle schema 定义
- **THEN** trigger function 和 trigger MUST 在对应表的 `pgTable` 声明中维护，不能在迁移配置中重复维护

## ADDED Requirements

### Requirement: Drizzle 目标结构包含外键
服务端自管目标描述 MUST 从 Drizzle 表定义读取外键约束名、本地列、引用 schema/table/列以及更新删除动作。目标描述、DDL、catalog snapshot 和结构 diff MUST 使用同一规范化结构。

#### Scenario: 描述复合外键
- **WHEN** 表通过 `foreignKey()` 声明多列关系
- **THEN** 目标描述保留本地列与引用列顺序、确定约束名和更新删除动作

### Requirement: 外键差异必须准确分类
结构比较 MUST 区分缺失、额外和定义变化的外键，并返回约束名与关联列，不得把所有外键笼统标记为未知复杂约束。

#### Scenario: 已有表缺少目标外键
- **WHEN** Drizzle 声明外键而 PostgreSQL catalog 中不存在对应关系
- **THEN** diff 报告缺失外键及其本地列、引用表和引用列

### Requirement: 新表外键在全部表创建后应用
空 schema 初始化 MUST 先创建全部缺失表、索引和 trigger，再为本次新建表创建目标外键。外键 DDL MUST 使用受控标识符、确定性约束名和幂等实态检查。

#### Scenario: 创建循环引用表
- **WHEN** 两张缺失表互相引用或表存在自引用
- **THEN** 系统先完成全部表创建，再执行外键 ADD CONSTRAINT，不依赖 registry 拓扑顺序

### Requirement: 已有表外键变更必须受控
已有表新增、修改或删除外键 MUST 通过表管理 sync plan 和显式 apply 完成。普通启动 MUST 只报告漂移，不得自动执行外键 ALTER TABLE。

#### Scenario: 启动发现外键漂移
- **WHEN** 已有表外键与目标态不一致
- **THEN** 启动记录差异且不修改数据库约束

#### Scenario: 应用外键计划
- **WHEN** 有权限操作者应用仍有效的外键计划
- **THEN** 系统在事务与 advisory lock 内复检 catalog 和孤儿数据，校验通过后才执行确定 DDL

### Requirement: 外键删除语义必须显式
每条目标外键 MUST 明确 onDelete 和 onUpdate 行为。默认关系 MUST 使用 RESTRICT；只有纯子记录才能使用 CASCADE，SET NULL 只能用于可空本地列。

#### Scenario: 关系删除语义未确认
- **WHEN** 外键的业务所有权或父记录删除行为无法明确
- **THEN** 该关系不得进入可应用计划，并作为阻塞项返回

### Requirement: 孤儿数据阻止约束应用
为已有表新增外键前 MUST 检查不满足目标关系的孤儿数据。存在孤儿时 plan MUST 展示阻塞信息，apply MUST 拒绝创建约束且不得静默删除或修复业务数据。

#### Scenario: 目标列存在孤儿值
- **WHEN** 外键 apply 复检发现本地值在引用表中不存在
- **THEN** 系统拒绝应用并返回约束、孤儿数量和受限样例
