## Context

`refactor-file-processing-task-management` 已把文件业务收敛到“上传一个文件、可选进入 RAG、一次预处理与 RAG 接入即一个可追溯任务”的模型，统一了任务数据模型、文件处理任务、管理端页面与任务中心。但其落地的 `hooks/file` 只是 `re-export` 转发壳：实现仍散落在 `hooks/upload`、`hooks/document`、`hooks/rag` 三个旧目录；新旧两套处理流水线都在跑（`document/processing/runner` 与 `file/tasks/file-processing/runner` 的 `stableParsedBlockId`、`getErrorCode`、`runStage` 逐字重复）；`file/errors.ts` 的 `FileProcessingError extends Error` 绕开统一 `ROOT_ERROR`，因无 `statusCode` 导致该域 `not-found`/`bad-request`/`conflict` 错误在 fastify `normalizeError` 处全部塌缩成 500；`router/routes` 顶层散落 `file.*`、`document.*`、`upload.*`、`file-processing.*` 路由，且每个 route 仅引用一个 service 方法；`hooks/task/lib.ts` 的通用查询层硬编码了 `file_processing_tasks`/`files`/`rag_datasets` 领域字段；`dependency-boundaries.test.ts` 只约束旧三目录、对 `hooks/file` 完全失明。

本设计接续并完成该 change：做真物理迁移而非再加一层门牌，把实现归入单一 `hooks/documents` 域并下线旧目录，routes 收敛到 `documents/` 下且最多两层，取消 route→service 薄封装，统一错误处理。

约束：服务端无内置测试 runner（测试在 `apps/client` 与少量 `node:test`）；所有产出物用简体中文；不改变数据库表结构（纯代码迁移）；保留已上传文件、文档版本、Segment、知识库及关联数据。

## Goals / Non-Goals

**Goals:**

- 把 `hooks/upload`、`hooks/document`、`hooks/rag` 实现物理迁入单一 `hooks/documents` 域，删除旧目录与所有 `re-export` 兼容出口。
- routes 收敛到 `router/routes/documents/`，路由名以 `/documents/` 为前缀且最多两层。
- 取消 route→service 薄封装，route 直接写业务逻辑；处理流水线 runner 作为 runtime 保留。
- 统一错误处理：删除 `FileProcessingError`，单一 `createDomainError` 工厂接入 `ROOT_ERROR`，修复 HTTP 500 塌缩。
- 退役旧 `document/processing` 流水线，抽公共 helper 消除重复。
- `hooks/task` 通用框架与 documents 域解耦，重写边界测试覆盖新域。

**Non-Goals:**

- 不改变任务数据模型与表结构（`tasks`、`file_processing_tasks`、`file_processing_task_stage_runs` 已由 refactor 落地，沿用）。
- 不实现 Embedding、Elasticsearch 索引或检索/回答（“RAG 接入”仍只表示生成稳定 Segment 并建立知识库关联）。
- 不在本次清理 `document_processing_jobs` 旧表数据（保留只读投影，后续单独清理）。
- 不重构管理端文件管理页面与任务中心 UI（refactor 已完成，仅迁移 API 调用路径）。

## Decisions

### 决策 1：单域命名为 `documents` 而非保留 `file`

`file` 一词无法覆盖文档内容、知识库、处理流水线等语义，且 `hooks/file` 已与“转发壳”强绑定，保留该名会延续历史包袱。`documents`（复数）更准确地表达“文件及其文档化生命周期”的单一域，与旧 `hooks/document`（单数、已废弃）区分。

**替代方案**：保留 `hooks/file` 改名为 `hooks/documents` 仅做重命名。否决：重命名而不下线旧目录会重演“门牌迁移”，必须同时物理搬迁实现并删除 `upload`/`document`/`rag`。

### 决策 2：子模块划分

```
hooks/documents/
  index.ts            公共出口
  errors.ts           单一 createDomainError + kind 映射
  types.ts            域自有类型（不再 re-export 旧模块）
  storage/            S3 原语：client/commands/presign/object-key
  upload/             上传会话生命周期：init/finish/sign/cancel/session（合并旧 init/upload/session 三 service）
  files/              文件行 CRUD + 流 + 下载 + 引用 + 清理 + management 聚合查询
  preview/            预览 provider + service（registry 内联，删死代码）
  content/            parser/normalizer/segmenter —— 算法单一一份
  processing/         任务化流水线：runner/service/definition，stages 内联或保留为阶段逻辑
  knowledge/          rag dataset + 文档关联
  task-runtime/       通用 task-stage 框架（claim/runStage/persist/fail/恢复），被 processing 复用
```

划分依据：按生命周期与职责，而非按旧目录名。`content` 收纳纯算法（parser/normalizer/segmenter），`processing` 承载有状态编排，二者分离使算法可被独立测试与复用。`task-runtime` 抽取两套 runner 重复的领取/阶段记录/状态机，供 `processing` 复用，避免再次双轨。

**替代方案**：保留 `stages/` 五个转发壳文件。否决：每个 stage 仅一行调用，纯增加跳转层级，runner 直接调 `content` 函数即可。若某阶段确有独立逻辑（如 rag-ingestion 的幂等关联），作为 `processing` 内函数保留，不单列文件。

### 决策 3：routes 收敛与最多两层

router loader 已支持递归加载、文件路径即路由（`server-fastify-route-foundation` 的“目录路由加载”requirement）。将 route 文件放入 `router/routes/documents/` 后，路由名自然变为 `/documents/<filename>`。文件名采用连字符 `<resource>-<action>`（如 `file-detail.ts` → `/documents/file-detail`）。之所以用连字符而非点：router loader 把文件名中的点视为路径分隔符（`app.create.ts` → `/sys/app/create`），若用 `file.detail.ts` 会得到 `/documents/file/detail` 三层；连字符保持单段，满足最多两层。路由命名映射示例：`file.detail`→`documents/file-detail`、`file.list`→`documents/file-list`、`upload.init`→`documents/upload-init`、`file-processing.create`→`documents/processing-create`、`file-processing.detail`→`documents/processing-detail`、`file-processing.cancel`→`documents/processing-cancel`、`file-processing.retry`→`documents/processing-retry`（`file-processing` 资源缩短为 `processing`；`document.{list,detail,remove}` 为前端未调用的孤立路由，直接删除）。

**为什么最多两层**：旧路由已有三层倾向（如 `/document/processing-list`、`/file-processing/task-create`）。收敛到 `/documents/<resource.action>` 统一深度，避免任务中心、文件管理、知识库各自不同层级，降低前端路由表维护成本。

**替代方案 A**：保留路由名不变（`/file/detail`），仅物理归类到 `documents/`。否决：loader 的“文件路径即路由”约定会使路由名变成 `/documents/file.detail`，强保留旧名需改 loader 支持显式路由名声明，增加机制复杂度，且用户已接受 BREAKING。

**替代方案 B**：按资源合并多接口到一个文件（`documents/files.ts` 含 list/detail/remove）。否决于本次：需改 loader 支持单文件多路由，超出“收敛”目标，留作后续优化。

### 决策 4：去 service 层，route 内联业务

route handler 直接编写 DB 查询、对象存储调用、任务编排。仅当一段逻辑被≥2 个 route 复用时，才提取为 `hooks/documents` 内的领域函数。有状态的处理流水线（worker/阶段编排/心跳）作为 `processing` runtime 保留，不属于“service 中间层”——它是后台执行体，route 只触发任务创建/取消。

**判定准则**：若一个函数仅被单个 route 引用，且无独立测试价值，则其内容应内联进 route；若被多处引用或有状态机/算法独立性，则作为领域函数或 runtime 保留。`init-upload-session` 这类被 orchestration 与 route 共用的逻辑保留为领域函数。

**替代方案**：保留 service 层但合并三 service 为一。否决：用户明确要求薄系统不引入 route→service 间接层，保留即违背诉求。

### 决策 5：统一错误处理

删除 `FileProcessingError extends Error`，统一为 `createDomainError(code, message, kind)` 工厂，返回 `ROOT_ERROR` 实例。`kind` 枚举（`bad-request`/`forbidden`/`not-found`/`conflict`/`internal`/`unavailable`）集中到 `@repo/types`，取代 document/upload/file 三套不一致的 kind。错误码集中为 `@repo/types` 枚举（参照现有 `UploadErrorCode`），取代散落字面量。底层错误（解析器/标准化器/存储）改抛 `createDomainError`，废除“消息前缀 + 正则提取”约定。

**修复 HTTP 500 塌缩**：`ROOT_ERROR` 带 `statusCode`，fastify `normalizeError` 可正确读取，`kind`→中文 key→HTTP code 链路恢复，file 侧业务错误不再塌缩 500。

**替代方案**：给 `FileProcessingError` 补 `statusCode` 字段而不删它。否决：保留两套错误体系（`ROOT_ERROR` 与自定义类）持续产生维护负担，且 `kind` 死字段问题仍在；统一为单一工厂是根治。

### 决策 6：旧流水线下线与公共 helper 抽取

退役 `document/processing/runner` 与 `service`，统一走 `processing` worker。`stableParsedBlockId`、`getErrorCode`、`runStage`/`runTaskStage`、`assertXxxNotCanceled` 等逐字重复的函数抽入 `task-runtime`/`content` 公共位置，单一份。`legacy.ts` 的旧表只读投影保留（启动时同步，不重跑）。旧 `document.*` 路由下线。

### 决策 7：`hooks/task` 解耦

`task/lib.ts` 的 `sqlList`/`sqlCounts` 剥离硬编码的 `file_processing_tasks`/`files`/`rag_datasets` leftJoin 与 `file_task` 字段。documents 域任务列表/统计由 documents 域 route 自行查询（route 内联），通用任务中心只保留领域无关的 `tasks` 主表查询与子进程任务执行框架。彻底删除 `InitTaskRun` 的子进程执行框架（`scripts`/`add`/`handle`/`kill`/`types`/spawn 部分，`scripts` 已空属死基建），并移除 `sys/task.add`、`task.kill`、`task.types` 路由。查询层（`sqlList`/`sqlCounts`/`sqlLogsById`）剥离 `file_processing_tasks`/`files`/`rag_datasets` 硬编码字段后保留为领域无关的 `tasks` 主表查询供任务中心；documents 域任务详情由 documents route 自行补充领域字段。

## Risks / Trade-offs

- **[BREAKING 路由名变化导致前端与管理端大面积改动]** → 迁移计划阶段 4 前后端分批切；提供完整路由映射表；lint 阶段 grep 旧路径残留。
- **[迁移期双端可用性]** → 阶段 2 将旧目录 `re-export` 方向反转为“旧目录转发到 documents”，保证迁移期 import 不断；阶段 5 才物理删除旧目录。
- **[物理迁移引入回归]** → 每阶段独立提交并跑 `pnpm turbo lint`；处理流水线有 `upload-rag.integration.test.ts` 与 `minio.integration.test.ts` 守护；迁移以“移动 + 调整 import”为主，不重写逻辑。
- **[去 service 层后 route 文件变长]** → 接受单 route 文件略长，换取少一层跳转；长 route 通过提取复用领域函数控制，不以“每接口一 service”强行拆分。
- **[错误统一改动面大]** → 错误码枚举与 kind 集中后，全量替换为常量引用；保留错误码字符串值不变以兼容已有日志与前端错误码判断。
- **[边界测试重写可能漏检]** → 边界测试覆盖每个子模块的“不导入他子模块内部实现”，并覆盖 routes 只导入 `hooks/documents` 公共入口。

## Migration Plan

1. **阶段 1 骨架与底座**：创建 `hooks/documents` 目录、`index.ts`、`types.ts`、`errors.ts`（单一 `createDomainError` + 集中 kind）、`task-runtime/` 公共 helper；在 `@repo/types` 新增 kind 枚举与错误码枚举。无行为变化。
2. **阶段 2 物理迁移实现**：把 `hooks/upload`、`hooks/document`、`hooks/rag` 的实现文件搬入 `hooks/documents` 对应子模块，调整 import；旧目录改为 `re-export` 到 `hooks/documents`（方向反转，过渡期双端可用）。合并 init/upload/session 三 service，抽 `toUploadSessionInfo`/`getOwnedSession`/`getInternalFile`/`upsertFileVariant` 为单份。
3. **阶段 3 流水线统一**：退役 `document/processing` runner/service，`processing` worker 统一承载；抽 `stableParsedBlockId`/`getErrorCode`/`runStage` 为 `task-runtime` 单一份；`content` 算法归位。
4. **阶段 4 routes 收敛与前端迁移**：route 文件迁入 `router/routes/documents/`，文件名用连字符 `<resource>-<action>.ts`，路由名变 `/documents/<resource-action>`；对外 API 一次性切换，不保留 `/file/*` 与 `/documents/*` 并存的兼容代理层，旧路由直接删除，前后端同批迁移；`@repo/types` 路由类型迁移到 `documents.*`。
5. **阶段 5 下线与校验**：删除 `hooks/upload`、`hooks/document`、`hooks/rag`、旧 `file.*`/`document.*`/`upload.*`/`file-processing.*` route 文件；删除 `hooks/file` 转发壳；重写 `dependency-boundaries.test.ts` 覆盖 `hooks/documents`；`hooks/task` 剥离 documents 领域字段；运行 `pnpm turbo lint` 与集成测试。

**回滚**：每阶段独立提交。阶段 2 的 re-export 反转保证可随时回退到旧目录实现；阶段 4 前后端可分别回滚；阶段 5 删除前确认无残留引用。

## Open Questions

- 路由命名映射表定稿：`file.*`→`file-*`、`upload.*`→`upload-*`、`file-processing.*`→`processing-*`、`rag.dataset-*`/`rag.dataset-document-*`→`dataset-*`/`dataset-document-*`（知识库管理一并并入 documents 域）；`document.{list,detail,remove}` 孤立路由删除。`processing-cancel/detail/retry` 保留任务中心权限键（`actions.task.kill/retry`、`pages.sys.sys.task`），`processing-create` 用 `actions.documents.process`；`pages.rag` 分组并入 `pages.documents`（`pages.documents.dataset`），`actions.rag.*`→`actions.documents.dataset-*`。
- `document_processing_jobs` 与 `document_processing_stage_runs` 旧表的物理清理时机（本次保留只读投影，清理留作后续 change）。

已决策（2026-07-12）：路由用连字符 `documents/<resource>-<action>`；`InitTaskRun` 子进程执行框架彻底删除；对外 API 一次性切换、无兼容代理层。
