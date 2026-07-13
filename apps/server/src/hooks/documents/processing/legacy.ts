import { asc, eq, max } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';

import type {
  DocumentProcessingStage,
  DocumentProcessingStatus,
  FileProcessingStage,
  TaskStatus,
} from '@repo/types';

/**
 * 将旧文档任务幂等投影到统一任务中心。
 *
 * 旧任务只用于查询和审计，不会被新的文件任务 worker 重新领取。
 */
export async function syncLegacyDocumentProcessingTasks() {
  const legacyRows = await db
    .select({
      job: schema.document_processing_jobs,
      version: schema.document_versions,
      document: schema.documents,
      file: schema.files,
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
      eq(schema.documents.document_id, schema.document_versions.document_id),
    )
    .innerJoin(
      schema.files,
      eq(schema.files.file_id, schema.document_versions.source_file_id),
    )
    .orderBy(
      asc(schema.files.create_timestamp),
      asc(schema.document_processing_jobs.create_timestamp),
    );

  for (const row of legacyRows) {
    const [existing] = await db
      .select({ taskId: schema.tasks.task_id })
      .from(schema.tasks)
      .where(eq(schema.tasks.task_id, row.job.job_id))
      .limit(1);
    if (existing) continue;

    const [lastExecution] = await db
      .select({ value: max(schema.file_processing_tasks.execution_no) })
      .from(schema.file_processing_tasks)
      .where(eq(schema.file_processing_tasks.file_id, row.file.file_id));
    const executionNo = (lastExecution?.value ?? 0) + 1;
    const [datasetLink] = await db
      .select({ datasetId: schema.rag_dataset_documents.dataset_id })
      .from(schema.rag_dataset_documents)
      .where(
        eq(
          schema.rag_dataset_documents.document_id,
          row.document.document_id,
        ),
      )
      .limit(1);
    const now = row.job.last_update_timestamp;
    const status = mapLegacyTaskStatus(row.job.status);
    await db.transaction(async (tx) => {
      await tx.insert(schema.tasks).values({
        task_id: row.job.job_id,
        task_key: 'file-processing',
        task_name: `${row.file.filename} / 历史第 ${executionNo} 次处理`,
        search_key: row.file.filename,
        pending_uuid: null,
        tenant_id: row.document.tenant_id,
        task_category: 'file-processing',
        business_type: 'file',
        business_id: row.file.file_id,
        current_stage: mapLegacyStage(row.job.stage),
        progress: status === 'completed' ? 100 : 0,
        processed_items: row.job.processed_items,
        total_items: row.job.total_items,
        error_code: row.job.error_code,
        error_message: row.job.error_message,
        args: null,
        status,
        execution_user_id: row.job.create_user_id,
        trigger_method: 'auto',
        create_timestamp: row.job.create_timestamp,
        start_timestamp: row.job.start_timestamp,
        end_timestamp: row.job.end_timestamp,
        logs: null,
        last_update_timestamp: now,
      });
      await tx.insert(schema.file_processing_tasks).values({
        task_id: row.job.job_id,
        file_id: row.file.file_id,
        document_id: row.document.document_id,
        document_version_id: row.version.document_version_id,
        dataset_id: datasetLink?.datasetId ?? null,
        execution_no: executionNo,
        trigger_source: 'upload',
        processing_config_version: row.job.config_version,
        result_summary:
          status === 'completed'
            ? JSON.stringify({
                legacy: true,
                documentId: row.document.document_id,
                documentVersionId: row.version.document_version_id,
                datasetId: datasetLink?.datasetId ?? null,
                segmentCount: row.job.processed_items,
                capability: 'content-processing',
              })
            : null,
        create_user_id: row.job.create_user_id,
        create_timestamp: row.job.create_timestamp,
        last_update_user_id: row.job.last_update_user_id,
        last_update_timestamp: now,
      });
    });

    const stageRuns = await db
      .select()
      .from(schema.document_processing_stage_runs)
      .where(eq(schema.document_processing_stage_runs.job_id, row.job.job_id));
    for (const stage of stageRuns) {
      await db
        .insert(schema.file_processing_task_stage_runs)
        .values({
          stage_run_id: stage.stage_run_id,
          task_id: row.job.job_id,
          stage: mapLegacyStage(stage.stage),
          attempt: stage.attempt,
          status: mapLegacyTaskStatus(stage.status),
          processed_items: stage.processed_items,
          total_items: stage.processed_items,
          checkpoint: null,
          error_code: stage.error_code,
          error_message: stage.error_message,
          start_timestamp: stage.start_timestamp,
          end_timestamp: stage.end_timestamp,
        })
        .onConflictDoNothing();
    }
  }
}

/** 将旧文档任务状态映射为统一任务状态。 */
function mapLegacyTaskStatus(status: DocumentProcessingStatus): TaskStatus {
  const mapping: Record<DocumentProcessingStatus, TaskStatus> = {
    pending: 'failed',
    running: 'failed',
    completed: 'completed',
    failed: 'failed',
    canceled: 'killed',
  };
  return mapping[status];
}

/** 将旧文档阶段映射为文件处理阶段。 */
function mapLegacyStage(stage: DocumentProcessingStage): FileProcessingStage {
  return stage === 'ready' ? 'completed' : stage;
}

