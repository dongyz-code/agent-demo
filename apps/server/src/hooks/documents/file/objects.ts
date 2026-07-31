import { randomUUID } from 'node:crypto';
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
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ROOT } from '@/configs/index.js';
import { documentsConfig } from '../config.js';

import type { Readable } from 'node:stream';
import type { UploadedPartInfo } from '@repo/types';
import type { SupportedFileExtension } from '@repo/shared';

let internalClient: S3Client | undefined;
let publicSigningClient: S3Client | undefined;

/** S3 Multipart 最小分片大小。 */
const MIN_PART_SIZE = 5 * 1024 * 1024;
/** S3 Multipart 最大分片数量。 */
const MAX_PART_COUNT = 10_000;
/** 分片大小向上取整粒度，便于观察与运维。 */
const PART_SIZE_STEP = 1024 * 1024;

const illegalFilenameChars = /[<>:"/\\|?*]/g;
// eslint-disable-next-line no-control-regex -- 文件名清洗需要匹配 C0/C1 控制字符
const controlChars = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * 去除 Endpoint 尾部斜杠，保持 S3 签名使用的 Host 和 Path 一致。
 *
 * @param value 待规范化的 Endpoint。
 * @returns 不含尾部斜杠的 Endpoint。
 */
function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/** 返回服务端执行对象命令的内部 S3 客户端。 */
function getInternalS3Client(): S3Client {
  internalClient ??= createClient(ROOT.storage.s3.internalEndpoint);
  return internalClient;
}

/** 返回按浏览器可达 Endpoint 生成签名的 S3 客户端。 */
function getPublicSigningS3Client(): S3Client {
  publicSigningClient ??= createClient(ROOT.storage.s3.publicEndpoint);
  return publicSigningClient;
}

/**
 * 使用统一凭证和 path-style 规则创建 S3 客户端。
 *
 * @param endpoint 客户端访问的 S3 Endpoint。
 * @returns 完成连接参数配置的 S3 客户端。
 */
function createClient(endpoint: string): S3Client {
  const s3 = ROOT.storage.s3;
  return new S3Client({
    endpoint: normalizeEndpoint(endpoint),
    region: s3.region?.trim() || 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: s3.accessKey,
      secretAccessKey: s3.secretKey,
    },
  });
}

/**
 * 清洗仅用于展示和 Content-Disposition 的原始文件名。
 *
 * @param filename 客户端提交的文件名。
 * @returns 不包含路径分隔符和控制字符的文件名。
 */
export function sanitizeUploadFilename(filename: string): string {
  const normalized = filename
    .trim()
    .replace(illegalFilenameChars, '_')
    .replace(controlChars, '_');
  return normalized.slice(0, 255) || 'file';
}

/**
 * 构造服务端控制的不可猜测对象路径。
 *
 * @param fileId 通用文件标识。
 * @param extension 已规范化扩展名。
 * @param now 用于稳定生成日期分区的当前时间。
 * @returns 不依赖用户文件名的对象路径。
 */
export function buildObjectKey({
  fileId,
  extension,
  now,
}: {
  fileId: string;
  extension: SupportedFileExtension;
  now: Date;
}): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `files/${year}/${month}/${fileId}/${randomUUID()}.${extension}`;
}

/**
 * 根据文件大小计算符合 S3 上限的分片策略。
 *
 * @param fileSize 文件总字节数。
 * @param preferredPartSize 策略首选分片字节数。
 * @returns 分片大小和总数量。
 */
export function calculateMultipartPlan(
  fileSize: number,
  preferredPartSize: number,
): { partSize: number; partCount: number } {
  const minimumForCount = Math.ceil(fileSize / MAX_PART_COUNT);
  const required = Math.max(MIN_PART_SIZE, preferredPartSize, minimumForCount);
  const partSize = Math.ceil(required / PART_SIZE_STEP) * PART_SIZE_STEP;
  return {
    partSize,
    partCount: Math.ceil(fileSize / partSize),
  };
}

/** 创建 Multipart Upload 并返回 uploadId。 */
export async function createMultipartUpload(body: {
  bucket: string;
  objectKey: string;
  contentType: string;
}): Promise<string> {
  const result = await getInternalS3Client().send(
    new CreateMultipartUploadCommand({
      Bucket: body.bucket,
      Key: body.objectKey,
      ContentType: body.contentType,
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
}): Promise<void> {
  await getInternalS3Client().send(
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
}): Promise<void> {
  await getInternalS3Client().send(
    new PutObjectCommand({
      Bucket: body.bucket,
      Key: body.objectKey,
      ContentType: body.contentType,
      Body: body.content,
    }),
  );
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
  const config = ROOT.storage.s3;
  await getInternalS3Client().send(
    new HeadBucketCommand({ Bucket: config.bucket }),
  );
}

/**
 * 签发普通单对象上传 URL。
 *
 * @param body 对象位置和浏览器上传时必须使用的 MIME。
 * @returns 短期上传地址。
 */
export async function presignPutObject(body: {
  bucket: string;
  objectKey: string;
  contentType: string;
}): Promise<{ url: string }> {
  const config = documentsConfig.upload;
  const url = await getSignedUrl(
    getPublicSigningS3Client(),
    new PutObjectCommand({
      Bucket: body.bucket,
      Key: body.objectKey,
      ContentType: body.contentType,
    }),
    { expiresIn: config.presignExpiresSeconds },
  );
  return { url };
}

/**
 * 签发指定 Multipart 分片 URL。
 *
 * @param body 对象位置、Multipart 标识和分片编号。
 * @returns 短期分片上传地址。
 */
export async function presignUploadPart(body: {
  bucket: string;
  objectKey: string;
  uploadId: string;
  partNumber: number;
}): Promise<{ url: string }> {
  const config = documentsConfig.upload;
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
  return { url };
}

/**
 * 签发短期文件读取 URL。
 *
 * @param body 对象位置及响应使用的 MIME、文件名和下载方式。
 * @returns 短期读取地址及其失效时间。
 */
export async function presignGetObject(body: {
  bucket: string;
  objectKey: string;
  contentType: string;
  filename: string;
  disposition: 'inline' | 'attachment';
}): Promise<{ url: string; expiresAt: Date }> {
  const config = documentsConfig.upload;
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
