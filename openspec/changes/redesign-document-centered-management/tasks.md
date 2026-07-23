## 1. 最小表模型与共享类型

- [x] 1.1 更新 `documents`：增加默认 RAG 开关并把状态收敛为文档生命周期，不再承载处理结果。
- [x] 1.2 更新 `document_versions`：增加唯一版本约束、源文件唯一引用和预览状态/页数/错误/转换器版本字段。
- [x] 1.3 新增唯一业务表 `document_preview_pages`，使用版本和页码唯一键保存页面尺寸、类型、大小和私有对象位置。
- [x] 1.4 更新 `rag_dataset_documents`：增加 activeVersionId、pendingVersionId、RAG 状态和错误摘要及必要索引。
- [x] 1.5 把重复的处理模型收敛为一套文档版本任务扩展，复用现有 tasks、租约和阶段记录，不新增结果/清理任务表。
- [x] 1.6 在 `@repo/types` 定义文档列表、详情、版本、页面窗口和知识库版本摘要，并移除公共文档 DTO 对 fileId 的依赖。

## 2. 文档模块收敛

- [x] 2.1 建立 `documents/queries.ts`、`commands.ts` 和 `versions.ts`，迁移 `files/documents.ts` 中的文档逻辑。
- [x] 2.2 将 `knowledge` 收敛为 `rag/datasets.ts` 和 `rag/relations.ts`，明确知识库基础信息与文档关系职责。
- [x] 2.3 收敛 documents 域外调用边界，只公开文档用例、上传和必要任务能力，隐藏 File 查询、转换器和任务内部函数。
- [x] 2.4 更新 README 和调用边界，禁止 route 复制复杂跨表流程或以 fileId 作为公共文档标识。

## 3. 上传与不可变版本

- [x] 3.1 扩展上传会话意图，支持新建文档/上传新版本、目标 documentId、datasetIds、默认/单次 RAG 和幂等键。
- [x] 3.2 保留现有普通/分片上传和可信 MIME、大小、SHA-256 校验，完成后在服务端内部绑定 verified File。
- [x] 3.3 实现原子创建 Document + Version 1 + activeVersion，并保证重复完成返回同一结果。
- [x] 3.4 实现 Document 行锁下的并发安全新版本创建，成功后立即更新 activeVersion，失败不影响旧版本。
- [x] 3.5 实现统一版本解析和指定版本下载，未指定时使用 activeVersion，显式指定时校验版本归属。

## 4. 文档查询和命令

- [x] 4.1 实现 `searchDocuments`，以 Document 分页并批量聚合当前版本 File、版本数、封面、预览状态和知识库 active/pending 摘要。
- [x] 4.2 让知识库文档列表复用 `searchDocuments` 的 datasetId 筛选，不再实现第二套文件/文档列表拼装。
- [x] 4.3 实现 `getDocumentDetail`，返回当前版本和按版本号倒序的完整历史。
- [x] 4.4 实现历史版本设为当前版本，并为每个关联知识库直接切换已有成功版本或设置 pending 后排队处理。
- [x] 4.5 实现文档 RAG 默认值修改和文档级幂等删除，删除时立即失效知识库关系并用现有 tasks 排队清理。

## 5. 统一页面图片预览

- [x] 5.1 定义单一页面转换器接口和组合版本，实现 PDF 及图片到有序 WebP 页面。
- [x] 5.2 实现 DOCX、PPTX、XLSX 经受控 Office 转 PDF 后按页转换。
- [x] 5.3 实现 TXT、Markdown、CSV 的固定排版和安全转换，禁用脚本、外链及本地文件读取。
- [x] 5.4 实现预览任务：更新版本状态、生成完整页面、事务替换页面行、记录页数，并在失去租约时禁止提交。
- [x] 5.5 实现按页码窗口查询和短期签名，列表封面复用第一页且不返回 bucket/object key。
- [x] 5.6 实现 failed 预览幂等重试，支持全部目标格式，并正确处理部分生成失败、大文档窗口和越权访问。

## 6. 多知识库 RAG 版本

- [x] 6.1 实现一个文档加入、移出和批量更新多个知识库，保证 `(datasetId, documentId)` 唯一。
- [x] 6.2 修改 Segment 持久化和索引元数据，使内容明确绑定 documentVersionId，重处理不得混入其他版本。
- [x] 6.3 实现以 DocumentVersion + 配置为幂等键的内容任务，批量更新各关系 pending/processing/failed 状态。
- [x] 6.4 RAG 成功后使用 pendingVersion 条件更新 activeVersion 并清空 pending，失败时保留旧 activeVersion。
- [x] 6.5 修改检索读取，只允许 relation.activeVersionId 对应的 Segment/向量结果参与召回。
- [x] 6.6 实现新版本上传、历史回切、失败重试、连续版本覆盖和关系删除时的迟到任务保护。

## 7. 路由与管理端

- [x] 7.1 新增文档搜索、详情、上传完成、版本切换、下载、删除、页面窗口和重试路由；复杂流程调用文档用例，普通局部查询允许直接使用 ORM。
- [x] 7.2 更新知识库关系路由，支持多知识库并返回 active/pending 版本和状态。
- [x] 7.3 把管理端文件列表改为文档列表，展示当前版本、版本数、封面、预览状态、RAG 状态和知识库。
- [x] 7.4 拆分首次上传和新版本上传交互，支持多知识库和单次 RAG 开关。
- [x] 7.5 实现文档详情、版本历史和历史回切；把 FileViewer 改为按窗口加载的统一页面图片查看器。
- [x] 7.6 更新权限和共享路由类型，确认管理端文档业务不再传 fileId。

## 8. 切换、清理与验证

- [x] 8.1 明确目标环境通过 reset 文档相关表完成切换，不实现旧模型迁移、回填或兼容读取。
- [x] 8.2 切换管理端后确认旧入口无消费者，再删除 file-list/detail/preview/remove、旧多模式查看器和重复处理 jobs。
- [x] 8.3 用现有任务实现幂等文档清理，支持取消和部分失败重试，并阻止迟到提交；对象不存在时视为成功。
- [x] 8.4 运行服务端/管理端 lint、类型检查、OpenSpec strict 校验和 `pnpm turbo lint`。

## 9. Route 与 hooks 边界纠偏

- [x] 9.1 将知识库基础 CRUD、上传会话列表/状态和文档 RAG 默认值等普通查询或更新迁回对应 route 直接使用 ORM；需要同步派生状态的任务取消保留业务函数。
- [x] 9.2 把上传初始化、完成、取消和 Multipart 编排收回 `upload/` 高层业务函数，route 不再组合 File、S3、会话和文档版本内部原语。
- [x] 9.3 将文档复杂读取、版本、删除、预览、RAG 和任务运行时按功能目录归位，拆除混杂的 `documents/commands.ts` 与 `processing/` 职责。
- [x] 9.4 删除 `files/queries.ts`、`rag/datasets.ts`、`upload/shared.ts`、根 barrel 和空目录；File 行、mapper、S3 与 worker 原语不得作为 route 公共 API。
- [x] 9.5 更新 README 和精确 import，移除死导出与重复查询，保持 API、数据库结构及业务行为不变。
- [x] 9.6 运行服务端 lint、OpenSpec strict 校验和 `git diff --check`。
- [x] 9.7 审计并纠正相关未归档 OpenSpec 中“所有 route 必须经过 hooks”、根公共入口、独立顶层 hook 和每类任务机械建目录等冲突规则。

## 10. 文档内容与 RAG 职责纠偏

- [x] 10.1 将 parser、normalize、segment、配置和执行器从 `rag/` 迁入 `document/content/`，保持算法行为不变。
- [x] 10.2 将内容任务幂等边界收敛为 `DocumentVersion + processingConfigVersion`，同一版本关联多个知识库只处理一次。
- [x] 10.3 将关系 processing/ready/failed 改为按文档版本批量条件更新，迟到任务仍不得覆盖更新后的 pending 版本。
- [x] 10.4 删除无消费者的 Segment 读取预留和任务单知识库字段，更新任务详情、取消/重试、README 与旧 OpenSpec 规则。
- [x] 10.5 运行服务端与管理端 lint、OpenSpec strict、静态引用审计和 `git diff --check`。

## 11. 错误调用精简

- [x] 11.1 全仓删除 `ROOT_ERROR` 固定附加消息，仅保留真正依赖运行时数据的动态详情。
- [x] 11.2 更新相关未归档 OpenSpec 错误调用规则，并运行服务端 lint、OpenSpec strict、静态审计和 `git diff --check`。
