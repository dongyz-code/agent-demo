import { ROOT_ERROR } from '@/configs/index.js';

/** 创建带稳定文档错误码的项目根错误。 */
export function createDocumentError(
  code: string,
  message: string,
  kind: 'bad-request' | 'not-found' | 'conflict' | 'internal' = 'bad-request',
) {
  const key = {
    'bad-request': '非法参数',
    'not-found': '相关文件不存在',
    conflict: '数据异常',
    internal: '服务异常',
  } as const;
  return new ROOT_ERROR(key[kind], `${code}: ${message}`);
}
