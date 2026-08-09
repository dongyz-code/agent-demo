import { eq, sql } from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';
import {
  markDocumentRagRelationsProcessing,
  publishDocumentRagRelationsForTask,
} from '../../rag/relations.js';
import { embedAndIndexSegments } from '../../rag/indexing.js';
import { getReadableDocumentSource } from '../../file/source.js';
import {
  completeFileProcessingTask,
  runTaskStage,
} from '../../tasks/stage.js';
import { getDefaultSegmentProfile } from './definition.js';
import { normalizeDocumentBlocks } from './normalize.js';
import { getDocumentParser } from './parsers/index.js';
import { createDocumentSegments } from './segment.js';

import type { DocumentSegment } from '@repo/types';
import type { FileProcessingTaskContext } from '../../tasks/stage.js';

/**
 * 执行已领取文档版本的读取、解析、切分和内容发布流程。
 *
 * 同一任务只生成一套版本级 Segment；完成后批量发布所有仍以该版本为 pending
 * 的知识库关系。关系已删除或改指新版本时不会被迟到任务恢复。
 *
 * @param context Worker 已校验的文档版本任务上下文。
 * @returns 正常返回时由任务框架自动完成；异常直接交由框架重试或终结。
 */
export async function runDocumentContentTask(
  context: FileProcessingTaskContext,
): Promise<void> {
  await context.task.throwIfCanceled();
  await markDocumentRagRelationsProcessing({
    task: context.task,
    documentId: context.documentId,
    documentVersionId: context.documentVersionId,
    userId: context.userId,
  });
  const file = await runTaskStage(context, 'reading', async () =>
    getReadableDocumentSource(context.fileId),
  );
  const parser = getDocumentParser(file.contentType);
  const parsed = await runTaskStage(
    context,
    'parsing',
    async ({ checkpoint, saveCheckpoint }) =>
      parser.parse({
        file,
        checkpoint,
        saveCheckpoint,
        assertActive: context.task.throwIfCanceled,
      }),
  );
  const normalized = await runTaskStage(context, 'normalizing', () =>
    normalizeDocumentBlocks(parsed),
  );
  const profile = getDefaultSegmentProfile();
  const segments = await runTaskStage(context, 'segmenting', () =>
    createDocumentSegments({
      documentVersionId: context.documentVersionId,
      blocks: normalized,
      profile,
    }),
  );
  await persistContentResult(context, {
    segments,
    segmentProfileVersion: profile.version,
  });
  await runTaskStage(context, 'embedding', async () =>
    embedAndIndexSegments({
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      segments,
    }),
  );
  const publishedRelationCount = await runTaskStage(
    context,
    'content-publishing',
    async () =>
      await publishDocumentRagRelationsForTask({
        task: context.task,
        documentId: context.documentId,
        documentVersionId: context.documentVersionId,
        userId: context.userId,
      }),
  );
  await completeFileProcessingTask(context, segments.length, {
    documentId: context.documentId,
    documentVersionId: context.documentVersionId,
    segmentCount: segments.length,
    capability: 'document-content',
    publishedRelationCount,
  });
}

/**
 * 幂等替换当前版本唯一一套 Segment。
 *
 * @param context 当前内容任务领域上下文。
 * @param result 待发布 Segment 与切分策略版本。
 * @returns 业务结果与任务有效性在同一事务确认后结束。
 */
async function persistContentResult(
  context: FileProcessingTaskContext,
  result: {
    /** 本次生成的全部 Segment。 */
    segments: DocumentSegment[];
    /** Segment 切分策略版本。 */
    segmentProfileVersion: string;
  },
): Promise<void> {
  await context.task.throwIfCanceled();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${[
        'document-segments',
        context.documentVersionId,
      ].join(':')}))`,
    );
    await tx
      .delete(schemas.document_segments)
      .where(
        eq(
          schemas.document_segments.document_version_id,
          context.documentVersionId,
        ),
      );
    if (result.segments.length) {
      await tx.insert(schemas.document_segments).values(
        result.segments.map((segment) => ({
          segment_id: segment.segmentId,
          document_version_id: context.documentVersionId,
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
