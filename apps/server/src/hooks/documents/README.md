# documents 模块

`hooks/documents` 只承载文档中心的复用业务、复杂查询、多表状态迁移、对象存储编排和后台任务。普通单表查询、分页和简单条件更新由 `router/routes/documents` 直接使用 ORM，不为它们建立 Repository 或薄 service。

Document 是公共业务主体，DocumentVersion 表示不可变内容，File 只作为版本内部源对象存在。管理端文档业务使用 `documentId` 与可选 `documentVersionId`，不依赖 `fileId`。

## 目录职责

- `document/`：复杂文档搜索与详情、版本创建和切换、逻辑删除与异步清理；`content/` 负责版本级解析、标准化、Segment 和唯一内容任务。
- `file/`：文件上传初始化、完成、Multipart 操作、会话状态、策略、内容验证，以及内部 S3 client、对象命令、签名和源文件读取；已上传分片以对象存储 `ListParts` 为唯一事实来源，不维护数据库分片投影。
- `preview/`：页面窗口、预览任务、页面转换器和 worker 执行体。
- `rag/`：文档知识库关系集合以及 active/pending 版本的批量条件发布。
- `tasks/`：文档任务详情、任务中心补充查询、worker、lease 和阶段运行时。
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
- 预览转换、文档版本内容处理、RAG 关系发布、任务取消状态收敛、lease 与后台执行。

`searchDocuments` 是文档列表和知识库文档列表共用的复杂聚合查询。它在固定批量查询中返回当前版本源文件摘要、版本数量、封面和知识库状态；不得拆成 File ID 列表后逐条查询。

## 依赖方向

```text
routes ──普通查询/更新────────────▶ database
routes ──复杂业务────────────────▶ document / file / preview / rag / tasks
file ────────────────────────────▶ document + preview
preview ─────────────────────────▶ document + file + tasks
document/content ────────────────▶ file + tasks + rag relations
rag/assignment ─────────────────▶ document content task + rag relations
tasks/worker ────────────────────▶ document cleanup + content runner + preview runner
```

`config.ts` 是域内共享叶子：document/file/preview/rag/tasks 各子模块读取其调参与外部服务端点，它只读 `ROOT`、不反向依赖任何子模块。S3 连接信息以 `ROOT.storage.s3` 为规范源，由 `file` 直接消费。

routes 不得直接导入 `file/source.ts`、S3 对象命令、parser、worker claim、lease 续租或阶段持久化函数。

## 验证

服务端类型检查使用 `pnpm --filter @repo/deploy-server lint`，OpenSpec 使用 strict 校验，交付前同时运行 `git diff --check`。
