import type {
  StoredFileStatus,
  UploadPolicyKey,
  UploadSessionStatus,
} from '@/types';

/** 文件状态对应的中文展示文案。 */
export const fileStatusLabels: Record<StoredFileStatus, string> = {
  pending: '待上传',
  verifying: '验证中',
  verified: '已验证',
  rejected: '已拒绝',
  deleting: '删除中',
  deleted: '已删除',
};

/** 上传会话状态对应的中文展示文案。 */
export const uploadStatusLabels: Record<UploadSessionStatus, string> = {
  initialized: '已初始化',
  uploading: '上传中',
  completing: '合并中',
  completed: '已完成',
  failed: '失败',
  canceled: '已取消',
  expired: '已过期',
};

/** 上传策略对应的中文展示文案。 */
export const uploadPolicyLabels: Record<UploadPolicyKey, string> = {
  'default-attachment': '通用附件',
  image: '图片',
  'rag-document': '知识文档',
};

/** 判断上传会话是否仍可取消或恢复。 */
export function isActiveUploadStatus(status: UploadSessionStatus) {
  return ['initialized', 'uploading', 'completing'].includes(status);
}

/** 将字节数格式化为适合表格展示的单位。 */
export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KiB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MiB`;
  return `${(size / 1024 ** 3).toFixed(1)} GiB`;
}

/** 将接口日期转换为本地时间文案。 */
export function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString();
}

/** 计算上传会话的整数进度百分比。 */
export function getUploadProgress(uploadedSize: number, size: number) {
  if (size <= 0) return 0;
  return Math.min(100, Math.round((uploadedSize / size) * 100));
}
