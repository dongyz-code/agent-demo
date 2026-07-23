## 1. 当前实现复核

- [ ] 1.1 确认 `database/index.ts` 只导出 `db` 与 `schemas`，`client.ts` 不导出 pool 或额外客户端类型
- [ ] 1.2 确认 `tables/index.ts` 只汇总表定义，managed 与 bootstrapped registry 仅位于 `tables/registry.ts`
- [ ] 1.3 确认业务调用方使用 `schemas.<table>`、Drizzle 原生表达式和表 `$inferSelect/$inferInsert`

## 2. 旧出口清理审计

- [ ] 2.1 静态确认旧查询 helper、排序 helper、`countRows`、通用 `Db`/`SqlData` 类型和连接池转发零引用
- [ ] 2.2 若审计发现漂移，只修复数据库访问边界，不修改表定义或业务查询语义

## 3. 验收

- [ ] 3.1 运行 `pnpm --filter @repo/deploy-server lint`
- [ ] 3.2 运行 OpenSpec strict 与 `git diff --check`，记录当前代码已经满足 capability 后完成归档准备
