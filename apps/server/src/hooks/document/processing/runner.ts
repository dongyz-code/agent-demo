import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

import { logger } from '@/configs/index.js';
import { countRows, db, schema } from '@/database/index.js';
import { getReadableFile } from '@/hooks/upload/index.js';
import { createDocumentSegments, hashToUuid } from '../segmentation/segment.js';
import { getDefaultSegmentProfile } from '../segmentation/profiles.js';
import { createDocumentError } from '../errors.js';
import { normalizeDocumentBlocks, NORMALIZER_VERSION } from '../normalization/normalize.js';
import { getDocumentParser } from '../parsers/registry.js';

import type {
  DocumentParsedBlock,
  DocumentProcessingStage,
} from '@repo/types';

/** 默认处理配置版本；解析器版本在执行时追加到阶段产物。 */
export const DEFAULT_DOCUMENT_PROCESSING_CONFIG_VERSION = 'document-processing-v1';

/** 异步启动文档处理并记录未捕获错误，调用方无需等待大文件解析。 */
export function scheduleDocumentProcessing(jobId: string) {
  queueMicrotask(() => {
    runDocumentProcessingJob(jobId).catch((error) => {
      logger.error(
        { event: 'document.processing.unhandled', jobId, err: error },
        '文档处理任务执行失败',
      );
    });
  });
}

/** 执行单个 文档处理任务。 */
export async function runDocumentProcessingJob(jobId: string) {
  const context = await getJobContext(jobId);
  if (context.job.status === 'canceled') {
    return;
  }
  const claimed = await db
    .update(schema.document_processing_jobs)
    .set({
      status: 'running',
      stage: 'reading',
      start_timestamp: context.job.start_timestamp ?? new Date(),
      end_timestamp: null,
      error_code: null,
      error_message: null,
      last_update_user_id: context.job.create_user_id,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schema.document_processing_jobs.job_id, jobId),
        inArray(schema.document_processing_jobs.status, ['pending', 'failed']),
      ),
    )
    .returning({ jobId: schema.document_processing_jobs.job_id });
  if (!claimed.length && context.job.status !== 'running') {
    return;
  }

  try {
    const file = await runStage(jobId, 'reading', async () =>
      await getReadableFile(
        context.version.source_file_id,
        context.document.tenant_id,
      ),
    );
    await assertJobNotCanceled(jobId);
    const parser = getDocumentParser(file.contentType);
    const parsed = await runStage(jobId, 'parsing', async () =>
      await parser.parse({ file }),
    );
    await assertJobNotCanceled(jobId);
    const normalized = await runStage(jobId, 'normalizing', async () =>
      normalizeDocumentBlocks(parsed),
    );
    await assertJobNotCanceled(jobId);
    const profile = getDefaultSegmentProfile();
    const segments = await runStage(jobId, 'segmenting', async () =>
      createDocumentSegments({
        documentVersionId: context.version.document_version_id,
        blocks: normalized,
        profile,
      }),
    );
    await assertJobNotCanceled(jobId);

    await db.transaction(async (tx) => {
      await tx
        .delete(schema.document_parsed_blocks)
        .where(
          and(
            eq(
              schema.document_parsed_blocks.document_version_id,
              context.version.document_version_id,
            ),
            eq(schema.document_parsed_blocks.parser_version, parser.version),
          ),
        );
      if (normalized.length) {
        await tx.insert(schema.document_parsed_blocks).values(
          normalized.map((block) => ({
            block_id: stableParsedBlockId(
              context.version.document_version_id,
              parser.version,
              block,
            ),
            document_version_id: context.version.document_version_id,
            type: block.type,
            content: block.text,
            heading_path: JSON.stringify(block.headingPath),
            page: block.page,
            position: block.position,
            metadata: JSON.stringify(block.metadata),
            parser_version: parser.version,
          })),
        );
      }
      await tx
        .delete(schema.document_segments)
        .where(
          and(
            eq(
              schema.document_segments.document_version_id,
              context.version.document_version_id,
            ),
            eq(schema.document_segments.segment_profile_version, profile.version),
          ),
        );
      if (segments.length) {
        await tx.insert(schema.document_segments).values(
          segments.map((segment) => ({
            segment_id: segment.segmentId,
            document_version_id: context.version.document_version_id,
            parent_segment_id: segment.parentSegmentId,
            content: segment.content,
            embedding_content: segment.embeddingContent,
            content_hash: segment.contentHash,
            heading_path: JSON.stringify(segment.headingPath),
            page: segment.page,
            position: segment.position,
            token_count: segment.tokenCount,
            segment_profile_version: profile.version,
          })),
        );
      }
      const now = new Date();
      await tx
        .update(schema.document_versions)
        .set({
          status: 'ready',
          parser_version: parser.version,
          normalizer_version: NORMALIZER_VERSION,
          segment_profile_version: profile.version,
          last_update_user_id: context.job.create_user_id,
          last_update_timestamp: now,
        })
        .where(
          eq(
            schema.document_versions.document_version_id,
            context.version.document_version_id,
          ),
        );
      await tx
        .update(schema.documents)
        .set({
          status: 'ready',
          last_update_user_id: context.job.create_user_id,
          last_update_timestamp: now,
        })
        .where(eq(schema.documents.document_id, context.document.document_id));
      await tx
        .update(schema.document_processing_jobs)
        .set({
          stage: 'ready',
          status: 'completed',
          processed_items: segments.length,
          total_items: segments.length,
          checkpoint: JSON.stringify({
            parserVersion: parser.version,
            normalizerVersion: NORMALIZER_VERSION,
            segmentProfileVersion: profile.version,
          }),
          end_timestamp: now,
          last_update_user_id: context.job.create_user_id,
          last_update_timestamp: now,
        })
        .where(eq(schema.document_processing_jobs.job_id, jobId));
    });
  } catch (error) {
    if (await isJobCanceled(jobId)) {
      return;
    }
    const message = error instanceof Error ? error.message : '文档处理失败';
    await db.transaction(async (tx) => {
      await tx
        .update(schema.document_processing_jobs)
        .set({
          status: 'failed',
          error_code: getErrorCode(message),
          error_message: message,
          end_timestamp: new Date(),
          last_update_user_id: context.job.create_user_id,
          last_update_timestamp: new Date(),
        })
        .where(eq(schema.document_processing_jobs.job_id, jobId));
      await tx
        .update(schema.document_versions)
        .set({
          status: 'failed',
          last_update_user_id: context.job.create_user_id,
          last_update_timestamp: new Date(),
        })
        .where(
          eq(
            schema.document_versions.document_version_id,
            context.version.document_version_id,
          ),
        );
      await tx
        .update(schema.documents)
        .set({
          status: 'failed',
          last_update_user_id: context.job.create_user_id,
          last_update_timestamp: new Date(),
        })
        .where(eq(schema.documents.document_id, context.document.document_id));
    });
    throw error;
  }
}

/** 查询任务是否已被管理端取消。 */
async function isJobCanceled(jobId: string) {
  const [job] = await db
    .select({ status: schema.document_processing_jobs.status })
    .from(schema.document_processing_jobs)
    .where(eq(schema.document_processing_jobs.job_id, jobId))
    .limit(1);
  return job?.status === 'canceled';
}

/** 在阶段边界阻止已取消任务继续写入后续产物。 */
async function assertJobNotCanceled(jobId: string) {
  if (await isJobCanceled(jobId)) {
    throw createDocumentError(
      'DOCUMENT_JOB_CANCELED',
      '文档处理任务已取消',
      'conflict',
    );
  }
}

/** 执行单个阶段并记录阶段运行结果。 */
async function runStage<T>(
  jobId: string,
  stage: DocumentProcessingStage,
  action: () => Promise<T> | T,
) {
  const attempt =
    (await countRows(
      schema.document_processing_stage_runs,
      and(
        eq(schema.document_processing_stage_runs.job_id, jobId),
        eq(schema.document_processing_stage_runs.stage, stage),
      ),
    )) + 1;
  const stageRunId = randomUUID();
  const start = new Date();
  await db.insert(schema.document_processing_stage_runs).values({
    stage_run_id: stageRunId,
    job_id: jobId,
    stage,
    attempt,
    status: 'running',
    processed_items: 0,
    error_code: null,
    error_message: null,
    start_timestamp: start,
    end_timestamp: null,
  });
  await db
    .update(schema.document_processing_jobs)
    .set({ stage, last_update_timestamp: start })
    .where(eq(schema.document_processing_jobs.job_id, jobId));
  try {
    const result = await action();
    const processed = Array.isArray(result) ? result.length : 1;
    await db
      .update(schema.document_processing_stage_runs)
      .set({
        status: 'completed',
        processed_items: processed,
        end_timestamp: new Date(),
      })
      .where(eq(schema.document_processing_stage_runs.stage_run_id, stageRunId));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '阶段执行失败';
    await db
      .update(schema.document_processing_stage_runs)
      .set({
        status: 'failed',
        error_code: getErrorCode(message),
        error_message: message,
        end_timestamp: new Date(),
      })
      .where(eq(schema.document_processing_stage_runs.stage_run_id, stageRunId));
    throw error;
  }
}

/** 查询执行任务需要的文档、版本和租户上下文。 */
async function getJobContext(jobId: string) {
  const [context] = await db
    .select({
      job: schema.document_processing_jobs,
      version: schema.document_versions,
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
    .where(eq(schema.document_processing_jobs.job_id, jobId))
    .limit(1);
  if (!context) {
    throw createDocumentError(
      'DOCUMENT_JOB_NOT_FOUND',
      '文档处理任务不存在',
      'not-found',
    );
  }
  return context;
}

/** 将解析器块标识收口为文档版本和解析器版本相关的 UUID。 */
function stableParsedBlockId(
  documentVersionId: string,
  parserVersion: string,
  block: DocumentParsedBlock,
) {
  return hashToUuid(
    `${documentVersionId}:${parserVersion}:${block.blockId}:${block.position}`,
  );
}

/** 从带前缀错误消息提取稳定错误码。 */
function getErrorCode(message: string) {
  const match = /^([A-Z0-9_]+):/.exec(message);
  return match?.[1] ?? 'DOCUMENT_PROCESSING_FAILED';
}
