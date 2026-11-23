import { documentAction } from '@/hooks/documents/document-action.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/documents/document-preview-pages',
  method: 'POST',
  handler: async ({ body, __token }) =>
    await documentAction.getPreviewPages(body, __token.user_id),
});

export default api;
