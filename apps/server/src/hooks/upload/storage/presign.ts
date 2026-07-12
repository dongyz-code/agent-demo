import {
  GetObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getUploadRuntimeConfig } from '@/configs/index.js';
import { getPublicSigningS3Client } from './client.js';

/** 签发普通单对象上传 URL。 */
export async function presignPutObject(body: {
  bucket: string;
  objectKey: string;
  contentType: string;
}): Promise<{ url: string; expiresAt: Date }> {
  const config = getUploadRuntimeConfig();
  const url = await getSignedUrl(
    getPublicSigningS3Client(),
    new PutObjectCommand({
      Bucket: body.bucket,
      Key: body.objectKey,
      ContentType: body.contentType,
    }),
    { expiresIn: config.presignExpiresSeconds },
  );
  return {
    url,
    expiresAt: new Date(Date.now() + config.presignExpiresSeconds * 1000),
  };
}

/** 签发指定 Multipart 分片 URL。 */
export async function presignUploadPart(body: {
  bucket: string;
  objectKey: string;
  uploadId: string;
  partNumber: number;
}): Promise<{ url: string; expiresAt: Date }> {
  const config = getUploadRuntimeConfig();
  const url = await getSignedUrl(
    getPublicSigningS3Client(),
    new UploadPartCommand({
      Bucket: body.bucket,
      Key: body.objectKey,
      UploadId: body.uploadId,
      PartNumber: body.partNumber,
    }),
    { expiresIn: config.presignExpiresSeconds },
  );
  return {
    url,
    expiresAt: new Date(Date.now() + config.presignExpiresSeconds * 1000),
  };
}

/** 签发短期文件读取 URL。 */
export async function presignGetObject(body: {
  bucket: string;
  objectKey: string;
  contentType: string;
  filename: string;
  disposition: 'inline' | 'attachment';
}): Promise<{ url: string; expiresAt: Date }> {
  const config = getUploadRuntimeConfig();
  const fallbackName = encodeURIComponent(body.filename);
  const contentDisposition = `${body.disposition}; filename*=UTF-8''${fallbackName}`;
  const url = await getSignedUrl(
    getPublicSigningS3Client(),
    new GetObjectCommand({
      Bucket: body.bucket,
      Key: body.objectKey,
      ResponseContentType: body.contentType,
      ResponseContentDisposition: contentDisposition,
    }),
    { expiresIn: config.presignExpiresSeconds },
  );
  return {
    url,
    expiresAt: new Date(Date.now() + config.presignExpiresSeconds * 1000),
  };
}
