import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = process.env.MINIO_ENDPOINT ?? 'http://127.0.0.1:9000';
const bucket = process.env.MINIO_BUCKET ?? 'agent-demo-integration';
const client = new S3Client({
  endpoint,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin123',
  },
});

/** 确保集成测试使用的私有 Bucket 已存在。 */
async function ensureBucket() {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(name)) {
      throw error;
    }
  }
}

describe('本地 MinIO 对象协议', () => {
  it('支持预签名普通上传、Range 读取和删除', async () => {
    await ensureBucket();
    const key = `integration/single-${randomUUID()}.pdf`;
    const content = Buffer.from('%PDF-1.7\nrange-test-content');
    try {
      const putUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: 'application/pdf',
        }),
        { expiresIn: 60 },
      );
      const uploaded = await fetch(putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: content,
      });
      assert.equal(uploaded.ok, true);

      const getUrl = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 60 },
      );
      const range = await fetch(getUrl, { headers: { Range: 'bytes=0-7' } });
      assert.equal(range.status, 206);
      assert.equal(range.headers.get('content-range'), `bytes 0-7/${content.length}`);
      assert.equal(Buffer.from(await range.arrayBuffer()).toString(), '%PDF-1.7');
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  });

  it('支持 Multipart 分片签名、ListParts、完成和删除', async () => {
    await ensureBucket();
    const key = `integration/multipart-${randomUUID()}.bin`;
    const created = await client.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key }),
    );
    assert.ok(created.UploadId);
    const parts = [Buffer.alloc(5 * 1024 * 1024, 1), Buffer.from('last-part')];
    try {
      const completedParts = [];
      for (let index = 0; index < parts.length; index++) {
        const partNumber = index + 1;
        const url: string = await getSignedUrl(
          client,
          new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId: created.UploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: 60 },
        );
        const response: Response = await fetch(url, {
          method: 'PUT',
          body: parts[index],
        });
        assert.equal(response.ok, true);
        const etag = response.headers.get('etag');
        assert.ok(etag);
        completedParts.push({ PartNumber: partNumber, ETag: etag });
      }
      const listed = await client.send(
        new ListPartsCommand({
          Bucket: bucket,
          Key: key,
          UploadId: created.UploadId,
        }),
      );
      assert.equal(listed.Parts?.length, 2);
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: created.UploadId,
          MultipartUpload: { Parts: completedParts },
        }),
      );
      const getUrl = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 60 },
      );
      const range = await fetch(getUrl, { headers: { Range: 'bytes=5242880-' } });
      assert.equal(range.status, 206);
      assert.equal(Buffer.from(await range.arrayBuffer()).toString(), 'last-part');
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  });
});
