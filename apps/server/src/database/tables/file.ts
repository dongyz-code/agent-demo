import {
  bigint,
  boolean,
  index,
  integer,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { baseCols, timestamptz, varchar255 } from './common-columns.js';
import { pgTable, timestampsTrigger } from '../structure/index.js';

import type {
  FileVariantStatus,
  FileVariantType,
  StoredFileStatus,
  UploadErrorCode,
  UploadMode,
  UploadPolicyKey,
  UploadSessionStatus,
} from '@repo/types';

export const files = pgTable(
  'files',
  {
    /** 通用文件稳定标识。 */
    file_id: uuid('file_id').primaryKey(),
    /** 文件所属租户；当前由认证上下文中的 client_id 或 system 派生。 */
    tenant_id: varchar255('tenant_id').notNull(),
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
    /** 服务端流式计算的 SHA-256。 */
    sha256: varchar255('sha256'),
    /** 私有对象所在 Bucket，仅服务端使用。 */
    bucket: varchar255('bucket').notNull(),
    /** 服务端生成的对象路径，不向普通客户端暴露。 */
    object_key: text('object_key').notNull(),
    /** 对象存储返回的最终 ETag，不作为完整文件 MD5。 */
    etag: varchar255('etag'),
    /** 文件可信状态。 */
    status: varchar255('status').$type<StoredFileStatus>().notNull(),
    /** 严格验证完成时间。 */
    verified_timestamp: timestamptz('verified_timestamp'),
    /** 进入逻辑删除的时间。 */
    deleted_timestamp: timestamptz('deleted_timestamp'),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('files_bucket_object_key_unique').on(
      table.bucket,
      table.object_key,
    ),
    index('files_tenant_status_idx').on(table.tenant_id, table.status),
    index('files_sha256_idx').on(table.sha256),
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
    /** 上传会话所属租户。 */
    tenant_id: varchar255('tenant_id').notNull(),
    /** 服务端上传策略键。 */
    policy_key: varchar255('policy_key').$type<UploadPolicyKey>().notNull(),
    /** 文件验证成功后是否自动创建 RAG 接入任务。 */
    enter_rag: boolean('enter_rag').notNull().default(false),
    /** 自动处理使用的目标知识库。 */
    dataset_id: uuid('dataset_id'),
    /** 自动处理使用的配置组合版本。 */
    processing_config_version: varchar255('processing_config_version'),
    /** 客户端文件指纹，用于刷新后匹配。 */
    fingerprint: varchar255('fingerprint').notNull(),
    /** 客户端请求幂等键。 */
    idempotency_key: varchar255('idempotency_key').notNull(),
    /** 单对象或 Multipart 模式。 */
    mode: varchar255('mode').$type<UploadMode>().notNull(),
    /** Multipart uploadId，普通上传为空。 */
    upload_id: text('upload_id'),
    /** 文件显示名称快照。 */
    filename: text('filename').notNull(),
    /** 浏览器声明的 MIME。 */
    declared_content_type: varchar255('declared_content_type').notNull(),
    /** 声明文件字节数。 */
    size: bigint('size', { mode: 'number' }).notNull(),
    /** Multipart 分片字节数。 */
    part_size: bigint('part_size', { mode: 'number' }),
    /** Multipart 分片数量。 */
    part_count: integer('part_count'),
    /** 最近一次 ListParts 同步的已上传字节数。 */
    uploaded_size: bigint('uploaded_size', { mode: 'number' })
      .notNull()
      .default(0),
    /** 上传会话状态。 */
    status: varchar255('status').$type<UploadSessionStatus>().notNull(),
    /** 会话失效时间。 */
    expire_timestamp: timestamptz('expire_timestamp').notNull(),
    /** 上传完成时间。 */
    completed_timestamp: timestamptz('completed_timestamp'),
    /** 稳定业务错误码。 */
    error_code: varchar255('error_code').$type<UploadErrorCode>(),
    /** 面向管理端的错误说明。 */
    error_message: text('error_message'),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('file_upload_sessions_idempotency_unique').on(
      table.tenant_id,
      table.create_user_id,
      table.policy_key,
      table.fingerprint,
      table.idempotency_key,
    ),
    uniqueIndex('file_upload_sessions_file_id_unique').on(table.file_id),
    index('file_upload_sessions_status_expire_idx').on(
      table.status,
      table.expire_timestamp,
    ),
    index('file_upload_sessions_tenant_user_idx').on(
      table.tenant_id,
      table.create_user_id,
    ),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

export const file_upload_parts = pgTable(
  'file_upload_parts',
  {
    /** 分片投影记录标识。 */
    part_id: uuid('part_id').primaryKey(),
    /** 所属上传会话。 */
    session_id: uuid('session_id').notNull(),
    /** 从 1 开始的分片编号。 */
    part_number: integer('part_number').notNull(),
    /** MinIO 返回的 ETag。 */
    etag: varchar255('etag').notNull(),
    /** 分片字节数。 */
    size: bigint('size', { mode: 'number' }).notNull(),
    /** MinIO 确认分片存在的时间。 */
    completed_timestamp: timestamptz('completed_timestamp').notNull(),
  },
  (table) => [
    uniqueIndex('file_upload_parts_session_part_unique').on(
      table.session_id,
      table.part_number,
    ),
    index('file_upload_parts_session_idx').on(table.session_id),
  ],
);

export const file_references = pgTable(
  'file_references',
  {
    /** 文件引用记录标识。 */
    reference_id: uuid('reference_id').primaryKey(),
    /** 被引用的通用文件。 */
    file_id: uuid('file_id').notNull(),
    /** 不透明业务命名空间，例如 document.version。 */
    namespace: varchar255('namespace').notNull(),
    /** 业务资源标识，上传模块不解释其语义。 */
    owner_id: varchar255('owner_id').notNull(),
    /** 文件在业务资源中的角色，例如 source。 */
    role: varchar255('role').notNull(),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('file_references_owner_role_file_unique').on(
      table.namespace,
      table.owner_id,
      table.role,
      table.file_id,
    ),
    index('file_references_file_id_idx').on(table.file_id),
    index('file_references_owner_idx').on(table.namespace, table.owner_id),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

export const file_variants = pgTable(
  'file_variants',
  {
    /** 文件派生物标识。 */
    variant_id: uuid('variant_id').primaryKey(),
    /** 来源通用文件。 */
    source_file_id: uuid('source_file_id').notNull(),
    /** 缩略图、PDF 预览等派生物类型。 */
    variant_type: varchar255('variant_type').$type<FileVariantType>().notNull(),
    /** 生成器稳定名称。 */
    generator: varchar255('generator').notNull(),
    /** 生成器版本，参与缓存键。 */
    generator_version: varchar255('generator_version').notNull(),
    /** 生成时使用的源文件 Hash。 */
    source_hash: varchar255('source_hash').notNull(),
    /** 派生物可信 MIME。 */
    content_type: varchar255('content_type'),
    /** 派生物字节数。 */
    size: bigint('size', { mode: 'number' }),
    /** 派生物所在 Bucket。 */
    bucket: varchar255('bucket'),
    /** 派生物对象路径。 */
    object_key: text('object_key'),
    /** 派生物处理状态。 */
    status: varchar255('status').$type<FileVariantStatus>().notNull(),
    /** 生成失败原因。 */
    error_message: text('error_message'),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('file_variants_cache_unique').on(
      table.source_file_id,
      table.variant_type,
      table.generator,
      table.generator_version,
      table.source_hash,
    ),
    index('file_variants_source_status_idx').on(
      table.source_file_id,
      table.status,
    ),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);
