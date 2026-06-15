import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { pickObj } from '@repo/utils-node';
import { inArray } from 'drizzle-orm';

import type { SqlData, SqlInsertData } from '@/database/index.js';

const { api } = routerHandler({
  url: '/sys/user/update',
  method: 'POST',
  handler: async ({ body: { id, form }, operator, now }) => {
    const userIds = Array.isArray(id) ? id : [id];
    if (!userIds.length) {
      return 'ok';
    }

    const updateForm: Partial<SqlData['user']> = pickObj(form, [
      'nickname',
      'email',
      'password',
      'available',
    ]);

    const promiseList: Promise<unknown>[] = [];

    const withRole = 'role_id' in form;

    if (withRole) {
      const list: SqlInsertData['user_role'][] = [];
      form.role_id?.forEach((role_id) => {
        userIds.forEach((user_id) => {
          list.push({
            user_id,
            role_id,
            last_update_user_id: operator,
            last_update_timestamp: now,
          });
        });
      });
      promiseList.push(
        db.transaction(async (tx) => {
          await tx
            .delete(schema.user_role)
            .where(inArray(schema.user_role.user_id, userIds));
          if (list.length) {
            await tx.insert(schema.user_role).values(list);
          }
        }),
      );
    }

    if (Object.keys(updateForm).length || withRole) {
      promiseList.push(
        db
          .update(schema.user)
          .set({
            ...updateForm,
            last_update_user_id: operator,
            last_update_timestamp: now,
          })
          .where(inArray(schema.user.user_id, userIds)),
      );
    }

    await Promise.all(promiseList);

    return 'ok';
  },
});

export default api;
