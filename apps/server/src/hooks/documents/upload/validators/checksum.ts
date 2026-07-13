import { createHash } from 'node:crypto';

import type { Readable } from 'node:stream';

/** 流式计算 SHA-256，调用后输入流会被完整消费。 */
export async function calculateSha256Stream(stream: Readable) {
  const hash = createHash('sha256');
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}
