import type { Readable } from 'node:stream';

/**
 * 把可读流聚合为 Buffer。
 *
 * @param stream 待消费的可读流。
 * @param maxBytes 可选运行时上限;累计字节超过该值时销毁流并抛错,防止异常大文件撑爆内存。
 * @returns 流全部内容拼接后的 Buffer。
 */
export async function readStreamToBuffer(
  stream: Readable,
  maxBytes?: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (maxBytes !== undefined) {
      total += buffer.byteLength;
      if (total > maxBytes) {
        stream.destroy();
        throw new Error(`流超过最大字节数上限: ${maxBytes}`);
      }
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
