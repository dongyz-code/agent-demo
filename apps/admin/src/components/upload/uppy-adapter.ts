import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import GoldenRetriever from '@uppy/golden-retriever';

import { api } from '@/utils';
import { sha256 } from '@/utils/crypto/sha256';
import { getUploadErrorMessage } from './utils';

import type { UppyFile } from '@uppy/core';
import type { AwsS3Part } from '@uppy/aws-s3';
import type { UploadFileMeta, UploadResponseBody, UploaderOptions } from './types';

type ManagedFile = UppyFile<UploadFileMeta, UploadResponseBody>;

/** 创建使用项目通用上传接口的 Uppy Core 实例。 */
export function createUploadUppy(options: UploaderOptions) {
  const uppy = new Uppy<UploadFileMeta, UploadResponseBody>({
    id: `agent-demo-upload-${options.policyKey}`,
    autoProceed: false,
    allowMultipleUploadBatches: true,
    restrictions: {
      maxNumberOfFiles: options.maxNumberOfFiles,
    },
  });

  uppy.use(GoldenRetriever<UploadFileMeta, UploadResponseBody>, {
    expires: 24 * 60 * 60 * 1000,
    serviceWorker: false,
    indexedDB: {
      name: `agent-demo-upload-${options.policyKey}`,
    },
  });

  /** 上传前先初始化会话，使插件可以同步判断普通上传或 Multipart。 */
  const initializeFiles = async (fileIds: string[]) => {
    await Promise.all(
      fileIds.map(async (fileId) => {
        const file = uppy.getFile(fileId);
        if (!file || file.meta.sessionId) {
          return;
        }
        const fingerprint = await createBrowserFingerprint(file);
        const initialized = await api('/upload/init', {
          policyKey: options.policyKey,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size ?? 0,
          fingerprint,
          idempotencyKey: fingerprint,
        });
        uppy.setFileMeta(file.id, {
          ...file.meta,
          sessionId: initialized.session.sessionId,
          fileId: initialized.session.fileId,
          mode: initialized.mode,
          fingerprint,
          ...(initialized.mode === 'single'
            ? {
                uploadUrl: initialized.uploadUrl,
                uploadHeaders: initialized.headers,
              }
            : {
                uploadId: initialized.uploadId,
                partSize: initialized.partSize,
              }),
        });
      }),
    );
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
        uploadId: file.meta.uploadId!,
      };
    },
    async listParts(_file, upload) {
      const result = await api('/upload/list-parts', {
        sessionId: upload.key,
      });
      return result.parts.map((part) => ({
        PartNumber: part.partNumber,
        ETag: part.etag,
        Size: part.size,
      }));
    },
    async signPart(_file, upload) {
      const result = await api('/upload/sign-parts', {
        sessionId: upload.key,
        partNumbers: [upload.partNumber],
      });
      const signed = result.parts[0];
      if (!signed) {
        throw new Error('服务端未返回分片签名');
      }
      return { method: 'PUT', url: signed.uploadUrl };
    },
    async completeMultipartUpload(file, upload) {
      const storedFile = await completeUploadAndNotify(
        file,
        upload.key,
        upload.parts,
      );
      return { location: '', file: storedFile };
    },
    async abortMultipartUpload(_file, upload) {
      await api('/upload/abort', { sessionId: upload.key });
    },
  });

  uppy.on('upload-success', (file, response) => {
    if (!file || file.meta.mode !== 'single' || response.body?.file) {
      return;
    }
    void completeUploadAndNotify(file, file.meta.sessionId!, undefined)
      .then((storedFile) => {
        uppy.setFileState(file.id, {
          response: {
            ...response,
            body: { file: storedFile },
          },
        });
      })
      .catch((error: unknown) => {
        uppy.setFileState(file.id, {
          error: getUploadErrorMessage(error, '文件验证或业务接入失败'),
        });
      });
  });

  /** 完成服务端验证并等待业务接入，失败时保留已验证文件供无重复上传重试。 */
  async function completeUploadAndNotify(
    file: ManagedFile,
    sessionId: string,
    parts: AwsS3Part[] | undefined,
  ) {
    const storedFile =
      file.meta.storedFile ?? (await completeStoredUpload(sessionId, parts));
    uppy.setFileMeta(file.id, {
      ...file.meta,
      storedFile,
    });
    try {
      await options.onUploaded?.(storedFile);
    } catch (error) {
      throw new Error(getUploadErrorMessage(error, '文件业务接入失败'));
    }
    return storedFile;
  }

  return uppy;
}

/** 完成服务端对象合并和文件验证。 */
async function completeStoredUpload(
  sessionId: string,
  parts: AwsS3Part[] | undefined,
) {
  const storedFile = await api('/upload/complete', {
    sessionId,
    parts: parts?.flatMap((part) =>
      part.PartNumber && part.ETag
        ? [{ partNumber: part.PartNumber, etag: part.ETag }]
        : [],
    ),
  });
  return storedFile;
}

/** 生成重新选择同一文件时可复用的稳定指纹。 */
async function createBrowserFingerprint(file: ManagedFile) {
  const lastModified =
    file.data instanceof File ? file.data.lastModified : 0;
  return await sha256(
    `${file.name}:${file.size ?? 0}:${file.type}:${lastModified}`,
  );
}

/** 断言预处理器已为文件建立上传会话。 */
function assertInitialized(file: ManagedFile) {
  if (!file.meta.sessionId || !file.meta.mode) {
    throw new Error('上传会话尚未初始化');
  }
}
