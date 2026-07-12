import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import { createDocumentError } from '../errors.js';
import { scheduleDocumentProcessing } from './runner.js';

import type { DocumentProcessingStatus } from '@repo/types';
import type { DocumentActor, ReadyDocument } from '../types.js';

/** 查询当前租户文档处理任务列表。 */
export async function listDocumentProcessingJobs(
  form: {
    /** 逻辑文档筛选。 */
    documentId?: string;
    /** 状态筛选。 */
    status?: DocumentProcessingStatus[];
    /** 分页范围。 */
    limit?: number[];
    /** 是否返回总数。 */
    withCount?: boolean;
  },
  actor: DocumentActor,
) {
  const [start = 0, end = 20] = form.limit ?? [];
  const where = and(
    form.status?.length
      ? inArray(schema.document_processing_jobs.status, form.status)
      : undefined,
    form.documentId
      ? eq(schema.documents.document_id, form.documentId)
      : undefined,
    eq(schema.documents.tenant_id, actor.tenantId),
  );
  const baseQuery = () =>
    db
      .select({
        job: schema.document_processing_jobs,
        document: schema.documents,
      })
      .from(schema.document_processing_jobs)
      .innerJoin(
        schema.document_versions,
        eq(
          schema.document_versions.document_version_id,
          schema.document_processing_jobs.document_version_id,
        ),
      )
      .innerJoin(
        schema.documents,
        eq(
          schema.documents.document_id,
          schema.document_versions.document_id,
        ),
      )
      .where(where);
  const [list, countValue] = await Promise.all([
    baseQuery()
      .orderBy(desc(schema.document_processing_jobs.create_timestamp))
      .offset(start)
      .limit(Math.max(0, end - start)),
    form.withCount
      ? db
          .select({ value: count() })
          .from(schema.document_processing_jobs)
          .innerJoin(
            schema.document_versions,
            eq(
              schema.document_versions.document_version_id,
              schema.document_processing_jobs.document_version_id,
            ),
          )
          .innerJoin(
            schema.documents,
            eq(
              schema.documents.document_id,
              schema.document_versions.document_id,
            ),
          )
          .where(where)
      : Promise.resolve([{ value: 0 }]),
  ]);
  return {
    list: list.map(({ job, document }) => ({
      jobId: job.job_id,
      documentId: document.document_id,
      stage: job.stage,
      status: job.status,
      processedItems: job.processed_items,
      totalItems: job.total_items,
      errorCode: job.error_code,
      errorMessage: job.error_message,
      createdAt: job.create_timestamp,
    })),
    count: countValue[0]?.value ?? 0,
  };
}

/** 查询当前租户文档处理任务详情及阶段日志。 */
export async function getDocumentProcessingJob(
  jobId: string,
  actor: DocumentActor,
) {
  const [row] = await db
    .select({ job: schema.document_processing_jobs })
    .from(schema.document_processing_jobs)
    .innerJoin(
      schema.document_versions,
      eq(
        schema.document_versions.document_version_id,
        schema.document_processing_jobs.document_version_id,
      ),
    )
    .innerJoin(
      schema.documents,
      eq(
        schema.documents.document_id,
        schema.document_versions.document_id,
      ),
    )
    .where(
      and(
        eq(schema.document_processing_jobs.job_id, jobId),
        eq(schema.documents.tenant_id, actor.tenantId),
      ),
    )
    .limit(1);
  const job = row?.job;
  if (!job) {
    throw createDocumentError(
      'DOCUMENT_JOB_NOT_FOUND',
      '文档处理任务不存在',
      'not-found',
    );
  }
  const stageRuns = await db
    .select()
    .from(schema.document_processing_stage_runs)
    .where(eq(schema.document_processing_stage_runs.job_id, jobId))
    .orderBy(
      schema.document_processing_stage_runs.start_timestamp,
      schema.document_processing_stage_runs.attempt,
    );
  return {
    jobId: job.job_id,
    stage: job.stage,
    status: job.status,
    checkpoint: job.checkpoint
      ? (JSON.parse(job.checkpoint) as Record<string, unknown>)
      : null,
    errorCode: job.error_code,
    errorMessage: job.error_message,
    stageRuns: stageRuns.map((run) => ({
      stage: run.stage,
      attempt: run.attempt,
      status: run.status,
      processedItems: run.processed_items,
      errorCode: run.error_code,
      errorMessage: run.error_message,
      startedAt: run.start_timestamp,
      endedAt: run.end_timestamp,
    })),
  };
}

/** 将失败任务重置为 pending 并异步重试。 */
export async function retryDocumentProcessingJob(
  jobId: string,
  actor: DocumentActor,
) {
  await getDocumentProcessingJob(jobId, actor);
  const [job] = await db
    .update(schema.document_processing_jobs)
    .set({
      status: 'pending',
      error_code: null,
      error_message: null,
      end_timestamp: null,
      last_update_user_id: actor.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schema.document_processing_jobs.job_id, jobId),
        eq(schema.document_processing_jobs.status, 'failed'),
      ),
    )
    .returning();
  if (!job) {
    throw createDocumentError(
      'DOCUMENT_JOB_STATE_CONFLICT',
      '只有失败任务可以重试',
      'conflict',
    );
  }
  scheduleDocumentProcessing(jobId);
}

/** 取消尚未完成的文档处理任务。 */
export async function cancelDocumentProcessingJob(
  jobId: string,
  actor: DocumentActor,
) {
  await getDocumentProcessingJob(jobId, actor);
  await db
    .update(schema.document_processing_jobs)
    .set({
      status: 'canceled',
      end_timestamp: new Date(),
      last_update_user_id: actor.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schema.document_processing_jobs.job_id, jobId),
        inArray(schema.document_processing_jobs.status, ['pending', 'running']),
      ),
    );
}

/** 返回 ready Segment，供 RAG、摘要与审核等消费者使用。 */
export async function getReadyDocument(
  documentVersionId: string,
  actor: DocumentActor,
): Promise<ReadyDocument> {
  const [row] = await db
    .select({ version: schema.document_versions })
    .from(schema.document_versions)
    .innerJoin(
      schema.documents,
      eq(
        schema.documents.document_id,
        schema.document_versions.document_id,
      ),
    )
    .where(
      and(
        eq(schema.document_versions.document_version_id, documentVersionId),
        eq(schema.documents.tenant_id, actor.tenantId),
      ),
    )
    .limit(1);
  const version = row?.version;
  if (!version || version.status !== 'ready') {
    throw createDocumentError(
      'DOCUMENT_NOT_READY',
      '文档版本尚未完成处理',
      'conflict',
    );
  }
  const segments = await db
    .select()
    .from(schema.document_segments)
    .where(
      and(
        eq(schema.document_segments.document_version_id, documentVersionId),
        eq(
          schema.document_segments.segment_profile_version,
          version.segment_profile_version,
        ),
      ),
    )
    .orderBy(schema.document_segments.position);
  return {
    documentVersionId,
    configVersion: [
      version.parser_version,
      version.normalizer_version,
      version.segment_profile_version,
    ].join(':'),
    segments: segments.map((segment) => ({
      segmentId: segment.segment_id,
      parentSegmentId: segment.parent_segment_id,
      content: segment.content,
      embeddingContent: segment.embedding_content,
      contentHash: segment.content_hash,
      headingPath: JSON.parse(segment.heading_path) as string[],
      page: segment.page,
      position: segment.position,
      tokenCount: segment.token_count,
    })),
  };
}
