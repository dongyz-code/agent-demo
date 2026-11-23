import { index, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';

import {
  baseCols,
  timestamptz,
  varchar255,
} from '../declaration/common-columns.js';
import { pgTable } from '../declaration/declaration.js';
import { timestampsTrigger } from '../declaration/presets.js';

/** 用户组只表示一组人，不表示资料库身份。 */
export const user_group = pgTable(
  'user_group',
  {
    /** 用户组标识。 */
    user_group_id: varchar255('user_group_id').primaryKey(),
    /** 全局唯一的组名。 */
    name: varchar255('name').notNull(),
    /** 组说明。 */
    description: text('description'),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('user_group_name_unique').on(table.name),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

/** 用户组成员。成员身份与资料库授权分开保存。 */
export const user_group_member = pgTable(
  'user_group_member',
  {
    /** 所属用户组。 */
    user_group_id: varchar255('user_group_id').notNull(),
    /** 组成员用户。 */
    user_id: varchar255('user_id').notNull(),
    /** 添加该成员的用户。 */
    create_user_id: varchar255('create_user_id').notNull(),
    /** 成员加入时间。 */
    create_timestamp: timestamptz('create_timestamp').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.user_group_id, table.user_id] }),
    index('user_group_member_user_idx').on(table.user_id),
  ],
);
