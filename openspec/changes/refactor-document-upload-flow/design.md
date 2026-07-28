## Context

管理端当前把 Uppy 文件状态、服务端 UploadSession、File 验证、DocumentVersion、预览任务和 RAG 关系压缩为一个队列状态。文档页又固定使用 `rag-document` 策略，导致文档支持范围被 RAG 解析器反向限制。GoldenRetriever 以策略键作为唯一存储标识并持久化全部选择项，两个上传弹窗会共享恢复空间；单文件上传还在对象存储成功事件后异步补做服务端完成，造成 100% 进度与业务结果脱节。

现有数据模型已经区分 File、UploadSession、Document、DocumentVersion、预览任务和知识库关系，本次优先修正流程与状态边界，不引入新的外部依赖。服务端仍必须执行可信 MIME、Magic Number、对象大小和 SHA-256 验证，DocumentVersion 继续保持不可变。

## Goals / Non-Goals

**Goals:**

- 以 DocumentVersion 成功创建作为上传成功边界。
- 支持图片作为普通文档上传和预览，RAG 能力按可信 MIME 独立判断。
- 使初始化、传输、服务端确认和失败重试具有一致的会话语义。
- 隔离上传器实例和业务目标，正确处理刷新恢复，不恢复未开始的本地选择。
- 阻止已完成会话再次写入源对象。

**Non-Goals:**

- 本次不实现图片 OCR 或新的图片 RAG 解析器。
- 本次不引入消息队列或完整 outbox 基础设施。
- 本次不改造预览和内容 Worker 的内部阶段执行逻辑。
- 本次不改变 DocumentVersion 的版本编号和历史版本切换规则。

## Decisions

### 1. 文档绑定是上传成功边界

`upload-complete` 负责完成对象验证并幂等创建 DocumentVersion。预览任务创建失败只记录日志，不能让接口返回上传失败；知识库关系不再在上传完成接口内修改。选择该边界是因为文档下载、版本历史和后续手工处理从 DocumentVersion 创建后已经可用。

备选方案是继续同步等待全部后置任务，仅把错误文案拆开；该方案仍会产生“文档已存在但上传失败”的错误状态，因此不采用。

### 2. RAG 作为文档入库后的显式能力

上传弹窗不再要求选择知识库，也不再以知识库缺失禁用开始按钮。用户通过文档列表中的知识库管理入口显式建立关系，内容任务沿用现有独立状态和重试机制。新文档默认 `ragEnabled=false`，避免上传新版本时被隐式 RAG 默认值阻塞。

### 3. 文档入口使用通用文档源策略

管理端文档上传使用当前 `default-attachment` 策略作为文档源策略，使 PDF、Office、文本和 JPEG/PNG/WebP 均可入库。服务端仍是最终安全边界，管理端从同一策略映射生成 `accept` 和 Uppy restrictions，提前阻止明显不支持的文件。

图片只创建预览任务；没有图片解析器时，后续知识库操作必须报告该版本不支持内容处理，而不是回滚文档。

### 4. 幂等键表示一次上传尝试

浏览器为每次新选择生成随机 `uploadAttemptId` 并作为 `idempotencyKey`，文件指纹只用于同一次尝试的请求恢复。初始化请求丢失后复用同一 attempt 可以取回活动会话；用户取消、终态失败或重新选择会生成新 attempt，从而建立新会话。

服务端遇到 completed 会话时返回“已完成恢复”响应，不再签发 PutObject 或 Multipart 写能力；客户端随后幂等调用完成接口取回 DocumentVersion 结果。服务端遇到 failed、canceled 或 expired 的同一 attempt 时返回明确终态错误，客户端必须开启新 attempt。

### 5. 单文件服务端确认使用 Uppy postprocessor

普通 PutObject 成功后，由 Uppy postprocessor 调用 `upload-complete`，使 `uppy.upload()` 覆盖服务端验证和文档绑定阶段。Multipart 继续在 `completeMultipartUpload` 中完成同一调用。两种模式最终都只有拿到 `DocumentUploadResult` 才进入成功状态。

页面列表刷新属于成功后的通知回调；回调失败不得重新标记文件上传失败。

### 6. 恢复空间按上传器用途隔离并与服务端对账

Uppy ID 和 IndexedDB 名称加入稳定 `instanceKey`，新文档与版本上传不再只按策略共享。GoldenRetriever 恢复后删除没有服务端 session 的未开始选择和丢失 Blob 的 ghost 文件；对已有 session 调用状态接口，根据服务端状态恢复、重新签发普通上传地址、取回完成结果或转为可重新尝试状态，之后显式触发 `restore-confirmed`。

已有 session 保存初始化时的 `documentId`，恢复和重试不得使用后来打开弹窗时的页面上下文覆盖它。切换目标文档前必须清理上一目标尚未开始的队列项。

### 7. 队列状态按阶段而不是单个布尔值表达

管理端至少区分待上传、初始化、传输中、已暂停、服务端确认、已入库和失败。失败项携带是否可重试；验证拒绝要求移除或重新选择，传输及可恢复确认失败才提供重试。开始按钮在批次执行期间显示 loading 并禁止重复提交。

## Risks / Trade-offs

- [预览任务创建失败后可能没有自动任务] → 记录结构化日志并保留现有文档详情中的独立重试入口；后续可用 outbox 进一步强化。
- [GoldenRetriever 恢复时服务端状态短暂处于 completing] → 保留“服务端确认中”状态并允许稍后只重试完成调用，不重新上传对象。
- [旧数据库中的 `rag_enabled=true`] → 上传入口不再读取该字段控制按钮；新文档显式写入 false，旧值可由后续数据修正而不阻塞本次上线。
- [浏览器 MIME 可能为空或不可靠] → 前端校验只做快速反馈，服务端扩展名、可信 MIME 和 Magic Number 验证仍是最终边界。

## Migration Plan

1. 先上线服务端 completed 会话写保护、终态错误和上传完成边界，保持旧客户端仍可调用现有字段。
2. 再上线管理端随机 attempt、postprocessor、实例隔离和恢复对账。
3. 将文档页策略切换为通用文档源策略并移除上传弹窗 RAG 选项。
4. 对旧的 pending/failed 上传会话保留自然过期和现有孤儿清理，不重签 completed 对象。
5. 回滚时可恢复旧管理端，但服务端 completed 写保护必须保留，不能回滚到可覆盖对象的行为。

## Open Questions

- 暂无阻塞实现的问题；可靠的后置任务 outbox 作为后续独立 change 评估。
