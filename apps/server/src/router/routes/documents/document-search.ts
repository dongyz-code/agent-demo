import { searchDocuments } from '@/hooks/documents/document/read.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-search',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.management'),
  handler: async ({ body, __token }) =>
    await searchDocuments(body, __token.user_id),
});

export default api;
