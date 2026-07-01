import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { randomUUID } from 'node:crypto';
import { ROOT_ERROR } from '@/configs/error.js';
import { stringifyRolePermissionPayload } from '@/router/permission.js';
import { adminPermissionKey } from '@repo/shared/permission';

import type { SqlInsertData } from '@/database/index.js';

type Item = SqlInsertData['role'];

const { api } = routerHandler({
  url: '/sys/role/create',
  method: 'POST',
  permission: adminPermissionKey('actions.role.create'),
  handler: async ({ body: { list }, operator, now }) => {
    if (!list.length) {
      return 'ok';
    }

    const listNext = list.map(({ name, desc, permission }) => {
      name = name.trim();
      if (desc) {
        desc = desc.trim();
      }

      if (!name) {
        throw new ROOT_ERROR('非法参数');
      }

      const item: Item = {
        role_id: randomUUID(),
        name,
        desc,
        permission: stringifyRolePermissionPayload(permission),
        available: true,
        create_timestamp: now,
        create_user_id: operator,
        last_update_user_id: operator,
        last_update_timestamp: now,
      };
      return item;
    });

    await db.insert(schema.role).values(listNext);

    return 'ok';
  },
});

export default api;
