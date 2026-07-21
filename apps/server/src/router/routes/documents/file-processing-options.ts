import { ROOT } from '@/configs/index.js';
import { listRagDatasets } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-processing-options',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.management'),
  handler: async ({ __token }) => {
    const result = await listRagDatasets(
      { status: ['active'], limit: [0, 1_000] },
      __token.user_id,
    );
    return {
      defaultEnterRag: ROOT.fileProcessing.defaultEnterRag,
      datasets: result.list.map((dataset) => ({
        datasetId: dataset.datasetId,
        name: dataset.name,
      })),
    };
  },
});

export default api;
