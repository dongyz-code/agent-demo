## Context

`refactor-file-processing-task-management` 已把文件业务收敛到“上传一个文件、可选进入 RAG、一次预处理与 RAG 接入即一个可追溯任务”的模型，统一了任务数据模型、文件处理任务、管理端页面与任务中心。但其落地的 `hooks/file` 只是 `re-export` 转发壳：实现仍散落在 `hooks/upload`、`hooks/document`、`hooks/rag` 三个旧目录；新旧两套处理流水线都在跑（`document/processing/runner` 与 `file/tasks/file-processing/runner` 的 `stableParsedBlockId`、`getErrorCode`、`runStage` 逐字重复）；`file/errors.ts` 的 `FileProcessingError extends Error` 绕开统一 `ROOT_ERROR`，因无 `statusCode` 导致该域 `not-found`/`bad-request`/`conflict` 错误在 fastify `normalizeError` 处全部塌缩成 500；`router/routes` 顶层散落 `file.*`、`document.*`、`upload.*`、`file-processing.*` 路由，且每个 route 仅引用一个 service 方法；`hooks/task/lib.ts` 的通用查询层硬编码了 `file_processing_tasks`/`files`/`rag_datasets` 领域字段；`dependency-boundaries.test.ts` 只约束旧三目录、对 `hooks/file` 完全失明。

本设计接续并完成该 change：做真物理迁移而非再加一层门牌，把实现归入单一 `hooks/documents` 域并下线旧目录，routes 收敛到 `documents/` 下且最多两层，取消 route→service 薄封装，统一错误处理。

约束：服务端无内置测试 runner（测试在 `apps/client` 与少量 `node:test`）；所有产出物用简体中文；不改变数据库表结构（纯代码迁移）；保留已上传文件、文档版本、Segment、知识库及关联数据。

## Goals / Non-Goals

**Goals:**

- 把 `hooks/upload`、`hooks/document`、`hooks/rag` 实现物理迁入单一 `hooks/documents` 域，删除旧目录与所有 `re-export` 兼容出口。
- routes 收敛到 `router/routes/documents/`，路由名以 `/documents/` 为前缀且最多两层。
- 取消普通 CRUD 的 route→service 薄封装；多表状态、对象存储、复杂聚合和处理流水线继续作为 hooks 业务能力保留。
- 统一错误处理：删除 `FileProcessingError`，documents 域直接使用 `ROOT_ERROR`，修复 HTTP 500 塌缩。
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
  document/           文档复杂读取、版本、删除、清理和版本内容处理
  upload/             上传初始化、完成、Multipart 和私有会话规则
  preview/            页面查询、任务、转换器与执行器
  rag/                知识库文档关系与版本发布
  tasks/              文档任务详情、worker、lease 与阶段运行时
  storage/            模块内部对象与源文件能力
```

划分依据：按用户可识别的功能和后台状态边界，而非按旧目录名。解析、标准化和 Segment 归 `document/content`，同一 DocumentVersion 与配置只处理一次；`rag` 只维护知识库关系和 active/pending 发布，通用任务租约归 `tasks`；File 行与 S3 原语只作为模块内部实现存在。

**替代方案**：保留 `stages/` 五个转发壳文件。否决：每个 stage 仅一行调用，纯增加跳转层级，内容 runner 直接调用解析、标准化和 Segment 函数即可；关系发布作为 `rag/relations` 的批量条件更新保留，不为单个阶段再建目录。

### 决策 3：routes 收敛与最多两层

router loader 已支持递归加载、文件路径即路由（`server-fastify-route-foundation` 的“目录路由加载”requirement）。将 route 文件放入 `router/routes/documents/` 后，路由名自然变为 `/documents/<filename>`。文件名采用连字符 `<resource>-<action>`（如 `file-detail.ts` → `/documents/file-detail`）。之所以用连字符而非点：router loader 把文件名中的点视为路径分隔符（`app.create.ts` → `/sys/app/create`），若用 `file.detail.ts` 会得到 `/documents/file/detail` 三层；连字符保持单段，满足最多两层。路由命名映射示例：`file.detail`→`documents/file-detail`、`file.list`→`documents/file-list`、`upload.init`→`documents/upload-init`、`file-processing.create`→`documents/processing-create`、`file-processing.detail`→`documents/processing-detail`、`file-processing.cancel`→`documents/processing-cancel`、`file-processing.retry`→`documents/processing-retry`（`file-processing` 资源缩短为 `processing`；`document.{list,detail,remove}` 为前端未调用的孤立路由，直接删除）。

**为什么最多两层**：旧路由已有三层倾向（如 `/document/processing-list`、`/file-processing/task-create`）。收敛到 `/documents/<resource.action>` 统一深度，避免任务中心、文件管理、知识库各自不同层级，降低前端路由表维护成本。

**替代方案 A**：保留路由名不变（`/file/detail`），仅物理归类到 `documents/`。否决：loader 的“文件路径即路由”约定会使路由名变成 `/documents/file.detail`，强保留旧名需改 loader 支持显式路由名声明，增加机制复杂度，且用户已接受 BREAKING。

**替代方案 B**：按资源合并多接口到一个文件（`documents/files.ts` 含 list/detail/remove）。否决于本次：需改 loader 支持单文件多路由，超出“收敛”目标，留作后续优化。

### 决策 4：普通 route 直接 ORM，复杂流程进入 hooks

普通单表查询、分页和简单条件更新由 route 直接使用 ORM。被多个入口复用，或涉及多表事务、状态迁移、对象存储、复杂聚合和后台执行的逻辑进入 `hooks/documents`。route 不得自行组合 File、S3 与 worker 内部原语。

**判定准则**：引用次数不是唯一条件；单入口复杂流程仍应作为业务函数，单入口普通 CRUD 不建立薄封装。

**替代方案**：保留 service 层但合并三 service 为一。否决：用户明确要求薄系统不引入 route→service 间接层，保留即违背诉求。

### 决策 5：统一错误处理

删除 `FileProcessingError extends Error`，documents 域业务错误直接抛出项目统一 `ROOT_ERROR` 实例。调用点使用已注册的 `ROOT_ERROR` 键表达 HTTP 语义（`非法参数`→400、`认证: 权限不足`→403、`相关文件不存在`→404、`数据异常`→409、`服务异常`→500），不再维护额外领域错误工厂或 `kind` 映射层。固定错误只传已注册的错误键；第二参数只用于补充无法在错误定义中预先表达的运行时上下文，不重复固定业务错误码或文案。

**修复 HTTP 500 塌缩**：`ROOT_ERROR` 带 `statusCode`，fastify `normalizeError` 可正确读取，file 侧业务错误不再塌缩 500。

**替代方案**：给 `FileProcessingError` 补 `statusCode` 字段而不删它。否决：保留两套错误体系（`ROOT_ERROR` 与自定义类）持续产生维护负担；直接使用 `ROOT_ERROR` 是更少一层的做法。

### 决策 6：旧流水线下线与公共 helper 抽取

退役 `document/processing/runner` 与 `service`，统一走 `processing` worker。`stableParsedBlockId`、`getErrorCode`、`runStage`/`runTaskStage`、`assertXxxNotCanceled` 等逐字重复的函数抽入 `task-runtime`/`content` 公共位置，单一份。`legacy.ts` 的旧表只读投影保留（启动时同步，不重跑）。旧 `document.*` 路由下线。

### 决策 7：`hooks/task` 解耦

`task/lib.ts` 的 `sqlList`/`sqlCounts` 剥离硬编码的 `file_processing_tasks`/`files`/`rag_datasets` leftJoin 与 `file_task` 字段。documents 域任务列表/统计由 documents 域 route 自行查询（route 内联），通用任务中心只保留领域无关的 `tasks` 主表查询与子进程任务执行框架。彻底删除 `InitTaskRun` 的子进程执行框架（`scripts`/`add`/`handle`/`kill`/`types`/spawn 部分，`scripts` 已空属死基建），并移除 `sys/task.add`、`task.kill`、`task.types` 路由。查询层（`sqlList`/`sqlCounts`/`sqlLogsById`）剥离 `file_processing_tasks`/`files`/`rag_datasets` 硬编码字段后保留为领域无关的 `tasks` 主表查询供任务中心；documents 域任务详情由 documents route 自行补充领域字段。

## Risks / Trade-offs

- **[BREAKING 路由名变化导致前端与管理端大面积改动]** → 迁移计划阶段 4 前后端分批切；提供完整路由映射表；lint 阶段 grep 旧路径残留。
- **[迁移期双端可用性]** → 阶段 2 将旧目录 `re-export` 方向反转为“旧目录转发到 documents”，保证迁移期 import 不断；阶段 5 才物理删除旧目录。
- **[物理迁移引入回归]** → 每阶段独立提交并跑 `pnpm turbo lint`；处理流水线有 `upload-rag.integration.test.ts` 与 `minio.integration.test.ts` 守护；迁移以“移动 + 调整 import”为主，不重写逻辑。
- **[route 直接 ORM 后出现重复]** → 只允许局部普通查询；出现第二个真实消费者或多表状态规则时再提取业务函数。
- **[错误统一改动面大]** → 错误码枚举与 kind 集中后，全量替换为常量引用；保留错误码字符串值不变以兼容已有日志与前端错误码判断。
- **[边界检查可能漏检]** → 类型检查配合静态搜索，确认 routes 只直接 ORM 或精确导入业务文件，不导入内部原语。

## Migration Plan

1. **阶段 1 骨架与底座**：创建 `hooks/documents` 功能目录和 README；不建立根 barrel，documents 域错误直接使用 `ROOT_ERROR`。无行为变化。
2. **阶段 2 物理迁移实现**：把 `hooks/upload`、`hooks/document`、`hooks/rag` 的实现文件搬入 `hooks/documents` 对应功能目录，调整为精确 import；旧目录只在迁移窗口临时转发，完成后删除。合并重复 service，并仅为真实复用提取 helper。
3. **阶段 3 流水线统一**：退役 `document/processing` runner/service，`processing` worker 统一承载；抽 `stableParsedBlockId`/`getErrorCode`/`runStage` 为 `task-runtime` 单一份；`content` 算法归位。
4. **阶段 4 routes 收敛与前端迁移**：route 文件迁入 `router/routes/documents/`，文件名用连字符 `<resource>-<action>.ts`，路由名变 `/documents/<resource-action>`；对外 API 一次性切换，不保留 `/file/*` 与 `/documents/*` 并存的兼容代理层，旧路由直接删除，前后端同批迁移；`@repo/types` 路由类型迁移到 `documents.*`。
5. **阶段 5 下线与校验**：删除 `hooks/upload`、`hooks/document`、`hooks/rag`、旧 `file.*`/`document.*`/`upload.*`/`file-processing.*` route 文件；删除 `hooks/file` 转发壳；重写 `dependency-boundaries.test.ts` 覆盖 `hooks/documents`；`hooks/task` 剥离 documents 领域字段；运行 `pnpm turbo lint` 与集成测试。

**回滚**：每阶段独立提交。阶段 2 的 re-export 反转保证可随时回退到旧目录实现；阶段 4 前后端可分别回滚；阶段 5 删除前确认无残留引用。

## Open Questions

- 路由命名映射表定稿：`file.*`→`file-*`、`upload.*`→`upload-*`、`file-processing.*`→`processing-*`、`rag.dataset-*`/`rag.dataset-document-*`→`dataset-*`/`dataset-document-*`（知识库管理一并并入 documents 域）；`document.{list,detail,remove}` 孤立路由删除。`processing-cancel/detail/retry` 保留任务中心权限键（`actions.task.kill/retry`、`pages.sys.sys.task`），`processing-create` 用 `actions.documents.process`；`pages.rag` 分组并入 `pages.documents`（`pages.documents.dataset`），`actions.rag.*`→`actions.documents.dataset-*`。
- `document_processing_jobs` 与 `document_processing_stage_runs` 旧表的物理清理时机（本次保留只读投影，清理留作后续 change）。

已决策（2026-07-12）：路由用连字符 `documents/<resource>-<action>`；`InitTaskRun` 子进程执行框架彻底删除；对外 API 一次性切换、无兼容代理层。
