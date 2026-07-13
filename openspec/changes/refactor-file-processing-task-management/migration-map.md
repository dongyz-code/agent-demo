# 文件处理任务迁移对照

## 当前入口

| 业务能力 | 当前服务端入口 | 当前管理端入口 | 迁移目标 |
| --- | --- | --- | --- |
| 上传初始化、签名、完成、恢复 | `hooks/upload/index.ts`、`/upload/*` | `components/upload`、文件页上传会话 | `hooks/file/upload`；上传会话只保留在上传组件内部 |
| 文件查询、预览、下载、删除 | `hooks/upload/index.ts`、`/file/*` | 文件管理“通用文件”页签 | `hooks/file/files` 与单一文件管理页面 |
| 文档创建、解析、切分 | `hooks/document/index.ts`、`/document/*` | 知识库文档上传和处理抽屉 | `hooks/file/content` 与 `tasks/file-processing` 阶段 |
| 知识库及文档关联 | `hooks/rag/index.ts`、`/rag/*` | 独立 RAG 管理页面 | `hooks/file/knowledge`；知识库实体管理保留，文档接入由文件任务完成 |
| 系统脚本任务 | `hooks/task/index.ts`、`/sys/task/*` | 系统管理/任务管理 | 保留并增强为统一任务中心 |
| 文档处理任务 | `document_processing_jobs` 与阶段表 | RAG 页面任务抽屉 | 新任务写入 `tasks` 与文件任务扩展表；旧记录只读兼容 |

## 兼容边界

- 新文件处理流程切换前，旧 `/document/*` 与 `/rag/dataset-document/*` routes 保持可用。
- 新管理端不得新增对旧文档处理 routes 的调用；切换完成后旧 routes 只做兼容转发并记录弃用日志。
- 旧 `hooks/upload`、`hooks/document` 与 `hooks/rag` 公共出口在迁移期转发到 `hooks/file/index.ts`，不得继续增加新能力。
- 已存在的 `document_processing_jobs` 采用只读兼容展示，不在首次重构中修改历史主键或任务结果；所有新执行统一写入通用任务体系。
- 移除兼容层前必须确认新旧任务数量、状态、文档版本、Segment 与知识库关联一致，并保留功能开关用于回滚。

## 首期配置决策

- `fileProcessing.defaultEnterRag` 使用服务端全局配置，默认 `true`，上传界面允许单次覆盖。
- 首期不把用户选择写成个人偏好，避免引入尚未存在的用户配置存储。
- 文件任务执行并发和失去心跳判断同样由 `fileProcessing` 配置集中管理。

