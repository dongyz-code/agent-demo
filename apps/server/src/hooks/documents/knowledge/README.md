# RAG 业务模块

`hooks/rag` 只负责知识库、文档关联，以及后续 Embedding、Elasticsearch 索引、混合检索、生成和评估语义。当前 change 实现知识库与文档关联，尚未实现索引和检索。

## 三层调用流程

```text
hooks/upload
  ↓ fileId
hooks/document
  ↓ documentId / ready DocumentSegment
hooks/rag
  ↓ datasetId + documentId 关联
后续 indexing / retrieval / generation / evaluation
```

## 依赖边界

- RAG 只能从 `@/hooks/document/index.js` 导入文档能力。
- 禁止导入上传模块、文档 parser、processing、segmentation 和文档数据表。
- 文档可加入多个知识库；移除知识库关联不得删除文档及源文件。
- 后续 Elasticsearch Worker 应消费 `getReadyDocument`，以 `segmentId + configVersion` 保证索引幂等。
