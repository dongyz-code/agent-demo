import { documentsConfig } from '../config.js';
import { createDocumentContentTask } from '../document/content/task.js';
import { getDocumentDetail } from '../document/read.js';
import { updateDocumentDatasetRelations } from './relations.js';

import type {
  FileProcessingTriggerSource,
} from '@repo/types';
import type { DocumentDatasetRelationMode } from './relations.js';

/** 文档知识库关系变更与版本内容任务触发输入。 */
export interface ApplyDocumentDatasetAssignmentInput {
  /** 文档稳定标识。 */
  documentId: string;
  /** 本次关系应处理的不可变文档版本。 */
  documentVersionId: string;
  /** 需要加入、移出或作为完整结果的知识库标识。 */
  datasetIds: string[];
  /** 关系集合变更方式。 */
  mode: DocumentDatasetRelationMode;
  /** 当前操作用户。 */
  userId: string;
  /** 上传自动触发或用户手动操作。 */
  triggerSource?: FileProcessingTriggerSource;
  /** 可选版本内容处理配置。 */
  processingConfigVersion?: string;
}

/**
 * 修改知识库关系，并为同一 DocumentVersion 最多创建一个内容任务。
 *
 * @param input 文档版本、知识库集合、变更方式、处理配置和审计用户。
 * @returns 关系更新及内容任务触发完成后结束。
 */
export async function applyDocumentDatasetAssignment(
  input: ApplyDocumentDatasetAssignmentInput,
): Promise<void> {
  await updateDocumentDatasetRelations(input);
  if (
    documentsConfig.fileProcessing.enabled &&
    input.mode !== 'remove' &&
    input.datasetIds.length
  ) {
    await createDocumentContentTask(
      {
        documentId: input.documentId,
        documentVersionId: input.documentVersionId,
        processingConfigVersion: input.processingConfigVersion,
        triggerSource: input.triggerSource ?? 'manual',
      },
      input.userId,
    );
  }
}

/**
 * 修改文档知识库集合并返回刷新后的文档详情。
 *
 * @param documentId 文档稳定标识。
 * @param datasetIds 需要加入、移出或作为完整结果的知识库标识。
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
  await applyDocumentDatasetAssignment({
    documentId,
    documentVersionId: document.activeVersion.documentVersionId,
    datasetIds,
    mode,
    userId,
    triggerSource: 'manual',
  });
  return await getDocumentDetail(documentId, userId);
}
