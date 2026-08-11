# documents 模块

`hooks/documents` 只承载文档中心的复用业务、复杂查询、多表状态迁移、对象存储编排和后台任务。普通单表查询、分页和简单条件更新由 `router/routes/documents` 直接使用 ORM，不为它们建立 Repository 或薄 service。

Document 是公共业务主体，DocumentVersion 表示不可变内容，File 只作为版本内部源对象存在。管理端文档业务使用 `documentId` 与可选 `documentVersionId`，不依赖 `fileId`。

## 目录职责

- `upload-action.ts`：上传初始化、状态、分片、取消、完成和文件验证的真实业务实现。
- `document-action.ts`：文档查询、版本、删除、页面窗口、知识库分配以及处理任务的真实业务实现。
- `document/index.ts`：把可信源文件统一解析、清洗并切分为 Segment，同时暴露文档物理清理流程；parser 和切分算法是目录内部实现。
- `file/index.ts`：统一暴露数据库文件读取、可信源文件流和对象存储能力；`objects.ts` 只实现 S3 命令。已上传分片以对象存储 `ListParts` 为唯一事实来源，不维护数据库分片投影。
- `preview/index.ts`：统一暴露预览支持检测、配置版本以及页面生成和原子发布流程；`converter.ts` 只负责格式转换。
- `rag/index.ts`：统一暴露知识库关系变更以及解析结果的持久化、向量写入和关系发布流程；索引和关系文件是目录内部实现。
- `tasks/index.ts`：文档任务子进程的唯一脚本入口，统一编排选中操作及创建、取消、失败生命周期；`stage.ts` 和 `types.ts` 分别保存阶段执行与数据契约。
- `config.ts`：域内共享调参常量与外部服务端点归一化（叶子，只读 `ROOT`，不依赖子模块）。

模块根目录不维护 `index.ts`。routes 只通过 `uploadAction` 和 `documentAction` 调用复杂业务；两个 Action 直接承载流程实现，不作为其他文件的重导出门面。五个子目录统一以 `index.ts` 作为能力边界，目录外运行时代码不得穿透引用其实现文件。业务处理能力不接收 `TaskRunInput`，任务入口负责把取消、进度和 checkpoint 转换为普通输入。

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
documentAction ─────────────────▶ file/index + preview/index + rag/index + task
document / preview / rag ───────▶ file/index + database
hooks/tasks/worker ─────────────▶ 独立 Node 任务子进程
documents/tasks/index ──────────▶ document/index + preview/index + rag/index
```

`config.ts` 是域内共享叶子：document/file/preview/rag/tasks 各子模块读取其调参与外部服务端点，它只读 `ROOT`、不反向依赖任何子模块。S3 连接信息以 `ROOT.storage.s3` 为规范源，由 `file/index.ts` 创建的统一文件能力直接消费。

routes 不得绕过子目录 `index.ts` 导入 S3 对象命令、parser、converter、关系实现、worker claim、lease 续租或阶段持久化函数。documents 域只允许从 `hooks/tasks/task.ts` 导入 `task`、脚本运行参数和公开生命周期类型，不得查询或写入 `tasks`、`task_attempts`、`task_logs`。

## 后台任务接入

`tasks/` 只保留三个文件：`index.ts` 是子进程直接加载的脚本并负责操作编排和领域生命周期；
`stage.ts` 负责 RAG 和预览操作的任务阶段记录；`types.ts` 保存主进程和 Worker 共用的 JSON 数据类型。
文档域只创建一个名为 `document.process` 的整体任务，data 使用 `operations` 选择 `preview`、`rag` 或 `cleanup`。
RAG 与预览可以在同一 task ID 内组合执行，也可以只指定一个；清理必须独占任务。
业务调用方不接触 script、通用任务状态或扩展表写入。

RAG、预览和删除统一通过 `documentAction.addDocumentTask` 入队。该对象把固定 script 和领域 data 交给
单对象 `task.add`；通用任务和 `file_processing_tasks` 扩展由 task 包内部事务及脚本 `onCreate`
一起保存。`tasks/index.ts` 只调用各目录 `index.ts` 暴露的普通业务能力，只有任务目录可以使用 `TaskRunInput`。

`file_processing_tasks` 保存人工执行序号和文档关联，`file_processing_task_stage_runs` 保存
不可覆盖的业务阶段时间线；通用 `task_attempts` 保存自动执行尝试。自动重试不增加业务执行
序号，终态后的人工重试或重新执行才创建新任务和新的业务执行序号。

## 验证

服务端类型检查使用 `pnpm --filter @repo/deploy-server lint`，OpenSpec 使用 strict 校验，交付前同时运行 `git diff --check`。
