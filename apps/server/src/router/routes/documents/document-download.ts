import { documentAction } from '@/hooks/documents/document-action.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/documents/document-download',
  method: 'POST',
  handler: async ({ body, __token }) =>
    await documentAction.getDownload(
      body.documentId,
      body.documentVersionId,
      __token.user_id,
    ),
});

export default api;
