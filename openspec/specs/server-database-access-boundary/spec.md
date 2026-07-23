## Purpose
定义服务端数据库访问的最小公共边界，约束 Drizzle 客户端、表定义汇总、运行时注册表、业务查询表达式、数据库行类型和连接池的职责与导入方向。

## Requirements

### Requirement: 数据库公共入口保持最小
服务端数据库公共入口 MUST 只导出 Drizzle 客户端 `db` 和汇总表定义 `schemas`，不得转发连接池、SQL 表达式、查询 helper 或无消费者客户端类型。

#### Scenario: 业务模块访问数据库
- **WHEN** route 或复杂业务函数构造数据库查询
- **THEN** 调用方从数据库入口导入 `db` 与 `schemas`，并从 `drizzle-orm` 导入所需表达式

### Requirement: schemas 只汇总表定义
`schemas` MUST 只包含真实 Drizzle 表定义。表管理白名单、启动注册表和其他运行时 registry MUST 位于独立模块，不得混入 `schemas`。

#### Scenario: 启动同步读取注册表
- **WHEN** 启动同步遍历需要落库的表
- **THEN** 它从 `tables/registry.ts` 精确导入启动注册表，而不是从数据库公共入口读取

### Requirement: 查询直接使用 Drizzle 原生能力
调用方 MUST 直接使用 Drizzle 的条件、排序、SQL template、事务和 `$count`，不得为简单查询维护 `listFilter`、`rangeFilter`、`whereAll`、排序或计数二次封装。

#### Scenario: route 构造分页筛选
- **WHEN** route 需要按业务字段筛选、排序和计数
- **THEN** 查询在业务上下文中显式组合 Drizzle 表达式并保持字段类型

### Requirement: 数据类型绑定具体表
数据库读取和写入类型 MUST 从具体表的 `$inferSelect` 或 `$inferInsert` 推导，不得通过表管理 registry、通用 `SqlData` 或宽泛 `Db` 类型间接生成。

#### Scenario: 定义更新数据类型
- **WHEN** 业务函数需要构造某张表的更新数据
- **THEN** 类型引用该具体表的 Drizzle 推导结果，不依赖 managed registry

### Requirement: 连接池保持内部
PostgreSQL Pool MUST 只由数据库客户端模块持有。业务代码 MUST 通过 `db` 和 `db.transaction` 执行查询与事务，不得通过公共数据库入口获取 pool。

#### Scenario: 执行业务事务
- **WHEN** 业务流程需要原子写入多张表
- **THEN** 调用方使用 `db.transaction`，且不直接借用底层连接池
