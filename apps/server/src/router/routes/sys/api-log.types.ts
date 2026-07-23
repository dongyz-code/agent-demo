import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';
import { isNotNull } from 'drizzle-orm';

function hasClientMark(row: { client_mark: string | null }): row is {
  client_mark: string;
} {
  return row.client_mark !== null;
}

const { api } = routerHandler({
  url: '/sys/api-log/types',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.app-log'),
  handler: async () => {
    const list = await db
      .selectDistinct({ client_mark: schemas.api_logs.client_mark })
      .from(schemas.api_logs)
      .where(isNotNull(schemas.api_logs.client_mark));
    return list.filter(hasClientMark).map(({ client_mark }) => ({
      label: client_mark,
      value: client_mark,
    }));
  },
});

export default api;
