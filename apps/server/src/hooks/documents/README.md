# documents 模块

`hooks/documents` 只承载文档中心的复用业务、复杂查询、多表状态迁移、对象存储编排和后台任务。普通单表查询、分页和简单条件更新由 `router/routes/documents` 直接使用 ORM，不为它们建立 Repository 或薄 service。

Document 是公共业务主体，DocumentVersion 表示不可变内容，File 只作为版本内部源对象存在。管理端文档业务使用 `documentId` 与可选 `documentVersionId`，不依赖 `fileId`。

## 目录职责

- `document/`：复杂文档搜索与详情、版本创建和切换、逻辑删除与异步清理。
- `upload/`：上传初始化、完成、Multipart 操作、会话状态规则、策略和内容验证。
- `preview/`：页面窗口、预览任务、页面转换器和 worker 执行体。
- `rag/`：文档知识库关系、RAG 任务、版本发布和解析切分 pipeline。
- `tasks/`：文档任务详情、任务中心补充查询、worker、lease 和阶段运行时。
- `storage/`：模块内部 S3 client、对象命令、签名和文档源文件读取。

模块不维护根 `index.ts`。routes、server 和任务中心精确导入功能明确的业务文件，避免根 barrel 重新暴露 File 行、S3、parser 或 worker 内部控制函数。

## 边界规则

以下逻辑直接留在 route：

- 知识库基础创建、列表、详情、更新和停用。
- 上传会话列表与单会话状态。
- 文档默认 RAG 开关等简单条件更新。
- 任务取消等单表状态更新。

以下逻辑进入 hooks：

- 被多个入口复用的业务能力。
- 多表事务、并发锁或状态机。
- 数据库与对象存储、worker 的一致性编排。
- 文档聚合、页面签名窗口和任务时间线等复杂查询。
- 预览转换、RAG pipeline、lease 与后台执行。

`searchDocuments` 是文档列表和知识库文档列表共用的复杂聚合查询。它在固定批量查询中返回当前版本源文件摘要、版本数量、封面和知识库状态；不得拆成 File ID 列表后逐条查询。

## 依赖方向

```text
routes ──普通查询/更新────────────▶ database
routes ──复杂业务────────────────▶ document / upload / preview / rag / tasks
upload ──────────────────────────▶ document + preview + rag + storage
preview ─────────────────────────▶ document + storage + tasks
rag ─────────────────────────────▶ document + storage + tasks
tasks/worker ────────────────────▶ document cleanup + preview runner + rag runner
```

routes 不得直接导入 `storage/source.ts`、S3 对象命令、parser、worker claim、lease 续租或阶段持久化函数。

## 验证

服务端类型检查使用 `pnpm --filter @repo/deploy-server lint`，OpenSpec 使用 strict 校验，交付前同时运行 `git diff --check`。
