> 2026-07-23 延期说明：当前运行时不存在任何 Drizzle 外键声明或外键生命周期消费者，以下任务均未实施且不应伪造完成。本 change 使用 `--skip-specs` 归档；后续只有在出现明确业务外键关系时才能重新提出。

## 1. 外键目标描述

- [ ] 1.1 为外键目标、catalog 实态和 diff 类型增加约束名、本地列、引用 schema/table/列、onUpdate 与 onDelete 字段及中文 TSDoc
- [ ] 1.2 从 Drizzle table config 归一化单列、复合、自引用和显式命名外键，未命名关系使用确定性名称
- [ ] 1.3 将主 spec 中 Drizzle schema 目录对应的当前代码说明统一为 `database/tables`

## 2. Catalog 与差异

- [ ] 2.1 扩展 PostgreSQL catalog snapshot，按列顺序读取并归一化外键实态
- [ ] 2.2 扩展结构 diff，分别报告缺失、额外和定义变化的外键及关联列
- [ ] 2.3 更新表管理详情 DTO 与投影，使管理员可以核对外键目标态和数据库实态

## 3. DDL 与启动流程

- [ ] 3.1 实现使用受控标识符、确定性约束名和完整动作的外键 ADD/DROP DDL 生成器
- [ ] 3.2 将空 schema 启动同步改为先创建全部缺失表、索引和 trigger，再为本次新表创建目标外键
- [ ] 3.3 确认已有表外键漂移在普通启动中只记录、不执行 ALTER TABLE

## 4. 受控同步

- [ ] 4.1 扩展 sync plan，列出外键新增、删除或变更、孤儿检查、删除语义、风险和阻塞项
- [ ] 4.2 扩展 sync apply，在事务与 advisory lock 内复检计划、catalog 和孤儿数据后执行确定 DDL
- [ ] 4.3 确认存在孤儿、计划过期或删除语义未确认时 apply 拒绝执行且不修改业务数据

## 5. 首批关系

- [ ] 5.1 建立当前 21 张目标表的关系矩阵，只选择列类型一致、所有权明确且删除动作可解释的首批外键
- [ ] 5.2 为首批关系补充 Drizzle 声明，默认 RESTRICT，纯子记录才使用 CASCADE，可空列才使用 SET NULL
- [ ] 5.3 将 `documents.active_version_id` 等无法表达完整业务一致性的关系明确列为暂缓，不猜测应用

## 6. 验收

- [ ] 6.1 使用现有 TypeScript 执行入口核对 descriptor、DDL 和 diff 的单列、复合、自引用、循环及漂移输出
- [ ] 6.2 分别演练空 schema 初始化和已有 schema 启动，确认前者两阶段建外键、后者只报告漂移
- [ ] 6.3 运行 `pnpm --filter @repo/deploy-server lint`、OpenSpec strict 与 `git diff --check`
