# 通用文档内容模块

`hooks/document` 负责把已验证通用文件转换为可复用的文档版本、解析块与 Segment，不理解知识库、Embedding、Elasticsearch、检索和回答语义。

```text
hooks/document → hooks/upload/index.ts
hooks/rag      → hooks/document/index.ts
```

业务调用方使用 `fileId` 创建文档；处理完成后，RAG、摘要或审核模块通过 `getReadyDocument` 获取稳定 Segment。禁止跨目录导入 parser、processing 和文档数据表。

## 解析服务配置

`document.parserEndpoint` 指向 PDF/Office 解析服务，服务端以原文件流调用其 `/parse` 接口。解析服务必须返回统一块数组，每个块包含 `blockId`、`type`、`text`，并可包含 `headingPath`、`page` 和 `metadata`。

TXT、Markdown 和 CSV 默认由本地解析器处理。新增解析器时实现 `DocumentParser` 并注册可信 MIME；第三方库结构必须在适配器内转换为 `DocumentParsedBlock`。

`document.segmentSizeTokens` 与 `document.segmentOverlapTokens` 控制结构化切分。处理规则变化时必须更新 parser、normalizer 或 Segment profile 版本，保证结果可复现。

## 故障排查

- `DOCUMENT_PARSER_UNAVAILABLE`：未配置远程解析 Endpoint，或解析服务不可达。
- `DOCUMENT_PARSER_INVALID_RESPONSE`：远程服务未返回统一块结构或返回未知块类型。
- 重试仍失败：查看 `/document/processing/detail` 的阶段记录、错误码和 attempt。
- Segment 重复：检查文档版本和处理配置版本，并运行确定性 Segment 测试。
