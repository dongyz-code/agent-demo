import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/login/logout',
  method: 'POST',
  handler: async ({ body, reply }) => {
    reply.clearCookie('token');
    return 'ok';
  },
});

export default api;
