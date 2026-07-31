import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import GoldenRetriever from '@uppy/golden-retriever';

import { api } from '@/utils';
import { getUploadErrorMessage } from './utils';
import { getClientUploadPolicy, resolveDeclaredContentType } from './policies';

import type { UppyFile } from '@uppy/core';
import type {
  UploadFileMeta,
  UploadResponseBody,
  UploaderOptions,
} from './types';

type ManagedFile = UppyFile<UploadFileMeta, UploadResponseBody>;

/** 不允许对同一文件直接重试的可信验证错误片段。 */
const NON_RETRYABLE_ERROR_PARTS = [
  '文件不能为空',
  '文件大小超过限制',
  '文件类型不受支持',
  '对象大小不匹配',
  '文件内容与声明类型不匹配',
];

/** 需要创建新上传尝试而不能复用旧 session 的错误片段。 */
const RESTART_REQUIRED_ERROR_PARTS = [
  '上传会话已过期',
  '上传会话已结束',
];

/** 创建使用项目文档上传接口的 Uppy 实例和队列操作。 */
export function createUploadUppy(options: UploaderOptions) {
  const policy = getClientUploadPolicy(options.policyKey);
  const uploaderId = [
    'agent-demo-upload',
    options.instanceKey,
    options.policyKey,
  ].join('-');
  const uppy = new Uppy<UploadFileMeta, UploadResponseBody>({
    id: uploaderId,
    autoProceed: false,
    allowMultipleUploadBatches: true,
    restrictions: {
      maxFileSize: policy.maxFileSizeBytes,
      maxNumberOfFiles: options.maxNumberOfFiles,
      allowedFileTypes: [...policy.allowedExtensions].map(
        (extension) => `.${extension}`,
      ),
    },
  });

  uppy.use(GoldenRetriever<UploadFileMeta, UploadResponseBody>, {
    expires: 24 * 60 * 60 * 1000,
    serviceWorker: false,
    indexedDB: { name: uploaderId },
  });

  /** 上传前初始化或刷新会话，并处理 completed 会话恢复。 */
  const initializeFiles = async (fileIds: string[]) => {
    await Promise.all(fileIds.map((fileId) => initializeFile(fileId)));
  };
  uppy.addPreProcessor(initializeFiles);

  uppy.use(AwsS3<UploadFileMeta, UploadResponseBody>, {
    shouldUseMultipart(file) {
      return file.meta.mode === 'multipart';
    },
    getChunkSize(file) {
      return (file as ManagedFile).meta.partSize ?? 5 * 1024 * 1024;
    },
    async getUploadParameters(file) {
      assertInitialized(file);
      return {
        method: 'PUT',
        url: file.meta.uploadUrl!,
        headers: file.meta.uploadHeaders,
      };
    },
    async createMultipartUpload(file) {
      assertInitialized(file);
      return {
        key: file.meta.sessionId!,
        uploadId: file.meta.sessionId!,
      };
    },
    async listParts(_file, upload) {
      const result = await api('/documents/upload-list-parts', {
        sessionId: upload.key,
      });
      return result.parts.map((part) => ({
        PartNumber: part.partNumber,
        ETag: part.etag,
        Size: part.size,
      }));
    },
    async signPart(_file, upload) {
      const result = await api('/documents/upload-sign-parts', {
        sessionId: upload.key,
        partNumber: upload.partNumber,
      });
      return { method: 'PUT', url: result.uploadUrl };
    },
    async completeMultipartUpload(file, upload) {
      setFileStage(file.id, 'confirming');
      const storedFile = await completeUploadAndNotify(file, upload.key);
      return { location: '', file: storedFile };
    },
    async abortMultipartUpload(_file, upload) {
      await api('/documents/upload-abort', { sessionId: upload.key });
    },
  });

  /** 普通 PutObject 完成后在 Uppy 成功前执行可信验证和文档绑定。 */
  const completeSingleUploads = async (fileIds: string[]) => {
    await Promise.all(
      fileIds.map(async (fileId) => {
        const file = uppy.getFile(fileId);
        if (
          !file ||
          file.meta.mode !== 'single' ||
          file.meta.storedFile ||
          file.error
        ) {
          return;
        }
        setFileStage(file.id, 'confirming');
        try {
          await completeUploadAndNotify(file, file.meta.sessionId!);
        } catch (error) {
          setFileFailure(file.id, error, '文件验证或文档入库失败');
        }
      }),
    );
  };
  uppy.addPostProcessor(completeSingleUploads);

  uppy.on('upload-start', (files) => {
    files.forEach((file) => setFileStage(file.id, 'uploading'));
  });
  uppy.on('upload-pause', (file, paused) => {
    if (!file) return;
    if (paused) {
      setFileStage(file.id, 'paused');
      return;
    }
    setFileStage(file.id, 'uploading');
  });
  uppy.on('upload-error', (file, error) => {
    if (file) setFileFailure(file.id, error, '文件传输失败');
  });
  uppy.on('restored', () => {
    void reconcileRestoredFiles();
  });

  /** 初始化单个文件；重复调用会刷新普通上传短期签名。 */
  async function initializeFile(fileId: string): Promise<boolean> {
    const file = uppy.getFile(fileId);
    if (!file || file.meta.storedFile) return true;
    setFileStage(file.id, 'initializing');
    try {
      const uploadAttemptId = file.meta.uploadAttemptId ?? crypto.randomUUID();
      const currentDocumentId = options.getDocumentId?.();
      let documentId = file.meta.documentId ?? currentDocumentId;
      if (file.meta.documentId === null) documentId = undefined;
      let contentType = file.type || 'application/octet-stream';
      if (file.data instanceof File) {
        contentType = resolveDeclaredContentType(file.data);
      }
      uppy.setFileMeta(file.id, {
        ...file.meta,
        documentId: documentId ?? null,
        uploadAttemptId,
        retryable: false,
        restartRequired: false,
      });
      const initialized = await api('/documents/upload-init', {
        policyKey: options.policyKey,
        filename: file.name,
        contentType,
        size: file.size ?? 0,
        idempotencyKey: uploadAttemptId,
        documentId,
      });
      uppy.setFileMeta(file.id, {
        ...uppy.getFile(file.id).meta,
        sessionId: initialized.sessionId,
      });
      if (initialized.mode === 'completed') {
        await completePendingFile(file.id);
        return true;
      }
      if (initialized.mode === 'single') {
        uppy.setFileMeta(file.id, {
          ...uppy.getFile(file.id).meta,
          mode: initialized.mode,
          uploadUrl: initialized.uploadUrl,
          uploadHeaders: initialized.headers,
        });
      } else {
        uppy.setFileMeta(file.id, {
          ...uppy.getFile(file.id).meta,
          mode: initialized.mode,
          partSize: initialized.partSize,
        });
      }
      setFileStage(file.id, 'uploading');
      return true;
    } catch (error) {
      setFileFailure(file.id, error, '上传会话初始化失败');
      return false;
    }
  }

  /**
   * 完成服务端验证、保存文档结果并独立通知页面刷新。
   *
   * @param file 当前 Uppy 文件。
   * @param sessionId 服务端上传会话标识。
   * @returns 文档版本绑定结果。
   */
  async function completeUploadAndNotify(file: ManagedFile, sessionId: string) {
    const storedFile =
      file.meta.storedFile ?? (await completeStoredUpload(sessionId));
    storeDocumentResult(file.id, storedFile);
    await notifyUploaded(storedFile);
    return storedFile;
  }

  /** 重试失败项，并根据服务端 session 终态选择续传、确认或新 attempt。 */
  async function retryFile(fileId: string): Promise<void> {
    let file = uppy.getFile(fileId);
    if (!file || file.meta.retryable === false) return;
    if (file.meta.restartRequired) {
      resetUploadAttempt(file.id);
      file = uppy.getFile(file.id);
    }
    if (file.meta.sessionId && file.progress.uploadComplete) {
      try {
        const status = await api('/documents/upload-status', {
          sessionId: file.meta.sessionId,
        });
        if (status.status === 'completed' || status.status === 'completing') {
          await completePendingFile(file.id);
          return;
        }
        if (['failed', 'canceled', 'expired'].includes(status.status)) {
          resetUploadAttempt(file.id);
        } else {
          resetCompletedTransferProgress(file.id);
        }
      } catch (error) {
        setFileFailure(file.id, error, '上传状态查询失败');
        return;
      }
    }
    setFileStage(file.id, 'waiting');
    await uppy.retryUpload(file.id);
  }

  /** 取消本地文件并尽力收敛对应服务端 session。 */
  async function removeFile(fileId: string): Promise<void> {
    const file = uppy.getFile(fileId);
    const sessionId = file?.meta.sessionId;
    const completed = Boolean(file?.meta.storedFile);
    if (file) uppy.removeFile(fileId);
    if (sessionId && !completed) {
      await api('/documents/upload-abort', { sessionId }).catch(() => undefined);
    }
  }

  /** 清理与即将打开的文档目标不一致的未完成队列。 */
  async function prepareContext(documentId?: string): Promise<void> {
    const expectedDocumentId = documentId ?? null;
    const staleFiles = uppy
      .getFiles()
      .filter(
        (file) =>
          !file.meta.storedFile &&
          file.meta.documentId !== undefined &&
          file.meta.documentId !== expectedDocumentId,
      );
    await Promise.all(staleFiles.map((file) => removeFile(file.id)));
  }

  /** 清理成功项和没有服务端会话的本地待选项。 */
  async function clearDismissedFiles(): Promise<void> {
    const files = uppy
      .getFiles()
      .filter((file) => file.meta.storedFile || !file.meta.sessionId);
    await Promise.all(files.map((file) => removeFile(file.id)));
  }

  /** 将 GoldenRetriever 恢复数据与服务端 session 状态对账。 */
  async function reconcileRestoredFiles(): Promise<void> {
    let hasResumableUpload = false;
    for (const restoredFile of uppy.getFiles()) {
      const file = uppy.getFile(restoredFile.id);
      if (!file) continue;
      uppy.setFileMeta(file.id, {
        ...file.meta,
        restored: true,
      });
      if (file.isGhost || !file.meta.sessionId) {
        uppy.removeFile(file.id);
        continue;
      }
      try {
        const status = await api('/documents/upload-status', {
          sessionId: file.meta.sessionId,
        });
        if (status.status === 'completed') {
          await completePendingFile(file.id);
          continue;
        }
        if (status.status === 'completing') {
          detachFileFromCurrentUploads(file.id);
          await completePendingFile(file.id);
          continue;
        }
        if (['failed', 'canceled', 'expired'].includes(status.status)) {
          detachFileFromCurrentUploads(file.id);
          resetUploadAttempt(
            file.id,
            '上次上传会话已结束，请重试或重新选择文件',
          );
          continue;
        }
        if (await initializeFile(file.id)) hasResumableUpload = true;
      } catch (error) {
        detachFileFromCurrentUploads(file.id);
        setFileFailure(file.id, error, '恢复上传状态失败');
      }
    }
    if (hasResumableUpload) {
      uppy.emit('restore-confirmed');
    } else {
      uppy.setState({ recoveredState: null });
    }
  }

  /** 对已传输对象重新执行服务端确认，不重复上传字节。 */
  async function completePendingFile(fileId: string): Promise<void> {
    const file = uppy.getFile(fileId);
    if (!file?.meta.sessionId) return;
    setFileStage(file.id, 'confirming');
    try {
      const storedFile = await completeStoredUpload(file.meta.sessionId);
      storeDocumentResult(file.id, storedFile);
      await notifyUploaded(storedFile);
    } catch (error) {
      setFileFailure(file.id, error, '文件验证或文档入库失败');
    }
  }

  /** 保存最终文档版本结果，并把 Uppy 文件推进到完整成功终态。 */
  function storeDocumentResult(
    fileId: string,
    storedFile: NonNullable<ManagedFile['meta']['storedFile']>,
  ): void {
    const file = uppy.getFile(fileId);
    if (!file) return;
    uppy.setFileState(fileId, {
      error: null,
      isPaused: false,
      meta: {
        ...file.meta,
        stage: 'complete',
        retryable: false,
        restartRequired: false,
        storedFile,
      },
      progress: {
        ...file.progress,
        uploadStarted: file.progress.uploadStarted ?? Date.now(),
        uploadComplete: true,
        complete: true,
        percentage: 100,
        bytesUploaded: file.size ?? 0,
        bytesTotal: file.size,
      },
      response: { status: 200, body: { file: storedFile } },
    });
  }

  /** 页面通知失败只由页面自身提示，不反向改变已入库文件。 */
  async function notifyUploaded(
    storedFile: NonNullable<ManagedFile['meta']['storedFile']>,
  ): Promise<void> {
    try {
      await options.onUploaded?.(storedFile);
    } catch {
      // API 层已经报告刷新错误，上传文件保持已入库。
    }
  }

  /** 将文件错误归一化为阶段、重试能力和用户文案。 */
  function setFileFailure(
    fileId: string,
    error: unknown,
    fallback: string,
  ): void {
    const file = uppy.getFile(fileId);
    if (!file) return;
    const message = getUploadErrorMessage(error, fallback);
    const restartRequired = RESTART_REQUIRED_ERROR_PARTS.some((part) =>
      message.includes(part),
    );
    const retryable =
      restartRequired ||
      !NON_RETRYABLE_ERROR_PARTS.some((part) => message.includes(part));
    uppy.setFileState(fileId, {
      error: message,
      meta: {
        ...file.meta,
        stage: 'failed',
        retryable,
        restartRequired,
      },
    });
  }

  /** 更新单个文件的用户可见阶段。 */
  function setFileStage(
    fileId: string,
    stage: NonNullable<ManagedFile['meta']['stage']>,
  ): void {
    const file = uppy.getFile(fileId);
    if (!file) return;
    uppy.setFileMeta(fileId, { ...file.meta, stage });
  }

  /** 丢弃终态 session 元数据并为同一 Blob 创建新的上传尝试。 */
  function resetUploadAttempt(fileId: string, error: string | null = null): void {
    const file = uppy.getFile(fileId);
    if (!file) return;
    const {
      sessionId: _sessionId,
      mode: _mode,
      partSize: _partSize,
      uploadUrl: _uploadUrl,
      uploadHeaders: _uploadHeaders,
      storedFile: _storedFile,
      ...preservedMeta
    } = file.meta;
    let stage: NonNullable<ManagedFile['meta']['stage']> = 'waiting';
    if (error) stage = 'failed';
    uppy.setFileState(fileId, {
      error,
      isPaused: false,
      response: undefined,
      meta: {
        ...preservedMeta,
        uploadAttemptId: crypto.randomUUID(),
        stage,
        retryable: true,
        restartRequired: false,
      },
      progress: {
        uploadStarted: null,
        uploadComplete: false,
        percentage: 0,
        bytesUploaded: false,
        bytesTotal: file.size ?? null,
      },
    });
  }

  /** 允许已上传但未确认成功的普通文件重新进入 Uppy 上传步骤。 */
  function resetCompletedTransferProgress(fileId: string): void {
    const file = uppy.getFile(fileId);
    if (!file) return;
    uppy.setFileState(fileId, {
      error: null,
      progress: {
        uploadStarted: null,
        uploadComplete: false,
        percentage: 0,
        bytesUploaded: false,
        bytesTotal: file.size ?? null,
      },
    });
  }

  /** 从 GoldenRetriever 的旧批次中移除文件，但保留本地 Blob 和队列项。 */
  function detachFileFromCurrentUploads(fileId: string): void {
    const currentUploads = uppy.getState().currentUploads;
    const nextUploads = { ...currentUploads };
    for (const [uploadId, upload] of Object.entries(currentUploads)) {
      const fileIDs = upload.fileIDs.filter((id) => id !== fileId);
      if (!fileIDs.length) {
        delete nextUploads[uploadId];
        continue;
      }
      nextUploads[uploadId] = { ...upload, fileIDs };
    }
    uppy.setState({ currentUploads: nextUploads });
  }

  return {
    uppy,
    retryFile,
    removeFile,
    prepareContext,
    clearDismissedFiles,
  };
}

/**
 * 完成服务端对象合并、可信验证和文档版本绑定。
 *
 * @param sessionId 服务端上传会话标识。
 * @returns 文档版本绑定结果。
 */
async function completeStoredUpload(sessionId: string) {
  return await api('/documents/upload-complete', { sessionId });
}

/** 断言预处理器已为文件建立可写上传会话。 */
function assertInitialized(file: ManagedFile): void {
  if (!file.meta.sessionId || !file.meta.mode) {
    throw new Error('上传会话尚未初始化');
  }
}
