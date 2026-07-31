import { onBeforeUnmount, ref, shallowRef } from 'vue';

import { createUploadUppy } from './uppy-adapter';
import {
  getClientUploadPolicy,
  resolveDeclaredContentType,
  validateClientUploadFile,
} from './policies';

import type {
  UploadQueueItem,
  UploadQueueStage,
  UploaderOptions,
} from './types';

/** 将 Uppy 作为唯一状态源映射为 Vue 上传队列和操作。 */
export function useUploader(options: UploaderOptions) {
  const items = shallowRef<UploadQueueItem[]>([]);
  const uploadingBatch = ref(false);
  const policy = getClientUploadPolicy(options.policyKey);
  const adapter = createUploadUppy(options);
  const { uppy } = adapter;

  /** 从 Uppy 当前状态刷新轻量视图模型。 */
  const syncItems = () => {
    items.value = uppy.getFiles().map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size ?? 0,
      progress: Math.round(file.progress.percentage ?? 0),
      stage: resolveQueueStage(file),
      restored: file.meta.restored === true,
      retryable: file.meta.retryable === true,
      error: file.error ?? null,
      storedFile: file.response?.body?.file ?? file.meta.storedFile,
    }));
  };
  uppy.on('state-update', syncItems);

  /**
   * 将浏览器选择文件加入当前业务上下文的队列。
   *
   * @param files 浏览器 FileList 或等价文件数组。
   * @returns 未加入队列的中文校验原因集合。
   */
  function addFiles(files: FileList | File[]): string[] {
    const errors: string[] = [];
    const documentId = options.getDocumentId?.();
    for (const file of Array.from(files)) {
      if (
        options.maxNumberOfFiles &&
        uppy.getFiles().length >= options.maxNumberOfFiles
      ) {
        errors.push(`单次最多选择 ${options.maxNumberOfFiles} 个文件`);
        break;
      }
      const validationError = validateClientUploadFile(file, policy);
      if (validationError) {
        errors.push(validationError);
        continue;
      }
      try {
        uppy.addFile({
          name: file.name,
          type: resolveDeclaredContentType(file),
          data: file,
          source: 'file-input',
          meta: {
            uploadAttemptId: crypto.randomUUID(),
            documentId: documentId ?? null,
            stage: 'waiting',
            retryable: false,
            restored: false,
          },
        });
      } catch (error) {
        let message = `${file.name}：无法加入上传队列`;
        if (error instanceof Error) message = error.message;
        errors.push(message);
      }
    }
    return errors;
  }

  /** 上传当前队列中尚未完成的文件，并禁止批次重复提交。 */
  async function upload(): Promise<void> {
    if (uploadingBatch.value) return;
    uploadingBatch.value = true;
    try {
      await uppy.upload();
    } finally {
      uploadingBatch.value = false;
    }
  }

  /**
   * 切换单个传输中的文件暂停或继续。
   *
   * @param fileId Uppy 文件标识。
   */
  function pauseResume(fileId: string): void {
    uppy.pauseResume(fileId);
  }

  /**
   * 取消并移除单个上传文件，同时尽力收敛服务端会话。
   *
   * @param fileId Uppy 文件标识。
   */
  async function remove(fileId: string): Promise<void> {
    await adapter.removeFile(fileId);
  }

  /**
   * 按失败阶段重试单个文件。
   *
   * @param fileId Uppy 文件标识。
   */
  async function retry(fileId: string): Promise<void> {
    await adapter.retryFile(fileId);
  }

  /**
   * 打开弹窗前清理其他文档上下文遗留的未完成队列。
   *
   * @param documentId 本次上传新版本的目标文档；空值表示新建文档。
   */
  async function prepareContext(documentId?: string): Promise<void> {
    await adapter.prepareContext(documentId);
  }

  /** 关闭弹窗时清理成功项和尚未建立服务端会话的本地选择。 */
  async function clearDismissedFiles(): Promise<void> {
    await adapter.clearDismissedFiles();
  }

  onBeforeUnmount(() => {
    uppy.destroy();
  });

  return {
    items,
    uploadingBatch,
    accept: policy.accept,
    addFiles,
    upload,
    pauseResume,
    remove,
    retry,
    prepareContext,
    clearDismissedFiles,
  };
}

/**
 * 从 Uppy 原始状态推导队列阶段，兼容恢复的旧元数据。
 *
 * @param file 当前 Uppy 文件状态。
 * @returns 可直接展示和决定操作的队列阶段。
 */
function resolveQueueStage(
  file: ReturnType<
    ReturnType<typeof createUploadUppy>['uppy']['getFiles']
  >[number],
): UploadQueueStage {
  if (file.meta.storedFile || file.response?.body?.file) return 'complete';
  if (file.error) return 'failed';
  if (file.isPaused) return 'paused';
  if (file.meta.stage) return file.meta.stage;
  if (file.progress.uploadComplete) return 'confirming';
  if (file.progress.uploadStarted) return 'uploading';
  return 'waiting';
}
