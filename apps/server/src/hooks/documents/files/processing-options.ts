import { getFileProcessingRuntimeConfig } from '@/configs/index.js';
import { listRagDatasets } from '../knowledge/index.js';


/** 返回文件上传和手动处理共用的 RAG 选项。 */
export async function getFileProcessingOptions(userId: string) {
  const result = await listRagDatasets(
    { status: ['active'], limit: [0, 1_000] },
    userId,
  );
  return {
    defaultEnterRag: getFileProcessingRuntimeConfig().defaultEnterRag,
    datasets: result.list.map((dataset) => ({
      datasetId: dataset.datasetId,
      name: dataset.name,
    })),
  };
}

