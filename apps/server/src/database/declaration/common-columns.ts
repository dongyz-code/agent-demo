import { customType, timestamp, varchar } from 'drizzle-orm/pg-core';

export const varchar255 = (name: string) => varchar(name, { length: 255 });

export const timestamptz = (name: string) =>
  timestamp(name, { precision: 6, withTimezone: true });

export const bytea = customType<{
  data: Buffer;
  driverData: Buffer;
}>({
  dataType() {
    return 'bytea';
  },
});

export const baseCols = () => ({
  /** 创建用户ID */
  create_user_id: varchar255('create_user_id').notNull(),
  /** 创建时间 */
  create_timestamp: timestamptz('create_timestamp').notNull(),
  /** 最近更新用户ID */
  last_update_user_id: varchar255('last_update_user_id').notNull(),
  /** 最近更新时间 */
  last_update_timestamp: timestamptz('last_update_timestamp').notNull(),
});
