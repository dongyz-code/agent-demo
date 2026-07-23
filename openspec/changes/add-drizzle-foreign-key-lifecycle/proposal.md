## Why

服务端自管 Drizzle DDL 当前只能描述列、主键、索引和 trigger，不能可靠描述或维护外键；把该能力与删表和数据库出口重构捆绑，会让风险和验收边界失控。需要建立一个只处理外键目标态、差异和受控应用的独立 change。

Supersedes: `simplify-database-schema` 中“Drizzle 外键目标描述与 DDL”及“已有表外键受控同步”部分。

## What Changes

- 从 Drizzle 表定义归一化外键约束名、本地列、引用 schema/table/列和更新删除动作。
- 扩展 catalog snapshot 与结构 diff，准确报告缺失、额外和定义变化的外键。
- 空 schema 初始化改为先创建全部缺失表，再为新表创建目标外键，支持任意注册顺序、自引用和循环关系。
- 已有表只在启动时报告外键漂移，不自动执行 `ALTER TABLE`。
- 表管理 sync plan/apply 在事务和 advisory lock 内复检 catalog 与孤儿数据后显式应用外键。
- 第一批关系和删除动作必须逐项确认；本 change 不夹带删表、数据导出或数据库公共入口调整。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `server-drizzle-database`: 增加外键目标描述、两阶段缺失表初始化、catalog diff 和已有表受控同步要求。

## Impact

- 影响 `apps/server/src/database/structure`、Drizzle 表关系声明、表管理 sync plan/apply 与相关 DTO。
- 可能为保留表增加数据库约束；任何已有表变更必须经过显式预演与应用，不在普通启动中执行。
