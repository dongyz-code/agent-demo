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

/** 对象在存储中的稳定位置。 */
interface ObjectReference {
  /** 对象所在 Bucket。 */
  bucket: string;
  /** Bucket 内的对象路径。 */
  objectKey: string;
}

/** 带 MIME 声明的对象位置。 */
interface ContentObjectReference extends ObjectReference {
  /** 对象写入或响应时使用的 MIME。 */
  contentType: string;
}

/** Multipart 上传对象位置。 */
interface MultipartObjectReference extends ObjectReference {
  /** S3 创建 Multipart Upload 后返回的标识。 */
  uploadId: string;
}

/** 指定 Multipart 分片的位置。 */
interface MultipartPartReference extends MultipartObjectReference {
  /** 从 1 开始的分片编号。 */
  partNumber: number;
}

/** 完成 Multipart 合并所需的信息。 */
interface CompleteMultipartInput extends MultipartObjectReference {
  /** 按分片编号排序的已上传分片。 */
  parts: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[];
}

/** 服务端写入对象所需的信息。 */
interface PutObjectInput extends ContentObjectReference {
  /** 待写入的完整内容或可读流。 */
  content: Buffer | Uint8Array | Readable;
}

/** 签发对象读取地址所需的信息。 */
interface PresignGetInput extends ContentObjectReference {
  /** Content-Disposition 使用的下载文件名。 */
  filename: string;
  /** 浏览器以内联或附件方式处理响应。 */
  disposition: 'inline' | 'attachment';
  /** 可选签名有效秒数；外部异步任务可覆盖默认浏览器下载时长。 */
  expiresInSeconds?: number;
}

/**
 * documents 域使用的 S3 对象存储适配器。
 *
 * 该类只封装 S3 客户端状态、对象命令和预签名，不负责文件名清洗、
 * 对象路径生成、分片方案计算或上传会话状态迁移。
 */
class S3ObjectStorage {
  /** 新对象默认写入的 Bucket。 */
  readonly bucket: string;

  /** 服务端执行对象命令使用的内部客户端。 */
  private readonly internalClient: S3Client;

  /** 使用浏览器可达 Endpoint 生成签名的客户端。 */
  private readonly signingClient: S3Client;

  /** 预签名地址有效秒数。 */
  private readonly presignExpiresSeconds: number;

  /**
   * 创建固定配置的对象存储适配器。
   *
   * @param config S3 连接、凭证和默认 Bucket 配置。
   * @param presignExpiresSeconds 预签名地址有效秒数。
   */
  constructor(
    config: typeof ROOT.storage.s3,
    presignExpiresSeconds: number,
  ) {
    const clientConfig = {
      region: config.region?.trim() || 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    };
    this.bucket = config.bucket;
    this.presignExpiresSeconds = presignExpiresSeconds;
    this.internalClient = new S3Client({
      ...clientConfig,
      endpoint: config.internalEndpoint.trim().replace(/\/+$/, ''),
    });
    this.signingClient = new S3Client({
      ...clientConfig,
      endpoint: config.publicEndpoint.trim().replace(/\/+$/, ''),
    });
  }

  /**
   * 检查默认 Bucket 是否可访问。
   *
   * @returns Bucket 可访问时完成。
   */
  async checkBucket(): Promise<void> {
    await this.internalClient.send(
      new HeadBucketCommand({ Bucket: this.bucket }),
    );
  }

  /**
   * 创建 Multipart Upload。
   *
   * @param input 对象位置和上传 MIME。
   * @returns S3 返回的 Multipart uploadId。
   */
  async createMultipart(input: ContentObjectReference): Promise<string> {
    const result = await this.internalClient.send(
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

  /**
   * 分页读取 Multipart 已上传分片。
   *
   * @param input 对象位置和 Multipart uploadId。
   * @returns 按分片编号升序排列的有效分片。
   */
  async listParts(input: MultipartObjectReference): Promise<UploadedPartInfo[]> {
    const parts: UploadedPartInfo[] = [];
    let marker: string | undefined;

    do {
      const result = await this.internalClient.send(
        new ListPartsCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          UploadId: input.uploadId,
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
      marker = undefined;
      if (result.IsTruncated) {
        const nextMarker = String(result.NextPartNumberMarker ?? '');
        if (nextMarker) marker = nextMarker;
      }
    } while (marker);

    return parts.sort((left, right) => left.partNumber - right.partNumber);
  }

  /**
   * 完成 Multipart 合并。
   *
   * @param input 对象位置、uploadId 和已验证分片。
   * @returns 合并完成时无返回值。
   */
  async completeMultipart(input: CompleteMultipartInput): Promise<void> {
    await this.internalClient.send(
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

  /**
   * 终止尚未完成的 Multipart Upload。
   *
   * @param input 对象位置和 Multipart uploadId。
   * @returns 终止完成时无返回值。
   */
  async abortMultipart(input: MultipartObjectReference): Promise<void> {
    await this.internalClient.send(
      new AbortMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        UploadId: input.uploadId,
      }),
    );
  }

  /**
   * 获取对象元数据。
   *
   * @param input 对象位置。
   * @returns S3 对象元数据。
   */
  async head(input: ObjectReference) {
    return await this.internalClient.send(
      new HeadObjectCommand({ Bucket: input.bucket, Key: input.objectKey }),
    );
  }

  /**
   * 打开新的对象可读流。
   *
   * @param input 对象位置。
   * @returns Node.js 可读流。
   */
  async open(input: ObjectReference): Promise<Readable> {
    const result = await this.internalClient.send(
      new GetObjectCommand({ Bucket: input.bucket, Key: input.objectKey }),
    );
    if (!result.Body || !('pipe' in result.Body)) {
      throw new Error('对象存储返回了不支持的响应流');
    }
    return result.Body as Readable;
  }

  /**
   * 写入服务端生成的对象。
   *
   * @param input 对象位置、MIME 和完整内容。
   * @returns 写入完成时无返回值。
   */
  async put(input: PutObjectInput): Promise<void> {
    await this.internalClient.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
        Body: input.content,
      }),
    );
  }

  /**
   * 删除对象；对象不存在时由 S3 幂等返回成功。
   *
   * @param input 对象位置。
   * @returns 删除完成时无返回值。
   */
  async remove(input: ObjectReference): Promise<void> {
    await this.internalClient.send(
      new DeleteObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
      }),
    );
  }

  /**
   * 签发普通单对象上传地址。
   *
   * @param input 对象位置和浏览器上传时必须使用的 MIME。
   * @returns 短期上传地址。
   */
  async presignPut(input: ContentObjectReference): Promise<string> {
    return await getSignedUrl(
      this.signingClient,
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
      }),
      { expiresIn: this.presignExpiresSeconds },
    );
  }

  /**
   * 签发指定 Multipart 分片上传地址。
   *
   * @param input 对象位置、uploadId 和分片编号。
   * @returns 短期分片上传地址。
   */
  async presignPart(input: MultipartPartReference): Promise<string> {
    return await getSignedUrl(
      this.signingClient,
      new UploadPartCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
      }),
      { expiresIn: this.presignExpiresSeconds },
    );
  }

  /**
   * 签发短期对象读取地址。
   *
   * @param input 对象位置、响应 MIME、文件名和下载方式。
   * @returns 短期读取地址及其失效时间。
   */
  async presignGet(
    input: PresignGetInput,
  ): Promise<{ url: string; expiresAt: Date }> {
    const fallbackName = encodeURIComponent(input.filename);
    const contentDisposition = `${input.disposition}; filename*=UTF-8''${fallbackName}`;
    const expiresInSeconds =
      input.expiresInSeconds ?? this.presignExpiresSeconds;
    const url = await getSignedUrl(
      this.signingClient,
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
}

/** documents 域共享的对象存储实例。 */
export const objectStorage = new S3ObjectStorage(
  ROOT.storage.s3,
  documentsConfig.upload.presignExpiresSeconds,
);
