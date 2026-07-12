import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { count, eq } from 'drizzle-orm';
import sharp from 'sharp';

import { db, pool, schema } from '@/database/index.js';
import { startupTableStructureSync } from '@/database/structure/index.js';
import {
  createDocument,
  getDocumentProcessingJob,
  reprocessDocument,
} from '@/hooks/document/index.js';
import {
  addDocumentToDataset,
  createRagDataset,
  listDatasetDocuments,
  removeDocumentFromDataset,
} from '@/hooks/rag/index.js';
import {
  bindFile,
  cancelUpload,
  createFileDownload,
  finishUpload,
  getFileInfo,
  getFilePreview,
  getUploadedParts,
  initUpload,
  listFiles,
  listFileReferences,
  listUploadSessions,
  releaseFile,
  removeFile,
  signUploadParts,
} from '@/hooks/upload/index.js';
import { deleteStoredObject } from '@/hooks/upload/storage/commands.js';

import type { UploadPolicyKey, UploadedPartInfo } from '@repo/types';

const actor = { tenantId: 'integration-tenant', userId: 'integration-user' };

/** 清空本 change 相关表和对象，保证测试可重复执行。 */
async function resetIntegrationData() {
  const files = await db.select().from(schema.files);
  await Promise.all(
    files.map((file) =>
      deleteStoredObject({ bucket: file.bucket, objectKey: file.object_key })
        .catch(() => undefined),
    ),
  );
  await pool.query(`TRUNCATE TABLE
    rag_dataset_documents, rag_datasets,
    document_segments, document_parsed_blocks, document_processing_stage_runs,
    document_processing_jobs, document_versions, documents,
    file_variants, file_references, file_upload_parts,
    file_upload_sessions, files RESTART IDENTITY CASCADE`);
}

/** 通过通用服务完成一个普通文本上传。 */
async function uploadText(
  filename: string,
  content: Buffer,
  contentType = 'text/plain',
  policyKey: UploadPolicyKey = 'rag-document',
) {
  const fingerprint = randomUUID();
  const input = {
    policyKey,
    filename,
    contentType,
    size: content.byteLength,
    fingerprint,
    idempotencyKey: fingerprint,
  };
  const first = await initUpload(input, actor);
  const repeated = await initUpload(input, actor);
  assert.equal(repeated.session.sessionId, first.session.sessionId);
  assert.equal(first.mode, 'single');
  const uploaded = await fetch(first.uploadUrl, {
    method: 'PUT',
    headers: first.headers,
    body: new Uint8Array(content),
  });
  assert.equal(uploaded.ok, true);
  const completed = await finishUpload(first.session.sessionId, undefined, actor);
  const completedAgain = await finishUpload(
    first.session.sessionId,
    undefined,
    actor,
  );
  assert.equal(completedAgain.fileId, completed.fileId);
  return completed;
}

/** 等待异步条件成立，超时后使测试明确失败。 */
async function waitFor<T>(read: () => Promise<T | undefined>, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('等待异步集成状态超时');
}

before(startupTableStructureSync);
beforeEach(resetIntegrationData);
after(async () => {
  await resetIntegrationData();
  await pool.end();
});

describe('通用上传与 RAG 业务服务', () => {
  it('普通上传完成幂等，文件引用绑定与释放幂等', async () => {
    const file = await uploadText('reference.txt', Buffer.from('引用测试'));
    const download = await createFileDownload(file.fileId, actor);
    const downloaded = await fetch(download.url);
    assert.equal(downloaded.ok, true);
    assert.equal(Buffer.from(await downloaded.arrayBuffer()).toString(), '引用测试');
    const reference = {
      fileId: file.fileId,
      namespace: 'integration.owner',
      ownerId: 'owner-1',
      role: 'source',
    };
    await bindFile(reference, actor);
    await bindFile(reference, actor);
    assert.equal((await listFileReferences(file.fileId, actor.tenantId)).length, 1);
    await releaseFile(reference, actor);
    await releaseFile(reference, actor);
    assert.equal((await listFileReferences(file.fileId, actor.tenantId)).length, 0);
    await removeFile(file.fileId, actor);
    await waitFor(async () => {
      const [row] = await db
        .select({ status: schema.files.status })
        .from(schema.files)
        .where(eq(schema.files.file_id, file.fileId));
      return row?.status === 'deleted' ? row : undefined;
    });
    await assert.rejects(getFileInfo(file.fileId, actor));
  });

  it('Multipart 支持续签、ListParts 恢复、重复完成和取消保护', async () => {
    const content = Buffer.concat([
      Buffer.alloc(5 * 1024 * 1024, 7),
      Buffer.from('multipart-tail'),
    ]);
    const fingerprint = randomUUID();
    const input = {
      policyKey: 'rag-document' as const,
      filename: 'large.txt',
      contentType: 'text/plain',
      size: content.byteLength,
      fingerprint,
      idempotencyKey: fingerprint,
    };
    const initialized = await initUpload(input, actor);
    assert.equal(initialized.mode, 'multipart');
    const renewed = await signUploadParts(
      initialized.session.sessionId,
      [1, 2],
      actor,
    );
    assert.equal(renewed.parts.length, 2);
    const renewedAgain = await signUploadParts(
      initialized.session.sessionId,
      [1],
      actor,
    );
    assert.equal(renewedAgain.parts[0]?.partNumber, 1);
    const completedParts: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[] = [];
    for (const signed of renewed.parts) {
      const start = (signed.partNumber - 1) * initialized.partSize;
      const body = content.subarray(start, start + initialized.partSize);
      const response = await fetch(signed.uploadUrl, {
        method: 'PUT',
        body: new Uint8Array(body),
      });
      assert.equal(response.ok, true);
      completedParts.push({
        partNumber: signed.partNumber,
        etag: response.headers.get('etag')!,
      });
    }
    const resumed = await initUpload(input, actor);
    assert.equal(resumed.session.sessionId, initialized.session.sessionId);
    const listed = await getUploadedParts(initialized.session.sessionId, actor);
    assert.equal(listed.parts.length, 2);
    assert.deepEqual(listed.missingPartNumbers, []);
    const file = await finishUpload(
      initialized.session.sessionId,
      completedParts,
      actor,
    );
    assert.equal(file.status, 'verified');
    assert.equal(
      (await finishUpload(initialized.session.sessionId, completedParts, actor)).fileId,
      file.fileId,
    );

    const cancelFingerprint = randomUUID();
    const cancelSession = await initUpload(
      {
        ...input,
        filename: 'cancel.txt',
        fingerprint: cancelFingerprint,
        idempotencyKey: cancelFingerprint,
      },
      actor,
    );
    await cancelUpload(cancelSession.session.sessionId, actor);
    await cancelUpload(cancelSession.session.sessionId, actor);
    await assert.rejects(
      signUploadParts(cancelSession.session.sessionId, [1], actor),
      /UPLOAD_SESSION_STATE_CONFLICT/,
    );
  });

  it('文档独立处理、知识库复用和重新处理保持 Segment 幂等', async () => {
    const markdown = await uploadText(
      'knowledge.md',
      Buffer.from('# 标题\n\n<script>alert(1)</script>正文'),
      'text/markdown',
    );
    const preview = await getFilePreview(markdown.fileId, actor);
    assert.equal(preview.mode, 'text');
    assert.equal(preview.text?.includes('<script'), false);
    await assert.rejects(
      getFilePreview(markdown.fileId, {
        ...actor,
        userId: 'other-user',
      }),
    );

    const pdf = await uploadText(
      'preview.pdf',
      Buffer.from('%PDF-1.7\npreview'),
      'application/pdf',
    );
    const pdfPreview = await getFilePreview(pdf.fileId, actor);
    assert.equal(pdfPreview.mode, 'direct');
    const pdfRange = await fetch(pdfPreview.url!, {
      headers: { Range: 'bytes=0-7' },
    });
    assert.equal(pdfRange.status, 206);

    const image = await uploadText(
      'preview.png',
      await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      }).png().toBuffer(),
      'image/png',
      'image',
    );
    const imagePreview = await getFilePreview(image.fileId, actor);
    assert.equal(imagePreview.mode, 'generated', imagePreview.reason ?? undefined);
    assert.equal((await fetch(imagePreview.url!)).ok, true);

    const office = await insertSyntheticVerifiedFile(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'docx',
    );
    assert.equal((await getFilePreview(office, actor)).mode, 'unsupported');
    for (const [contentType, extension] of [
      ['text/html', 'html'],
      ['image/svg+xml', 'svg'],
      ['application/x-unknown', 'bin'],
    ] as const) {
      const fileId = await insertSyntheticVerifiedFile(contentType, extension);
      assert.equal((await getFilePreview(fileId, actor)).mode, 'unsupported');
    }

    const pending = await initUpload(
      {
        policyKey: 'rag-document',
        filename: 'pending.txt',
        contentType: 'text/plain',
        size: 10,
        fingerprint: randomUUID(),
        idempotencyKey: randomUUID(),
      },
      actor,
    );
    const dataset = await createRagDataset({ name: `dataset-${randomUUID()}` }, actor);
    await assert.rejects(
      createDocument({ fileId: pending.session.fileId }, actor),
      /UPLOAD_FILE_REJECTED/,
    );

    const document = await createDocument(
      { fileId: markdown.fileId },
      actor,
    );
    const repeatedDocument = await createDocument(
      { fileId: markdown.fileId },
      actor,
    );
    assert.equal(repeatedDocument.documentId, document.documentId);
    assert.equal(
      (await listFiles({ withCount: true }, actor)).list.some(
        (file) => file.fileId === markdown.fileId,
      ),
      true,
    );
    assert.equal((await listUploadSessions({ withCount: true }, actor)).count > 0, true);
    await addDocumentToDataset(dataset.datasetId, document.documentId, actor);
    const secondDataset = await createRagDataset(
      { name: `dataset-${randomUUID()}` },
      actor,
    );
    await addDocumentToDataset(secondDataset.datasetId, document.documentId, actor);
    assert.equal(
      (await listDatasetDocuments(
        { datasetId: dataset.datasetId, withCount: true },
        actor,
      )).count,
      1,
    );
    assert.equal(
      (await listDatasetDocuments(
        { datasetId: secondDataset.datasetId, withCount: true },
        actor,
      )).count,
      1,
    );
    await waitFor(async () => {
      const [row] = await db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.document_id, document.documentId));
      return row?.status === 'ready' ? row : undefined;
    });
    const before = await readDocumentCounts();
    const rebuilt = await reprocessDocument(document.documentId, actor);
    await waitFor(async () => {
      const job = await getDocumentProcessingJob(rebuilt.jobId, actor);
      return job.status === 'completed' ? job : undefined;
    });
    const afterCounts = await readDocumentCounts();
    assert.deepEqual(afterCounts, before);
    await removeDocumentFromDataset(dataset.datasetId, document.documentId, actor);
    assert.equal(
      (await listDatasetDocuments(
        { datasetId: dataset.datasetId, withCount: true },
        actor,
      )).count,
      0,
    );
    assert.equal(
      (await listDatasetDocuments(
        { datasetId: secondDataset.datasetId, withCount: true },
        actor,
      )).count,
      1,
    );
  });
});

/** 插入无需读取对象内容的合成 verified 文件，用于安全降级矩阵测试。 */
async function insertSyntheticVerifiedFile(contentType: string, extension: string) {
  const fileId = randomUUID();
  const now = new Date();
  await db.insert(schema.files).values({
    file_id: fileId,
    tenant_id: actor.tenantId,
    filename: `synthetic.${extension}`,
    extension,
    declared_content_type: contentType,
    content_type: contentType,
    size: 1,
    sha256: '0'.repeat(64),
    bucket: 'agent-demo-integration',
    object_key: `integration/synthetic-${fileId}`,
    etag: null,
    status: 'verified',
    verified_timestamp: now,
    deleted_timestamp: null,
    create_user_id: actor.userId,
    create_timestamp: now,
    last_update_user_id: actor.userId,
    last_update_timestamp: now,
  });
  return fileId;
}

/** 查询文档幂等验证所需的版本、解析块与 Segment 数量。 */
async function readDocumentCounts() {
  const [[versions], [blocks], [segments]] = await Promise.all([
    db.select({ value: count() }).from(schema.document_versions),
    db.select({ value: count() }).from(schema.document_parsed_blocks),
    db.select({ value: count() }).from(schema.document_segments),
  ]);
  return {
    versions: versions?.value ?? 0,
    blocks: blocks?.value ?? 0,
    segments: segments?.value ?? 0,
  };
}
