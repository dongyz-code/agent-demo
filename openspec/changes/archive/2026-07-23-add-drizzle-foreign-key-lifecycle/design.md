## Context

当前表定义位于 `apps/server/src/database/tables`，自管结构层能描述列、主键、索引和 trigger，但 `TableTargetDescriptor`、catalog snapshot、diff 与 DDL 都没有外键目标态。启动同步逐表创建缺失表，已有表只报告当前可识别漂移。

外键涉及注册顺序、循环关系、历史孤儿数据和删除语义，必须与数据库入口收敛及删表解耦。普通启动对已有表仍遵循“只报告、不修改”的仓库约束。

## Goals / Non-Goals

**Goals:**

- 让目标 descriptor、catalog 和 diff 使用同一外键结构。
- 让空 schema 能按两阶段方式创建新表及其外键。
- 让已有表外键通过表管理 plan/apply 受控变更。
- 修正主 spec 中已经过期的 schema 目录位置。

**Non-Goals:**

- 不删除表、不重构数据库公共入口、不自动修复孤儿数据。
- 不在启动时修改已有表外键。
- 不一次性为所有 UUID 字段猜测关系和删除动作。

## Decisions

### 1. 外键进入统一目标描述

`describeTableTarget` 从 Drizzle table config 读取外键，归一化约束名、本地列、引用 schema/table/列及 onUpdate/onDelete。复合外键保持列顺序，显式名优先；未显式命名时使用确定性命名规则。

### 2. catalog 与 diff 比较语义而非原始 SQL

catalog snapshot 将 PostgreSQL 外键归一化为同一结构。diff 区分缺失、额外和定义变化，不把所有外键压缩为“复杂约束”。

### 3. 缺失表初始化使用两阶段流程

启动同步先在 advisory lock 下创建全部缺失表、索引和 trigger，再为本次新建表创建目标外键。这样不要求 registry 拓扑排序，并允许自引用与循环关系。

备选方案是把外键内联到 CREATE TABLE。当前注册顺序和循环关系使该方案脆弱，不采用。

### 4. 已有表只报告漂移

启动发现已有表缺少、额外或改变外键时只记录 drift。表管理 sync plan 展示目标、孤儿检查和风险；apply 在事务与 advisory lock 内复检 catalog 和孤儿数据后执行确定 DDL。

### 5. 关系和删除动作逐项确认

实施先建立关系矩阵，只有本地列与引用列类型一致、业务所有权明确且 onDelete/onUpdate 行为可解释的关系才能进入首批。默认使用 RESTRICT；纯子记录才使用 CASCADE，SET NULL 要求本地列可空。

### 6. 验证使用聚焦执行入口

仓库当前没有独立服务端测试配置，本 change 不扩张为测试框架建设。descriptor、DDL 和 diff 通过已有可执行的 TypeScript 校验入口、空 schema 演练、server lint 与人工 SQL 审阅验证。

## Risks / Trade-offs

- [历史孤儿阻止约束应用] → plan 展示阻塞数量和样例，apply 在数据清理前拒绝执行。
- [CASCADE 造成误删] → 默认 RESTRICT，逐关系审查并在 plan 中明确删除动作。
- [循环关系创建失败] → 只在全部缺失表创建完成后单独 ADD CONSTRAINT。
- [启动意外修改已有库] → 已有表外键永远只报告 drift，DDL 仅由显式 sync apply 执行。
- [规范目录与当前代码继续漂移] → 本 delta 同时把主 spec 路径从 `database/schema` 修正为 `database/tables`。

## Migration Plan

1. 修正 schema 目录规范并定义外键目标、catalog 与 diff 类型。
2. 实现确定性外键 DDL 和缺失表两阶段初始化。
3. 扩展表管理 sync plan/apply 的外键预演、孤儿检查和复检。
4. 建立首批关系矩阵，逐项声明关系与删除动作。
5. 在空 schema 和已有 schema 分别演练：前者创建目标外键，后者只报告 drift。
6. 运行服务端 lint、OpenSpec strict 和差异检查。

回滚时先停止新增外键 apply；已应用约束通过受控 sync 反向计划删除，不能由普通启动自动回滚。

## Open Questions

- `documents.active_version_id` 是否进入首批，取决于能否表达并验证“active version 必须属于同一 document”的复合一致性；未确认前只保留应用层校验。
