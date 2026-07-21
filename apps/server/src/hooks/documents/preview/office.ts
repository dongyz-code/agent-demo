import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import axios from 'axios';

import { ROOT } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { putStoredObject } from '../storage/commands.js';
import { presignGetObject } from '../storage/presign.js';

import type { PreviewProvider } from './types.js';

const OFFICE_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const GENERATOR = 'libreoffice-worker';
const GENERATOR_VERSION = '1';

/** Office 文件转 PDF 的可配置 HTTP Worker 提供器。 */
export const officePreviewProvider: PreviewProvider = {
  name: GENERATOR,
  version: GENERATOR_VERSION,
  supports(contentType) {
    return OFFICE_TYPES.includes(contentType);
  },
  async getPreview(file, userId) {
    const config = ROOT.upload;
    if (!config.officePreviewEndpoint) {
      return {
        mode: 'unsupported',
        status: null,
        contentType: null,
        url: null,
        text: null,
        expiresAt: null,
        variantType: null,
        reason: '未配置 Office 预览 Worker，可下载原文件查看',
      };
    }
    const existing = await findReadyVariant(file.fileId, file.sha256);
    const variant =
      existing ??
      (await convertOffice(file, userId, config.officePreviewEndpoint));
    const signed = await presignGetObject({
      bucket: variant.bucket!,
      objectKey: variant.object_key!,
      contentType: 'application/pdf',
      filename: `${file.filename}.pdf`,
      disposition: 'inline',
    });
    return {
      mode: 'generated',
      status: 'ready',
      contentType: 'application/pdf',
      url: signed.url,
      text: null,
      expiresAt: signed.expiresAt,
      variantType: 'preview-pdf',
      reason: null,
    };
  },
};

/** 查询可复用 Office PDF 预览。 */
async function findReadyVariant(fileId: string, sourceHash: string) {
  const [variant] = await db
    .select()
    .from(schema.file_variants)
    .where(
      and(
        eq(schema.file_variants.source_file_id, fileId),
        eq(schema.file_variants.variant_type, 'preview-pdf'),
        eq(schema.file_variants.generator, GENERATOR),
        eq(schema.file_variants.generator_version, GENERATOR_VERSION),
        eq(schema.file_variants.source_hash, sourceHash),
        eq(schema.file_variants.status, 'ready'),
      ),
    )
    .limit(1);
  return variant;
}

/** 调用隔离 Worker 将 Office 原文件转换为 PDF。 */
async function convertOffice(
  file: Parameters<PreviewProvider['getPreview']>[0],
  operator: string,
  endpoint: string,
) {
  const requestedVariantId = randomUUID();
  const now = new Date();
  const objectKey = `derived/${file.fileId}/preview-pdf/${GENERATOR_VERSION}/${file.sha256}.pdf`;
  const [claimed] = await db
    .insert(schema.file_variants)
    .values({
      variant_id: requestedVariantId,
      source_file_id: file.fileId,
      variant_type: 'preview-pdf',
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
    const source = await presignGetObject({
      bucket: file.bucket,
      objectKey: file.objectKey,
      contentType: file.contentType,
      filename: file.filename,
      disposition: 'attachment',
    });
    const response = await axios.post<ArrayBuffer>(
      endpoint,
      { sourceUrl: source.url, filename: file.filename, target: 'pdf' },
      { responseType: 'arraybuffer', timeout: 2 * 60 * 1000 },
    );
    const content = Buffer.from(response.data);
    await putStoredObject({
      bucket: file.bucket,
      objectKey,
      contentType: 'application/pdf',
      content,
    });
    const [updated] = await db
      .update(schema.file_variants)
      .set({
        content_type: 'application/pdf',
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
      throw new Error('Office 预览状态写入失败');
    }
    return updated;
  } catch (error) {
    await db
      .update(schema.file_variants)
      .set({
        status: 'failed',
        error_message:
          error instanceof Error ? error.message : 'Office 预览失败',
        last_update_user_id: operator,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.file_variants.variant_id, variantId));
    throw error;
  }
}
