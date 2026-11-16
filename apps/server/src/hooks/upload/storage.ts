import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ROOT } from '@/configs/index.js';
import { uploadConfig } from './config.js';

import type { Readable } from 'node:stream';
import type { UploadedPartInfo } from '@repo/types';

type ObjectReference = {
  bucket: string;
  objectKey: string;
};

type ContentObjectReference = ObjectReference & {
  contentType: string;
};

type MultipartObjectReference = ObjectReference & {
  uploadId: string;
};

const s3 = ROOT.storage.s3;
const clientConfig = {
  region: s3.region?.trim() || 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: s3.accessKey,
    secretAccessKey: s3.secretKey,
  },
};

/** 新对象写入的 Bucket。 */
export const bucket = s3.bucket;

const internalClient = new S3Client({
  ...clientConfig,
  endpoint: s3.internalEndpoint.trim().replace(/\/+$/, ''),
});

const signingClient = new S3Client({
  ...clientConfig,
  endpoint: s3.publicEndpoint.trim().replace(/\/+$/, ''),
});

/** 检查默认 Bucket 是否可访问。 */
export async function checkBucket() {
  await internalClient.send(new HeadBucketCommand({ Bucket: bucket }));
}

/** 创建 Multipart Upload，返回 uploadId。 */
export async function createMultipart(input: ContentObjectReference) {
  const result = await internalClient.send(
    new CreateMultipartUploadCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
    }),
  );
  if (!result.UploadId) {
    throw new Error('对象存储未返回 Multipart uploadId');
  }
  return result.UploadId;
}

/** 分页读取已上传分片，并按编号排序。 */
export async function listParts(input: MultipartObjectReference) {
  const parts: UploadedPartInfo[] = [];
  let marker: string | undefined;
  do {
    const result = await internalClient.send(
      new ListPartsCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        UploadId: input.uploadId,
        PartNumberMarker: marker,
      }),
    );
    for (const part of result.Parts ?? []) {
      if (!part.PartNumber || !part.ETag || part.Size === undefined) continue;
      parts.push({
        partNumber: part.PartNumber,
        etag: part.ETag,
        size: part.Size,
      });
    }
    marker = undefined;
    if (result.IsTruncated) {
      const nextMarker = String(result.NextPartNumberMarker ?? '');
      if (nextMarker) marker = nextMarker;
    }
  } while (marker);
  return parts.sort((left, right) => left.partNumber - right.partNumber);
}

/** 合并已核对的分片。 */
export async function completeMultipart(
  input: MultipartObjectReference & {
    parts: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[];
  },
) {
  await internalClient.send(
    new CompleteMultipartUploadCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: input.parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    }),
  );
}

/** 终止 Multipart。上传已不存在时视为已经终止。 */
export async function abortMultipart(input: MultipartObjectReference) {
  try {
    await internalClient.send(
      new AbortMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        UploadId: input.uploadId,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'NoSuchUpload') return;
    throw error;
  }
}

/** 读取对象元数据。 */
export async function head(input: ObjectReference) {
  return await internalClient.send(
    new HeadObjectCommand({ Bucket: input.bucket, Key: input.objectKey }),
  );
}

/** 打开新的对象读取流。 */
export async function open(input: ObjectReference) {
  const result = await internalClient.send(
    new GetObjectCommand({ Bucket: input.bucket, Key: input.objectKey }),
  );
  if (!result.Body || !('pipe' in result.Body)) {
    throw new Error('对象存储返回了不支持的响应流');
  }
  return result.Body as Readable;
}

/** 写入服务端已经收齐的内容。 */
export async function put(
  input: ContentObjectReference & { content: Buffer | Uint8Array },
) {
  await internalClient.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      Body: input.content,
    }),
  );
}

/** 把临时对象复制到最终位置，避免旧的上传地址覆盖已发布文件。 */
export async function copy(source: ObjectReference, target: ObjectReference) {
  const copySource = [source.bucket, ...source.objectKey.split('/')]
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  await internalClient.send(
    new CopyObjectCommand({
      Bucket: target.bucket,
      Key: target.objectKey,
      CopySource: copySource,
    }),
  );
}

/** 删除对象。对象不存在时 S3 也返回成功。 */
export async function remove(input: ObjectReference) {
  await internalClient.send(
    new DeleteObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
    }),
  );
}

/** 签发单对象上传地址。 */
export async function presignPut(input: ContentObjectReference) {
  return await getSignedUrl(
    signingClient,
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
    }),
    { expiresIn: uploadConfig.presignExpiresSeconds },
  );
}

/** 签发一个分片的上传地址。 */
export async function presignPart(
  input: MultipartObjectReference & { partNumber: number },
) {
  return await getSignedUrl(
    signingClient,
    new UploadPartCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      UploadId: input.uploadId,
      PartNumber: input.partNumber,
    }),
    { expiresIn: uploadConfig.presignExpiresSeconds },
  );
}

/** 签发短期读取地址。 */
export async function presignGet(
  input: ContentObjectReference & {
    filename: string;
    disposition: 'inline' | 'attachment';
    expiresInSeconds?: number;
  },
) {
  const fallbackName = encodeURIComponent(input.filename);
  const contentDisposition = `${input.disposition}; filename*=UTF-8''${fallbackName}`;
  const expiresInSeconds =
    input.expiresInSeconds ?? uploadConfig.presignExpiresSeconds;
  const url = await getSignedUrl(
    signingClient,
    new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: contentDisposition,
    }),
    { expiresIn: expiresInSeconds },
  );
  return {
    url,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}
