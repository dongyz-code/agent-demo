import { eq } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import {
  abortMultipartUpload,
  listMultipartParts,
} from '../storage/objects.js';
import { presignUploadPart } from '../storage/presign.js';
import {
  assertTransferableUploadSession,
  getOwnedUploadSession,
  getUploadSourceFile,
} from './session.js';

import type { Upload } from '@repo/types';

/**
 * 为上传会话的一组 Multipart 分片签发短期地址。
 *
 * @param input 上传会话与需要签名的分片编号。
 * @param userId 当前操作用户，用于校验会话所有权。
 * @returns 分片编号、短期上传地址和过期时间。
 */
export async function signDocumentUploadParts(
  input: Upload['sign-parts']['body'],
  userId: string,
): Promise<Upload['sign-parts']['resp']> {
  const session = await getOwnedUploadSession(input.sessionId, userId);
  assertTransferableUploadSession(session);
  if (session.mode !== 'multipart' || !session.upload_id || !session.part_count) {
    throw new ROOT_ERROR('非法参数');
  }
  const uniqueParts = [...new Set(input.partNumbers)];
  if (
    !uniqueParts.length ||
    uniqueParts.length > ROOT.upload.maxSignedParts ||
    uniqueParts.some(
      (partNumber) =>
        !Number.isInteger(partNumber) ||
        partNumber < 1 ||
        partNumber > session.part_count!,
    )
  ) {
    throw new ROOT_ERROR('非法参数');
  }
  const file = await getUploadSourceFile(session.file_id);
  const parts = await Promise.all(
    uniqueParts.map(async (partNumber) => {
      const signed = await presignUploadPart({
        bucket: file.bucket,
        objectKey: file.object_key,
        uploadId: session.upload_id!,
        partNumber,
      });
      return {
        partNumber,
        uploadUrl: signed.url,
        expiresAt: signed.expiresAt,
      };
    }),
  );
  return { parts };
}

/**
 * 从对象存储同步 Multipart 已完成分片与会话进度。
 *
 * @param sessionId 上传会话标识。
 * @param userId 当前操作用户，用于会话所有权和审计。
 * @returns 已完成分片、上传字节数和缺失分片编号。
 */
export async function syncDocumentUploadParts(
  sessionId: string,
  userId: string,
): Promise<Upload['list-parts']['resp']> {
  const session = await getOwnedUploadSession(sessionId, userId);
  assertTransferableUploadSession(session);
  if (session.mode !== 'multipart' || !session.upload_id || !session.part_count) {
    return { parts: [], uploadedSize: 0, missingPartNumbers: [] };
  }
  const file = await getUploadSourceFile(session.file_id);
  const parts = await listMultipartParts({
    bucket: file.bucket,
    objectKey: file.object_key,
    uploadId: session.upload_id,
  });
  const now = new Date();
  await db
    .update(schemas.file_upload_sessions)
    .set({
      status: session.status === 'initialized' ? 'uploading' : session.status,
      uploaded_size: parts.reduce((sum, part) => sum + part.size, 0),
      last_update_user_id: userId,
      last_update_timestamp: now,
    })
    .where(eq(schemas.file_upload_sessions.session_id, session.session_id));
  const uploaded = new Set(parts.map((part) => part.partNumber));
  return {
    parts,
    uploadedSize: parts.reduce((sum, part) => sum + part.size, 0),
    missingPartNumbers: Array.from(
      { length: session.part_count },
      (_, index) => index + 1,
    ).filter((partNumber) => !uploaded.has(partNumber)),
  };
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
  if (['completed'].includes(session.status)) {
    throw new ROOT_ERROR('数据异常');
  }
  const file = await getUploadSourceFile(session.file_id);
  if (session.mode === 'multipart' && session.upload_id) {
    await abortMultipartUpload({
      bucket: file.bucket,
      objectKey: file.object_key,
      uploadId: session.upload_id,
    });
  }
  await db
    .update(schemas.file_upload_sessions)
    .set({
      status: 'canceled',
      last_update_user_id: userId,
      last_update_timestamp: new Date(),
    })
    .where(eq(schemas.file_upload_sessions.session_id, sessionId));
  return 'ok';
}
