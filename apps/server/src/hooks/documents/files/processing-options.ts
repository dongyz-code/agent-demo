import { getFileProcessingRuntimeConfig } from '@/configs/index.js';
import { listRagDatasets } from '../knowledge/index.js';

import type { UploadActor as FileActor } from '../upload/index.js';

/** 返回文件上传和手动处理共用的 RAG 选项。 */
export async function getFileProcessingOptions(actor: FileActor) {
  const result = await listRagDatasets(
    { status: ['active'], limit: [0, 1_000] },
    actor,
  );
  return {
    defaultEnterRag: getFileProcessingRuntimeConfig().defaultEnterRag,
    datasets: result.list.map((dataset) => ({
      datasetId: dataset.datasetId,
      name: dataset.name,
    })),
  };
}

