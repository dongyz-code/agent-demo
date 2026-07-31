import { eq, inArray } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import {
  abortMultipartUpload,
  listMultipartParts,
  presignUploadPart,
} from './objects.js';
import {
  assertTransferableUploadSession,
  getOwnedUploadSession,
} from './session.js';
import { getStoredFile } from './source.js';

import type { Upload } from '@repo/types';

/**
 * 为上传会话的指定 Multipart 分片签发短期地址。
 *
 * @param input 上传会话与需要签名的分片编号。
 * @param userId 当前操作用户，用于校验会话所有权。
 * @returns 短期上传地址。
 */
export async function signDocumentUploadParts(
  input: Upload['sign-parts']['body'],
  userId: string,
): Promise<Upload['sign-parts']['resp']> {
  const session = await getOwnedUploadSession(input.sessionId, userId);
  assertTransferableUploadSession(session);
  if (
    session.mode !== 'multipart' ||
    !session.upload_id ||
    !session.part_count
  ) {
    throw new ROOT_ERROR('非法参数');
  }
  if (
    !Number.isInteger(input.partNumber) ||
    input.partNumber < 1 ||
    input.partNumber > session.part_count
  ) {
    throw new ROOT_ERROR('非法参数');
  }
  const file = await getStoredFile(session.file_id);
  const signed = await presignUploadPart({
    bucket: file.bucket,
    objectKey: file.object_key,
    uploadId: session.upload_id,
    partNumber: input.partNumber,
  });
  return { uploadUrl: signed.url };
}

/**
 * 从对象存储同步 Multipart 已完成分片与会话进度。
 *
 * @param sessionId 上传会话标识。
 * @param userId 当前操作用户，用于会话所有权和审计。
 * @returns 对象存储已接收的分片。
 */
export async function syncDocumentUploadParts(
  sessionId: string,
  userId: string,
): Promise<Upload['list-parts']['resp']> {
  const session = await getOwnedUploadSession(sessionId, userId);
  assertTransferableUploadSession(session);
  if (
    session.mode !== 'multipart' ||
    !session.upload_id ||
    !session.part_count
  ) {
    return { parts: [] };
  }
  const file = await getStoredFile(session.file_id);
  const parts = await listMultipartParts({
    bucket: file.bucket,
    objectKey: file.object_key,
    uploadId: session.upload_id,
  });
  const now = new Date();
  await db
    .update(schemas.file_upload_sessions)
    .set({
      status: 'uploading',
      last_update_user_id: userId,
      last_update_timestamp: now,
    })
    .where(eq(schemas.file_upload_sessions.session_id, session.session_id));
  return { parts };
}

/**
 * 取消未完成的上传会话并终止对应 Multipart 对象。
 *
 * @param sessionId 上传会话标识。
 * @param userId 当前操作用户，用于会话所有权和审计。
 * @returns 取消完成或会话已处于取消终态时返回固定成功值。
 */
export async function abortDocumentUpload(
  sessionId: string,
  userId: string,
): Promise<'ok'> {
  const session = await getOwnedUploadSession(sessionId, userId);
  if (['canceled', 'expired'].includes(session.status)) return 'ok';
  if (session.status === 'completed') {
    throw new ROOT_ERROR('数据异常');
  }
  const where = buildWhere((filter) => {
    filter.push(
      eq(schemas.file_upload_sessions.session_id, sessionId),
      inArray(schemas.file_upload_sessions.status, [
        'initialized',
        'uploading',
        'failed',
      ]),
    );
  });
  const [claimed] = await db
    .update(schemas.file_upload_sessions)
    .set({
      status: 'canceled',
      last_update_user_id: userId,
      last_update_timestamp: new Date(),
    })
    .where(where)
    .returning({ id: schemas.file_upload_sessions.session_id });
  if (!claimed) {
    throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
  }
  const file = await getStoredFile(session.file_id);
  if (session.mode === 'multipart' && session.upload_id) {
    await abortMultipartUpload({
      bucket: file.bucket,
      objectKey: file.object_key,
      uploadId: session.upload_id,
    });
  }
  return 'ok';
}
