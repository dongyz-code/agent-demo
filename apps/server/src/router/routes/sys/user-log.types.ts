import { LOG_MAP } from '@/hooks/user-log/static.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';
import { getKeys } from '@repo/utils-node';

const data = JSON.stringify({
  data: getKeys(LOG_MAP).map((value) => ({
    value,
    label: LOG_MAP[value].label,
  })),
});

const { api } = routerHandler({
  url: '/sys/user-log/types',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.user-log'),
  handler: async ({ body: {} }) => {
    return data as any;
  },
});

export default api;
