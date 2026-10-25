# documents 模块

`hooks/documents` 只承载文档中心的复用业务、复杂查询、多表状态迁移、对象存储编排和后台任务。普通单表查询、分页和简单条件更新由 `router/routes/documents` 直接使用 ORM，不为它们建立 Repository 或薄 service。

Document 是公共业务主体，DocumentVersion 表示不可变内容，File 只作为版本内部源对象存在。管理端文档业务使用 `documentId` 与可选 `documentVersionId`，不依赖 `fileId`。

## 目录职责

- `upload-action.ts`：上传初始化、状态、分片、取消、完成和文件验证的真实业务实现。
- `document-action.ts`：文档查询、版本、删除、页面窗口、知识库分配以及处理任务的真实业务实现。
- `document-process-action.ts`：文档处理任务的入队、取消、详情和人工重试。
- `document/index.ts`：把可信源文件统一解析、清洗并切分为 Segment，同时暴露文档物理清理流程；parser 和切分算法是目录内部实现。
- `file/index.ts`：统一暴露数据库文件读取、可信源文件流和对象存储能力；`objects.ts` 只实现 S3 命令。已上传分片以对象存储 `ListParts` 为唯一事实来源，不维护数据库分片投影。
- `preview/index.ts`：统一暴露预览支持检测、配置版本以及页面生成和原子发布流程；`converter.ts` 只负责格式转换。
- `rag/index.ts`：统一暴露知识库关系变更以及解析结果的持久化、向量写入和关系发布流程；索引和关系文件是目录内部实现。
- `tasks/process.ts`：`document.process` 脚本、预览与 RAG 编排和失败状态收敛。
- `tasks/cleanup.ts`：`document.cleanup` 脚本及逻辑删除入队。
- `config.ts`：域内共享调参常量与外部服务端点归一化（叶子，只读 `ROOT`，不依赖子模块）。

模块根目录不维护 `index.ts`。routes 只通过 Action 调用复杂业务；Action 直接承载流程实现，不作为其他文件的重导出门面。`document`、`file`、`preview`、`rag` 四个业务子目录以 `index.ts` 作为能力边界，`tasks` 只保留 `process.ts` 和 `cleanup.ts`；目录外运行时代码不得穿透引用实现文件。普通业务能力不接收 `TaskRunContext`，任务脚本负责把取消、进度和 checkpoint 转换为普通输入。

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

`documentAction.search` 是文档列表和知识库文档列表共用的复杂聚合查询。它在固定批量查询中返回当前版本源文件摘要、版本数量、封面和知识库状态；不得拆成 File ID 列表后逐条查询。

## 依赖方向

```text
routes ──普通查询/更新────────────▶ database
routes ──上传业务────────────────▶ uploadAction
routes ──文档业务────────────────▶ documentAction
uploadAction ────────────────────▶ documentAction + file/index
documentAction ─────────────────▶ file/index + preview/index + rag/index + document-process-action + tasks/cleanup
document-process-action ────────▶ tasks/process + preview/index + rag/index
document / preview / rag ───────▶ file/index + database
hooks/tasks/worker ─────────────▶ 脚本加载器按 script_path 加载默认执行函数
documents/tasks/process ───────▶ preview/index + rag/index
documents/tasks/cleanup ───────▶ document/index
```

`config.ts` 是域内共享叶子：document/file/preview/rag/tasks 各子模块读取其调参与外部服务端点，它只读 `ROOT`、不反向依赖任何子模块。S3 连接信息以 `ROOT.storage.s3` 为规范源，由 `file/index.ts` 创建的统一文件能力直接消费。

routes 不得绕过子目录能力边界导入 S3 对象命令、parser、converter、关系实现、worker claim、lease 续租或阶段持久化函数。documents 域只允许从 `hooks/tasks/task.ts` 导入 `defineTask`、`task`、任务上下文和公开类型，不得查询或写入 `tasks`、`task_attempts`、`task_logs`。

## 后台任务接入

`tasks/` 只保留两个文件：

- `process.ts`：定义 `document.process`，默认执行函数组合预览与 RAG。
- `cleanup.ts`：定义 `document.cleanup`，逻辑删除和入队在领域事务内完成；默认执行函数清理对象存储和领域行。

两个任务共享 `document` 并发分组。调用方只写：

```ts
await enqueueDocumentProcess(
  { documentId, operations: ['preview', 'rag'], triggerSource: 'manual' },
  userId,
);
await enqueueDocumentCleanup(documentId, userId);
```

调用方不提交 fileId、配置版本、脚本入口、展示名称、重试、超时或并发。预览已就绪时
`enqueueDocumentProcess` 返回 `null`，不会创建重复任务。取消通过
`cancelDocumentProcessingTask` 在同一事务内更新任务和领域状态。

文档任务通过 `tasks.correlation_id` 关联文档，通过通用 `tasks.checkpoint` 在自动重试间
恢复远程解析；任务状态、进度、结果、attempt 和日志全部保存在通用任务表，不再维护文档
专用任务表或阶段表。终态后的人工重试会创建新任务。部署前需要 reset 旧
`file_processing_tasks` 和 `file_processing_task_stage_runs` 数据。

## 验证

服务端类型检查使用 `pnpm --filter @repo/server lint`，OpenSpec 使用 strict 校验，交付前同时运行 `git diff --check`。不要为任务模块新增测试文件或独立检验脚本。
