> 2026-07-23 规范治理复核：本清单基于已经过期的 26 表实态，剩余工作已拆分到 `simplify-database-access`、`remove-upload-part-projection` 和 `add-drizzle-foreign-key-lifecycle`。未完成项保持未勾选，本 change 不再继续实施。

## 1. 基线与退役清单

- [ ] 1.1 完成 `consolidate-documents-domain` 尚未执行的 `upload-rag.integration.test.ts` 与 `minio.integration.test.ts`，保存通过结果作为本变更行为基线
- [ ] 1.2 生成当前 26 张注册表的业务所有者、写路径、读路径或产品预留理由、保留理由和清理策略清单，并断言五张退役表与二十一张保留表分类完整且无重复
- [ ] 1.3 为五张退役表实现只读预检，返回物理存在状态、精确行数、依赖对象和是否必须导出，并为无表、空表、非空表覆盖测试
- [ ] 1.4 记录第一批外键关系、删除动作、孤儿检查 SQL 和暂缓关系，明确 `documents.active_version_id` 是否进入本批

## 2. 删除无效运行时投影

- [ ] 2.1 修改 Multipart 恢复路由，只使用 MinIO/S3 `ListParts` 计算分片、已上传字节和缺失编号，不再写入 `file_upload_parts`
- [ ] 2.2 为 Multipart 恢复补充聚焦测试，验证刷新恢复结果不依赖 PostgreSQL 分片记录
- [ ] 2.3 修改文档创建流程，不再写入 `file_references`，并保证文档与版本创建仍处于单个数据库事务的一致边界
- [ ] 2.4 修改文件删除与清理保护，直接按 `document_versions.source_file_id` 判断占用，并覆盖被引用拒绝、未引用删除和逻辑删除幂等测试
- [ ] 2.5 修改文件处理结果持久化，不再删除或插入 `document_parsed_blocks`，继续原子替换最终 `document_segments`
- [ ] 2.6 为处理成功和失败补充测试，验证解析块只在流水线内传递、Segment 与任务错误行为不变
- [ ] 2.7 删除旧 `document_processing_jobs`/`document_processing_stage_runs` 兼容投影及遗留类型引用，确认新任务只访问统一任务三表
- [ ] 2.8 增加 Agent 表保留断言，确认 `agent_conversations`、`agent_messages` 及其共享类型、Drizzle 导出和启动注册保持不变

## 3. 收敛 Drizzle 注册表

- [ ] 3.1 从 `tables/index.ts` 的导出、`managedTableRegistry` 和 `bootstrappedTableRegistry` 中移除五张退役表，同时保留两张 Agent 表
- [ ] 3.2 删除退役表 schema 定义并整理相邻表文件，保持二十一张保留表的字段和索引不发生无关变化
- [ ] 3.3 增加注册表清单测试，断言启动注册表恰好包含二十一张预期表、包含两张 Agent 表且每张表只注册一次
- [ ] 3.4 更新 documents README、数据库说明和早期变更的过渡性描述，明确分片、文件占用和解析块的新事实来源
- [ ] 3.5 运行服务端类型检查并使用静态搜索确认五张退役表在运行时代码中零引用

## 4. 受控物理退役

- [ ] 4.1 在一次性 `tsx` 维护脚本与扩展表管理 plan/apply 之间完成选择，并在设计中记录最终入口和权限边界
- [ ] 4.2 实现机器可读退役 plan，保存目标 schema、五张表的 catalog 指纹、行数、依赖、生成时间、过期时间和阻塞项
- [ ] 4.3 实现非空表导出校验，记录导出格式、位置、列清单、行数和 SHA-256，且禁止把业务导出数据写入 Git 工作区
- [ ] 4.4 实现显式 apply 确认与 catalog 指纹复检，按依赖顺序幂等执行限定白名单中的 `DROP TABLE`
- [ ] 4.5 为过期计划、实态变化、导出缺失、摘要不匹配、目标已不存在和部分失败场景补充测试
- [ ] 4.6 在测试数据库执行完整 plan/export/apply 演练，验证五张表删除、二十一张保留表（含两张 Agent 表）和服务重启均正常
- [ ] 4.7 物理删除生产或共享环境中的退役表前单独取得操作确认；未确认时仅交付维护能力和预演报告

## 5. Drizzle 外键目标描述与 DDL

- [ ] 5.1 扩展结构类型，为目标外键描述增加约束名、本地列、引用 schema/table/列及更新删除动作的中文 TSDoc
- [ ] 5.2 从 Drizzle `getTableConfig().foreignKeys` 归一化外键，保证复合外键、自引用和显式命名均得到确定描述
- [ ] 5.3 实现独立的外键 DDL 生成器，使用受控标识符与确定性约束名生成幂等 `ALTER TABLE ... ADD CONSTRAINT`
- [ ] 5.4 重构启动同步为“创建全部缺失表后创建其外键”两阶段流程，已有表缺失外键时只报告漂移
- [ ] 5.5 扩展 catalog 归一化与结构 diff，准确区分缺失、额外和定义变化的外键，不再把所有外键笼统标为复杂约束
- [ ] 5.6 为 descriptor、DDL、空 schema 初始化、循环关系和已有表启动不自动变更约束补充聚焦测试

## 6. 已有表外键受控同步

- [ ] 6.1 扩展表管理 sync plan，列出待新增外键、对应孤儿检查、风险和阻塞项
- [ ] 6.2 扩展 sync apply，在事务与 advisory lock 内复检 catalog 和孤儿数据后应用外键
- [ ] 6.3 为 `user_role`、文件上传/派生物、文档版本/Segment、知识库关联、文件任务扩展/阶段记录声明第一批稳定外键
- [ ] 6.4 逐项固定 `CASCADE`、`RESTRICT` 或 `SET NULL` 行为，并为父记录删除和子记录清理补充集成测试
- [ ] 6.5 在现有数据库生成孤儿报告；先修复或记录阻塞数据，再通过受控 sync 分批应用约束
- [ ] 6.6 更新表管理详情和差异 DTO/页面，使外键目标与数据库实态可被管理员核对

## 7. 验收

- [ ] 7.1 运行 documents 上传、Multipart 恢复、预览、处理、知识库关联、删除保护和任务时间线集成测试
- [ ] 7.2 在空 schema 启动服务，验证二十一张表（含两张 Agent 表）、索引、trigger 和首批外键均成功创建且第二次启动幂等
- [ ] 7.3 在含历史表的 schema 启动服务，验证只报告五张未注册物理表而不自动删除或改写数据
- [ ] 7.4 运行 `pnpm --filter @repo/deploy-server lint` 与 `pnpm turbo lint`
- [ ] 7.5 运行 OpenSpec 校验并核对 proposal、design、specs、tasks 的退役清单、保留清单和迁移顺序一致

## 8. 数据库访问入口收敛

- [x] 8.1 将 `database/index.ts` 收敛为 `db` 和 `schemas`，删除连接池转发、客户端类型、Drizzle 二次导出、查询 helper 和未使用映射
- [x] 8.2 将调用方迁移为 `schemas` 与 Drizzle 原生 API，使用表 `$inferSelect/$inferInsert` 替代绑定管理白名单的通用类型
- [x] 8.3 运行服务端 lint、OpenSpec strict、旧导出零引用审计和 `git diff --check`
