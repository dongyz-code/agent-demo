import {
  bigint,
  index,
  integer,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { baseCols, timestamptz, varchar255 } from '../declaration/common-columns.js';
import { pgTable } from '../declaration/declaration.js';
import { timestampsTrigger } from '../declaration/presets.js';

import type {
  StoredFileStatus,
  UploadMode,
  UploadSessionStatus,
} from '@repo/types';

export const files = pgTable(
  'files',
  {
    /** 通用文件稳定标识。 */
    file_id: uuid('file_id').primaryKey(),
    /** 用户上传时的显示名称。 */
    filename: text('filename').notNull(),
    /** 经服务端规范化后的扩展名，不包含点。 */
    extension: varchar255('extension').notNull(),
    /** 浏览器初始化时声明的 MIME，仅供审计。 */
    declared_content_type: varchar255('declared_content_type').notNull(),
    /** 服务端文件签名验证后的可信 MIME。 */
    content_type: varchar255('content_type'),
    /** 文件字节数。 */
    size: bigint('size', { mode: 'number' }).notNull(),
    /** 私有对象所在 Bucket，仅服务端使用。 */
    bucket: varchar255('bucket').notNull(),
    /** 服务端生成的对象路径，不向普通客户端暴露。 */
    object_key: text('object_key').notNull(),
    /** 文件可信状态。 */
    status: varchar255('status').$type<StoredFileStatus>().notNull(),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('files_bucket_object_key_unique').on(
      table.bucket,
      table.object_key,
    ),
    index('files_status_idx').on(table.status),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

export const file_upload_sessions = pgTable(
  'file_upload_sessions',
  {
    /** 上传会话标识。 */
    session_id: uuid('session_id').primaryKey(),
    /** 初始化时创建的通用文件标识。 */
    file_id: uuid('file_id').notNull(),
    /** 新增版本时的目标文档；新建文档时为空。 */
    document_id: uuid('document_id'),
    /** 客户端请求幂等键。 */
    idempotency_key: varchar255('idempotency_key').notNull(),
    /** 单对象或 Multipart 模式。 */
    mode: varchar255('mode').$type<UploadMode>().notNull(),
    /** Multipart uploadId，普通上传为空。 */
    upload_id: text('upload_id'),
    /** Multipart 分片字节数。 */
    part_size: bigint('part_size', { mode: 'number' }),
    /** Multipart 分片数量。 */
    part_count: integer('part_count'),
    /** 上传会话状态。 */
    status: varchar255('status').$type<UploadSessionStatus>().notNull(),
    /** 会话失效时间。 */
    expire_timestamp: timestamptz('expire_timestamp').notNull(),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('file_upload_sessions_idempotency_unique').on(
      table.create_user_id,
      table.idempotency_key,
    ),
    uniqueIndex('file_upload_sessions_file_id_unique').on(table.file_id),
    index('file_upload_sessions_status_expire_idx').on(
      table.status,
      table.expire_timestamp,
    ),
    index('file_upload_sessions_user_idx').on(table.create_user_id),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);
