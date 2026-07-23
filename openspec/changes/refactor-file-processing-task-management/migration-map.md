# 文件处理任务迁移对照

## 当前入口

| 业务能力 | 当前服务端入口 | 当前管理端入口 | 迁移目标 |
| --- | --- | --- | --- |
| 上传初始化、签名、完成、恢复 | `hooks/upload/index.ts`、`/upload/*` | `components/upload`、文件页上传会话 | `hooks/documents/upload`；会话列表和状态直接归 route |
| 文件查询、预览、下载、删除 | `hooks/upload/index.ts`、`/file/*` | 文件管理“通用文件”页签 | 文档复杂读取归 `document`、预览归 `preview`，普通查询直接 ORM |
| 文档创建、解析、切分 | `hooks/document/index.ts`、`/document/*` | 知识库文档上传和处理抽屉 | 文档版本归 `document`，解析与切分归 `rag/pipeline` |
| 知识库及文档关联 | `hooks/rag/index.ts`、`/rag/*` | 独立 RAG 管理页面 | 复杂关系归 `hooks/documents/rag`；知识库基础 CRUD 直接归 route |
| 系统脚本任务 | `hooks/task/index.ts`、`/sys/task/*` | 系统管理/任务管理 | 保留并增强为统一任务中心 |
| 文档处理任务 | `document_processing_jobs` 与阶段表 | RAG 页面任务抽屉 | 新任务写入 `tasks` 与文件任务扩展表；旧记录只读兼容 |

## 兼容边界

- 新文件处理流程切换前，旧 `/document/*` 与 `/rag/dataset-document/*` routes 保持可用。
- 新管理端不得新增对旧文档处理 routes 的调用；切换完成后旧 routes 只做兼容转发并记录弃用日志。
- 旧 `hooks/file`、`hooks/upload`、`hooks/document` 与 `hooks/rag` 只允许在迁移窗口临时转发，最终必须删除且不得转发到新的根 barrel。
- 已存在的 `document_processing_jobs` 采用只读兼容展示，不在首次重构中修改历史主键或任务结果；所有新执行统一写入通用任务体系。
- 移除兼容层前必须确认新旧任务数量、状态、文档版本、Segment 与知识库关联一致，并保留功能开关用于回滚。

## 首期配置决策

- `fileProcessing.defaultEnterRag` 使用服务端全局配置，默认 `true`，上传界面允许单次覆盖。
- 首期不把用户选择写成个人偏好，避免引入尚未存在的用户配置存储。
- 文件任务执行并发和失去心跳判断同样由 `fileProcessing` 配置集中管理。
