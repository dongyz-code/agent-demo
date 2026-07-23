import { and, eq, sql } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import { getReadableDocumentSource } from '../storage/source.js';
import {
  completeTask,
  failTask,
  FileProcessingLeaseLostError,
  isTaskCanceled,
  runTaskStage,
} from '../tasks/runtime.js';
import { getErrorCode } from '../tasks/errors.js';
import { getDefaultSegmentProfile } from './config.js';
import { normalizeDocumentBlocks } from './pipeline/normalize.js';
import { getDocumentParser } from './pipeline/parsers/registry.js';
import { createDocumentSegments } from './pipeline/segment.js';
import {
  failRagVersion,
  markRagVersionProcessing,
  publishRagVersion,
} from './relations.js';

import type { DocumentSegment } from '@repo/types';
import type {
  FileProcessingTaskContext,
  FileProcessingTaskLease,
} from '../tasks/runtime.js';

/**
 * 执行已领取 RAG 任务的读取、解析、切分和版本发布流程。
 *
 * @param context worker 已校验的文档版本任务上下文。
 * @param lease 当前领取对应的 lease 校验器。
 * @returns 任务成功、失败、取消或失去 lease 后结束。
 */
export async function runDocumentRagTask(
  context: FileProcessingTaskContext,
  lease: FileProcessingTaskLease,
): Promise<void> {
  const datasetId = context.datasetId;
  try {
    await lease.assertActive();
    if (!datasetId) {
      throw new Error(
        'FILE_PROCESSING_CONTEXT_INVALID: RAG 任务缺少目标知识库',
      );
    }
    const processing = await markRagVersionProcessing({
      datasetId,
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      userId: context.userId,
    });
    if (!processing) {
      throw new Error(
        'RAG_TARGET_SUPERSEDED: 知识库关系已删除或待处理版本已经变化',
      );
    }
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
    const published = await runTaskStage(
      context,
      lease,
      'rag-ingestion',
      async () =>
        await publishRagVersion({
          datasetId,
          documentId: context.documentId,
          documentVersionId: context.documentVersionId,
          userId: context.userId,
        }),
    );
    await completeTask(context, lease, segments.length, {
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      datasetId,
      segmentCount: segments.length,
      capability: 'rag-ingestion',
      published,
    });
  } catch (error) {
    if (
      error instanceof FileProcessingLeaseLostError ||
      (await isTaskCanceled(context.taskId))
    ) {
      return;
    }
    const message = error instanceof Error ? error.message : '文件处理失败';
    const failed = await failTask(
      context.taskId,
      lease.leaseId,
      getErrorCode(message, 'FILE_PROCESSING_FAILED'),
      message,
    );
    if (!failed) return;
    if (datasetId) {
      await failRagVersion({
        datasetId,
        documentId: context.documentId,
        documentVersionId: context.documentVersionId,
        error: message,
        userId: context.userId,
      });
    }
    throw error;
  }
}

/** 幂等保存当前版本和配置对应的最终 Segment。 */
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
        result.segmentProfileVersion,
      ].join(':')}))`,
    );
    const [owned] = await tx
      .update(schema.tasks)
      .set({ last_update_timestamp: new Date() })
      .where(
        and(
          eq(schema.tasks.task_id, context.taskId),
          eq(schema.tasks.status, 'pending'),
          eq(schema.tasks.pending_uuid, lease.leaseId),
        ),
      )
      .returning({ taskId: schema.tasks.task_id });
    if (!owned) throw new FileProcessingLeaseLostError();
    await tx
      .delete(schema.document_segments)
      .where(
        and(
          eq(
            schema.document_segments.document_version_id,
            context.documentVersionId,
          ),
          eq(
            schema.document_segments.segment_profile_version,
            result.segmentProfileVersion,
          ),
        ),
      );
    if (result.segments.length) {
      await tx.insert(schema.document_segments).values(
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
