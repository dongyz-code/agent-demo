# 规范基线实施审计

## 当前实现证据

本记录用于说明基线 specs 与 2026-07-23 工作区当前实现的对应关系，不替代历史 change，也不把未执行测试记为完成。

| 基线 capability | 当前实现证据 | 结论 |
|---|---|---|
| `document-lifecycle-management` | `document/read.ts` 提供 `searchDocuments` 与完整详情；`document/remove.ts` 以 Document 为删除边界；公共 DTO 不在文档摘要中暴露 `fileId` | 与 Document 主体、聚合查询和整文档删除要求一致 |
| `document-version-management` | `document/version.ts` 使用源文件 advisory lock、文档内递增版本号和 `active_version_id`；`resolveDocumentVersion` 统一解析默认或显式版本 | 与不可变版本、幂等创建和可选历史版本一致 |
| `document-image-preview` | `preview/converter.ts` 将当前策略支持的 PDF、Office、文本、Markdown、CSV 和图片转换为 WebP 页面；`document_preview_pages` 与版本预览状态已注册 | 与统一页面图片、版本级状态和窗口查询一致 |
| `document-rag-versioning` | `rag_dataset_documents` 具有 active/pending 版本；`rag/relations.ts` 使用目标版本条件发布；内容任务按版本和配置复用 | 与多知识库和新版本成功前保留旧版本一致 |
| `document-processing-task` | `tasks/worker.ts` 原子领取、heartbeat、lease 和 stale 恢复；`tasks/runtime.ts` 记录阶段 attempt；取消和重试使用 documents 业务接口 | 与一级任务、不可变执行历史和从 reading 重试一致 |
| `documents-domain-boundary` | 文档实现仅位于 `hooks/documents/{document,upload,preview,rag,tasks,storage}`；routes 位于 `router/routes/documents`；不存在根 documents barrel | 与单一领域、精确导入和 route/hooks 分工一致 |
| `generic-file-upload-management` | `upload/init.ts`、`multipart.ts`、`complete.ts` 和 storage 子模块处理传输；完成响应为 `DocumentUploadResult`；策略与转换器支持格式一致 | 与内部 File、公共 DocumentVersion 和普通/分片上传分层一致 |
| `business-task-center` | `/sys/task` 仅保留 counts/list/logs 与 schedule list/pause/resume；文档详情、取消和重试位于 `/documents/processing-*`；领域富化在 `documents/tasks/task-center.ts` | 与单一任务中心和受限控制面一致 |

上传会话 DTO 仍包含内部传输所需的 `fileId`，但文档搜索、详情、版本、预览、下载、知识库和删除业务均不要求客户端使用该标识；这不构成 File 业务主体。

## 历史 capability 承接关系

| 历史 capability | 当前承接 capability | 冲突处理 |
|---|---|---|
| `file-centered-document-management` | `document-lifecycle-management`、`document-version-management` | File 主体要求被明确废弃 |
| `document-content-management` | `document-lifecycle-management`、`document-version-management` | 上传完成改为服务端创建文档版本 |
| `file-preview-and-viewing` | `document-image-preview` | direct/PDF/HTML/text 公共模式被页面图片取代 |
| `rag-document-ingestion` | `document-rag-versioning` | 使用文档版本及知识库 active/pending 关系 |
| `unified-file-processing-task`、`file-processing-worker-runtime` | `document-processing-task` | checkpoint 跳阶段恢复被 lease 与从 reading 重试取代 |
| `documents-domain`、`documents-routing`、`unified-domain-errors`、`documents-domain-maintainability` | `documents-domain-boundary` | 目录、依赖、路由、错误与校验规则合并 |
| 旧 `generic-file-upload-management` | 新 `generic-file-upload-management` | 保留传输能力，公共完成结果改为文档版本 |
| 旧 `business-task-center` | 新 `business-task-center` | 删除当前不存在的通用创建、停止和类型管理要求 |

## 静态审计结果

- 基线 specs 不存在正向要求 File 作为公共业务主体。
- 基线 specs 不存在 direct/generated/text 等多模式公共预览契约。
- 基线 specs 明确禁止把阶段摘要作为 checkpoint 跳过 reading、parsing、normalizing 或 segmenting。
- 基线 specs 明确不声明通用任务手动添加、任意停止或任务类型管理能力。
- `file_upload_parts` 仍在 registry 和 Multipart 写入路径中，因此只交给后继 `remove-upload-part-projection` change，不在当前基线假定已经删除。

## 独立 change 复核

### `harden-admin-role-permissions`

已落地部分包括共享 `adminPermissionTree`、有效 key 归一化、admin 路由 meta、角色权限树 UI、启用角色聚合以及 routeHandler 单权限 key 守卫。

该 change 不能普通归档，原因如下：

- 原 spec 要求 route 权限规则支持多个 key、anyOf/allOf 和基于 payload 的动态规则，当前 `AdminPermissionRule` 仅允许单个 key。
- 原 spec 要求权限守卫组合在 `authentication.ts`，当前守卫位于 `router/permission.ts` 并由 `router/index.ts` 注册为统一 preHandler。
- `role/update` 无论修改基础信息、权限列表还是启用状态，都只校验 `actions.role.update`；`actions.role.assign-permission` 与 `actions.role.toggle` 目前只控制 admin 交互，没有服务端强制校验。

为避免降低已确认的安全契约，本轮不把 spec 改写为较弱的当前行为，也不修改业务代码；相关实施任务重新打开，change 保持 active。

### `add-schema-form-component`

`packages/ui/src/components/schema-form` 已包含 columns API、归一化、CSS grid、renderer registry、异步 options、reloadOn、提交转换、暴露方法、slots、README 和四个测试文件。admin 多个搜索页及编辑弹窗已实际使用 `VSchemaForm`。

执行 `pnpm --filter @repo/ui test`，4 个测试文件、20 个测试全部通过。未发现后继 change 推翻其 capability，可以普通归档。

## 复核结论

八个 capability 均有当前产品决策和运行实现证据，未发现需要修改业务代码才能成立的基线 requirement。历史有效要求已经被当前 capability 承接，互斥要求只作为归档历史保留。

## 最终验证记录

- `pnpm --filter @repo/ui test`：4 个测试文件、20 个测试通过。
- `pnpm --filter @repo/deploy-server lint`：TypeScript 检查通过。
- `openspec validate --all --strict`：当前 11 个 active/main artifact 全部通过。
- 语义检索只命中“任务中心 MUST NOT 声明手动添加、任意停止”等否定约束；未发现旧能力被正向要求。
- `git diff --check` 通过。
- 本轮实施写入仅限 `openspec` artifacts 与归档目录；服务端、管理端和数据库代码只做读取、lint 或测试，没有由本轮治理修改。
