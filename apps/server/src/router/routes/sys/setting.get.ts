import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';
import { SYS_CONF_ID } from './setting.set.js';
import { eq } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/setting/get',
  method: 'POST',
  permission: adminPermissionKey('actions.setting.set'),
  handler: async ({}) => {
    const [item] = await db
      .select({ data: schemas.sys_conf.data })
      .from(schemas.sys_conf)
      .where(eq(schemas.sys_conf.id, SYS_CONF_ID))
      .limit(1);
    return {
      data: item?.data ?? null,
    };
  },
});

export default api;
