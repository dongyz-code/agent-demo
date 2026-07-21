## 1. 测试入口与当前基线

- [x] 1.1 为 `apps/server` 增加可重复执行的 documents 聚焦测试命令，确保测试文件能被发现且失败返回非零退出码
- [x] 1.2 生成 documents 域外公共符号消费者清单和域内 import 图，记录当前根出口、循环边与允许依赖方向
- [x] 1.3 为对象 key、文件指纹、Multipart 计划、可信 MIME 回退、normalize 和 segment 增加不依赖数据库/S3 的聚焦测试
- [x] 1.4 为现有上传完成流程建立普通上传、Multipart、重复完成、对象校验失败和自动创建处理任务的行为基线测试
- [x] 1.5 建立可选 MinIO 集成测试环境检测；配置齐全时运行真实上传流程，缺少配置时输出明确 skip 原因

## 2. 单向依赖与显式公共 API

- [x] 2.1 扩展 `ensureDocumentForFile` 输入，由 processing 显式传入 normalizer 与 segment profile 版本，移除 files 对 `processing/definition` 的依赖
- [x] 2.2 将 knowledge 对根 `documents/index.ts` 的反向导入替换为允许方向上的文件/文档实现导入
- [x] 2.3 将 processing 对根 `documents/index.ts` 的反向导入替换为 files 和 knowledge 的稳定实现导入
- [x] 2.4 将根 `documents/index.ts` 改为按职责分组的显式命名导出，并保留所有现有域外消费者所需符号
- [x] 2.5 从根出口移除 S3 client getter、具体 provider/parser、stale 恢复、单任务执行和其他内部控制函数
- [x] 2.6 更新 documents routes、`server.ts` 和 sys task routes 的导入，确认域外代码仍只使用根入口且不存在深层导入
- [x] 2.7 实现依赖边界测试，覆盖域内禁止导入根入口、files 禁止依赖 processing、允许依赖 DAG 和域外禁止深层导入
- [x] 2.8 运行服务端类型检查和依赖边界测试，确认循环边全部消失且服务启动导入正常

## 3. Worker 与 Runner 职责拆分

- [x] 3.1 把启动、定时 drain、并发容量、原子 claim 和 stale 恢复迁入 `processing/worker.ts`
- [x] 3.2 保留 `processing/runner.ts` 承担单任务阶段顺序、阶段 attempt、取消检查、结果持久化和任务完成/失败
- [x] 3.3 为 worker 时钟和 heartbeat 调度提供最小可测试边界，不引入通用 task-runtime 或外部队列抽象
- [x] 3.4 通过带 `task_id + pending` 条件的更新实现 lease heartbeat，间隔从 `staleTaskSeconds` 推导并设置安全上下限
- [x] 3.5 heartbeat 更新失败或条件不匹配时标记 lease 丢失，并在每个外部动作返回后、结果持久化前再次校验
- [x] 3.6 在 stale 恢复事务中终结遗留 pending stage run，写入稳定 worker 失效错误码和结束时间后重置任务
- [x] 3.7 停止把 `{ processedItems }` 写成可恢复 checkpoint，明确新 attempt 始终从 reading 阶段开始
- [x] 3.8 收窄根出口，只公开 `startFileProcessingWorker` 与任务创建/查询用例，不公开 recover、claim、runStage 和单任务执行

## 4. Worker 行为测试

- [x] 4.1 测试两个 worker 同时看到同一任务时只有一个原子 claim 成功且只创建一组阶段记录
- [x] 4.2 使用可控时钟测试长阶段按期 heartbeat，未过期任务不会被 stale 恢复
- [x] 4.3 测试 heartbeat 条件失配与数据库续租失败会阻止当前执行器提交 Segment、知识库关联和 completed 状态
- [x] 4.4 测试 stale 恢复会终结 pending stage、保留历史完成记录、递增 attempt 并从 reading 重跑
- [x] 4.5 测试阶段开始前取消和远程动作执行中取消，确认取消后不提交结果或启动后续阶段
- [x] 4.6 测试 worker 启停与重复启动幂等，确认测试结束后 timer 被释放且不会污染后续用例

## 5. 删除死抽象与合并小文件

- [x] 5.1 删除 `FILE_PROCESSING_STAGES`、`FileProcessingPipelineResult`、`ReadyDocument`、`UploadFilePreview`、`listDocumentParsers` 和 `listStoredObjectKeys`
- [x] 5.2 把 upload 状态判断合入会话 helper，把 `UploadPolicy` 合入 policies，并删除对应纯类型/状态小文件
- [x] 5.3 将单实现 Magic Number validator registry 收敛为直接检测函数，保留 SHA-256 和文本 MIME 安全回退行为
- [x] 5.4 把 `ReadableStoredFile` 合入 files 查询模块，把 processing 创建输入和 runner 上下文分别移动到实际使用文件
- [x] 5.5 删除 storage/upload/files/preview/knowledge/processing 六个纯转发子模块 `index.ts`，更新域内 import 为明确实现路径
- [x] 5.6 在 `simplify-database-schema` 移除解析块持久化后删除 `stableParsedBlockId`；若该变更尚未落地则保留并记录依赖，不提前破坏编译
- [x] 5.7 重新运行静态引用检查，删除其他确认只有声明位置的定义，但保留多实现 parser/preview registry 和 S3 三层基础设施
- [x] 5.8 核对收敛后的文件均对应独立状态机、外部系统、多实现选择、纯算法或跨调用方复用，不为达到目标数量继续机械合并

## 6. 文档与规格实态

- [x] 6.1 重写 documents README 的实际目录、依赖 DAG、根公共 API、worker 从头重试和测试命令说明
- [x] 6.2 删除或重写过期 knowledge README，移除旧 `hooks/upload`/`hooks/document`/`hooks/rag` 与不存在的 `getReadyDocument`
- [x] 6.3 移除 README 中不存在的 `content/`、`documents/`、`task-runtime/` 和 legacy/service 描述
- [x] 6.4 重新核对 `consolidate-documents-domain` 已勾选任务与仓库实态，只有测试文件存在且命令实际通过的项目才能保持完成状态
- [x] 6.5 决定无效 `userId` 参数是删除还是另立数据范围权限变更，本次不得静默改变权限可见范围

## 7. 最终验收

- [x] 7.1 运行 documents 依赖边界、纯函数、上传完成和 worker 全部聚焦测试
- [x] 7.2 在具备 MinIO/数据库配置的测试环境运行完整上传、恢复、预览、处理、知识库关联和任务中心集成测试
- [x] 7.3 运行 `pnpm --filter @repo/deploy-server lint` 与 `pnpm turbo lint`
- [x] 7.4 静态确认域内不导入根入口、域外不深层导入、根出口无 `export *` 且六个死定义不存在
- [x] 7.5 核对 `/documents/*` 路径、DTO、权限键、错误码和对象 key 未发生变更，并完成管理端关键流程回归
- [x] 7.6 运行 OpenSpec strict 校验，确认 proposal、specs、design、tasks 与实际交付结构一致
