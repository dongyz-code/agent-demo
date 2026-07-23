## Why

当前管理端把通用文件、上传会话、文档处理和知识库关联分别暴露给用户，服务端也由多个 hook 和多套任务状态承载同一条文件处理流程，导致用户操作割裂、任务记录难以统一查看，代码入口和职责不够清晰。需要把业务收敛为“上传形成文档版本，可选择加入知识库；一个版本的一次内容处理就是一个可追溯任务”，并复用现有任务中心统一管理等待、执行中和历史任务。

## What Changes

- 管理端以单一“文件管理”页面作为文件业务入口，移除“通用文件”“上传会话”和独立 RAG 文档操作页签；上传会话仅作为上传组件内部的恢复状态。
- 上传文件时允许选择是否进入 RAG，并允许配置默认选择；选择进入 RAG 时可指定多个目标知识库，文件验证成功后建立关系并自动创建一个版本内容任务。
- 未选择进入 RAG 的文件只保存到文件列表，用户可在文件操作中手动创建处理任务。
- 将一次版本读取、解析、标准化、内容切分和关系发布定义为一个任务，内部阶段只用于进度、错误定位和重试，不在任务中心平铺成多个独立任务。
- 多文件上传时按文件创建相互独立的任务并允许并行执行；单个文件失败不影响其他文件。
- 每次重新执行都创建新的任务记录并累计执行次数；同一文件存在等待中或执行中任务时不得重复创建等价任务。
- 增强现有“系统管理 / 任务管理”为统一任务中心，支持文件任务分类、等待/执行中/成功/失败统计、文件筛选、阶段进度、取消、重试和历史执行记录。
- 文件列表展示是否进入 RAG、当前任务状态、当前阶段、累计执行次数、最后成功任务和所属知识库，并可跳转到已筛选的任务中心。
- **BREAKING** 重构服务端文件业务边界：不再由管理端串联 `/document/create` 与 `/rag/dataset-document/add` 完成接入；改由文件处理任务统一编排，并逐步下线独立的管理端文档处理流程。
- 重整 hook 目录，将复杂文档生命周期与任务编排收敛到 `hooks/documents` 的功能目录；普通查询和简单更新直接由 route 使用 ORM，不建立文件域公共入口或职责重叠的顶层 hook。

## Capabilities

### New Capabilities

- `file-centered-document-management`: 定义单一文件管理入口、上传时选择是否进入 RAG、手动处理、文件状态与任务摘要展示等行为。
- `unified-file-processing-task`: 定义一个 DocumentVersion 与处理配置对应一个内容任务、阶段进度、执行次数、并行处理、幂等、取消和重试行为。
- `business-task-center`: 定义现有任务中心对文件处理任务的统一查询、统计、筛选、详情、操作、历史追溯和权限能力。

### Modified Capabilities

无。

## Impact

- 管理端将调整 `apps/admin/src/pages/file/management`、上传组件、菜单、路由和现有 `apps/admin/src/pages/system/task`，独立 RAG 文档页面将被收敛或移除。
- 服务端将相关能力收敛到 `apps/server/src/hooks/documents` 的 document、upload、preview、rag、tasks、storage 功能目录，并让对应 routes 按复杂度直接 ORM 或精确导入业务函数。
- PostgreSQL 需要统一文件处理任务与阶段记录，补充任务类型、文档版本、执行序号、触发方式、当前阶段、进度、错误和最后成功执行等查询能力。
- `@repo/types` 需要新增文件管理聚合结果、文件处理任务、任务阶段和任务中心查询类型，并迁移现有 document/RAG 管理端接口类型。
- 现有文件对象、文档版本、Segment、知识库及关联数据必须保留，重构不得要求重新上传文件；已有处理任务需要提供兼容查询或明确迁移策略。

## Superseded

本 change 已被 `simplify-documents-domain`、`redesign-document-centered-management` 及 `reconcile-current-system-specs` 基线取代。最终系统采用 Document 主体、页面图片预览、版本级内容任务和从 reading 阶段重试，不再采用 File 业务主体或 checkpoint 跳阶段恢复。本 change 仅作为演进历史使用 `--skip-specs` 归档。
