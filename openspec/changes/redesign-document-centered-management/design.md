## Context

当前系统已经有 `documents`、`document_versions`、`files`、`document_segments` 和 `rag_dataset_documents`，但公共入口仍是 File：列表按 File 查询，Document 只在处理任务中被顺带创建，版本固定为 1，预览有 PDF/HTML/direct 等多种模式，知识库关系也没有记录当前使用哪个版本。

本次目标是一个精简的文档管理功能：上传、删除、统一图片预览、多版本、当前版本选择和进入多个 RAG 知识库。后续可能增加审批、上下架和分发，但现在不为未来功能提前增加表。

设计遵循两个约束：

1. Document 是业务主体，File 只是 DocumentVersion 的内部源文件。
2. 优先改造现有表，只新增当前需求无法表达的一张页面表。

## Goals / Non-Goals

**Goals:**

- 公共业务只使用 `documentId` 和可选 `documentVersionId`。
- 支持首次上传、不可变新版本、最新版本自动成为当前版本和历史回切。
- 所有支持格式由后端统一转换为页面图片。
- 一个文档加入多个知识库，每个知识库独立保存 RAG 生效版本。
- 新版本 RAG 成功前继续使用旧版本，失败不影响旧结果。
- 使用一个 `searchDocuments` 收敛文档列表和知识库文档列表查询。
- 复用现有 File、上传、Task、Segment 和对象存储能力。

**Non-Goals:**

- 不实现审批、发布、上下架、分发和工作流。
- 不单独删除历史版本。
- 不引入 PreviewGeneration、RagResult、SegmentSet、事件总线或 Repository 层。
- 不把 File 删除，也不把它继续作为管理端业务对象。
- 不同时保留多套预览生成结果或多套 RAG 配置结果；配置升级直接重新处理当前目标。

## Decisions

### 1. 核心业务只保留四张表

```text
documents
  └── document_versions
        └── document_preview_pages       唯一新增业务表

rag_datasets
  └── rag_dataset_documents              记录文档在知识库中的版本状态
```

目标字段如下。

#### documents（现有表改造）

| 字段 | 用途 |
| --- | --- |
| document_id | 文档稳定标识 |
| name | 文档名称 |
| active_version_id | 当前展示和默认操作版本 |
| rag_enabled | 后续上传默认是否进入已关联知识库 |
| status | `active` 或 `deleted` |
| 审计字段 | 创建、修改用户和时间 |

Document 不保存预览状态、RAG 状态、审批状态或发布状态。

#### document_versions（现有表改造）

| 字段 | 用途 |
| --- | --- |
| document_version_id | 版本标识 |
| document_id | 所属文档 |
| version | 文档内递增版本号 |
| source_file_id | 已验证源文件 |
| preview_status | `pending/processing/ready/failed` |
| preview_page_count | ready 时的页数 |
| preview_error | 最近预览错误摘要 |
| preview_converter_version | 当前页面使用的转换器版本 |
| 审计字段 | 创建用户和时间 |

版本内容字段创建后不可修改。预览字段是该版本唯一一套页面的运行状态，可以由 worker 更新。

#### document_preview_pages（唯一新增业务表）

| 字段 | 用途 |
| --- | --- |
| document_version_id | 所属版本 |
| page_number | 从 1 开始的页码 |
| width / height | 图片尺寸 |
| content_type / size | 可信 MIME 和字节数 |
| bucket / object_key | 私有页面对象位置 |

使用 `(document_version_id, page_number)` 作为主键或唯一键，不需要 pageId，也不需要 preview generation 表。

#### rag_dataset_documents（现有表改造）

| 字段 | 用途 |
| --- | --- |
| dataset_document_id | 关系标识 |
| dataset_id / document_id | 知识库与文档，多对多唯一 |
| active_version_id | 当前实际参与检索的版本，可空 |
| pending_version_id | 等待或正在处理的目标版本，可空 |
| rag_status | `pending/processing/ready/failed` |
| rag_error | 最近一次错误摘要 |
| 审计字段 | 创建、修改用户和时间 |

一个知识库一行，因此同一文档在多个知识库可以有不同 active/pending 版本。

### 2. 其他表全部复用，不再增加结果表

- `files` 和 `file_upload_sessions`：继续负责上传对象、可信 MIME、Hash、大小和对象位置。
- `rag_datasets`：继续负责知识库基础信息。
- `document_segments`：继续按 `document_version_id` 保存 RAG 内容。
- `tasks`：继续负责等待、运行、成功、失败、取消和任务租约。
- 处理任务扩展只保留一套。把现有 file-centered 扩展收敛为 `document_processing_tasks`，只保存 task type、documentVersionId、可选 datasetId 和配置版本；删除未实际使用的 `document_processing_jobs`，不新增第三套任务表。

不采用预览批次表：每个版本首期只需要一套页面，生成器升级时重新生成并替换即可。

不采用 RAG result 表：首期只需要知道知识库当前使用哪个版本、正在处理哪个版本。任务历史已经能回答某次处理是否成功。

### 3. 上传流程只在服务端内部接触 File

首次上传：

```text
初始化上传
→ 直传/分片上传
→ 服务端校验 File
→ 事务创建 Document + Version 1
→ activeVersionId = Version 1
→ 创建预览任务
→ 为选择的每个知识库创建 RAG 关系/任务
```

上传新版本：

```text
校验目标 Document 权限
→ 上传并校验新 File
→ 锁定 Document
→ 创建 Version N
→ activeVersionId = Version N
→ 创建预览任务
→ 若本次启用 RAG，将各关系 pendingVersionId 更新为 Version N
```

版本号通过 Document 行锁和 `(document_id, version)` 唯一约束保证并发安全。上传会话保存 `create-document/create-version` 意图、目标 documentId、datasetIds 和幂等键。上传完成返回 Document/Version 结果，管理端不需要再用 fileId 绑定文档。

单次 `enterRag=false` 只是不更新这次 pendingVersion，不会修改 `documents.rag_enabled`，也不会清除旧 activeVersion。

### 4. 预览只维护版本的一套页面

所有格式统一转页面图片：

- PDF 直接按页渲染。
- DOCX、PPTX、XLSX 先通过受控 Office 转 PDF，再按页渲染。
- TXT、Markdown、CSV 使用固定字体和排版转 PDF，再按页渲染。
- JPG、JPEG、PNG、WebP 校正方向并规范化为单页。

worker 流程：

```text
previewStatus = processing
→ 在任务临时目录生成全部页面
→ 上传到唯一临时对象前缀
→ 验证页码连续、对象完整
→ 数据库事务删除旧页面行并插入新页面行
→ previewStatus = ready，记录 pageCount 和 converterVersion
→ 异步删除旧页面对象
```

中途失败只把版本标记 failed，不插入部分页面。失去任务 lease 后不得提交页面。

页面 API 按窗口返回短期 URL，例如每次 10 页、最大 30 页；列表封面直接使用第一页。客户端不再区分 PDF、文本或 Office 查看器。

替代方案是扩展 `file_variants` 增加页码，但它以 File 派生物为中心，会让文档页面继续散落在文件逻辑中，因此新增一张语义明确的页面表更简单。

### 5. RAG 通过 active/pending 两个版本指针完成切换

首次加入知识库：

```text
activeVersionId = null
pendingVersionId = Document.activeVersionId
ragStatus = pending
```

新版本开始处理时，只更新 pending，不改 active：

```text
activeVersionId = V1
pendingVersionId = V2
ragStatus = processing
```

V2 成功后执行条件更新：

```sql
UPDATE rag_dataset_documents
SET active_version_id = V2,
    pending_version_id = NULL,
    rag_status = 'ready'
WHERE dataset_document_id = ?
  AND pending_version_id = V2;
```

如果 V2 失败，只把关系标记 failed 并保留 activeVersionId=V1。如果用户在 V2 处理期间又上传 V3，pending 已变成 V3，V2 的迟到更新匹配不到，因而不能覆盖最新目标。

检索必须用关系的 activeVersionId 过滤 Segment/向量结果。候选版本写入时带 datasetId、documentId 和 documentVersionId，未成为 active 的版本不可见。

历史回切时，对每个知识库分别处理：已有该版本成功任务/索引则直接切换 active；没有则设置 pending 并创建任务，旧 active 继续服务。

这里不处理“同一版本同时保留多个 RAG 配置结果”。配置改变时重新处理 pendingVersion，完成后仍发布为同一 activeVersion。未来确实需要多配置并存时，再增加结果实体。

### 6. 查询收敛为一个列表入口和一个详情入口

只保留两个主要读取用例：

- `searchDocuments(input, accessScope)`：文档分页列表；`datasetId` 是可选筛选，因此知识库文档列表也复用它。
- `getDocumentDetail(documentId, accessScope)`：文档详情和全部版本历史。

`searchDocuments` 以 documents 为分页主表，获取当前页后批量查询：

1. 当前版本及其 source File；
2. 每个文档版本数量；
3. 当前版本第一页封面和预览状态；
4. Dataset-Document 关系及 active/pending 版本。

查询可以是一条聚合 SQL，也可以是一个主查询加固定数量批量查询，但不得按每行循环查 File、任务或知识库。

版本下载和页面预览共用内部 `resolveDocumentVersion(documentId, documentVersionId?)`：未指定版本时返回 activeVersion，指定时校验版本属于该文档。File 查询只是这个内部过程的一步，不再单独暴露为管理端用例。

### 7. Route 直接 ORM，hooks 只承载复杂或复用业务

`hooks/documents` 不是 Repository 层。普通单表查询、分页和简单条件更新直接放在对应 route；只有满足以下任一条件的逻辑进入 hooks：

- 被两个以上业务入口复用；
- 涉及多表事务、锁或状态迁移；
- 同时协调数据库、对象存储或任务 worker；
- 属于固定批量聚合、权限解析、短期签名等复杂查询；
- 属于预览转换、RAG pipeline 或后台任务运行时。

因此知识库基础 CRUD、上传会话列表/状态和文档 RAG 默认值更新直接使用 ORM。`searchDocuments`、文档详情、版本、删除、上传生命周期、预览、RAG 关系和任务运行时继续作为业务能力保留。File 行查询与 mapper 不作为公共 hook；File 只在上传流程和文档版本源对象读取中作为内部实现存在。

目标目录如下：

```text
hooks/documents/
├── document/
│   ├── read.ts             searchDocuments、复杂详情和版本解析
│   ├── version.ts          新版本和当前版本切换
│   └── remove.ts           逻辑删除和异步清理
├── upload/                 上传初始化、完成、分片流程与私有会话规则
├── preview/
│   ├── converter.ts        格式到页面图片
│   ├── task.ts             预览任务创建和重试
│   ├── runner.ts           预览任务执行
│   └── pages.ts            页面窗口和签名
├── rag/
│   ├── relations.ts        多知识库关系和 active/pending 切换
│   ├── task.ts             RAG 任务创建
│   └── pipeline/           解析、规范化和 Segment 发布
├── tasks/                  文档任务详情、worker、lease 和阶段运行时
└── storage/                模块内部对象存储与源文件读取
```

不保留根 barrel、`files/queries.ts`、`rag/datasets.ts`、`upload/shared.ts` 或含义混杂的 `commands.ts`。route 精确导入所需业务文件；模块内部的 S3、File 行和任务原语不对 route 暴露。简单 route 允许直接操作自己的单表或局部查询，但不得复制文档聚合、版本状态机或对象存储编排。

### 8. 删除使用现有任务，不增加清理表

删除事务：

1. 将 Document 标记 deleted；
2. 删除或失效全部 Dataset-Document 关系；
3. 取消等待中的预览/RAG 任务；
4. 用现有 tasks 创建唯一清理任务。

普通查询只读取 active 文档，因此删除立即生效。运行中的任务在发布前再次检查 Document 和 Dataset-Document 关系；检查失败就不提交。

清理任务依次删除向量/索引、Segment、页面对象、源文件对象和数据库记录。步骤幂等，对象不存在视为成功。不增加 cleanup 表，进度和错误使用现有任务状态与结果摘要。

### 9. 未来扩展只保留概念边界

审批、上下架和分发未来需要固定版本时，再增加：

```text
DocumentVersion ← DocumentRelease ← Approval / Publication / Distribution
```

现在不创建这些表，也不在 Document 或 DocumentVersion 上加入 approved、published、channel 等字段。未来 Release 固定引用 `documentVersionId`，不会受文档 activeVersion 变化影响。

## State Transitions

### 文档

```text
active ──删除──▶ deleted
```

预览或 RAG 失败不会改变 Document 状态。

### 版本预览

```text
pending → processing → ready
                 └──→ failed → 重试 → processing
```

### 知识库文档关系

```text
pending → processing → ready
                 └──→ failed → 重试 → processing
```

failed 可以同时保留非空 activeVersion 和 pendingVersion，表示旧版本仍服务、新目标失败。

## Risks / Trade-offs

- [没有 PreviewGeneration，不能同时保留多套转换结果] → 当前只需要一套页面；升级转换器时重新生成，确认成功后替换页面行。
- [没有 RagResult，不能精细区分同版本的多套配置结果] → 当前不要求多配置并存；任务历史保留审计，真正需要时再新增结果表。
- [页面图片增加存储和转换时间] → 使用 WebP、异步生成、页面窗口加载和临时目录资源限制。
- [列表聚合内容较多] → 采用主分页加固定数量批量查询，并为 activeVersion、documentId、datasetId 和 pageNumber 建索引。
- [外部向量写入与数据库切换不是同一事务] → 先写带版本标识的不可见候选数据，再通过 activeVersion 条件过滤可见结果。
- [当前仓库没有独立列迁移命令] → 目标环境没有需保留的文档数据，切换时直接 reset 文档相关表，再由启动流程创建当前结构。
- [迟到任务可能覆盖状态] → 所有发布使用 pendingVersion 条件更新，并在提交前检查文档和关系仍存在。
- [route 直接 ORM 可能导致重复] → 只接受局部、单入口的普通查询；出现第二个真实消费者或多表状态规则时再提取业务函数，不预先建立 Repository。

## Migration Plan

目标环境没有需要保留的存量文件或文档数据，不实现迁移脚本、状态回填或旧模型兼容读取。

1. 停止服务和 worker，reset 文档相关表。
2. 由服务启动流程创建当前表结构和缺失索引。
3. 启动新 worker 和文档路由，管理端直接使用文档列表、版本历史和页面查看器。

切换失败时停止新服务并修复当前结构或实现；不恢复旧文件管理模型，也不执行数据回迁。

## Open Questions

以下只影响实现配置，不改变表模型：

1. 页面默认 DPI、WebP 质量、窗口上限和签名有效期。
2. Office 转换运行环境以及 TXT/Markdown/CSV 使用的字体和纸张配置。
3. 向量检索层当前如何按 `datasetId + documentVersionId` 过滤；若尚未实现，首期必须把这两个标识写入索引元数据。
