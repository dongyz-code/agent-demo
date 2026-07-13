import { getFileProcessingRuntimeConfig } from '@/configs/index.js';
import {
  finishUpload as finishStoredUpload,
} from './upload-service.js';
import { getUploadSessionInfo } from './session-service.js';
import { initUpload as initStoredUpload } from './init-service.js';
import { getRagDataset } from '../knowledge/index.js';
import { createFileProcessingTask } from '../processing/index.js';
import { createDomainError } from '../errors.js';

import type { Upload } from '@repo/types';

type UploadInitBody = Upload['init']['body'];

/**
 * 初始化文件管理上传，并在服务端保存后续处理意图。
 *
 * 通用附件不传 `enterRag` 时不会自动进入文件处理流程。
 */
export async function initFileUpload(
  input: UploadInitBody,
  userId: string,
) {
  const defaultEnterRag =
    input.policyKey === 'rag-document' &&
    getFileProcessingRuntimeConfig().enabled
      ? getFileProcessingRuntimeConfig().defaultEnterRag
      : false;
  const enterRag = input.enterRag ?? defaultEnterRag;
  if (enterRag && !input.datasetId) {
    throw createDomainError(
      'FILE_PROCESSING_DATASET_REQUIRED',
      '选择进入 RAG 时必须指定目标知识库',
      'bad-request',
    );
  }
  if (enterRag && input.datasetId) {
    const dataset = await getRagDataset(input.datasetId, userId);
    if (dataset.status !== 'active') {
      throw createDomainError(
        'FILE_PROCESSING_DATASET_DISABLED',
        '目标知识库已停用',
        'conflict',
      );
    }
  }
  return await initStoredUpload(
    {
      ...input,
      enterRag,
      datasetId: enterRag ? input.datasetId : undefined,
    },
    userId,
  );
}

/** 完成文件验证，并按照持久化意图幂等创建文件处理任务。 */
export async function finishFileUpload(
  sessionId: string,
  parts: Upload['complete']['body']['parts'],
  userId: string,
) {
  const file = await finishStoredUpload(sessionId, parts, userId);
  const session = await getUploadSessionInfo(sessionId, userId);
  if (
    getFileProcessingRuntimeConfig().enabled &&
    session.enterRag &&
    session.datasetId
  ) {
    await createFileProcessingTask(
      {
        fileId: file.fileId,
        datasetId: session.datasetId,
        processingConfigVersion:
          session.processingConfigVersion ?? undefined,
        triggerSource: 'upload',
      },
      userId,
    );
  }
  return file;
}
