## Purpose
定义文档版本在后端统一转换为页面图片时的生成、完整性验证、原子发布、私有存储、窗口化访问、失败隔离和独立重试规则。

## Requirements

### Requirement: 所有文档预览统一为页面图片
系统 MUST 将当前上传策略支持的 PDF、DOCX、PPTX、XLSX、TXT、Markdown、CSV 和图片在后端转换为有序页面图片。公共预览接口 MUST NOT 返回 PDF、HTML 或原文件作为其他预览模式。

#### Scenario: 预览不同格式文档
- **WHEN** 用户预览任一支持格式的 ready 版本
- **THEN** 系统返回相同结构的页面图片窗口，客户端使用同一查看器

### Requirement: 预览页面直接属于文档版本
系统 MUST 使用 `document_preview_pages` 按 `documentVersionId + pageNumber` 保存页面，页码从 1 开始连续，并记录尺寸、可信 MIME、字节数和私有对象位置。

#### Scenario: 多页转换完成
- **WHEN** worker 成功生成 N 页图片
- **THEN** 系统保存页码 1 至 N，并在 DocumentVersion 上记录 ready 和准确页数

### Requirement: 预览状态保存在版本上
系统 MUST 在 DocumentVersion 上独立记录 `pending`、`processing`、`ready` 或 `failed` 预览状态、页数和错误摘要。预览失败不得改变文档生命周期或 RAG 状态。

#### Scenario: 预览失败但 RAG 成功
- **WHEN** 页面转换失败而 RAG 已成功
- **THEN** 知识库继续使用该版本，详情只显示预览失败和重试入口

### Requirement: 页面集合必须完整替换
worker MUST 先生成并验证全部页面对象，再在事务中替换该版本页面行并把状态更新为 ready。部分生成或失去任务租约时 MUST NOT 发布不完整页面。

#### Scenario: 中途转换失败
- **WHEN** 转换器只生成部分页面后失败
- **THEN** 系统标记预览失败且不把部分页面作为 ready 结果返回

### Requirement: 页面按窗口安全返回
系统 MUST 按受限页码窗口返回页面元数据和短期签名 URL，不得一次返回大文档全部页面，也不得暴露 bucket 或 object key。

#### Scenario: 查看大文档中间页面
- **WHEN** 授权用户请求合法页面窗口
- **THEN** 系统按页码顺序返回该窗口、总页数、短期地址和过期时间

### Requirement: 预览任务可独立重试
系统 MUST 复用现有任务机制为同一版本创建唯一活动预览任务，并允许授权用户重试 failed 状态。

#### Scenario: 重复触发预览
- **WHEN** 上传完成和手动重试同时触发同一版本预览
- **THEN** 系统只保留一个活动任务
