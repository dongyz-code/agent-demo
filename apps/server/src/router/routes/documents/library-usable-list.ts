import { listUsableLibraries } from '@/hooks/documents/library-access.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/documents/library-usable-list',
  method: 'POST',
  handler: async ({ __token }) => ({
    list: await listUsableLibraries(__token.user_id),
  }),
});

export default api;
