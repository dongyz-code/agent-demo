import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { ROOT } from '@/configs/index.js';
import { getInternalS3Client } from './client.js';

import type { Readable } from 'node:stream';
import type { UploadedPartInfo } from '@repo/types';

/** 创建 Multipart Upload 并返回 uploadId。 */
export async function createMultipartUpload(body: {
  bucket: string;
  objectKey: string;
  contentType: string;
  filename: string;
}): Promise<string> {
  const result = await getInternalS3Client().send(
    new CreateMultipartUploadCommand({
      Bucket: body.bucket,
      Key: body.objectKey,
      ContentType: body.contentType,
      Metadata: { filename: encodeURIComponent(body.filename) },
    }),
  );
  if (!result.UploadId) {
    throw new Error('对象存储未返回 Multipart uploadId');
  }
  return result.UploadId;
}

/** 分页读取 Multipart 已上传分片。 */
export async function listMultipartParts(body: {
  bucket: string;
  objectKey: string;
  uploadId: string;
}): Promise<UploadedPartInfo[]> {
  const parts: UploadedPartInfo[] = [];
  let marker: string | undefined;

  do {
    const result = await getInternalS3Client().send(
      new ListPartsCommand({
        Bucket: body.bucket,
        Key: body.objectKey,
        UploadId: body.uploadId,
        PartNumberMarker: marker,
      }),
    );
    for (const part of result.Parts ?? []) {
      if (!part.PartNumber || !part.ETag || part.Size === undefined) {
        continue;
      }
      parts.push({
        partNumber: part.PartNumber,
        etag: part.ETag,
        size: part.Size,
      });
    }
    marker = result.IsTruncated
      ? String(result.NextPartNumberMarker ?? '') || undefined
      : undefined;
  } while (marker);

  return parts.sort((left, right) => left.partNumber - right.partNumber);
}

/** 完成 Multipart 合并。 */
export async function completeMultipartUpload(body: {
  bucket: string;
  objectKey: string;
  uploadId: string;
  parts: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[];
}): Promise<string | undefined> {
  const result = await getInternalS3Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: body.bucket,
      Key: body.objectKey,
      UploadId: body.uploadId,
      MultipartUpload: {
        Parts: body.parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    }),
  );
  return result.ETag;
}

/** 终止尚未完成的 Multipart。 */
export async function abortMultipartUpload(body: {
  bucket: string;
  objectKey: string;
  uploadId: string;
}): Promise<void> {
  await getInternalS3Client().send(
    new AbortMultipartUploadCommand({
      Bucket: body.bucket,
      Key: body.objectKey,
      UploadId: body.uploadId,
    }),
  );
}

/** 获取对象元数据。 */
export async function headStoredObject(body: {
  bucket: string;
  objectKey: string;
}) {
  return await getInternalS3Client().send(
    new HeadObjectCommand({ Bucket: body.bucket, Key: body.objectKey }),
  );
}

/** 打开新的对象可读流。 */
export async function openStoredObject(body: {
  bucket: string;
  objectKey: string;
}): Promise<Readable> {
  const result = await getInternalS3Client().send(
    new GetObjectCommand({ Bucket: body.bucket, Key: body.objectKey }),
  );
  if (!result.Body || !('pipe' in result.Body)) {
    throw new Error('对象存储返回了不支持的响应流');
  }
  return result.Body as Readable;
}

/** 写入服务端生成的派生对象。 */
export async function putStoredObject(body: {
  bucket: string;
  objectKey: string;
  contentType: string;
  content: Buffer | Uint8Array | Readable;
}): Promise<string | undefined> {
  const result = await getInternalS3Client().send(
    new PutObjectCommand({
      Bucket: body.bucket,
      Key: body.objectKey,
      ContentType: body.contentType,
      Body: body.content,
    }),
  );
  return result.ETag;
}

/** 删除对象；对象不存在时由 S3 幂等返回成功。 */
export async function deleteStoredObject(body: {
  bucket: string;
  objectKey: string;
}): Promise<void> {
  await getInternalS3Client().send(
    new DeleteObjectCommand({ Bucket: body.bucket, Key: body.objectKey }),
  );
}

/** 检查配置 Bucket 是否可访问。 */
export async function checkUploadBucket(): Promise<void> {
  const config = ROOT.upload;
  await getInternalS3Client().send(
    new HeadBucketCommand({ Bucket: config.bucket }),
  );
}
