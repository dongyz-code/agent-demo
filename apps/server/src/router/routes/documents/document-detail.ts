import { documentAction } from '@/hooks/documents/document-action.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/documents/document-detail',
  method: 'POST',
  handler: async ({ body, __token }) =>
    await documentAction.getDetail(body.documentId, __token.user_id),
});

export default api;
