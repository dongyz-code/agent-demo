import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { SYS_CONF_ID } from './setting.set.js';
import { eq } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/setting/get',
  method: 'POST',
  handler: async ({}) => {
    const [item] = await db
      .select({ data: schema.sys_conf.data })
      .from(schema.sys_conf)
      .where(eq(schema.sys_conf.id, SYS_CONF_ID))
      .limit(1);
    return {
      data: item?.data ?? null,
    };
  },
});

export default api;
