import { and, eq, sql } from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';
import {
  failDocumentRagRelations,
  markDocumentRagRelationsProcessing,
  publishDocumentRagRelationsForTask,
} from '../../rag/relations.js';
import { getReadableDocumentSource } from '../../storage/source.js';
import { getErrorCode } from '../../tasks/errors.js';
import {
  completeTask,
  failTask,
  FileProcessingLeaseLostError,
  isTaskCanceled,
  runTaskStage,
} from '../../tasks/runtime.js';
import { getDefaultSegmentProfile } from './definition.js';
import { normalizeDocumentBlocks } from './normalize.js';
import { getDocumentParser } from './parsers/registry.js';
import { createDocumentSegments } from './segment.js';

import type { DocumentSegment } from '@repo/types';
import type {
  FileProcessingTaskContext,
  FileProcessingTaskLease,
} from '../../tasks/runtime.js';

/**
 * 执行已领取文档版本的读取、解析、切分和内容发布流程。
 *
 * 同一任务只生成一套版本级 Segment；完成后批量发布所有仍以该版本为 pending
 * 的知识库关系。关系已删除或改指新版本时不会被迟到任务恢复。
 *
 * @param context worker 已校验的文档版本任务上下文。
 * @param lease 当前领取对应的 lease 校验器。
 * @returns 任务成功、失败、取消或失去 lease 后结束。
 */
export async function runDocumentContentTask(
  context: FileProcessingTaskContext,
  lease: FileProcessingTaskLease,
): Promise<void> {
  try {
    await lease.assertActive();
    await markDocumentRagRelationsProcessing({
      taskId: context.taskId,
      leaseId: lease.leaseId,
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      userId: context.userId,
    });
    const file = await runTaskStage(context, lease, 'reading', async () =>
      getReadableDocumentSource(context.fileId),
    );
    const parser = getDocumentParser(file.contentType);
    const parsed = await runTaskStage(context, lease, 'parsing', async () =>
      parser.parse({ file }),
    );
    const normalized = await runTaskStage(context, lease, 'normalizing', () =>
      normalizeDocumentBlocks(parsed),
    );
    const profile = getDefaultSegmentProfile();
    const segments = await runTaskStage(context, lease, 'segmenting', () =>
      createDocumentSegments({
        documentVersionId: context.documentVersionId,
        blocks: normalized,
        profile,
      }),
    );
    await persistContentResult(context, lease, {
      segments,
      segmentProfileVersion: profile.version,
    });
    const publishedRelationCount = await runTaskStage(
      context,
      lease,
      'content-publishing',
      async () =>
        await publishDocumentRagRelationsForTask({
          taskId: context.taskId,
          leaseId: lease.leaseId,
          documentId: context.documentId,
          documentVersionId: context.documentVersionId,
          userId: context.userId,
        }),
    );
    await completeTask(context, lease, segments.length, {
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      segmentCount: segments.length,
      capability: 'document-content',
      publishedRelationCount,
    });
  } catch (error) {
    if (
      error instanceof FileProcessingLeaseLostError ||
      (await isTaskCanceled(context.taskId))
    ) {
      return;
    }
    const message = error instanceof Error ? error.message : '文档内容处理失败';
    const failed = await failTask(
      context.taskId,
      lease.leaseId,
      getErrorCode(message, 'DOCUMENT_CONTENT_PROCESSING_FAILED'),
      message,
    );
    if (!failed) return;
    await failDocumentRagRelations({
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      error: message,
      userId: context.userId,
    });
    throw error;
  }
}

/** 幂等替换当前版本唯一一套 Segment。 */
async function persistContentResult(
  context: FileProcessingTaskContext,
  lease: FileProcessingTaskLease,
  result: {
    /** 本次生成的全部 Segment。 */
    segments: DocumentSegment[];
    /** Segment 切分策略版本。 */
    segmentProfileVersion: string;
  },
): Promise<void> {
  await lease.assertActive();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${[
        'document-segments',
        context.documentVersionId,
      ].join(':')}))`,
    );
    const [owned] = await tx
      .update(schemas.tasks)
      .set({ last_update_timestamp: new Date() })
      .where(
        and(
          eq(schemas.tasks.task_id, context.taskId),
          eq(schemas.tasks.status, 'pending'),
          eq(schemas.tasks.pending_uuid, lease.leaseId),
        ),
      )
      .returning({ taskId: schemas.tasks.task_id });
    if (!owned) throw new FileProcessingLeaseLostError();
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
