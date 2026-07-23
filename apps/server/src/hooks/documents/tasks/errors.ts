/**
 * 从带前缀错误消息提取稳定错误码。
 *
 * @param message 可能以大写错误码和冒号开头的安全错误消息。
 * @param fallback 无法提取前缀时使用的兜底错误码。
 * @returns 提取到的稳定错误码或兜底值。
 */
export function getErrorCode(message: string, fallback: string): string {
  const match = /^([A-Z0-9_]+):/.exec(message);
  return match?.[1] ?? fallback;
}
