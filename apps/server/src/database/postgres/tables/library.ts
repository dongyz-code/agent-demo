import { index, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { baseCols, varchar255 } from '../declaration/common-columns.js';
import { pgTable } from '../declaration/declaration.js';
import { timestampsTrigger } from '../declaration/presets.js';

import type {
  LibraryGrantRole,
  LibraryGrantSubjectType,
  LibraryStatus,
  LibraryVisibility,
} from '@repo/types';

/** 资料库是文档的唯一分享边界。 */
export const libraries = pgTable(
  'libraries',
  {
    /** 资料库标识。 */
    library_id: varchar255('library_id').primaryKey(),
    /** 资料库名称。 */
    name: varchar255('name').notNull(),
    /** 资料库说明。 */
    description: text('description'),
    /** 仅授权，或全体登录用户可使用。 */
    visibility: varchar255('visibility').$type<LibraryVisibility>().notNull(),
    /** 正常或已归档。归档后停止检索，文档和授权保留。 */
    status: varchar255('status').$type<LibraryStatus>().notNull(),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('libraries_name_unique').on(table.name),
    index('libraries_status_idx').on(table.status),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

/** 资料库授权。一个主体在一个库里只有一行。 */
export const library_grants = pgTable(
  'library_grants',
  {
    /** 授权标识。 */
    library_grant_id: varchar255('library_grant_id').primaryKey(),
    /** 所属资料库。 */
    library_id: varchar255('library_id').notNull(),
    /** 授权对象类型：用户或用户组。 */
    subject_type: varchar255('subject_type')
      .$type<LibraryGrantSubjectType>()
      .notNull(),
    /** 用户或用户组标识。 */
    subject_id: varchar255('subject_id').notNull(),
    /** 使用者或管理员。 */
    role: varchar255('role').$type<LibraryGrantRole>().notNull(),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('library_grants_subject_unique').on(
      table.library_id,
      table.subject_type,
      table.subject_id,
    ),
    index('library_grants_subject_idx').on(
      table.subject_type,
      table.subject_id,
    ),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);
