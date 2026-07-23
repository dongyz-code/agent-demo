## Context

当前主 specs 仅包含数据库、服务端基础设施和共享类型等少量 capability，而文档、RAG、任务中心、后台权限和 SchemaForm 等已实现能力仍停留在 active changes。文档链又经过多轮连续重构，旧 change 与新 change 分别声明了 File/Document 主体、直接/图片预览、checkpoint/从头重试等互斥语义。

OpenSpec strict 校验只能确认单个 artifact 的结构和引用有效，不能判断多个 change 归档后的业务语义是否冲突。因此本次治理必须先选择最终事实并形成无冲突基线，不能简单按时间把所有 change 普通归档。

本次治理涉及三类对象：

- 主 specs：只表达当前有效系统契约。
- active changes：只表达尚未进入主 specs 的增量。
- archived changes：保存已经完成或被后续设计替代的历史。

## Goals / Non-Goals

**Goals:**

- 为文档演进链建立一份与当前产品决策和运行实现一致的主规范候选。
- 消除 File/Document 主体、预览模式、上传完成、任务恢复和任务中心能力的历史冲突。
- 选择正确的普通归档或 `--skip-specs` 归档方式，避免重复或过期 delta 污染主 specs。
- 识别并拆分基线已经过期的数据库大 change。
- 建立后续 change 的命名、替代和归档规则。

**Non-Goals:**

- 不修改服务端、管理端、数据库结构或运行时行为。
- 不在本 change 中实现上传分片表删除、外键生命周期或新的数据库迁移能力。
- 不恢复已经删除的服务端 integration tests，也不把未执行的测试任务伪造为完成。
- 不重写归档 change 以伪装历史设计从未存在。

## Decisions

### 1. 以明确优先级选择规范事实

发生冲突时，规范事实按以下优先级确定：

1. 当前已经确认的产品需求；
2. 当前运行代码及公共 DTO；
3. 最新且未被后续决策推翻的 change；
4. 更早的历史 change。

当前代码不是无条件高于产品需求：若已确认需求尚未落地，应作为待实施增量；只有在本次“纯治理”范围内，代码用于防止把不存在的能力误写成当前基线。

备选方案是以最新 change 全量覆盖旧 change。该方案不能识别最新 change 内部已过期的任务或实现偏差，因此不采用。

### 2. 按业务概念合并 capability，而不是沿用每轮名称

文档链按最终业务概念收敛：

| 历史 capability | 基线 capability | 处理方式 |
|---|---|---|
| `file-centered-document-management`、`document-content-management` | `document-lifecycle-management`、`document-version-management` | 采用 Document 主体与不可变版本，舍弃 File 主体 |
| `file-preview-and-viewing` | `document-image-preview` | 采用页面图片预览，舍弃 direct/PDF/HTML/text 公共模式 |
| `rag-document-ingestion` | `document-rag-versioning` | 使用 DocumentVersion 和知识库 active/pending 版本 |
| `unified-file-processing-task`、`file-processing-worker-runtime` | `document-processing-task` | 使用一级任务、lease 与从 reading 重试，舍弃 checkpoint 续跑 |
| `documents-domain`、`documents-routing`、`unified-domain-errors`、`documents-domain-maintainability` | `documents-domain-boundary` | 合并目录、依赖、路由、错误和验证原则 |
| `generic-file-upload-management` | `generic-file-upload-management` | 保留传输基础设施，公共完成结果改为文档版本 |
| `business-task-center` | `business-task-center` | 保留查询、日志、调度和文档任务富化，删除不存在的通用创建/停止能力 |

不为每轮设计创建新的同义 capability；否则主 specs 会同时存在互相冲突的“当前事实”。

### 3. Document 是公共主体，File 是内部存储资源

公共管理、搜索、详情、预览、下载、版本、知识库和删除流程使用 `documentId`，具体内容使用 `documentVersionId`。内部 File 仅负责源对象元数据和存储定位，不作为管理端拼装业务流程的标识。

备选方案是保留一个并列的通用文件管理中心。当前产品目标是文档管理，运行时也不存在独立文件管理路由，因此该方案会制造第二业务主体，不采用。

### 4. 归档方式由 delta 是否仍然有效决定

归档分为两类：

- `add-schema-form-component` 没有后继 change 推翻其 capability，代码和测试对照通过后正常归档，由其 delta 生成主 specs。
- `harden-admin-role-permissions` 的实施审计发现服务端只支持单权限 key，角色授权和启停缺少独立服务端强制校验，与其 delta 不一致。本轮保持该 change active 并重新打开缺失任务，不降低安全规范，也不在纯治理 change 中修改运行时代码。
- 文档演进链中的旧 change 被后继方案部分或全部替代，必须在本基线 artifacts 完整且校验通过后使用 `openspec archive <name> --skip-specs` 归档，只保留历史。

文档历史 change 包括：

- `add-rag-multipart-upload-management`
- `refactor-file-processing-task-management`
- `consolidate-documents-domain`
- `simplify-documents-domain`
- `redesign-document-centered-management`

`redesign-document-centered-management` 虽最接近最终方案，但其有效要求已经完整吸收到本基线。若再普通归档，会与本 change 的 ADDED capability 重复，因此同样使用 `--skip-specs`。

### 5. 不伪造已失效任务的完成状态

`consolidate-documents-domain` 中要求运行已删除 integration tests 的未完成任务，必须注明它已被后续“删除服务端测试”决策替代，不得执行不存在的命令或直接勾选为已完成。完成历史说明后，整个 change 作为 superseded history 使用 `--skip-specs` 归档。

### 6. 数据库大 change 独立重建基线

`simplify-database-schema` 的表数量、待删除表和保留表假设已不符合当前 registry，不能继续执行剩余旧任务。实施阶段应先冻结该 change，再将仍有效工作拆为：

- `simplify-database-access`：数据库入口仅保留稳定的 `db`、`schemas` 等已确认出口，并核对 registry 边界。
- `remove-upload-part-projection`：只处理当前仍存在的 `file_upload_parts` 及 Multipart 状态来源。
- `add-drizzle-foreign-key-lifecycle`：独立处理外键 descriptor、DDL、catalog diff 与受控 apply。

新 change artifacts 建立并通过校验后，原 change 才能作为过期基线使用 `--skip-specs` 归档。拆分后的每个 change 必须重新从当前代码和表 registry 取数，不继承“26 张表”等历史数字。

### 7. 本 change 通过正常归档生成主文档 specs

本 change 的 tasks 完成后，正常归档 `reconcile-current-system-specs`，由其八个 ADDED delta 生成主 specs。历史文档 changes 必须在此之前完成 `--skip-specs` 归档，确保它们不会在基线生成后再次合并旧要求。

备选方案是直接编辑 `openspec/specs`。该方案绕过 change 审查和归档记录，不采用。

### 8. 后续 change 使用显式替代关系

同一 capability 同时最多保留一个主要 active change。后续 change 推翻尚未归档的设计时，proposal 必须写明 `Supersedes: <change-name>`，并在新基线稳定后及时处理旧 change。完成 change 不跨开发周期长期堆积。

## Risks / Trade-offs

- [基线把尚未落地设计误写为当前事实] → 每项 requirement 同时对照当前产品决策、公共 DTO、route 和持久化实现；差异作为新增 change，不在本次基线中假定已完成。
- [过早 `--skip-specs` 导致有效要求丢失] → 先完成八个基线 delta、严格校验和逐项映射，再归档历史 change。
- [独立 change 与基线重复 capability] → 权限与 SchemaForm 不进入本 change；SchemaForm 由原 change 正常归档，权限 change 完成实际缺口后再归档；文档链全部由本基线接管。
- [归档未完成 change 掩盖未交付工作] → 对失效任务写明 superseded 原因；仍有效未完成工作必须迁移到新 change 后才能归档。
- [数据库 change 拆分时遗漏已完成工作] → 先记录现有 3 个完成任务对应的代码差异，再创建后继 changes，不按旧任务列表重新猜测。
- [归档顺序或命令误操作] → 每次归档前记录 `openspec status`，归档后立即运行 `openspec list`、`openspec validate --all --strict` 和 diff 检查；所有变更均由 Git 可恢复。

## Migration Plan

1. 完成并严格校验本 change 的 proposal、design、八个 delta specs 和 tasks。
2. 对照当前代码复核 `add-schema-form-component` 与 `harden-admin-role-permissions`；SchemaForm 一致时正常归档，权限 change 若有实现缺口则重新打开任务并保持 active。
3. 在文档历史 changes 中补充 superseded 说明，但不篡改旧需求和已完成记录。
4. 使用 `--skip-specs` 归档五个文档历史 changes，并在每次归档后校验状态。
5. 审计 `simplify-database-schema` 已完成差异和当前表 registry，创建三个边界独立的后继 changes；后继 artifacts 可承接后再 `--skip-specs` 归档原 change。
6. 完成本 change 的所有实施任务后，正常归档本 change，使八个最终 capability 进入主 specs。
7. 运行 OpenSpec strict、服务端 lint 和差异检查，确认主 specs 只描述当前事实。

回滚时通过 Git 恢复对应归档提交即可；本 change 不触及运行时数据，不需要数据库回滚。

## Open Questions

无。数据库三个后继 change 的具体表结构和实施顺序应在各自 proposal 中重新审计，不在本 change 中预先决定。
