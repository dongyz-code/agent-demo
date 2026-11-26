import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

import { settingsCache } from '@/router/settings.js';

/** 唯一的系统配置记录标识。 */
export const SYS_CONF_ID = 0;

const { api } = routerHandler({
  url: '/sys/setting/set',
  method: 'POST',
  permission: adminPermissionKey('actions.setting.set'),
  handler: async ({ body: { data }, now }) => {
    await db
      .insert(schemas.sys_conf)
      .values({
        id: SYS_CONF_ID,
        data,
        last_update_timestamp: now,
      })
      .onConflictDoUpdate({
        target: schemas.sys_conf.id,
        set: {
          data,
          last_update_timestamp: now,
        },
      });

    await settingsCache.del('current');
    return 'ok';
  },
});

export default api;
