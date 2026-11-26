import {
  boolean,
  index,
  integer,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { baseCols, varchar255 } from '../declaration/common-columns.js';
import { pgTable } from '../declaration/declaration.js';

/** 字典类型；编码创建后固定，供业务代码稳定引用。 */
export const dictionary = pgTable(
  'dictionary',
  {
    id: varchar255('id').primaryKey(),
    code: varchar255('code').notNull(),
    name: varchar255('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    remark: text('remark').notNull().default(''),
    ...baseCols(),
  },
  (table) => [uniqueIndex('dictionary_code_unique').on(table.code)],
);

/** 字典项只保存字符串值，顺序由 sort 和创建时间共同确定。 */
export const dictionary_item = pgTable(
  'dictionary_item',
  {
    id: varchar255('id').primaryKey(),
    dictionary_id: varchar255('dictionary_id').notNull(),
    label: varchar255('label').notNull(),
    value: varchar255('value').notNull(),
    sort: integer('sort').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    remark: text('remark').notNull().default(''),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('dictionary_item_value_unique').on(
      table.dictionary_id,
      table.value,
    ),
    index('dictionary_item_order_idx').on(table.dictionary_id, table.sort),
  ],
);
