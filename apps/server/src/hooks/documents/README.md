# documents 域

`hooks/documents` 是文件上传、文件管理、预览、文档处理、知识库和文件处理任务的单一业务域。域外代码统一从 `hooks/documents/index.ts` 使用公共用例；具体 HTTP 流程由 `router/routes/documents/` 直接编排。

## 当前目录

- `storage/`：S3 client、对象命令和预签名 URL，隔离内部连接与公共签名连接。
- `upload/`：上传策略、会话查询、对象 key 和内容校验纯逻辑。上传流程不使用独立状态机，由 upload routes 按数据库会话状态直接处理。
- `files/`：文件查询、文件信息转换，以及逻辑文档和 Segment 持久化。
- `preview/`：direct、image、text、office 多实现预览 provider 及选择 registry。
- `knowledge/`：知识库查询、更新和文档关联。
- `processing/`：处理定义、任务查询、worker 调度、单任务 runner、任务中心富化和处理算法。
- `tests/`：依赖边界、纯函数、上传完成、worker 和可选基础设施集成测试。

## 依赖边界

域内依赖遵循以下方向：

```text
storage ─────▶ files ─────▶ knowledge ─────▶ processing
   │                              ▲               │
   └────────▶ preview             └───────────────┘

upload 独立提供策略、会话判断、对象 key 和验证逻辑
routes/server ─▶ documents/index.ts
```

箭头表示右侧模块可以依赖左侧模块。子模块不得反向导入根 `index.ts`，`files` 不得依赖 `processing`。域内按明确实现文件导入，不为每个子目录维护纯转发 barrel。

根 `index.ts` 使用显式白名单，仅公开以下域外用例：

- 对象命令与预签名 URL。
- 上传策略、会话、对象 key 和内容校验。
- 文件/文档查询转换与预览 provider 选择。
- 知识库查询、更新与文档关联。
- 文件处理任务创建/查询、worker 启动和任务中心富化。

S3 client、具体 preview/parser 实现、任务 claim、stale 恢复、单任务 runner 和阶段持久化均为内部实现，不通过根出口公开。

## Worker 语义

`processing/worker.ts` 负责定时 drain、并发容量、原子 claim、lease heartbeat、stale 恢复和调度；`processing/runner.ts` 负责单任务阶段顺序、取消检查与结果持久化。两者是不同运行时职责，不抽取通用 task runtime。

任务执行期间通过 `task_id + pending + lease token` 条件续租。续租失败或状态不匹配后，当前执行器不得提交后续阶段或业务结果。stale 恢复会终结遗留 pending stage，并创建递增 attempt，从 reading 阶段重新执行；阶段统计不作为 checkpoint，也不会跳过处理阶段。

`stableParsedBlockId` 仍用于 `document_parsed_blocks` 的确定性持久化。该表及其写入由独立的 `simplify-database-schema` 变更移除后，才可一并删除该函数。

## 权限与兼容性

本次收敛不改变 `/documents/*` 路径、请求响应 DTO、权限键、业务错误码和对象存储 key。`listDocumentsByIds`、`getDocument`、`listRagDatasets` 等既有查询中的 `userId` 参数暂不改变；补充数据范围过滤属于权限行为变更，需要单独设计和验证。

## 测试

运行全部 documents 聚焦测试：

```bash
pnpm --filter @repo/deploy-server test:documents
```

默认运行依赖边界、纯函数和 worker 单元测试；需要 PostgreSQL、MinIO 的用例在环境不完整时会明确跳过。配置集成环境后运行完整流程：

```bash
DOCUMENTS_INTEGRATION_TEST=1 pnpm --filter @repo/deploy-server test:documents
```

服务端类型检查使用 `pnpm --filter @repo/deploy-server lint`，全仓验收使用 `pnpm turbo lint`。
