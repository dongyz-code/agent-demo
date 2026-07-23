import { createHash } from 'node:crypto';

/**
 * 将任意稳定文本摘要转换为符合 UUID 格式的确定性标识。
 *
 * @param value 参与标识计算的稳定文本。
 * @returns 可重复生成的 UUID 格式标识。
 */
export function hashToUuid(value: string): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 32);
  const versioned = `${digest.slice(0, 12)}5${digest.slice(13, 16)}8${digest.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}
