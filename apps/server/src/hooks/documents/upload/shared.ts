import { and, eq } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import { createDomainError } from '../errors.js';

import type { UploadSessionInfo } from '@repo/types';
import type { UploadActor } from './types.js';

/** 查询调用者拥有的上传会话，不存在则抛 not-found。 */
export async function getOwnedSession(
  sessionId: string,
  actor: UploadActor,
) {
  const [session] = await db
    .select()
    .from(schema.file_upload_sessions)
    .where(
      and(
        eq(schema.file_upload_sessions.session_id, sessionId),
        eq(schema.file_upload_sessions.tenant_id, actor.tenantId),
        eq(schema.file_upload_sessions.create_user_id, actor.userId),
      ),
    )
    .limit(1);
  if (!session) {
    throw createDomainError(
      'UPLOAD_SESSION_NOT_FOUND',
      '上传会话不存在',
      'not-found',
    );
  }
  return session;
}

/** 查询上传模块内部文件行，不存在则抛 not-found。 */
export async function getInternalFile(fileId: string) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.file_id, fileId))
    .limit(1);
  if (!file) {
    throw createDomainError(
      'UPLOAD_SESSION_NOT_FOUND',
      '文件记录不存在',
      'not-found',
    );
  }
  return file;
}

/** 将数据库会话行转换为公共响应。 */
export function toUploadSessionInfo(
  session: typeof schema.file_upload_sessions.$inferSelect,
): UploadSessionInfo {
  return {
    sessionId: session.session_id,
    fileId: session.file_id,
    policyKey: session.policy_key,
    enterRag: session.enter_rag,
    datasetId: session.dataset_id,
    processingConfigVersion: session.processing_config_version,
    mode: session.mode,
    status: session.status,
    filename: session.filename,
    size: session.size,
    partSize: session.part_size,
    partCount: session.part_count,
    uploadedSize: session.uploaded_size,
    expiresAt: session.expire_timestamp,
    errorCode: session.error_code,
    errorMessage: session.error_message,
  };
}
