# documents 模块

`hooks/documents` 只承载文档中心的复用业务、复杂查询、多表状态迁移、对象存储编排和后台任务。普通单表查询、分页和简单条件更新由 `router/routes/documents` 直接使用 ORM，不为它们建立 Repository 或薄 service。

Document 是公共业务主体，DocumentVersion 表示不可变内容，File 只作为版本内部源对象存在。管理端文档业务使用 `documentId` 与可选 `documentVersionId`，不依赖 `fileId`。

## 目录职责

- `document/`：复杂文档搜索与详情、版本创建和切换、逻辑删除与异步清理；`content/` 只负责版本级解析、标准化和 Segment runner。
- `file/`：文件上传初始化、完成、Multipart 操作、会话状态、内容验证，以及 S3 对象存储适配器和源文件读取；已上传分片以对象存储 `ListParts` 为唯一事实来源，不维护数据库分片投影。
- `preview/`：页面窗口、页面转换器和预览 runner。
- `rag/`：文档知识库关系集合以及 active/pending 版本的批量条件发布。
- `tasks/`：文档整体任务创建、脚本执行、详情、取消和阶段时间线；通用状态机与进程监督位于 `hooks/tasks`。
- `config.ts`：域内共享调参常量与外部服务端点归一化（叶子，只读 `ROOT`，不依赖子模块）。

模块不维护根 `index.ts`。routes、server 和任务中心精确导入功能明确的业务文件，避免根 barrel 重新暴露 File 行、S3、parser 或 worker 内部控制函数。

## 边界规则

以下逻辑直接留在 route：

- 知识库基础创建、列表、详情、更新和停用。
- 文档默认 RAG 开关等简单条件更新。

以下逻辑进入 hooks：

- 被多个入口复用的业务能力。
- 上传会话所有权校验与状态机约束。
- 多表事务、并发锁或状态机。
- 数据库与对象存储、worker 的一致性编排。
- 文档聚合、页面签名窗口和任务时间线等复杂查询。
- 预览转换、文档版本内容处理、RAG 关系发布、任务取消的领域状态收敛和业务脚本。

`searchDocuments` 是文档列表和知识库文档列表共用的复杂聚合查询。它在固定批量查询中返回当前版本源文件摘要、版本数量、封面和知识库状态；不得拆成 File ID 列表后逐条查询。

## 依赖方向

```text
routes ──普通查询/更新────────────▶ database
routes ──复杂业务────────────────▶ document / file / preview / rag / tasks/task
file ────────────────────────────▶ document + preview
preview ─────────────────────────▶ document + file + documents/tasks/task
document/content ────────────────▶ file + documents/tasks/task + rag relations
rag/assignment ─────────────────▶ document content task + rag relations
hooks/tasks/worker ─────────────▶ 独立 Node 任务子进程
documents/tasks/runtime ────────▶ document cleanup + content runner + preview runner
```

`config.ts` 是域内共享叶子：document/file/preview/rag/tasks 各子模块读取其调参与外部服务端点，它只读 `ROOT`、不反向依赖任何子模块。S3 连接信息以 `ROOT.storage.s3` 为规范源，由 `file` 直接消费。

routes 不得直接导入 `file/source.ts`、S3 对象命令、parser、worker claim、lease 续租或阶段持久化函数。documents 域只允许从 `hooks/tasks/task.ts` 导入 `task`、脚本运行参数和公开生命周期类型，不得查询或写入 `tasks`、`task_attempts`、`task_logs`。

## 后台任务接入

`tasks/` 只保留三个文件：`task.ts` 是业务唯一入口，负责入队、详情和取消；
`runtime.ts` 是子进程直接加载的脚本并负责领域生命周期；`stage.ts` 负责内容和预览共用的阶段执行。
文档域只创建一个名为 `document.process` 的整体任务，data 使用有序 `parts` 选择内容、预览和清理。
内容与预览可以在同一 task ID 内组合执行，也可以只指定一个并跳过其余部分；清理必须独占任务。
业务调用方不接触 script、通用任务状态或扩展表写入。

内容、预览和删除流程只调用 `tasks/task.ts` 的领域函数。该入口把固定 script 和领域 data 交给
单对象 `task.add`；通用任务和 `file_processing_tasks` 扩展由 task 包内部事务及脚本 `onCreate`
一起保存。runner 只使用 `TaskRunInput` 记录日志、更新进度和检查取消。

`file_processing_tasks` 保存人工执行序号和文档关联，`file_processing_task_stage_runs` 保存
不可覆盖的业务阶段时间线；通用 `task_attempts` 保存自动执行尝试。自动重试不增加业务执行
序号，终态后的人工重试或重新执行才创建新任务和新的业务执行序号。

## 验证

服务端类型检查使用 `pnpm --filter @repo/deploy-server lint`，OpenSpec 使用 strict 校验，交付前同时运行 `git diff --check`。
