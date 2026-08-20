import { randomUUID } from 'node:crypto';
import { eq, inArray, ne } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';

import { logger, ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import { contentTypesByExtension, getFileExtension } from '@repo/shared';
import { documentsConfig } from './config.js';
import { documentAction } from './document-action.js';
import { documentFile } from './file/index.js';

import type { SupportedFileExtension } from '@repo/shared';
import type { Upload, UploadMode, UploadSessionStatus } from '@repo/types';

/** S3 Multipart 最小分片大小。 */
const MIN_MULTIPART_PART_SIZE = 5 * 1024 * 1024;
/** S3 Multipart 最大分片数量。 */
const MAX_MULTIPART_PART_COUNT = 10_000;
/** 分片大小向上取整粒度，便于观察与运维。 */
const MULTIPART_PART_SIZE_STEP = 1024 * 1024;

/** 文件名中不允许保留的路径分隔符和跨平台特殊字符。 */
const illegalFilenameChars = /[<>:"/\\|?*]/g;
// eslint-disable-next-line no-control-regex -- 文件名清洗需要匹配 C0/C1 控制字符
const controlChars = /[\u0000-\u001F\u007F-\u009F]/g;

/** 后端确定并持久化的 Multipart 分片方案。 */
interface MultipartPlan {
  /** 每个非末尾分片的目标字节数。 */
  partSize: number;
  /** 文件按目标大小切分后的分片总数。 */
  partCount: number;
}

/** 文件签名检测读取的最大前缀。
 *
 * OOXML（docx/pptx/xlsx）本质是 zip，file-type 需顺序读取 zip 内
 * [Content_Types].xml 才能判定具体子类型。该条目体积或偏移会随生成工具
 * 变化（如 WPS 保存的 pptx 常超出 8 KiB），前缀不足时 file-type 退化为
 * application/zip，与声明的 OOXML MIME 不匹配导致上传被拒。放大到 1 MiB
 * 覆盖常见 OOXML 的 [Content_Types].xml 完整读取。 */
const MAGIC_PREFIX_BYTES = 1024 * 1024;

/** 文件内容验证器输入。 */
interface FileValidationInput {
  /** 文件前缀字节。 */
  prefix: Buffer;
  /** 用户上传时提供的文件名，用于约束签名识别范围。 */
  filename: string;
  /** 初始化时声明的 MIME。 */
  declaredContentType: string;
}

/** 允许继续签名、恢复或完成对象上传的会话状态。 */
const transferableStatuses = new Set<UploadSessionStatus>([
  'initialized',
  'uploading',
]);

/**
 * 文档上传业务动作及其内部状态机辅助方法。
 *
 * 对象存储和文件流读取作为底层适配器保留在类外部模块。
 */
class UploadAction {
  /**
   * 初始化文档的普通或 Multipart 上传流程。
   *
   * @param input 客户端上传声明、文档意图和幂等信息。
   * @param userId 当前操作用户，用于文档范围与上传会话所有权。
   * @returns 普通上传签名或 Multipart 会话描述。
   */
  async initialize(
    input: Upload['init']['body'],
    userId: string,
  ): Promise<Upload['init']['resp']> {
    if (input.documentId) {
      await this.assertUploadTargetDocument(input.documentId, userId);
    }
    const filename = this.sanitizeUploadFilename(input.filename);
    const extension = getFileExtension(filename);
    if (!Number.isSafeInteger(input.size) || input.size <= 0) {
      throw new ROOT_ERROR('文件上传: 文件不能为空');
    }
    if (input.size > documentsConfig.upload.maxFileSizeBytes) {
      throw new ROOT_ERROR('文件上传: 文件大小超过限制');
    }
    if (!extension) {
      throw new ROOT_ERROR('文件上传: 文件类型不受支持');
    }
    const contentType = contentTypesByExtension[extension];
    if (!contentType.mime.includes(input.contentType)) {
      throw new ROOT_ERROR('文件上传: 文件类型不受支持');
    }

    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.file_upload_sessions.create_user_id, userId),
        eq(schemas.file_upload_sessions.idempotency_key, input.idempotencyKey),
      );
    });
    const [existing] = await db
      .select()
      .from(schemas.file_upload_sessions)
      .where(where)
      .limit(1);
    if (existing) {
      return await this.buildInitResponse(existing);
    }

    const now = new Date();
    const fileId = randomUUID();
    const sessionId = randomUUID();
    const objectKey = this.buildObjectKey({ fileId, extension, now });
    const bucket = documentFile.bucket;
    let mode: UploadMode = 'single';
    let multipart: MultipartPlan | undefined;
    if (input.size >= documentsConfig.upload.multipartThresholdBytes) {
      mode = 'multipart';
      multipart = this.calculateMultipartPlan(
        input.size,
        documentsConfig.upload.partSizeBytes,
      );
    }
    let uploadId: string | undefined;
    if (mode === 'multipart') {
      uploadId = await documentFile.createMultipart({
        bucket,
        objectKey,
        contentType: input.contentType,
      });
    }

    let created: typeof schemas.file_upload_sessions.$inferSelect;
    try {
      created = await db.transaction(async (tx) => {
        await tx.insert(schemas.files).values({
          file_id: fileId,
          filename,
          extension,
          declared_content_type: input.contentType,
          content_type: null,
          size: input.size,
          bucket,
          object_key: objectKey,
          status: 'pending',
          create_user_id: userId,
          create_timestamp: now,
          last_update_user_id: userId,
          last_update_timestamp: now,
        });
        const [session] = await tx
          .insert(schemas.file_upload_sessions)
          .values({
            session_id: sessionId,
            file_id: fileId,
            document_id: input.documentId ?? null,
            idempotency_key: input.idempotencyKey,
            mode,
            upload_id: uploadId ?? null,
            part_size: multipart?.partSize ?? null,
            part_count: multipart?.partCount ?? null,
            status: 'initialized',
            expire_timestamp: new Date(
              now.getTime() +
                documentsConfig.upload.sessionExpiresSeconds * 1000,
            ),
            create_user_id: userId,
            create_timestamp: now,
            last_update_user_id: userId,
            last_update_timestamp: now,
          })
          .returning();
        if (!session) throw new Error('上传会话创建后无法读取');
        return session;
      });
    } catch (error) {
      if (uploadId) {
        await documentFile
          .abortMultipart({
            bucket,
            objectKey,
            uploadId,
          })
          .catch(() => undefined);
      }
      throw error;
    }

    return await this.buildInitResponse(created);
  }

  /**
   * 校验上传新版本的目标文档存在且属于当前用户。
   *
   * @param documentId 目标文档标识。
   * @param userId 当前操作用户，用于限制文档范围。
   * @returns 校验通过时无返回值。
   */
  private async assertUploadTargetDocument(
    documentId: string,
    userId: string,
  ): Promise<void> {
    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.documents.document_id, documentId),
        eq(schemas.documents.create_user_id, userId),
        ne(schemas.documents.status, 'deleted'),
      );
    });
    const [document] = await db
      .select({ id: schemas.documents.document_id })
      .from(schemas.documents)
      .where(where)
      .limit(1);
    if (!document) {
      throw new ROOT_ERROR('相关文件不存在');
    }
  }

  /** 根据现有上传会话重建初始化响应与短期签名。 */
  private async buildInitResponse(
    session: typeof schemas.file_upload_sessions.$inferSelect,
  ): Promise<Upload['init']['resp']> {
    if (session.status === 'completed') {
      return {
        mode: 'completed',
        sessionId: session.session_id,
      };
    }
    if (session.expire_timestamp.getTime() <= Date.now()) {
      throw new ROOT_ERROR('文件上传: 上传会话已过期，请重新选择文件');
    }
    if (session.status === 'completing') {
      throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
    }
    if (['failed', 'canceled', 'expired'].includes(session.status)) {
      throw new ROOT_ERROR('文件上传: 上传会话已结束，请重新选择文件');
    }
    const file = await documentFile.getStored(session.file_id);
    if (session.mode === 'single') {
      const uploadUrl = await documentFile.presignPut({
        bucket: file.bucket,
        objectKey: file.object_key,
        contentType: file.declared_content_type,
      });
      return {
        mode: 'single',
        sessionId: session.session_id,
        uploadUrl,
        headers: { 'Content-Type': file.declared_content_type },
      };
    }
    if (!session.upload_id || !session.part_size || !session.part_count) {
      throw new Error('Multipart 会话缺少必要字段');
    }
    return {
      mode: 'multipart',
      sessionId: session.session_id,
      partSize: session.part_size,
    };
  }

  /**
   * 清洗仅用于展示和 Content-Disposition 的原始文件名。
   *
   * @param filename 客户端提交的文件名。
   * @returns 不包含路径分隔符和控制字符的文件名。
   */
  private sanitizeUploadFilename(filename: string): string {
    const normalized = filename
      .trim()
      .replace(illegalFilenameChars, '_')
      .replace(controlChars, '_');
    return normalized.slice(0, 255) || 'file';
  }

  /**
   * 构造服务端控制的不可猜测对象路径。
   *
   * @param input 文件标识、扩展名和日期分区时间。
   * @returns 不依赖用户文件名的对象路径。
   */
  private buildObjectKey(input: {
    /** 通用文件稳定标识。 */
    fileId: string;
    /** 已规范化的文件扩展名。 */
    extension: SupportedFileExtension;
    /** 用于生成日期分区的当前时间。 */
    now: Date;
  }): string {
    const year = String(input.now.getUTCFullYear());
    const month = String(input.now.getUTCMonth() + 1).padStart(2, '0');
    return `files/${year}/${month}/${input.fileId}/${randomUUID()}.${input.extension}`;
  }

  /**
   * 根据文件大小计算符合 S3 限制的分片方案。
   *
   * @param fileSize 文件总字节数。
   * @param preferredPartSize 首选分片字节数。
   * @returns 需要持久化并返回前端的分片大小和数量。
   */
  private calculateMultipartPlan(
    fileSize: number,
    preferredPartSize: number,
  ): MultipartPlan {
    const minimumForCount = Math.ceil(fileSize / MAX_MULTIPART_PART_COUNT);
    const required = Math.max(
      MIN_MULTIPART_PART_SIZE,
      preferredPartSize,
      minimumForCount,
    );
    const partSize =
      Math.ceil(required / MULTIPART_PART_SIZE_STEP) * MULTIPART_PART_SIZE_STEP;
    return {
      partSize,
      partCount: Math.ceil(fileSize / partSize),
    };
  }

  /**
   * 完成对象上传、创建文档版本并触发独立预览任务。
   *
   * @param input 上传会话标识。
   * @param userId 当前操作用户，用于会话所有权、文档范围和审计。
   * @returns 新建或复用的文档版本结果。
   */
  async complete(
    input: Upload['complete']['body'],
    userId: string,
  ): Promise<Upload['complete']['resp']> {
    const session = await this.getOwnedUploadSession(input.sessionId, userId);
    const file = await this.finishUpload(session, userId);
    const binding = await documentAction.createVersionFromFile(
      {
        fileId: file.file_id,
        documentId: session.document_id ?? undefined,
        name: file.filename,
        ragEnabled: false,
      },
      userId,
    );
    try {
      await documentAction.addDocumentTask(
        {
          documentId: binding.document.documentId,
          documentVersionId: binding.documentVersionId,
          operations: ['preview'],
          triggerSource: 'upload',
        },
        userId,
      );
    } catch (error) {
      let message = '预览任务创建失败';
      if (error instanceof Error) message = error.message;
      await db
        .update(schemas.document_versions)
        .set({
          preview_status: 'failed',
          preview_error: message,
          last_update_user_id: userId,
          last_update_timestamp: new Date(),
        })
        .where(
          eq(
            schemas.document_versions.document_version_id,
            binding.documentVersionId,
          ),
        )
        .catch(() => undefined);
      logger.error(
        {
          event: 'documents.upload.preview_schedule_failed',
          documentId: binding.document.documentId,
          documentVersionId: binding.documentVersionId,
          error,
        },
        '文档已入库，但预览任务创建失败',
      );
    }
    return {
      documentId: binding.document.documentId,
      documentVersionId: binding.documentVersionId,
      version: binding.version,
      created: binding.created,
    };
  }

  /** 幂等完成上传并返回已验证源文件行。 */
  private async finishUpload(
    session: typeof schemas.file_upload_sessions.$inferSelect,
    userId: string,
  ) {
    if (session.status === 'completed') {
      return await documentFile.getStored(session.file_id);
    }
    if (session.status === 'completing') {
      throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
    }
    this.assertTransferableUploadSession(session);

    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.file_upload_sessions.session_id, session.session_id),
        inArray(schemas.file_upload_sessions.status, [
          'initialized',
          'uploading',
        ]),
      );
    });
    const [claimed] = await db
      .update(schemas.file_upload_sessions)
      .set({
        status: 'completing',
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(where)
      .returning();
    if (!claimed) {
      throw new ROOT_ERROR('数据异常');
    }

    const file = await documentFile.getStored(session.file_id);
    try {
      if (session.mode === 'multipart') {
        if (!session.upload_id || !session.part_count) {
          throw new ROOT_ERROR('非法参数');
        }
        const actualParts = await documentFile.listParts({
          bucket: file.bucket,
          objectKey: file.object_key,
          uploadId: session.upload_id,
        });
        const hasInvalidPart = actualParts.some(
          (part, index) => part.partNumber !== index + 1,
        );
        if (actualParts.length !== session.part_count || hasInvalidPart) {
          throw new ROOT_ERROR('非法参数');
        }
        await documentFile.completeMultipart({
          bucket: file.bucket,
          objectKey: file.object_key,
          uploadId: session.upload_id,
          parts: actualParts,
        });
      }

      const verified = await this.validateStoredFile(file, session, userId);
      await db
        .update(schemas.file_upload_sessions)
        .set({
          status: 'completed',
          last_update_user_id: userId,
          last_update_timestamp: new Date(),
        })
        .where(eq(schemas.file_upload_sessions.session_id, session.session_id));
      return verified;
    } catch (error) {
      await db
        .update(schemas.file_upload_sessions)
        .set({
          status: 'failed',
          last_update_user_id: userId,
          last_update_timestamp: new Date(),
        })
        .where(eq(schemas.file_upload_sessions.session_id, session.session_id));
      throw error;
    }
  }

  /** 验证上传完成后的对象并写入可信文件信息。 */
  private async validateStoredFile(
    file: typeof schemas.files.$inferSelect,
    session: typeof schemas.file_upload_sessions.$inferSelect,
    userId: string,
  ) {
    try {
      const head = await documentFile.head({
        bucket: file.bucket,
        objectKey: file.object_key,
      });
      if (head.ContentLength !== file.size) {
        throw new ROOT_ERROR('文件上传: 对象大小不匹配');
      }

      const prefix = await this.readObjectPrefix({
        bucket: file.bucket,
        objectKey: file.object_key,
        limit: MAGIC_PREFIX_BYTES,
      });
      const trustedContentType = await this.detectTrustedContentType({
        prefix,
        filename: file.filename,
        declaredContentType: file.declared_content_type,
      });
      if (!trustedContentType) {
        throw new ROOT_ERROR('文件上传: 文件内容与声明类型不匹配');
      }

      const now = new Date();
      const [updated] = await db
        .update(schemas.files)
        .set({
          content_type: trustedContentType,
          status: 'verified',
          last_update_user_id: userId,
          last_update_timestamp: now,
        })
        .where(eq(schemas.files.file_id, file.file_id))
        .returning();
      if (!updated) throw new Error('文件验证结果写入失败');
      return updated;
    } catch (error) {
      await db
        .update(schemas.files)
        .set({
          status: 'rejected',
          last_update_user_id: userId,
          last_update_timestamp: new Date(),
        })
        .where(eq(schemas.files.file_id, file.file_id));
      throw error;
    }
  }

  /** 读取对象前缀，达到上限后主动结束当前流。 */
  private async readObjectPrefix({
    bucket,
    objectKey,
    limit,
  }: {
    bucket: string;
    objectKey: string;
    limit: number;
  }) {
    const stream = await documentFile.open({ bucket, objectKey });
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = limit - total;
      chunks.push(buffer.subarray(0, remaining));
      total += Math.min(buffer.length, remaining);
      if (total >= limit) {
        stream.destroy();
        break;
      }
    }
    return Buffer.concat(chunks);
  }

  /**
   * 使用文件签名识别可信 MIME。
   *
   * 文本格式通常没有稳定 Magic Number，仅允许受策略约束的 text 声明回退。
   *
   * @param input 文件前缀与客户端声明 MIME。
   * @returns 二进制签名识别结果、允许的文本回退或空。
   */
  private async detectTrustedContentType(input: FileValidationInput) {
    const extension = getFileExtension(input.filename);
    if (!extension) return undefined;
    const contentType = contentTypesByExtension[extension];

    const detected = await fileTypeFromBuffer(input.prefix);
    if (detected?.mime) {
      if (!contentType.mime.includes(detected.mime)) return undefined;
      return contentType.mime[0];
    }
    if (contentType.type !== 'text') return undefined;
    if (!contentType.mime.includes(input.declaredContentType)) {
      return undefined;
    }
    return contentType.mime[0];
  }

  /**
   * 为上传会话的指定 Multipart 分片签发短期地址。
   *
   * @param input 上传会话与需要签名的分片编号。
   * @param userId 当前操作用户，用于校验会话所有权。
   * @returns 短期上传地址。
   */
  async signParts(
    input: Upload['sign-parts']['body'],
    userId: string,
  ): Promise<Upload['sign-parts']['resp']> {
    const session = await this.getOwnedUploadSession(input.sessionId, userId);
    this.assertTransferableUploadSession(session);
    if (
      session.mode !== 'multipart' ||
      !session.upload_id ||
      !session.part_count
    ) {
      throw new ROOT_ERROR('非法参数');
    }
    if (
      !Number.isInteger(input.partNumber) ||
      input.partNumber < 1 ||
      input.partNumber > session.part_count
    ) {
      throw new ROOT_ERROR('非法参数');
    }
    const file = await documentFile.getStored(session.file_id);
    const uploadUrl = await documentFile.presignPart({
      bucket: file.bucket,
      objectKey: file.object_key,
      uploadId: session.upload_id,
      partNumber: input.partNumber,
    });
    return { uploadUrl };
  }

  /**
   * 从对象存储同步 Multipart 已完成分片与会话进度。
   *
   * @param sessionId 上传会话标识。
   * @param userId 当前操作用户，用于会话所有权和审计。
   * @returns 对象存储已接收的分片。
   */
  async syncParts(
    sessionId: string,
    userId: string,
  ): Promise<Upload['list-parts']['resp']> {
    const session = await this.getOwnedUploadSession(sessionId, userId);
    this.assertTransferableUploadSession(session);
    if (
      session.mode !== 'multipart' ||
      !session.upload_id ||
      !session.part_count
    ) {
      return { parts: [] };
    }
    const file = await documentFile.getStored(session.file_id);
    const parts = await documentFile.listParts({
      bucket: file.bucket,
      objectKey: file.object_key,
      uploadId: session.upload_id,
    });
    const now = new Date();
    await db
      .update(schemas.file_upload_sessions)
      .set({
        status: 'uploading',
        last_update_user_id: userId,
        last_update_timestamp: now,
      })
      .where(eq(schemas.file_upload_sessions.session_id, session.session_id));
    return { parts };
  }

  /**
   * 取消未完成的上传会话并终止对应 Multipart 对象。
   *
   * @param sessionId 上传会话标识。
   * @param userId 当前操作用户，用于会话所有权和审计。
   * @returns 取消完成或会话已处于取消终态时返回固定成功值。
   */
  async abort(sessionId: string, userId: string): Promise<'ok'> {
    const session = await this.getOwnedUploadSession(sessionId, userId);
    if (['canceled', 'expired'].includes(session.status)) return 'ok';
    if (session.status === 'completed') {
      throw new ROOT_ERROR('数据异常');
    }
    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.file_upload_sessions.session_id, sessionId),
        inArray(schemas.file_upload_sessions.status, [
          'initialized',
          'uploading',
          'failed',
        ]),
      );
    });
    const [claimed] = await db
      .update(schemas.file_upload_sessions)
      .set({
        status: 'canceled',
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(where)
      .returning({ id: schemas.file_upload_sessions.session_id });
    if (!claimed) {
      throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
    }
    const file = await documentFile.getStored(session.file_id);
    if (session.mode === 'multipart' && session.upload_id) {
      await documentFile.abortMultipart({
        bucket: file.bucket,
        objectKey: file.object_key,
        uploadId: session.upload_id,
      });
    }
    return 'ok';
  }

  /**
   * 查询调用者拥有的上传会话。
   *
   * @param sessionId 上传会话标识。
   * @param userId 当前操作用户，用于限制会话所有权。
   * @returns 上传会话数据库行。
   */
  private async getOwnedUploadSession(sessionId: string, userId: string) {
    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.file_upload_sessions.session_id, sessionId),
        eq(schemas.file_upload_sessions.create_user_id, userId),
      );
    });
    const [session] = await db
      .select()
      .from(schemas.file_upload_sessions)
      .where(where)
      .limit(1);
    if (!session) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    return session;
  }

  /**
   * 校验会话当前允许继续执行对象传输操作。
   *
   * @param session 上传会话数据库行。
   * @returns 校验通过时无返回值。
   */
  private assertTransferableUploadSession(
    session: typeof schemas.file_upload_sessions.$inferSelect,
  ): void {
    if (session.expire_timestamp.getTime() <= Date.now()) {
      throw new ROOT_ERROR('文件上传: 上传会话已过期，请重新选择文件');
    }
    if (!transferableStatuses.has(session.status)) {
      if (session.status === 'completing') {
        throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
      }
      throw new ROOT_ERROR('文件上传: 上传会话已结束，请重新选择文件');
    }
  }

  /**
   * 查询当前用户持有的上传会话状态。
   *
   * @param sessionId 上传会话标识。
   * @param userId 当前操作用户，用于限制会话所有权。
   * @returns 仅包含公共上传状态的响应。
   */
  async getStatus(sessionId: string, userId: string) {
    const session = await this.getOwnedUploadSession(sessionId, userId);
    return { status: session.status };
  }
}

/** 服务端唯一的文档上传动作实例。 */
export const uploadAction = new UploadAction();
