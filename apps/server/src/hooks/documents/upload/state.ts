import type { UploadSessionStatus } from '@repo/types';

/** 允许继续签名、恢复或完成对象上传的会话状态。 */
const transferableStatuses = new Set<UploadSessionStatus>([
  'initialized',
  'uploading',
]);

/** 判断会话是否允许继续对象传输。 */
export function canTransferUploadSession(status: UploadSessionStatus) {
  return transferableStatuses.has(status);
}

/** 判断会话是否允许主动取消。 */
export function canCancelUploadSession(status: UploadSessionStatus) {
  return !['completed', 'canceled', 'expired'].includes(status);
}
