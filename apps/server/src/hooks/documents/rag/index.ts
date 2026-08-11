import { eq } from 'drizzle-orm';

import { db, pgAdvisoryXactLock, schemas } from '@/database/index.js';
import { documentProcessor } from '../document/index.js';
import { embedAndIndexSegments } from './indexing.js';
import {
  markDocumentRagRelationsProcessing,
  prepareDocumentRagRelationsForReprocessing,
  publishDocumentRagRelations,
  updateDocumentDatasetRelations,
} from './relations.js';

import type { DocumentSegment } from '@repo/types';

/** 文档 RAG 处理所需的业务输入。 */
export interface DocumentRagProcessInput {
  /** 已验证源文件标识。 */
  fileId: string;
  /** 逻辑文档标识。 */
  documentId: string;
  /** 本次处理的不可变文档版本。 */
  documentVersionId: string;
  /** 写入 RAG 状态的审计用户。 */
  userId: string;
  /** 上次执行保存的远程解析恢复信息。 */
  checkpoint: unknown;
  /** 保存可序列化的远程解析恢复信息。 */
  saveCheckpoint: (checkpoint: unknown) => Promise<void>;
  /** 确认当前调用仍允许继续执行，取消或失效时抛出错误。 */
  assertActive: () => Promise<void>;
}

/** 文档 RAG 操作返回的稳定摘要。 */
export interface DocumentRagProcessResult {
  /** 实际生成并索引的 Segment 数量。 */
  segmentCount: number;
  /** 成功发布到知识库关系的数量。 */
  publishedRelationCount: number;
  /** 本次使用的切分策略版本。 */
  segmentProfileVersion: string;
}

/**
 * 解析、切分、索引并发布指定文档版本的 RAG 内容。
 *
 * 同一调用只生成一套版本级 Segment；完成后批量发布仍以该版本为 pending
 * 的知识库关系。关系已删除或改指新版本时不会被迟到处理恢复。
 *
 * @param input 文档版本、源文件、恢复信息和通用存活检查。
 * @returns Segment 数量、关系发布数量和切分策略版本。
 */
async function processDocumentRag(
  input: DocumentRagProcessInput,
): Promise<DocumentRagProcessResult> {
  await input.assertActive();
  await markDocumentRagRelationsProcessing({
    documentId: input.documentId,
    documentVersionId: input.documentVersionId,
    userId: input.userId,
  });
  const content = await documentProcessor.process({
    fileId: input.fileId,
    documentVersionId: input.documentVersionId,
    checkpoint: input.checkpoint,
    saveCheckpoint: input.saveCheckpoint,
    assertActive: input.assertActive,
  });
  await input.assertActive();
  await persistDocumentSegments(input.documentVersionId, {
    segments: content.segments,
    segmentProfileVersion: content.segmentProfileVersion,
  });
  await input.assertActive();
  await embedAndIndexSegments({
    documentId: input.documentId,
    documentVersionId: input.documentVersionId,
    segments: content.segments,
  });
  await input.assertActive();
  const publishedRelationCount = await publishDocumentRagRelations({
    documentId: input.documentId,
    documentVersionId: input.documentVersionId,
    userId: input.userId,
  });
  return {
    segmentCount: content.segments.length,
    publishedRelationCount,
    segmentProfileVersion: content.segmentProfileVersion,
  };
}

/** 文档 RAG 关系管理、内容处理、索引和发布的统一入口。 */
export const documentRag = {
  /** 解析并发布指定文档版本的 RAG 内容。 */
  process: processDocumentRag,
  /** 按 add、remove 或 replace 修改文档知识库关系。 */
  updateRelations: updateDocumentDatasetRelations,
  /** 为新一轮处理准备 pending 知识库关系。 */
  prepareRelationsForReprocessing: prepareDocumentRagRelationsForReprocessing,
};

export type { DocumentDatasetRelationMode } from './relations.js';

/**
 * 幂等替换当前版本唯一一套 Segment。
 *
 * @param documentVersionId 本次替换 Segment 的不可变文档版本。
 * @param result 待发布 Segment 与切分策略版本。
 * @returns 数据库中的版本 Segment 替换完成后结束。
 */
async function persistDocumentSegments(
  documentVersionId: string,
  result: {
    /** 本次生成的全部 Segment。 */
    segments: DocumentSegment[];
    /** Segment 切分策略版本。 */
    segmentProfileVersion: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await pgAdvisoryXactLock(tx, 'document-segments', documentVersionId);
    await tx
      .delete(schemas.document_segments)
      .where(
        eq(schemas.document_segments.document_version_id, documentVersionId),
      );
    if (result.segments.length) {
      await tx.insert(schemas.document_segments).values(
        result.segments.map((segment) => ({
          segment_id: segment.segmentId,
          document_version_id: documentVersionId,
          parent_segment_id: segment.parentSegmentId,
          content: segment.content,
          embedding_content: segment.embeddingContent,
          content_hash: segment.contentHash,
          heading_path: JSON.stringify(segment.headingPath),
          page: segment.page,
          position: segment.position,
          token_count: segment.tokenCount,
          segment_profile_version: result.segmentProfileVersion,
        })),
      );
    }
  });
}
