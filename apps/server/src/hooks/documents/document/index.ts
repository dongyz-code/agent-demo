import { eq, inArray } from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { documentsConfig } from '../config.js';
import { documentFile } from '../file/index.js';
import { textParser } from './parser-text.js';
import { textInParser } from './parser-textin.js';
import { createDocumentSegments } from './segment.js';

import type { DocumentSegment } from '@repo/types';
import type { DocumentParser } from './types.js';

/** 解析器按可信 MIME 匹配，新增实现时只在入口注册一次。 */
const documentParsers: DocumentParser[] = [textParser, textInParser];

/** 需要由文档清理任务删除的私有对象位置。 */
interface DocumentCleanupStoredObject {
  /** 对象所在 Bucket。 */
  bucket: string;
  /** 对象私有路径。 */
  objectKey: string;
}

/** 文档物理清理所需的业务输入。 */
export interface DocumentCleanupInput {
  /** 被逻辑删除的文档标识。 */
  documentId: string;
  /** 确认当前调用仍允许继续执行，取消或失效时抛出错误。 */
  assertActive: () => Promise<void>;
}

/** 文档物理清理完成后的稳定摘要。 */
export interface DocumentCleanupResult {
  /** 已从对象存储删除的去重对象数量。 */
  deletedObjectCount: number;
}

/** 文档内容解析与切分所需的业务输入。 */
export interface DocumentContentProcessInput {
  /** 已验证源文件标识。 */
  fileId: string;
  /** 本次处理的不可变文档版本。 */
  documentVersionId: string;
  /** 上次执行保存的远程解析恢复信息。 */
  checkpoint: unknown;
  /** 保存可序列化的远程解析恢复信息。 */
  saveCheckpoint: (checkpoint: unknown) => Promise<void>;
  /** 确认当前调用仍允许继续执行，取消或失效时抛出错误。 */
  assertActive: () => Promise<void>;
}

/** 文档内容解析与切分后的稳定输出。 */
export interface DocumentContentProcessResult {
  /** 清洗并按当前策略生成的全部 Segment。 */
  segments: DocumentSegment[];
  /** 本次使用的切分策略版本。 */
  segmentProfileVersion: string;
}

/** 文档内容处理与物理清理的统一能力实现。 */
class DocumentProcessor {
  /**
   * 把可信源文件解析、清洗并切分为可索引 Segment。
   *
   * @param input 源文件、文档版本、恢复信息和存活检查。
   * @returns 当前策略生成的 Segment 与切分策略版本。
   */
  async process(
    input: DocumentContentProcessInput,
  ): Promise<DocumentContentProcessResult> {
    await input.assertActive();
    const file = await documentFile.getReadableSource(input.fileId);
    const parser = documentParsers.find((item) =>
      item.contentTypes.includes(file.contentType),
    );
    if (!parser) {
      throw new ROOT_ERROR(
        '文件处理: 不支持的文件类型',
        `: ${file.contentType}`,
      );
    }
    const parsed = await parser.parse({
      file,
      checkpoint: input.checkpoint,
      saveCheckpoint: input.saveCheckpoint,
      assertActive: input.assertActive,
    });
    const cleanedBlocks = parsed.map((block) => {
      let text = block.text;
      if (block.type !== 'code') {
        text = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
      }
      // eslint-disable-next-line no-control-regex
      text = text.normalize('NFKC').replace(/[\u0000\u00ad\u200b\ufeff]/g, '');
      if (block.type === 'code') {
        text = text.replace(/\r\n?/g, '\n').trim();
      } else if (block.type === 'table') {
        text = text
          .replace(/\r\n?/g, '\n')
          .replace(/[ \t]+\|/g, ' |')
          .replace(/\|[ \t]+/g, '| ')
          .trim();
      } else {
        text = text
          .replace(/\r\n?/g, '\n')
          .replace(/[\t ]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
      return { ...block, text };
    });
    const shortLineCounts = new Map<string, number>();
    cleanedBlocks.forEach((block) => {
      if (
        block.type === 'paragraph' &&
        block.text.length > 0 &&
        block.text.length <= 80
      ) {
        shortLineCounts.set(
          block.text,
          (shortLineCounts.get(block.text) ?? 0) + 1,
        );
      }
    });
    const normalized = cleanedBlocks
      .filter((block) => {
        if (!block.text) return false;
        if (block.type !== 'paragraph') return true;
        return (shortLineCounts.get(block.text) ?? 0) < 3;
      })
      .map((block, position) => ({ ...block, position }));
    const config = documentsConfig.document;
    const profile = {
      version: `structure-v1-${config.segmentSizeTokens}-${config.segmentOverlapTokens}`,
      segmentSizeTokens: config.segmentSizeTokens,
      overlapTokens: config.segmentOverlapTokens,
    };
    return {
      segments: createDocumentSegments({
        documentVersionId: input.documentVersionId,
        blocks: normalized,
        profile,
      }),
      segmentProfileVersion: profile.version,
    };
  }

  /**
   * 执行已逻辑删除文档的对象与数据库清理。
   *
   * 对象全部删除后才会进入数据库事务；任一步失败都会保留文档行，使同一任务可以安全重试。
   *
   * @param input 已逻辑删除文档和通用存活检查。
   * @returns 被删除的对象数量。
   */
  async cleanup(input: DocumentCleanupInput): Promise<DocumentCleanupResult> {
    await input.assertActive();
    const objects = await loadDocumentCleanupObjects(input.documentId);
    await deleteDocumentStoredObjects(objects, input);
    await deleteDocumentDatabaseRows(input);
    return { deletedObjectCount: objects.length };
  }
}

/** 文档解析切分与物理清理的统一入口。 */
export const documentProcessor = new DocumentProcessor();

/**
 * 顺序删除去重后的文档对象，并在每次远程动作前后检查取消。
 *
 * @param objects 页面和源文件对象位置。
 * @param input 文档标识和通用存活检查。
 * @returns 所有对象均已删除时结束。
 */
async function deleteDocumentStoredObjects(
  objects: DocumentCleanupStoredObject[],
  input: DocumentCleanupInput,
): Promise<void> {
  const uniqueObjects = new Map(
    objects.map((object) => [
      `${object.bucket}\u0000${object.objectKey}`,
      object,
    ]),
  );
  for (const object of uniqueObjects.values()) {
    await input.assertActive();
    await documentFile.remove({
      bucket: object.bucket,
      objectKey: object.objectKey,
    });
    await input.assertActive();
  }
}

/**
 * 读取已删除文档当前仍有数据库记录的页面和源文件对象。
 *
 * @param documentId 被逻辑删除的文档标识。
 * @returns 页面与源文件的私有对象位置；文档已被物理删除时返回空数组。
 */
async function loadDocumentCleanupObjects(
  documentId: string,
): Promise<DocumentCleanupStoredObject[]> {
  const [document] = await db
    .select({ status: schemas.documents.status })
    .from(schemas.documents)
    .where(eq(schemas.documents.document_id, documentId))
    .limit(1);
  if (!document) return [];
  if (document.status !== 'deleted') {
    throw new ROOT_ERROR('只有已逻辑删除的文档可以清理');
  }
  const versions = await db
    .select({
      id: schemas.document_versions.document_version_id,
      fileId: schemas.document_versions.source_file_id,
    })
    .from(schemas.document_versions)
    .where(eq(schemas.document_versions.document_id, documentId));
  if (!versions.length) return [];
  const versionIds = versions.map((version) => version.id);
  const fileIds = versions.map((version) => version.fileId);
  const [pages, quickPages, files] = await Promise.all([
    db
      .select({
        bucket: schemas.document_preview_pages.bucket,
        objectKey: schemas.document_preview_pages.object_key,
      })
      .from(schemas.document_preview_pages)
      .where(
        inArray(schemas.document_preview_pages.document_version_id, versionIds),
      ),
    db
      .select({
        bucket: schemas.document_preview_quick_pages.bucket,
        objectKey: schemas.document_preview_quick_pages.object_key,
      })
      .from(schemas.document_preview_quick_pages)
      .where(
        inArray(
          schemas.document_preview_quick_pages.document_version_id,
          versionIds,
        ),
      ),
    db
      .select({
        bucket: schemas.files.bucket,
        objectKey: schemas.files.object_key,
      })
      .from(schemas.files)
      .where(inArray(schemas.files.file_id, fileIds)),
  ]);
  return [...pages, ...quickPages, ...files];
}

/**
 * 在一个事务内删除文档领域记录并确认任务仍有效。
 *
 * @param input 已逻辑删除文档和通用存活检查。
 * @returns 数据库记录删除完成后结束，通用任务历史始终保留。
 */
async function deleteDocumentDatabaseRows(
  input: DocumentCleanupInput,
): Promise<void> {
  await input.assertActive();
  await db.transaction(async (tx) => {
    const [document] = await tx
      .select({ status: schemas.documents.status })
      .from(schemas.documents)
      .where(eq(schemas.documents.document_id, input.documentId))
      .limit(1);
    if (document && document.status !== 'deleted') {
      throw new ROOT_ERROR('文档状态已恢复，拒绝物理清理');
    }
    if (document) {
      const versions = await tx
        .select({
          id: schemas.document_versions.document_version_id,
          fileId: schemas.document_versions.source_file_id,
        })
        .from(schemas.document_versions)
        .where(eq(schemas.document_versions.document_id, input.documentId));
      const versionIds = versions.map((version) => version.id);
      const fileIds = versions.map((version) => version.fileId);
      await tx
        .delete(schemas.rag_dataset_documents)
        .where(eq(schemas.rag_dataset_documents.document_id, input.documentId));
      if (versionIds.length) {
        await tx
          .delete(schemas.document_segments)
          .where(
            inArray(schemas.document_segments.document_version_id, versionIds),
          );
        await tx
          .delete(schemas.document_preview_quick_pages)
          .where(
            inArray(
              schemas.document_preview_quick_pages.document_version_id,
              versionIds,
            ),
          );
        await tx
          .delete(schemas.document_preview_pages)
          .where(
            inArray(
              schemas.document_preview_pages.document_version_id,
              versionIds,
            ),
          );
        await tx
          .delete(schemas.document_versions)
          .where(
            inArray(schemas.document_versions.document_version_id, versionIds),
          );
      }
      if (fileIds.length) {
        await tx
          .delete(schemas.file_upload_sessions)
          .where(inArray(schemas.file_upload_sessions.file_id, fileIds));
        await tx
          .delete(schemas.files)
          .where(inArray(schemas.files.file_id, fileIds));
      }
      await tx
        .delete(schemas.documents)
        .where(eq(schemas.documents.document_id, input.documentId));
    }
  });
}
