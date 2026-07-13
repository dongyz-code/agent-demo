import { onBeforeUnmount, shallowRef } from 'vue';

import { createUploadUppy } from './uppy-adapter';
import { getUploadErrorMessage } from './utils';

import type { UploadQueueItem, UploaderOptions } from './types';

/** 将 Uppy 作为唯一状态源映射为 Vue 只读上传队列。 */
export function useUploader(options: UploaderOptions) {
  const items = shallowRef<UploadQueueItem[]>([]);
  const uppy = createUploadUppy(options);

  /** 从 Uppy 当前状态刷新轻量视图模型。 */
  const syncItems = () => {
    items.value = uppy.getFiles().map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size ?? 0,
      progress: Math.round(file.progress.percentage ?? 0),
      paused: file.isPaused === true,
      complete: file.progress.uploadComplete === true && Boolean(file.response?.body?.file),
      error: file.error ?? null,
      storedFile: file.response?.body?.file,
    }));
  };
  uppy.on('state-update', syncItems);

  /** 将浏览器选择的本地文件加入队列。 */
  function addFiles(files: FileList | File[]) {
    Array.from(files).forEach((file) => {
      uppy.addFile({
        name: file.name,
        type: file.type,
        data: file,
        source: 'file-input',
      });
    });
  }

  /** 上传当前队列中尚未完成的文件。 */
  async function upload() {
    await uppy.upload();
  }

  /** 切换单个文件暂停或继续。 */
  function pauseResume(fileId: string) {
    uppy.pauseResume(fileId);
  }

  /** 取消并移除单个上传文件。 */
  function remove(fileId: string) {
    uppy.removeFile(fileId);
  }

  /** 重试单个失败文件。 */
  async function retry(fileId: string) {
    const file = uppy.getFile(fileId);
    const storedFile = file?.meta.storedFile;
    if (file && storedFile) {
      try {
        await options.onUploaded?.(storedFile);
        uppy.setFileState(fileId, {
          error: null,
          progress:
            file.progress.uploadStarted === null
              ? {
                  ...file.progress,
                  uploadStarted: Date.now(),
                  uploadComplete: true,
                  percentage: 100,
                  bytesUploaded: file.size ?? 0,
                  bytesTotal: file.size,
                }
              : {
                  ...file.progress,
                  uploadComplete: true,
                  percentage: 100,
                  bytesUploaded: file.size ?? 0,
                  bytesTotal: file.size,
                },
          response: {
            status: 200,
            body: { file: storedFile },
          },
        });
      } catch (error) {
        uppy.setFileState(fileId, {
          error: getUploadErrorMessage(error, '文件业务接入失败'),
        });
      }
      return;
    }
    await uppy.retryUpload(fileId);
  }

  /** 清除已完成队列项，保留上传中和业务接入失败的恢复数据。 */
  function clearCompleted() {
    uppy.getFiles().forEach((file) => {
      if (file.response?.body?.file && !file.error) {
        uppy.removeFile(file.id);
      }
    });
  }

  onBeforeUnmount(() => {
    uppy.destroy();
  });

  return { items, addFiles, upload, pauseResume, remove, retry, clearCompleted };
}
