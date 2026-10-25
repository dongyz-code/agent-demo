## 1. 简化任务 API

- [x] 1.1 将 `defineTask` 收窄为脚本路径、并发分组、重试和超时配置，只返回类型化 enqueue
- [x] 1.2 删除 `prepare`、`onCancel`、`onFailure`、WeakMap 定义存储和默认句柄反查
- [x] 1.3 将任务标识合并为持久化 `script_path`，更新查询、列表、过滤和管理端展示
- [x] 1.4 支持预先分配 taskId 和共享事务，由领域代码显式完成准备与入队

## 2. 脚本执行内核

- [x] 2.1 将模块加载器改为脚本加载器，按 `script_path` 调用默认导出函数
- [x] 2.2 保留原子领取、attempt、lease、分组并发、重试、超时、取消和 stale 恢复
- [x] 2.3 保留 PostgreSQL 任务、attempt 和结构化日志
- [x] 2.4 删除最终失败路径中的业务回调加载

## 3. documents 迁移

- [x] 3.1 将文档处理快照解析迁移到 `enqueueDocumentProcess` 显式领域函数
- [x] 3.2 将文档逻辑删除和清理任务创建迁移到 `enqueueDocumentCleanup`
- [x] 3.3 将文档取消收敛迁移到 `cancelDocumentProcessingTask`
- [x] 3.4 将 process 和 cleanup 改为默认导出执行函数
- [x] 3.5 更新上传、文档操作、取消路由和读取接口调用方
- [x] 3.6 更新 `hooks/tasks` 与 `hooks/documents` README

## 4. 验证

- [x] 4.1 运行服务端 TypeScript 检查
- [x] 4.2 运行 `@repo/types` TypeScript 检查
- [x] 4.3 运行修改文件 ESLint
- [x] 4.4 运行 OpenSpec strict 校验
- [x] 4.5 运行 `git diff --check`
- [x] 4.6 确认未新增 `*.test.ts` 或测试脚本

## 5. 移除文档专用任务层

- [x] 5.1 删除 `file_processing_tasks`、`file_processing_task_stage_runs` 和 `stage.ts`
- [x] 5.2 为通用任务增加 `correlation_id` 与自动重试 `checkpoint`
- [x] 5.3 删除文档任务对扩展表、执行序号、阶段 attempt 和结果摘要的依赖
- [x] 5.4 将 `tasks/process.ts` 收窄为任务声明、预览/RAG 执行和失败状态收敛
- [x] 5.5 将文档处理入队、取消、详情和人工重试迁移到 `document-process-action.ts`
- [x] 5.6 删除文档必须先取消活动处理任务，再创建清理任务

## 6. 简化后的验证

- [x] 6.1 运行服务端与共享类型 TypeScript 检查
- [x] 6.2 运行管理端类型检查
- [x] 6.3 运行修改文件 ESLint
- [x] 6.4 运行 OpenSpec strict 校验
- [x] 6.5 运行 `git diff --check`
