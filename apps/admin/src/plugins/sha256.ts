import { createSHA256 } from 'hash-wasm';

import type { IDataType } from 'hash-wasm';

/** 返回 sha256 值， hex 格式 */
export async function sha256(str: IDataType) {
  const sha256 = await createSHA256();
  return sha256.update(str).digest('hex');
}
