import type { UploadSessionStatus } from '@repo/types';

/** 既有上传会话在重复初始化时允许执行的动作。 */
export type ExistingUploadInitDisposition =
  | 'active'
  | 'completed'
  | 'completing'
  | 'expired'
  | 'terminal';

/** 重复初始化判断所需的最小上传会话状态。 */
export interface ExistingUploadInitState {
  /** 服务端持久化的上传会话状态。 */
  status: UploadSessionStatus;
  /** 当前会话不再允许继续写对象的时间。 */
  expiresAt: Date;
}

/**
 * 判断重复初始化应恢复、取回结果还是要求新建上传尝试。
 *
 * @param state 既有会话状态和失效时间。
 * @returns 服务端初始化流程应执行的稳定动作分类。
 */
export function resolveExistingUploadInitDisposition(
  state: ExistingUploadInitState,
): ExistingUploadInitDisposition {
  if (state.status === 'completed') return 'completed';
  if (state.expiresAt.getTime() <= Date.now()) return 'expired';
  if (state.status === 'completing') return 'completing';
  if (['failed', 'canceled', 'expired'].includes(state.status)) {
    return 'terminal';
  }
  return 'active';
}
