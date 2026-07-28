## ADDED Requirements

### Requirement: 图片文档入库不得依赖 RAG 支持
文档源策略 MUST 接受 JPEG、PNG 和 WebP 作为普通 DocumentVersion。系统 MUST 在可信文件验证和文档版本创建后独立调度单页图片预览，不得因为缺少图片 OCR 或 RAG 解析器而拒绝上传。

#### Scenario: 上传 PNG 文档
- **WHEN** 用户在文档管理中上传通过可信验证的 PNG
- **THEN** 系统创建 Document 与 DocumentVersion，并独立生成一页预览

#### Scenario: 图片没有 RAG 解析器
- **WHEN** 图片版本当前没有可用内容解析器
- **THEN** 文档上传和预览仍可成功，RAG 能力单独显示不支持

