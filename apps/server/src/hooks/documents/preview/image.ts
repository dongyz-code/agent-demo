import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';

import { db, schema } from '@/database/index.js';
import { openStoredObject, putStoredObject } from '../storage/commands.js';
import { presignGetObject } from '../storage/presign.js';

import type { PreviewProvider } from './types.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const GENERATOR = 'sharp-thumbnail';
const GENERATOR_VERSION = '1';

/** 图片缩略图派生预览提供器。 */
export const imagePreviewProvider: PreviewProvider = {
  name: GENERATOR,
  version: GENERATOR_VERSION,
  supports(contentType) {
    return IMAGE_TYPES.includes(contentType);
  },
  async getPreview(file, userId) {
    const existing = await findReadyVariant(file.fileId, file.sha256);
    const variant = existing ?? (await createThumbnail(file, userId));
    const signed = await presignGetObject({
      bucket: variant.bucket!,
      objectKey: variant.object_key!,
      contentType: variant.content_type!,
      filename: `${file.filename}.webp`,
      disposition: 'inline',
    });
    return {
      mode: 'generated',
      status: 'ready',
      contentType: variant.content_type,
      url: signed.url,
      text: null,
      expiresAt: signed.expiresAt,
      variantType: 'thumbnail',
      reason: null,
    };
  },
};

/** 查询可复用的图片缩略图。 */
async function findReadyVariant(fileId: string, sourceHash: string) {
  const [variant] = await db
    .select()
    .from(schema.file_variants)
    .where(
      and(
        eq(schema.file_variants.source_file_id, fileId),
        eq(schema.file_variants.variant_type, 'thumbnail'),
        eq(schema.file_variants.generator, GENERATOR),
        eq(schema.file_variants.generator_version, GENERATOR_VERSION),
        eq(schema.file_variants.source_hash, sourceHash),
        eq(schema.file_variants.status, 'ready'),
      ),
    )
    .limit(1);
  return variant;
}

/** 生成最大宽高 1600 的 WebP 缩略图。 */
async function createThumbnail(
  file: Parameters<PreviewProvider['getPreview']>[0],
  operator: string,
) {
  const now = new Date();
  const requestedVariantId = randomUUID();
  const objectKey = `derived/${file.fileId}/thumbnail/${GENERATOR_VERSION}/${file.sha256}.webp`;
  const [claimed] = await db
    .insert(schema.file_variants)
    .values({
      variant_id: requestedVariantId,
      source_file_id: file.fileId,
      variant_type: 'thumbnail',
      generator: GENERATOR,
      generator_version: GENERATOR_VERSION,
      source_hash: file.sha256,
      content_type: null,
      size: null,
      bucket: null,
      object_key: null,
      status: 'processing',
      error_message: null,
      create_user_id: operator,
      create_timestamp: now,
      last_update_user_id: operator,
      last_update_timestamp: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.file_variants.source_file_id,
        schema.file_variants.variant_type,
        schema.file_variants.generator,
        schema.file_variants.generator_version,
        schema.file_variants.source_hash,
      ],
      set: {
        status: 'processing',
        error_message: null,
        last_update_user_id: operator,
        last_update_timestamp: now,
      },
    })
    .returning({ variantId: schema.file_variants.variant_id });
  const variantId = claimed?.variantId ?? requestedVariantId;
  try {
    const source = await streamToBuffer(
      await openStoredObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
      }),
    );
    const content = await sharp(source)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    await putStoredObject({
      bucket: file.bucket,
      objectKey,
      contentType: 'image/webp',
      content,
    });
    const [updated] = await db
      .update(schema.file_variants)
      .set({
        content_type: 'image/webp',
        size: content.byteLength,
        bucket: file.bucket,
        object_key: objectKey,
        status: 'ready',
        last_update_user_id: operator,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.file_variants.variant_id, variantId))
      .returning();
    if (!updated) {
      throw new Error('缩略图状态写入失败');
    }
    return updated;
  } catch (error) {
    await db
      .update(schema.file_variants)
      .set({
        status: 'failed',
        error_message:
          error instanceof Error ? error.message : '缩略图生成失败',
        last_update_user_id: operator,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.file_variants.variant_id, variantId));
    throw error;
  }
}

/** 将受策略大小约束的图片流读取为 Buffer。 */
async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
