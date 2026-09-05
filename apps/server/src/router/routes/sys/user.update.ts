import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { pickObj } from '@repo/utils-node';
import { inArray } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';
import { ROOT_ERROR } from '@/configs/error.js';
import { hashPassword } from '@/utils/password.js';

type UserRow = typeof schemas.user.$inferSelect;
type UserRoleInsert = typeof schemas.user_role.$inferInsert;

const { api } = routerHandler({
  url: '/sys/user/update',
  method: 'POST',
  permission: adminPermissionKey('actions.user.update'),
  handler: async ({ body: { id, form }, operator, now }) => {
    const userIds = Array.isArray(id) ? id : [id];
    if (!userIds.length) {
      return 'ok';
    }

    const updateForm: Partial<UserRow> = pickObj(form, [
      'nickname',
      'email',
      'available',
    ]);

    let password: string | undefined;
    if (typeof form.password === 'string') {
      if (!form.password) {
        throw new ROOT_ERROR('非法参数', '密码不能为空');
      }
      password = form.password;
    }
    const passwordHash = password ? await hashPassword(password) : undefined;

    const promiseList: Promise<unknown>[] = [];

    const withRole = 'role_id' in form;

    if (withRole) {
      const list: UserRoleInsert[] = [];
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
            .delete(schemas.user_role)
            .where(inArray(schemas.user_role.user_id, userIds));
          if (list.length) {
            await tx.insert(schemas.user_role).values(list);
          }
        }),
      );
    }

    if (passwordHash) {
      promiseList.push(
        db
          .update(schemas.user)
          .set({
            ...updateForm,
            password: passwordHash,
            last_update_user_id: operator,
            last_update_timestamp: now,
          })
          .where(inArray(schemas.user.user_id, userIds)),
      );
    } else if (Object.keys(updateForm).length || withRole) {
      promiseList.push(
        db
          .update(schemas.user)
          .set({
            ...updateForm,
            last_update_user_id: operator,
            last_update_timestamp: now,
          })
          .where(inArray(schemas.user.user_id, userIds)),
      );
    }

    await Promise.all(promiseList);

    return 'ok';
  },
});

export default api;
