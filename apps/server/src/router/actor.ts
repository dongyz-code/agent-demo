import { ROOT_ERROR } from '@/configs/index.js';

import type { TokenDataWithExp } from '@/types/index.js';
import type { UploadActor } from '@/hooks/documents/index.js';

/**
 * 将认证 Token 转换为文件与 RAG 模块使用的最小调用者上下文。
 *
 * 当前后台用户共享 system 租户；应用 Token 使用 client_id 隔离对象和知识库。
 */
export function getUploadActor(token: TokenDataWithExp | undefined): UploadActor {
  if (!token?.user_id) {
    throw new ROOT_ERROR('认证: 身份校验失败');
  }
  return {
    tenantId: token.client_id ?? 'system',
    userId: token.user_id,
  };
}
