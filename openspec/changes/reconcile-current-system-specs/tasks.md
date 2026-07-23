## 1. 基线实态复核

- [ ] 1.1 对照当前 documents routes、hooks、公共 DTO 和表定义，逐项确认八个基线 capability 只描述已经确认且实际存在的行为
- [ ] 1.2 静态检索并确认基线 specs 不再要求 File 作为公共主体、旧多模式预览、checkpoint 跳阶段恢复或通用任务手动创建/停止能力
- [ ] 1.3 记录历史 capability 到八个基线 capability 的逐项映射，并确认每项仍有效 requirement 已被承接

## 2. 归档独立完成变更

- [ ] 2.1 对照当前共享权限定义、admin 路由和服务端守卫复核 `harden-admin-role-permissions`，记录实现与 delta 一致性
- [ ] 2.2 正常归档 `harden-admin-role-permissions`，确认 `admin-access-control` 已进入主 specs 且 strict 校验通过
- [ ] 2.3 对照当前 `VSchemaForm` 组件、导出类型和管理端用法复核 `add-schema-form-component`，记录实现与 delta 一致性
- [ ] 2.4 正常归档 `add-schema-form-component`，确认 `schema-form-component` 已进入主 specs 且 strict 校验通过

## 3. 归档文档演进历史

- [ ] 3.1 为五个文档历史 change 补充明确的 superseded 说明，并注明 `consolidate-documents-domain` 的遗留 integration test 任务已被后续删除测试决策取消，不伪造完成记录
- [ ] 3.2 使用 `--skip-specs` 归档 `add-rag-multipart-upload-management`，确认主 specs 未新增旧 File、预览或 RAG capability
- [ ] 3.3 使用 `--skip-specs` 归档 `refactor-file-processing-task-management`，确认主 specs 未新增 File 中心或 checkpoint 恢复要求
- [ ] 3.4 使用 `--skip-specs` 归档 `consolidate-documents-domain`，确认未完成的失效测试任务具有可追溯说明
- [ ] 3.5 使用 `--skip-specs` 归档 `simplify-documents-domain`，确认其有效边界和 lease 规则已经由本基线承接
- [ ] 3.6 使用 `--skip-specs` 归档 `redesign-document-centered-management`，确认其有效文档、版本、预览和 RAG 要求已经由本基线承接

## 4. 重建数据库变更基线

- [ ] 4.1 审计当前 schemas registry、实际表集合和 `simplify-database-schema` 已完成的 3 项任务，记录旧表数量及删除目标中的失效假设
- [ ] 4.2 创建 `simplify-database-access` change artifacts，只承接数据库出口与 schemas/registry 边界的已确认工作
- [ ] 4.3 创建 `remove-upload-part-projection` change artifacts，只描述当前仍存在的 `file_upload_parts` 和 Multipart 状态来源调整
- [ ] 4.4 创建 `add-drizzle-foreign-key-lifecycle` change artifacts，独立描述外键 descriptor、DDL、catalog diff 与受控 apply
- [ ] 4.5 校验三个后继 change 均从当前代码取基线、声明 `Supersedes: simplify-database-schema`，且不存在重复或互相依赖的任务
- [ ] 4.6 使用 `--skip-specs` 归档原 `simplify-database-schema`，确认已完成工作和剩余工作分别具有可追溯去向

## 5. 治理结果验证

- [ ] 5.1 运行 `openspec list`，确认 active changes 只剩本基线和三个边界明确的数据库后继 changes
- [ ] 5.2 运行 `openspec validate --all --strict`，确认主 specs、active changes 和归档历史全部通过严格校验
- [ ] 5.3 运行服务端 lint 与类型检查，确认基线描述对应的当前实现可通过仓库验证入口
- [ ] 5.4 运行语义检索，确认主 specs 中不存在 File/Document 主体、预览模式、checkpoint 恢复和任务控制面的互斥要求
- [ ] 5.5 运行差异检查并人工复核归档记录，确认本轮只修改 OpenSpec artifacts、没有业务代码或数据库变更
