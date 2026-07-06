import { boolean, index, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { baseCols, timestamptz, varchar255 } from './common-columns.js';
import { pgTable, timestampsTrigger } from '../structure/index.js';

export const user = pgTable(
  'user',
  {
    /** 用户ID */
    user_id: uuid('user_id').primaryKey(),
    /** 用户名 */
    username: varchar255('username').notNull(),
    /** 密码 */
    password: varchar255('password'),
    /** 用户昵称 */
    nickname: varchar255('nickname').notNull(),
    /** 用户邮箱 */
    email: varchar255('email'),
    /** 是否启用 */
    available: boolean('available').notNull(),
    /** 最后登录时间 */
    last_login_timestamp: timestamptz('last_login_timestamp'),
    /** 额外信息 */
    extra: text('extra'),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('user_username_unique').on(table.username),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

export const role = pgTable(
  'role',
  {
    /** 角色ID */
    role_id: uuid('role_id').primaryKey(),
    /** 角色名称 */
    name: varchar255('name').notNull(),
    /** 角色描述 */
    desc: text('desc'),
    /** 是否可用 */
    available: boolean('available').notNull(),
    /** 权限 */
    permission: text('permission'),
    ...baseCols(),
  },
  () => [
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

export const user_role = pgTable(
  'user_role',
  {
    /** 角色ID */
    role_id: uuid('role_id').notNull(),
    /** 用户ID */
    user_id: uuid('user_id').notNull(),
    /** 最近更新用户ID */
    last_update_user_id: varchar255('last_update_user_id').notNull(),
    /** 最近更新时间 */
    last_update_timestamp: timestamptz('last_update_timestamp').notNull(),
  },
  (table) => [
    index('user_role_role_id_idx').on(table.role_id),
    /** 覆盖 user_id 查询并在 DB 层防止同一用户重复授权同一角色 */
    uniqueIndex('user_role_user_id_role_id_unique').on(
      table.user_id,
      table.role_id,
    ),
    ...timestampsTrigger({
      createColumn: 'last_update_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);
