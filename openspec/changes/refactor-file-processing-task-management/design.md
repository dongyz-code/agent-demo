## Context

当前实现已经具备 MinIO/S3 上传、文件验证与预览、文档解析与 Segment、知识库与文档关联，以及通用系统任务中心。但同一条业务流程分散在 `hooks/upload`、`hooks/document`、`hooks/rag` 和管理端多个页面中：上传成功后由前端依次创建文档、等待处理并建立知识库关联；文档处理任务又独立于系统任务中心保存和展示。结果是用户需要理解“通用文件、上传会话、文档、知识库关联”等技术对象，维护者也需要在多个顶层 hook 间追踪一条文件流程。

本次重构以文件为业务中心。用户上传时只决定“是否进入 RAG”以及目标知识库；系统在文件验证成功后创建一个完整文件处理任务。一次任务内部包含预处理和 RAG 接入阶段，阶段用于进度和错误定位，但不会成为任务中心中的多条一级任务。每次重新执行创建一条新任务记录，以便统计执行次数和追溯历史。

现有高级 RAG 尚未实现 Embedding、Elasticsearch 混合索引、Reranker 和评估闭环。本次重构需要为这些阶段保留清晰扩展点，但不得伪造已经完成的索引能力。

## Goals / Non-Goals

**Goals:**

- 管理端只保留一个面向用户的文件管理入口，并在上传和文件操作中提供 RAG 处理选择。
- 一个文件的一次预处理与 RAG 接入对应一个任务记录，任务拥有明确阶段、进度、结果、错误和执行序号。
- 多文件上传按文件创建独立任务，允许并行执行且互不影响。
- 复用并增强现有系统任务中心，统一展示文件任务和原有系统任务。
- 将服务端复杂流程收敛到单一 `hooks/documents` 域并按功能组织，普通查询和简单更新直接留在 route。
- 保留现有文件、文档版本、解析块、Segment、知识库和历史任务数据，并提供渐进迁移方案。
- 保持 route 与 hooks 按复杂度分工、调用方精确导入、状态迁移集中和完整中文 TSDoc。

**Non-Goals:**

- 本 change 不实现 Embedding 模型部署、Elasticsearch 索引、混合检索、Reranker 或回答评估闭环。
- 不把浏览器上传进度当作文件处理任务；上传队列仍由上传组件管理。
- 不引入批次父任务或复杂的父子任务树；多文件操作只产生多个独立文件任务，可通过来源标识筛选。
- 不允许任务中心直接理解解析器、对象存储或知识库内部表。
- 不在本 change 中删除知识库实体；知识库仍用于选择文件处理目标和维护关联。

## Decisions

### 1. 使用 `hooks/documents` 作为统一文档域，并按复杂度划分 route

新的服务端边界：

```text
普通 CRUD route ─────────────▶ Drizzle ORM
复杂文档 route ──────────────▶ hooks/documents/document
上传 route ──────────────────▶ hooks/documents/upload
预览 route ──────────────────▶ hooks/documents/preview
RAG 文档 route ──────────────▶ hooks/documents/rag
server ──────────────────────▶ hooks/documents/tasks/worker

routes ─X storage / File 行 / parser / worker 控制面
```

建议目录：

```text
apps/server/src/hooks/documents/
├── document/
│   ├── read.ts
│   ├── version.ts
│   └── remove.ts
├── upload/
│   ├── init.ts
│   ├── complete.ts
│   ├── multipart.ts
│   ├── session.ts
│   ├── policies.ts
│   └── validators.ts
├── preview/
├── rag/
│   ├── relations.ts
│   ├── task.ts
│   ├── runner.ts
│   └── pipeline/
├── tasks/
└── storage/
```

`document` 承载文档复杂读取、版本和删除，`upload` 承载上传状态与对象编排，`preview` 和 `rag` 承载各自任务及执行器，`tasks` 只提供共享运行时，`storage` 只提供域内对象能力。目录不提供根 barrel，route 精确导入业务文件。

普通单表查询、分页和简单条件更新不建立同名 hook。复用业务、多表事务、状态迁移、对象存储、复杂聚合和后台执行才进入 `hooks/documents`；引用次数不是唯一条件，单入口复杂流程仍可保留业务函数。

### 2. 一个文件的一次完整处理只创建一个任务

任务键固定为 `file-processing`。任务内部阶段为：

```text
queued
  ↓
reading → parsing → normalizing → segmenting → rag-ingestion
  ↓
completed
```

管理端将前四个阶段归类展示为“预处理”，将 `rag-ingestion` 展示为“RAG 接入”。阶段运行记录用于耗时、进度、错误和恢复，不作为任务中心一级记录。

本 change 中 `rag-ingestion` 表示将 ready 文档安全关联到指定知识库，并产出可供后续索引器消费的稳定 Segment 交接结果。未来实现 Embedding 和索引时，可在同一任务定义中增加版本化阶段，或在需求明确后新增独立任务类型；当前不得将仅有关联的数据展示为“已建立向量索引”。

备选方案是每个阶段创建一条通用任务。该方案会造成一个文件产生多条任务、取消和重试语义复杂、任务中心难以阅读，因此不采用。

### 3. 通用 `tasks` 表作为任务中心主记录，文件任务使用扩展表保存领域数据

`tasks` 继续作为统一任务主记录，并补充通用查询字段：

```text
tenant_id
task_category
business_type
business_id
current_stage
progress
processed_items
total_items
error_code
error_message
```

文件任务扩展表：

```text
file_processing_tasks
├── task_id
├── file_id
├── document_id
├── document_version_id
├── dataset_id
├── execution_no
├── trigger_source
├── processing_config_version
└── result_summary
```

阶段表：

```text
file_processing_task_stage_runs
├── stage_run_id
├── task_id
├── stage
├── attempt
├── status
├── processed_items
├── total_items
├── checkpoint
├── error_code
├── error_message
├── start_timestamp
└── end_timestamp
```

`tasks.status` 是任务状态唯一事实来源，文件扩展表不得重复保存另一套任务状态。文件列表通过聚合查询获得当前活动任务、累计执行次数和最后成功任务。

备选方案是继续保留 `document_processing_jobs` 并让任务中心聚合多张任务表。该方案短期迁移简单，但会长期保留两套状态、过滤和权限逻辑，因此只允许作为迁移期兼容方案。

### 4. 文件处理任务采用持久化领取与恢复，不依赖当前进程内队列

现有通用任务执行器偏向脚本和子进程任务，任务队列保存在进程内。文件解析可能耗时较长，服务重启后必须能够恢复。因此文件任务 runner 使用数据库状态领取任务，并在每个阶段写入 checkpoint：

```text
to-be-started → pending → completed
                    ├── failed
                    └── killed
```

- Worker 只领取 `to-be-started` 任务。
- 服务重启时识别超过心跳期限的 `pending` 文件任务，并根据最后完成阶段恢复或标记可重试失败。
- 取消只在阶段边界生效，后续阶段不得继续写入产物。
- 相同文件、目标知识库和处理配置只能存在一个活动任务。
- 每次用户重试或重新执行都创建新的 `task_id` 和递增 `execution_no`，历史任务不可覆盖。

### 5. 上传意图在文件域保存，文件验证成功后自动创建任务

面向文件管理的上传初始化请求增加：

```text
enterRag
datasetId?
processingConfigVersion?
```

- `enterRag=true` 时必须校验目标知识库可用。
- 处理意图与上传会话一起持久化，避免浏览器在上传完成后掉线导致任务未创建。
- 文件验证成功后由服务端幂等创建文件处理任务。
- `enterRag=false` 时只产生 verified 文件，不创建处理任务。
- 用户后续可通过文件操作手动创建任务。

默认是否进入 RAG 使用服务端配置并由管理端初始化展示，用户仍可在上传时修改。通用附件等非文件管理调用方可以继续使用不带处理意图的上传能力。

备选方案是继续让管理端在上传回调中依次调用文档和 RAG 接口。该方案无法保证浏览器断线后的业务一致性，因此不采用。

### 6. 文件列表返回面向页面的聚合结果

`/file/list` 返回文件基础信息和任务摘要：

```text
fileId
filename
contentType
size
fileStatus
enterRag
datasetSummary
activeTask
executionCount
lastSuccessfulTask
createdAt
```

页面不得逐行请求任务、文档和知识库接口拼装状态。文件操作包括预览、下载、开始处理、查看任务、重新执行和删除。

上传会话列表不再作为管理端独立页签。断点恢复、分片进度和重新选择文件仍保留在上传弹窗内部。

### 7. 复用现有任务中心，增加文件任务视图而不新建第二套页面

现有 `system.task` 路由和页面继续保留，增加：

- 任务分类：全部、文件处理、系统任务。
- 状态统计：等待执行、执行中、执行成功、执行失败、已取消。
- 筛选：文件名、知识库、任务阶段、触发方式、发起人、创建时间。
- 文件任务列：文件、执行序号、当前阶段、进度、知识库和错误摘要。
- 文件任务详情：阶段时间线、结果摘要、失败原因和技术日志折叠区。
- 操作：等待/执行中任务可取消，失败任务可创建新任务重试，成功任务可再次执行。

文件列表点击“查看任务”跳转 `system.task` 并携带文件筛选条件。任务中心根据任务分类选择详情组件，原系统脚本任务的日志、停止和定时任务能力保持不变。

### 8. 权限按业务对象过滤，不因复用系统页面扩大可见范围

- 系统管理员可以查看所有任务、技术日志和调度能力。
- 普通文件用户只能查看自己有权访问文件所关联的任务。
- 知识库管理员只能操作其有权管理知识库中的文件任务。
- 查看任务、取消任务、重试任务和查看技术日志使用独立权限。
- 任务列表、统计和详情必须使用相同可见范围，防止统计数量泄露其他租户任务。

### 9. 管理端目录按页面和独立交互单元拆分

```text
apps/admin/src/pages/file/management/
├── index.vue
├── components/
│   ├── FileTable.vue
│   ├── FileUploadDialog.vue
│   ├── FileProcessingDialog.vue
│   └── FileTaskSummary.vue
├── types.ts
└── utils.ts

apps/admin/src/pages/system/task/
├── index.vue
├── components/
│   ├── SystemTaskDetail.vue
│   ├── FileTaskDetail.vue
│   ├── TaskStatusSummary.vue
│   └── TaskAdd.vue
├── types.ts
└── utils.ts
```

页面负责筛选、分页、入口状态和刷新；上传、处理配置和任务详情分别维护自己的异步状态。搜索表单继续使用 `VSchemaForm mode="search"`。

## Risks / Trade-offs

- [文件域目录体量变大] → 按 `upload`、`content`、`knowledge`、`tasks/<task-key>` 子域拆分，公共入口只暴露稳定用例，不建立巨型 service。
- [迁移期间存在两套任务记录] → 增加兼容读取和一次性迁移，切换后禁止创建新的 `document_processing_jobs`，最终删除兼容分支。
- [任务主表增加业务查询字段] → 字段保持通用语义，文件专属数据放扩展表，避免 `tasks` 变成文件任务专表。
- [服务端自动创建任务导致重复] → 使用文件、知识库、配置和活动状态唯一约束，并为上传完成使用稳定幂等键。
- [长任务在服务重启后停滞] → 使用数据库领取、心跳超时和阶段 checkpoint 恢复，不依赖进程内数组。
- [取消发生时阶段仍在执行] → 阶段边界检查取消状态，昂贵外部调用增加中止信号和超时，产物写入使用事务或幂等替换。
- [当前没有实际 Embedding/索引能力] → UI 使用“RAG 接入/知识库关联”准确文案，接口保留版本化阶段扩展点，不展示虚假的向量索引成功。
- [统一任务中心导致普通用户看到系统能力] → 按权限隐藏定时任务、手动脚本添加和技术日志，并在服务端执行数据范围过滤。

## Migration Plan

1. 扩展通用任务主表和共享类型，建立文件任务扩展表、阶段表及唯一约束，不改变现有任务页面行为。
2. 新建 `hooks/file` 公共入口，先以适配器方式复用现有 upload、document、rag 实现，建立目录边界和回归测试。
3. 实现 `tasks/file-processing` 任务定义、持久化领取、阶段执行、取消、重试、执行序号和恢复。
4. 将现有文档处理阶段迁入文件任务，迁移或兼容读取已有 `document_processing_jobs` 和阶段记录；迁移期间禁止重复执行同一版本。
5. 将知识库和关联服务迁入文件域 `knowledge`，保留现有表和兼容 routes，文件任务负责在最后阶段建立关联。
6. 增强 `/file/list` 和文件处理 routes，上传会话持久化 RAG 意图并在验证成功后幂等创建任务。
7. 重构管理端文件管理页面，移除通用文件/上传会话页签和独立 RAG 文档操作入口，接入任务摘要与处理弹窗。
8. 增强现有任务中心的文件任务筛选、统计、详情、取消和重试，并完成权限隔离。
9. 验证现有文件、历史任务和知识库数据后，停止旧 `/document/*` 管理端调用；保留短期兼容并记录弃用日志。
10. 稳定运行后移除旧顶层 `hooks/upload`、`hooks/document`、`hooks/rag` 入口和不再使用的兼容代码。

回滚时保留原数据表和兼容 routes，通过功能开关恢复旧管理端流程；新任务记录不会删除旧文档及 Segment 产物。

## Open Questions

- “上传后进入 RAG”的默认值应放在全局配置、租户配置还是用户偏好；建议首期使用服务端全局配置并允许单次覆盖。
- 知识库创建和配置入口是否继续保留独立轻量页面；本 change 只移除独立的 RAG 文档操作流程，不删除知识库实体管理能力。
- 历史 `document_processing_jobs` 是一次性迁移为通用任务，还是只读兼容展示；建议数据量确认后优先一次性迁移。
