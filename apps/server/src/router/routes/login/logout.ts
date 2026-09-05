import { routerHandler } from '@/router/utils.js';
import { authentication } from '@/router/authentication.js';

const { api } = routerHandler({
  url: '/login/logout',
  method: 'POST',
  handler: async ({ body, reply }) => {
    authentication.cookieClear(reply);
    return 'ok';
  },
});

export default api;
