import { and, eq } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import { createDomainError } from '../errors.js';
import { getUploadPolicy } from './policies.js';
import { headStoredObject, openStoredObject } from '../storage/index.js';
import { calculateSha256Stream } from './validators/checksum.js';
import { detectTrustedContentType } from './validators/registry.js';

import type { UploadActor } from './types.js';

/** 文件签名检测读取的最大前缀，足以覆盖常见格式识别。 */
const MAGIC_PREFIX_BYTES = 8192;

/**
 * 验证上传完成后的对象并写入可信文件信息。
 *
 * @param fileId 通用文件标识。
 * @param actor 当前调用者，用于防止跨租户验证。
 * @returns 验证完成后的文件数据库行。
 */
export async function validateStoredFile(fileId: string, actor: UploadActor) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(
      and(
        eq(schema.files.file_id, fileId),
        eq(schema.files.tenant_id, actor.tenantId),
      ),
    )
    .limit(1);
  if (!file) {
    throw createDomainError(
      'UPLOAD_SESSION_NOT_FOUND',
      '文件记录不存在',
      'not-found',
    );
  }

  const [session] = await db
    .select()
    .from(schema.file_upload_sessions)
    .where(eq(schema.file_upload_sessions.file_id, fileId))
    .limit(1);
  if (!session) {
    throw createDomainError(
      'UPLOAD_SESSION_NOT_FOUND',
      '上传会话不存在',
      'not-found',
    );
  }

  const now = new Date();
  await db
    .update(schema.files)
    .set({
      status: 'verifying',
      last_update_user_id: actor.userId,
      last_update_timestamp: now,
    })
    .where(eq(schema.files.file_id, fileId));

  try {
    const head = await headStoredObject({
      bucket: file.bucket,
      objectKey: file.object_key,
    });
    if (head.ContentLength !== file.size) {
      throw createDomainError(
        'UPLOAD_OBJECT_MISMATCH',
        '对象大小与初始化声明不一致',
      );
    }

    const prefix = await readObjectPrefix({
      bucket: file.bucket,
      objectKey: file.object_key,
      limit: MAGIC_PREFIX_BYTES,
    });
    const trustedContentType = await detectTrustedContentType({
      prefix,
      declaredContentType: file.declared_content_type,
    });
    const policy = getUploadPolicy(session.policy_key);
    if (
      !trustedContentType ||
      !policy.allowedContentTypes.includes(trustedContentType)
    ) {
      throw createDomainError(
        'UPLOAD_FILE_TYPE_NOT_ALLOWED',
        '实际文件类型不在上传策略允许范围内',
      );
    }

    const sha256 = await calculateObjectSha256({
      bucket: file.bucket,
      objectKey: file.object_key,
    });
    const [updated] = await db
      .update(schema.files)
      .set({
        content_type: trustedContentType,
        sha256,
        etag: head.ETag ?? file.etag,
        status: 'verified',
        verified_timestamp: now,
        last_update_user_id: actor.userId,
        last_update_timestamp: now,
      })
      .where(eq(schema.files.file_id, fileId))
      .returning();
    if (!updated) {
      throw new Error('文件验证结果写入失败');
    }
    return updated;
  } catch (error) {
    await db
      .update(schema.files)
      .set({
        status: 'rejected',
        last_update_user_id: actor.userId,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.files.file_id, fileId));
    throw error;
  }
}

/** 读取对象前缀，达到上限后主动结束当前流。 */
async function readObjectPrefix({
  bucket,
  objectKey,
  limit,
}: {
  /** 对象 Bucket。 */
  bucket: string;
  /** 对象路径。 */
  objectKey: string;
  /** 最大读取字节数。 */
  limit: number;
}) {
  const stream = await openStoredObject({ bucket, objectKey });
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = limit - total;
    chunks.push(buffer.subarray(0, remaining));
    total += Math.min(buffer.length, remaining);
    if (total >= limit) {
      stream.destroy();
      break;
    }
  }
  return Buffer.concat(chunks);
}

/** 流式计算对象 SHA-256，避免大文件整体进入内存。 */
async function calculateObjectSha256(body: {
  /** 对象 Bucket。 */
  bucket: string;
  /** 对象路径。 */
  objectKey: string;
}) {
  return await calculateSha256Stream(await openStoredObject(body));
}
