# documents 模块

`hooks/documents` 只承载文档中心的复用业务、复杂查询、多表状态迁移、文件使用编排和后台任务。通用文件上传、验证、存储与 URL 生成统一由 `hooks/upload` 管理。普通单表查询、分页和简单条件更新由 `router/routes/documents` 直接使用 ORM，不为它们建立 Repository 或薄 service。

Document 是公共业务主体，DocumentVersion 表示不可变内容，File 是 upload 管理的通用文件，文档版本通过内部源文件标识引用它。绑定入口接收 upload 返回的 key；文档后续操作使用 `documentId` 与可选 `documentVersionId`。

## 目录职责

- `document-action.ts`：文档查询、文件句柄绑定版本、删除、页面窗口、知识库分配以及处理任务的真实业务实现。
- `document-process-action.ts`：文档处理任务的入队、活动任务去重、取消、删除前批量撤销、详情和人工重试。
- `access.ts`：普通用户与系统管理员的数据范围、文档存在性校验和共同事务锁。
- `document/index.ts`：把可信源文件统一解析、清洗并切分为 Segment，同时暴露文档物理清理流程；parser 和切分算法是目录内部实现。
- `preview/index.ts`：统一暴露预览支持检测、配置版本以及页面生成和原子发布流程；`converter.ts` 只负责格式转换。
- `preview/database.ts`：预览状态与双层页面集合的持久化，格式转换不访问数据库。
- `rag/index.ts`：统一暴露知识库关系变更以及解析结果的持久化、向量写入和关系发布流程；索引和关系文件是目录内部实现。
- `tasks/process.ts`：`document.process` 脚本、预览与 RAG 编排，以及执行异常和主动取消共用的失败处理；具体状态写入仍交给各领域能力。
- `tasks/cleanup.ts`：`document.cleanup` 脚本及逻辑删除入队。
- `config.ts`：域内共享调参常量与外部服务端点归一化（叶子，只读 `ROOT`，不依赖子模块）。

模块根目录不维护 `index.ts`。routes 只通过 Action 调用复杂业务；Action 直接承载流程实现，不作为其他文件的重导出门面。`document`、`preview`、`rag` 三个业务子目录以 `index.ts` 作为能力边界，`tasks` 只保留 `process.ts` 和 `cleanup.ts`；目录外运行时代码不得穿透引用实现文件。普通业务能力不接收 `TaskRunContext`，任务脚本负责把取消、进度和 checkpoint 转换为普通输入。

## 边界规则

以下逻辑直接留在 route：

- 知识库基础创建、列表、详情、更新和停用。
- 文档默认 RAG 开关等简单条件更新。

以下逻辑进入 hooks：

- 被多个入口复用的业务能力。
- 多表事务、并发锁或状态机。
- 数据库与通用文件、worker 的一致性编排；文件传输状态机与会话所有权由 upload 管理。
- 文档聚合、页面签名窗口和任务时间线等复杂查询。
- 预览转换、文档版本内容处理、RAG 关系发布、任务取消的领域状态收敛和业务脚本。

`documentAction.search` 是文档列表和知识库文档列表共用的复杂聚合查询。它在固定批量查询中返回当前版本源文件摘要、版本数量、封面和知识库状态；不得拆成 File ID 列表后逐条查询。

## 依赖方向

```text
routes ──普通查询/更新────────────▶ database
routes/upload ──文件传输─────────▶ hooks/upload
routes ──文档业务────────────────▶ documentAction
documentAction ─────────────────▶ hooks/upload + preview/index + rag/index + document-process-action + tasks/cleanup
document-process-action ────────▶ tasks/process + preview/index + rag/index
document / preview ────────────▶ hooks/upload + database
rag ───────────────────────────▶ database
hooks/tasks/worker ─────────────▶ 脚本加载器按 script_path 加载默认执行函数
documents/tasks/process ───────▶ preview/index + rag/index
documents/tasks/cleanup ───────▶ document/index + document-process-action
```

`config.ts` 是域内共享叶子：document/preview/rag/tasks 读取文档处理调参与外部服务端点，它只读 `ROOT`、不反向依赖子模块。S3 连接与上传传输配置由 `hooks/upload` 独立消费；documents 不持有存储适配器。预览页面保存通用 `file_id`，转换器只接收元数据与读取流工厂。

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
同版本且操作完全被活动任务覆盖时复用任务；部分重叠的操作拒绝入队。已上传文件的版本绑定与预览入队、版本切换与 RAG 入队、
知识库关系变更与 RAG 入队均共享事务；这些入口不复用活动 RAG 任务，冲突时
整体回滚并提示稍后重试，避免任务已发布后新关系停留 pending。

所有文档生命周期写入使用 `access.ts` 的同一 `document:<id>` 事务锁。发布和失败
收敛在获取锁后重新检查执行权，取消任务不再能覆盖后续执行的状态。逻辑删除、
撤销活动处理、移除关系和创建清理任务同事务提交。每次生成页面都通过 upload 分配新的不可变文件句柄，防止重试覆盖前一次执行仍被引用的页面。

文件通过 `/upload/complete` 完成验证并返回稳定 key，再通过 `/documents/document-version-create` 绑定文档。任务入队失败回滚文档绑定，已验证文件保留，客户端只重试绑定。下载和页面接口先校验文档权限，再通过 upload 批量生成短期 URL。

本次抽离改变 `files` 用途字段、上传会话文档字段与双层页面表文件引用；列漂移需要迁移数据或按既有 reset 流程处理，具体见 `hooks/upload/README.md`。未执行数据库重置。

文档任务通过 `tasks.correlation_id` 关联文档，通过通用 `tasks.checkpoint` 在自动重试间
恢复远程解析；任务状态、进度、结果、attempt 和日志全部保存在通用任务表，不再维护文档
专用任务表或阶段表。终态后的人工重试会创建新任务。部署前需要 reset 旧
`file_processing_tasks` 和 `file_processing_task_stage_runs` 数据。

## 验证

服务端类型检查使用 `pnpm --filter @repo/server lint`，OpenSpec 使用 strict 校验，交付前同时运行 `git diff --check`。不要为任务模块新增测试文件或独立检验脚本。
