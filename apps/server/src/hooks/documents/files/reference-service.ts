import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import { createDomainError } from '../errors.js';
import { getFileRowForConsumer } from './file-service.js';

import type { BindFileInput } from '../upload/index.js';

/** 幂等创建业务文件引用。 */
export async function bindFile(input: BindFileInput, userId: string) {
  const file = await getFileRowForConsumer(input.fileId);
  if (file.status !== 'verified') {
    throw createDomainError(
      'UPLOAD_FILE_REJECTED',
      '未验证文件不能建立正式引用',
      'conflict',
    );
  }

  const now = new Date();
  await db
    .insert(schema.file_references)
    .values({
      reference_id: randomUUID(),
      file_id: input.fileId,
      namespace: input.namespace,
      owner_id: input.ownerId,
      role: input.role,
      create_user_id: userId,
      create_timestamp: now,
      last_update_user_id: userId,
      last_update_timestamp: now,
    })
    .onConflictDoNothing({
      target: [
        schema.file_references.namespace,
        schema.file_references.owner_id,
        schema.file_references.role,
        schema.file_references.file_id,
      ],
    });
}

/** 幂等释放业务文件引用。 */
export async function releaseFile(input: BindFileInput) {
  await getFileRowForConsumer(input.fileId);
  await db
    .delete(schema.file_references)
    .where(
      and(
        eq(schema.file_references.file_id, input.fileId),
        eq(schema.file_references.namespace, input.namespace),
        eq(schema.file_references.owner_id, input.ownerId),
        eq(schema.file_references.role, input.role),
      ),
    );
}

/** 查询文件当前全部业务引用，供删除和一致性巡检使用。 */
export async function listFileReferences(fileId: string) {
  await getFileRowForConsumer(fileId);
  return await db
    .select()
    .from(schema.file_references)
    .where(eq(schema.file_references.file_id, fileId));
}
