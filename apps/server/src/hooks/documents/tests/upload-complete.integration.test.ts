import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setImmediate as waitForImmediate } from 'node:timers/promises';
import test from 'node:test';
import { eq, inArray } from 'drizzle-orm';

import { ROOT } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { uploadCompleteHandler } from '@/router/routes/documents/upload-complete.js';
import {
  abortMultipartUpload,
  createMultipartUpload,
  deleteStoredObject,
  putStoredObject,
} from '../storage/commands.js';
import { presignUploadPart } from '../storage/presign.js';

const integrationEnabled = process.env.DOCUMENTS_INTEGRATION_TEST === '1';
const integrationSkipReason = integrationEnabled
  ? false
  : '未设置 DOCUMENTS_INTEGRATION_TEST=1，跳过上传完成集成测试';

/** 上传完成集成测试使用的数据库与对象标识。 */
interface UploadFixture {
  /** 通用文件标识。 */
  fileId: string;
  /** 上传会话标识。 */
  sessionId: string;
  /** MinIO 对象 key。 */
  objectKey: string;
  /** 可选知识库标识。 */
  datasetId?: string;
}

/**
 * 写入上传完成 route 所需的最小文件与会话记录。
 *
 * @param input 上传模式、对象大小和可选 RAG 关联。
 * @returns 后续断言和清理使用的随机标识。
 */
async function createUploadFixture(input: {
  /** 文件与会话声明的字节数。 */
  size: number;
  /** 单对象或 Multipart 模式。 */
  mode: 'single' | 'multipart';
  /** Multipart 上传标识。 */
  uploadId?: string;
  /** Multipart 分片数量。 */
  partCount?: number;
  /** 验证成功后是否自动进入 RAG。 */
  enterRag?: boolean;
}): Promise<UploadFixture> {
  const fileId = randomUUID();
  const sessionId = randomUUID();
  const objectKey = `integration/upload-complete/${fileId}.txt`;
  const datasetId = input.enterRag ? randomUUID() : undefined;
  const now = new Date();
  const userId = 'documents-integration';

  if (datasetId) {
    await db.insert(schema.rag_datasets).values({
      dataset_id: datasetId,
      name: `documents-integration-${datasetId}`,
      description: null,
      status: 'active',
      create_user_id: userId,
      create_timestamp: now,
      last_update_user_id: userId,
      last_update_timestamp: now,
    });
  }
  await db.insert(schema.files).values({
    file_id: fileId,
    filename: `${fileId}.txt`,
    extension: 'txt',
    declared_content_type: 'text/plain',
    content_type: null,
    size: input.size,
    sha256: null,
    bucket: ROOT.upload.bucket,
    object_key: objectKey,
    etag: null,
    status: 'pending',
    verified_timestamp: null,
    deleted_timestamp: null,
    create_user_id: userId,
    create_timestamp: now,
    last_update_user_id: userId,
    last_update_timestamp: now,
  });
  await db.insert(schema.file_upload_sessions).values({
    session_id: sessionId,
    file_id: fileId,
    policy_key: 'rag-document',
    enter_rag: input.enterRag ?? false,
    dataset_id: datasetId ?? null,
    processing_config_version: input.enterRag ? 'integration-v1' : null,
    fingerprint: randomUUID(),
    idempotency_key: randomUUID(),
    mode: input.mode,
    upload_id: input.uploadId ?? null,
    filename: `${fileId}.txt`,
    declared_content_type: 'text/plain',
    size: input.size,
    part_size: input.mode === 'multipart' ? input.size : null,
    part_count: input.partCount ?? null,
    uploaded_size: 0,
    status: 'initialized',
    expire_timestamp: new Date(now.getTime() + 60 * 60 * 1000),
    completed_timestamp: null,
    error_code: null,
    error_message: null,
    create_user_id: userId,
    create_timestamp: now,
    last_update_user_id: userId,
    last_update_timestamp: now,
  });
  return { fileId, sessionId, objectKey, datasetId };
}

/**
 * 删除上传完成集成测试创建的任务、文档、文件和对象。
 *
 * @param fixture 需要清理的随机资源标识。
 * @returns 所有数据库记录与对象删除完成后结束。
 */
async function cleanupUploadFixture(fixture: UploadFixture): Promise<void> {
  const fileTasks = await db
    .select({ taskId: schema.file_processing_tasks.task_id })
    .from(schema.file_processing_tasks)
    .where(eq(schema.file_processing_tasks.file_id, fixture.fileId));
  const versions = await db
    .select({
      versionId: schema.document_versions.document_version_id,
      documentId: schema.document_versions.document_id,
    })
    .from(schema.document_versions)
    .where(eq(schema.document_versions.source_file_id, fixture.fileId));
  const taskIds = fileTasks.map((row) => row.taskId);
  const versionIds = versions.map((row) => row.versionId);
  const documentIds = versions.map((row) => row.documentId);

  if (taskIds.length) {
    await db
      .delete(schema.file_processing_task_stage_runs)
      .where(inArray(schema.file_processing_task_stage_runs.task_id, taskIds));
    await db
      .delete(schema.file_processing_tasks)
      .where(inArray(schema.file_processing_tasks.task_id, taskIds));
    await db.delete(schema.tasks).where(inArray(schema.tasks.task_id, taskIds));
  }
  if (documentIds.length) {
    await db
      .delete(schema.rag_dataset_documents)
      .where(inArray(schema.rag_dataset_documents.document_id, documentIds));
  }
  if (versionIds.length) {
    await db
      .delete(schema.document_parsed_blocks)
      .where(
        inArray(schema.document_parsed_blocks.document_version_id, versionIds),
      );
    await db
      .delete(schema.document_segments)
      .where(inArray(schema.document_segments.document_version_id, versionIds));
    await db
      .delete(schema.document_versions)
      .where(inArray(schema.document_versions.document_version_id, versionIds));
  }
  if (documentIds.length) {
    await db
      .delete(schema.documents)
      .where(inArray(schema.documents.document_id, documentIds));
  }
  await db
    .delete(schema.file_references)
    .where(eq(schema.file_references.file_id, fixture.fileId));
  await db
    .delete(schema.file_upload_parts)
    .where(eq(schema.file_upload_parts.session_id, fixture.sessionId));
  await db
    .delete(schema.file_upload_sessions)
    .where(eq(schema.file_upload_sessions.session_id, fixture.sessionId));
  await db.delete(schema.files).where(eq(schema.files.file_id, fixture.fileId));
  if (fixture.datasetId) {
    await db
      .delete(schema.rag_datasets)
      .where(eq(schema.rag_datasets.dataset_id, fixture.datasetId));
  }
  await deleteStoredObject({
    bucket: ROOT.upload.bucket,
    objectKey: fixture.objectKey,
  });
}

test(
  '普通上传可完成、重复完成保持幂等并自动创建一个处理任务',
  { skip: integrationSkipReason },
  async () => {
    const body = Buffer.from('documents upload complete integration');
    const fixture = await createUploadFixture({
      size: body.length,
      mode: 'single',
      enterRag: true,
    });
    const previousConcurrency = ROOT.fileProcessing.workerConcurrency;
    ROOT.fileProcessing.workerConcurrency = 0;

    try {
      await putStoredObject({
        bucket: ROOT.upload.bucket,
        objectKey: fixture.objectKey,
        contentType: 'text/plain',
        content: body,
      });
      const request = {
        body: { sessionId: fixture.sessionId },
        __token: { user_id: 'documents-integration' },
      } as never;
      const first = await uploadCompleteHandler(request);
      const second = await uploadCompleteHandler(request);
      const [session] = await db
        .select()
        .from(schema.file_upload_sessions)
        .where(eq(schema.file_upload_sessions.session_id, fixture.sessionId));
      const tasks = await db
        .select()
        .from(schema.file_processing_tasks)
        .where(eq(schema.file_processing_tasks.file_id, fixture.fileId));

      assert.equal(first.fileId, fixture.fileId);
      assert.deepEqual(second, first);
      assert.equal(session?.status, 'completed');
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0]?.trigger_source, 'upload');
    } finally {
      await waitForImmediate();
      await cleanupUploadFixture(fixture);
      ROOT.fileProcessing.workerConcurrency = previousConcurrency;
    }
  },
);

test(
  'Multipart 上传按 MinIO 分片事实完成并验证文件',
  { skip: integrationSkipReason },
  async () => {
    const body = Buffer.alloc(5 * 1024 * 1024, 0x61);
    const objectKey = `integration/upload-complete/${randomUUID()}.txt`;
    const uploadId = await createMultipartUpload({
      bucket: ROOT.upload.bucket,
      objectKey,
      contentType: 'text/plain',
      filename: 'multipart.txt',
    });
    let multipartCompleted = false;
    let fixture: UploadFixture | undefined;

    try {
      const signed = await presignUploadPart({
        bucket: ROOT.upload.bucket,
        objectKey,
        uploadId,
        partNumber: 1,
      });
      const response = await fetch(signed.url, { method: 'PUT', body });
      assert.equal(response.ok, true);
      const etag = response.headers.get('etag');
      assert.ok(etag);

      fixture = await createUploadFixture({
        size: body.length,
        mode: 'multipart',
        uploadId,
        partCount: 1,
      });
      await db
        .update(schema.files)
        .set({ object_key: objectKey })
        .where(eq(schema.files.file_id, fixture.fileId));
      fixture.objectKey = objectKey;

      const result = await uploadCompleteHandler({
        body: {
          sessionId: fixture.sessionId,
          parts: [{ partNumber: 1, etag }],
        },
        __token: { user_id: 'documents-integration' },
      } as never);
      multipartCompleted = true;

      assert.equal(result.fileId, fixture.fileId);
      assert.equal(result.status, 'verified');
      assert.equal(result.size, body.length);
    } finally {
      if (!multipartCompleted) {
        await abortMultipartUpload({
          bucket: ROOT.upload.bucket,
          objectKey,
          uploadId,
        }).catch(() => undefined);
      }
      if (fixture) {
        await cleanupUploadFixture(fixture);
      } else {
        await deleteStoredObject({
          bucket: ROOT.upload.bucket,
          objectKey,
        });
      }
    }
  },
);

test(
  '对象大小校验失败会拒绝文件并记录会话失败',
  { skip: integrationSkipReason },
  async () => {
    const body = Buffer.from('size mismatch');
    const fixture = await createUploadFixture({
      size: body.length + 1,
      mode: 'single',
    });

    try {
      await putStoredObject({
        bucket: ROOT.upload.bucket,
        objectKey: fixture.objectKey,
        contentType: 'text/plain',
        content: body,
      });
      await assert.rejects(
        uploadCompleteHandler({
          body: { sessionId: fixture.sessionId },
          __token: { user_id: 'documents-integration' },
        } as never),
        /UPLOAD_OBJECT_MISMATCH/,
      );
      const [session] = await db
        .select()
        .from(schema.file_upload_sessions)
        .where(eq(schema.file_upload_sessions.session_id, fixture.sessionId));
      const [file] = await db
        .select()
        .from(schema.files)
        .where(eq(schema.files.file_id, fixture.fileId));

      assert.equal(session?.status, 'failed');
      assert.equal(session?.error_code, 'UPLOAD_FILE_REJECTED');
      assert.equal(file?.status, 'rejected');
    } finally {
      await cleanupUploadFixture(fixture);
    }
  },
);
