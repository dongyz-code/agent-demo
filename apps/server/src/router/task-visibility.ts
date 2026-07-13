import { hasAdminPermissionKey } from '@repo/shared/permission';

import { getUploadActor } from './actor.js';
import { getAdminPermissionContext } from './permission.js';

import type { TokenDataWithExp } from '@/types/index.js';

/** 任务中心查询使用的用户或租户可见范围。 */
export interface TaskVisibility {
  /** 普通用户只能查看自己发起的任务。 */
  userId?: string;
  /** 知识库管理员可以查看当前租户任务。 */
  tenantId?: string;
}

/** 根据系统管理员和知识库权限计算任务数据范围。 */
export async function getTaskVisibility(
  token: TokenDataWithExp,
): Promise<TaskVisibility> {
  const context = await getAdminPermissionContext(token.user_id);
  if (context.sys_admin) return {};
  if (
    hasAdminPermissionKey(context.permissions, 'pages.documents.dataset')
  ) {
    return { tenantId: getUploadActor(token).tenantId };
  }
  return { userId: token.user_id };
}

