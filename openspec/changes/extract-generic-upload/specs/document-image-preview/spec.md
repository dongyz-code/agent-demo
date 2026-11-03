## MODIFIED Requirements

### Requirement: 预览页面直接属于文档版本

系统 MUST 使用 document_preview_pages 与 document_preview_quick_pages 按 documentVersionId + pageNumber 保存清晰和快速页面，页码从 1 开始连续。页面 MUST 记录尺寸、可信 MIME、字节数和 upload 文件句柄，物理对象位置只保存在通用 files 中。

#### Scenario: 多页转换完成

- **WHEN** worker 成功生成 N 页图片
- **THEN** 系统保存页码 1 至 N 的文件句柄，并在 DocumentVersion 上记录 ready 和准确页数
