## Why

`hooks/documents` 已集中上传、文件、预览、文档处理、知识库和任务能力，但当前 40 个 TypeScript 文件形成了与说明不一致的循环依赖、过宽的 barrel 出口和多项无消费者抽象；核心 `runner.ts` 又把 worker、状态机、阶段记录和内容落库堆在 527 行中。更严重的是，规范宣称完成的边界测试、上传/RAG 集成测试和 task-runtime 并不存在，任务恢复也只有“从头重跑”却使用 heartbeat/checkpoint 语义，需要在继续扩展 RAG 前先让结构与真实能力一致。

## What Changes

- 保留单一 `hooks/documents` 域，不重新拆回 `hooks/upload`、`hooks/document`、`hooks/rag`，继续按 storage/upload/files/preview/processing/knowledge 职责组织。
- 把域内依赖收敛为单向 DAG：子模块不得导入根 `documents/index.ts`，`files` 不再反向依赖 `processing`，消除 `files ↔ processing` 和根 barrel 循环。
- 删除根 `index.ts` service locator；routes、server 和跨域任务中心精确导入所需业务文件，S3 client、worker 内部控制函数、provider/parser 实现和纯内部 helper 不对 route 暴露。
- 删除确认无消费者的常量、类型和函数，合并仅承载少量类型、状态判断或转发导出的小文件；目标是减少无业务边界的文件，而不是机械追求最少文件数。
- 保留有多个真实实现的 parser/preview provider 注册机制，以及 S3 internal/public signing client、commands、presign 的基础设施边界。
- 将文件处理 runtime 明确为“数据库领取 + lease heartbeat + 进程失效后从头重试”，不再把仅含统计数量的 JSON 描述为可恢复 checkpoint。
- 处理 worker 失效时必须终结遗留的 pending stage run，再创建新 attempt；长阶段执行期间持续刷新 lease，避免滚动部署或多实例误领取。
- 把 527 行 runner 按“worker 生命周期/领取”和“单任务执行/阶段持久化”拆成两个稳定职责，不新增通用 task-runtime 框架。
- 补齐真实存在、可执行的依赖边界测试、上传完成测试、worker 领取/heartbeat/恢复/取消测试与核心纯函数测试；删除 OpenSpec 和 README 中不存在的测试、目录和 API 描述。
- 保持现有 `/documents/*` API、权限键、DTO、对象存储布局和管理端交互不变；本变更不修改数据库表数量，减表由 `simplify-database-schema` 独立处理。

## Capabilities

### New Capabilities

- `documents-domain-maintainability`: 定义 documents 域的单向依赖、显式公共 API、抽象准入、目录收敛、文档真实性和可执行测试要求。
- `file-processing-worker-runtime`: 定义文件处理 worker 的数据库领取、lease heartbeat、失效恢复、阶段 attempt、取消和从头重试语义。

### Modified Capabilities

无。

## Impact

- 服务端：`apps/server/src/hooks/documents` 全目录、documents routes 的 import、`apps/server/src/server.ts` 和系统任务中心 routes。
- 测试：为 `apps/server` 增加可执行的 documents 聚焦测试入口；补回此前规格声称存在但仓库实际缺失的测试覆盖。
- 运行时：文件处理任务对外状态不变，但长阶段会刷新 lease，进程失效后的旧 pending 阶段会明确终结并从第一阶段重跑。
- 代码组织：预计从 40 个 TypeScript 文件收敛到约 28～32 个；最终数量由真实职责决定，不作为单独验收条件。
- 依赖关系：本变更可先完成测试与循环依赖修复；涉及 `document_parsed_blocks` 的清理应与 `simplify-database-schema` 的对应任务协调，避免重复修改同一持久化代码。
