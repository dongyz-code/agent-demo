import { getOwnedFileRow, toStoredFileInfo } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-detail',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.view'),
  handler: async ({ body, __token }) => {
    return toStoredFileInfo(
      await getOwnedFileRow(body.fileId, __token.user_id),
    );
  },
});

export default api;
