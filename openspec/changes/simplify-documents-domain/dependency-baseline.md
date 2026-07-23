# Documents 依赖基线

记录时间：2026-07-21。该清单用于实施前后对照，不是新的公共 API 承诺。

## 域外根入口消费者

- `apps/server/src/server.ts`：`checkUploadBucket`、`startFileProcessingWorker`
- `apps/server/src/router/routes/sys/*`：`findFileProcessingTaskIds`、`enrichFileTaskList`
- `apps/server/src/router/routes/documents/*`：
  `abortMultipartUpload`、`addDocumentToDataset`、`assertActiveSession`、
  `buildObjectKey`、`calculateMultipartPlan`、`calculateSha256Stream`、
  `canCancelUploadSession`、`completeMultipartUpload`、
  `createFileFingerprint`、`createFileProcessingTask`、
  `createMultipartUpload`、`deleteStoredObject`、`detectTrustedContentType`、
  `getDatasetRow`、`getFileProcessingTask`、`getFileRow`、
  `getOwnedFileRow`、`getOwnedSession`、`getPreviewProvider`、
  `getRagDataset`、`getUploadPolicy`、`getUploadSessionInfo`、
  `headStoredObject`、`listDocumentsByIds`、`listMultipartParts`、
  `listRagDatasets`、`normalizeExtension`、`openStoredObject`、
  `presignGetObject`、`presignPutObject`、`presignUploadPart`、
  `sanitizeUploadFilename`、`toDatasetInfo`、`toStoredFileInfo`、
  `toUploadSessionInfo`、`updateRagDataset`

所有域外消费者当前均从 `@/hooks/documents/index.js` 导入，没有深层导入。

## 当前循环边

- `knowledge/queries.ts -> documents/index.ts -> knowledge/index.ts`
- `processing/queries.ts -> documents/index.ts -> processing/index.ts`
- `files/documents.ts -> processing/definition.ts -> ... -> files/index.ts`

## 目标依赖方向

```text
storage -> files -> knowledge -> processing
   |                       ^          |
   +-------> preview       +----------+

upload: 只依赖配置、数据库和外部类型，不依赖其他 documents 子模块
域内:   不得导入 documents/index.ts
域外:   普通 route 直接使用 ORM，复杂流程精确导入功能明确的业务文件
routes: 不得导入 storage、File 行、parser 或 worker 内部控制面
```
