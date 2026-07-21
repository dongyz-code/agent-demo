## Context

`hooks/documents` 当前包含 40 个 TypeScript 文件、约 3100 行；25 个 documents route 另有约 1500 行。目录表面上按 storage/upload/files/preview/processing/knowledge 拆分，但七个 barrel `index.ts` 逐层转发，根出口通配暴露全部能力。knowledge 和 processing 反向导入根出口，files 又直接导入 processing 的 definition，形成 `files ↔ processing` 与子模块到根 barrel 的循环。

抽象分布也不均衡：preview 有四个真实 provider、parser 有本地与远程两个真实实现，这些 registry 有价值；upload validator 却只有一个 Magic Number 实现，仍维护 interface、order 和数组。至少六个公开定义在工作区只有声明位置，部分 worker 内部函数和 S3 client 也通过 wildcard 意外进入根公共 API。

核心 runtime 的问题相反：`processing/runner.ts` 用 527 行承担 worker 定时器、任务领取、状态恢复、完整流水线、阶段记录、取消和内容持久化。`last_update_timestamp` 只在阶段边界更新，没有执行中 heartbeat；stale 恢复把任务重置到 queued，却不终结旧 pending stage；所谓 checkpoint 只保存 `processedItems`，下一次仍从 reading 全量重跑。

当前 `apps/server` 仅有一份 agents 测试，没有 documents 测试。`consolidate-documents-domain` 已勾选的依赖边界测试、task-runtime 和集成测试在仓库中不存在，README 仍引用旧 hooks、三个不存在的子目录和不存在的 `getReadyDocument`。

## Goals / Non-Goals

**Goals:**

- 保留 documents 单域，同时让域内依赖成为可测试的单向图。
- 把根公共 API 从 wildcard service locator 收敛为显式 use-case 列表。
- 删除无消费者和单实现提前抽象，合并没有独立职责的小文件。
- 保留 S3、preview provider、parser 与纯处理算法的真实边界。
- 让 worker 的 claim、heartbeat、取消和进程失效重试语义与实现一致。
- 建立真实可运行的 documents 测试入口，并修复 README/OpenSpec 实态漂移。

**Non-Goals:**

- 不恢复旧 upload/document/rag 顶层 hooks，也不建立新的跨域 service 层。
- 不把每个 route 的单次业务流程搬成同名 service；route 直接业务逻辑约定保持不变。
- 不实现阶段级业务 checkpoint、外部队列、分布式调度器或 exactly-once 执行。
- 不修改 `/documents/*` API、DTO、权限键、错误码和管理端页面。
- 不在本变更删除数据库表、增加外键或修改列；这些由 `simplify-database-schema` 负责。
- 不以固定文件数作为验收目标，也不为了缩短文件而合并真实外部系统或多实现边界。

## Decisions

### 决策 1：保留单域，内部使用明确依赖 DAG

目标依赖如下：

```text
storage ─────▶ files ─────▶ knowledge ─────▶ processing
   │                              ▲               │
   └────────▶ preview             └───────────────┘

upload 仅包含策略、会话判断、对象 key 和验证纯逻辑
routes/server ─▶ documents/index.ts（唯一域外入口）
```

箭头表示“被右侧依赖”。processing 可以使用 files 和 knowledge；knowledge 可以使用文件/文档查询；files 只能依赖 storage，不能读取 processing 配置。当前 `ensureDocumentForFile` 需要 normalizer 和 segment profile 的问题通过显式输入版本信息解决，由 processing 构造输入，files 不再反向读取 processing definition。

域内允许直接导入稳定实现文件，不再强制每个子目录都建一个 `index.ts`。边界由允许方向和根入口测试保证，而不是靠多层 barrel 表达。

备选方案是重新拆回三个顶层 hooks。否决原因是上传、文档和知识库仍属于同一用户流程，重新拆域不能解决循环和公共 API 过宽，只会恢复历史转发层。

### 决策 2：根出口使用显式白名单

根 `index.ts` 按 storage/upload/files/preview/knowledge/processing 分组显式导出域外实际消费者需要的符号。S3 client getter、具体 provider/parser、`recoverStaleFileProcessingTasks`、`runFileProcessingTask`、纯内部转换与测试 helper 不进入白名单。

所有 documents routes、`server.ts` 和 sys task routes 仍从根入口导入，域外不得深层导入。域内不得导入根入口，防止 root cycle。

备选方案是保留 `export *` 并依赖 TypeScript tree shaking。否决原因是服务端 ESM 不需要 bundle tree shaking来隐藏 API，wildcard 会让内部符号成为事实公共契约并掩盖循环。

### 决策 3：按证据删除和合并抽象

确认删除的无消费者定义包括 `FILE_PROCESSING_STAGES`、`FileProcessingPipelineResult`、`ReadyDocument`、`UploadFilePreview`、`listDocumentParsers`、`listStoredObjectKeys`。`stableParsedBlockId` 在 `simplify-database-schema` 删除解析块持久化后一起移除。

文件收敛方向：

- 删除只做转发的六个子模块 `index.ts`，根出口直接显式引用实现。
- `upload/state.ts` 合入会话 helper，`upload/types.ts` 的策略类型合入 policies，删除未使用预览别名。
- validators 删除单实现 registry，保留 SHA-256 与可信 MIME 两个直接函数。
- `files/types.ts` 合入查询文件；`processing/types.ts` 的输入和上下文分别归入 queries 与 runner。
- 删除过期 knowledge README，统一由域根 README 描述当前结构。
- `processing/ids.ts` 只保留确有跨算法复用的稳定 hash；错误码提取留在执行 runtime。

preview 和 parser registry 保留，因为已经有多个真实实现；storage 的 client/commands/presign 保留，因为内部连接和公共签名连接是不同安全边界。

备选方案是把所有代码合并成几个大文件。否决原因是当前 runner 已证明大文件会混合状态边界，精简目标是删除虚假边界而不是消灭真实边界。

### 决策 4：runner 只拆为 worker 与执行器

`worker.ts` 负责启动、定时 drain、原子 claim、lease heartbeat、stale 恢复和调度并发；`runner.ts` 负责单任务阶段顺序、阶段 attempt、取消检查、内容持久化和成功/失败提交。queries 与 task-center 继续独立，因为分别服务 documents routes 和 sys task routes。

不创建通用 `task-runtime/`，也不为 reading/parsing/normalizing/segmenting 建单行转发文件。未来出现第二种共享相同持久化状态机的任务后，再根据真实重复抽通用 runtime。

### 决策 5：采用 lease heartbeat 加从头重试

现有表已经可以用 `tasks.last_update_timestamp` 表示 lease 活跃度，无需新增列。claim 后启动 heartbeat，间隔取配置 stale 阈值的安全分数并设置合理上限；每次更新带 `task_id + status=pending` 条件。更新不到记录或数据库续租失败时设置本地 `leaseLost`，外部动作返回后先检查 lease，再持久化任何结果。

启动恢复在事务中完成两件事：把 stale 任务的 pending stage run 标记为 failed，错误码固定为 worker 失效；把任务重置为 `to-be-started/queued`。新 claim 从 reading 开始，attempt 基于历史记录递增。checkpoint 字段不再写入伪恢复数据，可暂时保持 null，列删除由未来数据库变更决定。

备选方案 A 是实现阶段 checkpoint。否决原因是 parser 返回块、Segment 数组和远程调用都没有可重放游标，真正 checkpoint 需要持久化大块中间产物，会重新引入刚准备删除的复杂度。

备选方案 B 是完全不 heartbeat、只依赖五分钟 stale。否决原因是滚动部署或多实例启动可能在长阶段仍执行时错误重置任务，导致重复写入和状态竞争。

### 决策 6：测试先于文件移动

先建立服务端 documents 测试命令和以下覆盖，再调整 import 与文件：

- 依赖边界：域外只导入根入口、域内不导入根入口、依赖方向不反转。
- 上传完成：普通/Multipart、幂等、对象校验失败和自动创建任务。
- worker：双实例 claim、heartbeat、lease 丢失、stale 恢复、stage 终结、取消。
- 纯函数：对象 key、Multipart 计划、MIME 回退、normalize、segment。

MinIO 真实集成测试需要可选环境变量并在缺少环境时明确 skip；单元测试不得依赖 MinIO。OpenSpec 只有在命令实际执行通过后才能勾选测试任务。

## Risks / Trade-offs

- [显式根出口遗漏 route 依赖] → 先生成当前域外 import 清单，逐项迁移并由 TypeScript 检查兜底。
- [消除循环时改变初始化顺序] → 先增加边界和服务启动测试，再逐条替换 import，不在同一步重写业务逻辑。
- [heartbeat 增加数据库写入] → 每个活跃任务只按安全间隔更新一行，间隔设置下限与上限，不跟随 2 秒 drain 频率。
- [lease 丢失时外部请求仍继续] → 外部调用保持超时，返回后禁止提交；后续 parser 支持 AbortSignal 时再增加主动取消。
- [从头重试重复计算] → Segment 与知识库关联继续使用确定性 ID/唯一约束和事务替换，明确接受重复计算而不是假装断点恢复。
- [小文件合并造成冲突] → 按子模块分批移动并保持每批可通过类型检查，数据库减表重叠代码由单一 change 负责。
- [此前完成状态失真] → 不直接改写历史任务记录，当前 README 只引用实际文件；归档前重新核对两个 change 的真实完成项。

## Migration Plan

1. 增加 documents 测试入口、依赖边界测试和核心纯函数测试，记录当前行为基线。
2. 将根 `index.ts` 改为显式导出，替换 knowledge/processing 对根出口的反向 import，并通过显式版本输入移除 files 对 processing 的依赖。
3. 实现 worker/runner 两职责拆分、lease heartbeat、stale stage 终结和从头重试测试；保持 API 状态枚举不变。
4. 删除无消费者定义，合并 upload/files/processing 小文件，删除六个子 barrel，逐批运行类型检查与测试。
5. 更新 documents README，删除过期 knowledge README，核对所有目录/API/测试引用存在。
6. 与 `simplify-database-schema` 协调解析块持久化和 `stableParsedBlockId` 清理，确保同一代码只由一个变更实施。
7. 运行服务端 documents 测试、服务端 lint、全仓 lint 和 OpenSpec strict 校验，再执行上传/RAG/任务中心管理端回归。

回滚按阶段进行：边界和出口改动可整批回退；worker 改动独立回退到原 runner；文件移动最后执行且不改变行为。数据库减表一旦物理执行，回滚按其独立导出恢复方案处理，不由本变更承担。

## Open Questions

- heartbeat 间隔采用 `min(30s, staleTaskSeconds / 3)` 还是新增独立配置；推荐从 stale 阈值推导并设置最小 1 秒，避免再增加配置项。
- 当前 `listDocumentsByIds`、`getDocument`、`listRagDatasets` 的 `userId` 参数没有参与数据过滤。本变更只删除误导参数还是补充数据范围权限，需结合现有单租户/多租户目标决定；权限行为变化应单独立项，不混入结构精简。
