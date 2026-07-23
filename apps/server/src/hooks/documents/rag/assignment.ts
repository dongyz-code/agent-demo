import { ROOT } from '@/configs/index.js';
import { getDocumentDetail } from '../document/read.js';
import {
  updateDocumentDatasetRelations,
} from './relations.js';
import { createDocumentRagTask } from './task.js';

import type { DocumentDatasetRelationMode } from './relations.js';

/**
 * 修改文档知识库集合，并为仍等待当前版本的关系创建 RAG 任务。
 *
 * @param documentId 文档稳定标识。
 * @param datasetIds 需要加入、移出或作为完整替换结果的知识库标识。
 * @param mode 关系集合的加入、移出或替换方式。
 * @param userId 当前操作用户，用于文档范围和审计。
 * @returns 更新后的文档详情与各知识库版本状态。
 */
export async function changeDocumentDatasets(
  documentId: string,
  datasetIds: string[],
  mode: DocumentDatasetRelationMode,
  userId: string,
) {
  const document = await getDocumentDetail(documentId, userId);
  const documentVersionId = document.activeVersion.documentVersionId;
  await updateDocumentDatasetRelations({
    documentId,
    documentVersionId,
    datasetIds,
    mode,
    userId,
  });
  let updated = await getDocumentDetail(documentId, userId);
  if (ROOT.fileProcessing.enabled && mode !== 'remove') {
    const pendingDatasetIds = updated.datasets
      .filter(
        (dataset) =>
          dataset.pendingVersionId === documentVersionId &&
          dataset.status !== 'processing',
      )
      .map((dataset) => dataset.datasetId);
    await Promise.all(
      pendingDatasetIds.map(
        async (datasetId) =>
          await createDocumentRagTask(
            {
              documentId,
              documentVersionId,
              datasetId,
              triggerSource: 'manual',
            },
            userId,
          ),
      ),
    );
    updated = await getDocumentDetail(documentId, userId);
  }
  return updated;
}
