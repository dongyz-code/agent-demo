import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

export const SYS_CONF_ID = 0;

const { api } = routerHandler({
  url: '/sys/setting/set',
  method: 'POST',
  permission: adminPermissionKey('actions.setting.set'),
  handler: async ({ body: { data }, now }) => {
    await db
      .insert(schema.sys_conf)
      .values({
        id: SYS_CONF_ID,
        data,
        last_update_timestamp: now,
      })
      .onConflictDoUpdate({
        target: schema.sys_conf.id,
        set: {
          data,
          last_update_timestamp: now,
        },
      });

    return 'ok';
  },
});

export default api;
