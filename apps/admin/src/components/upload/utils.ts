/**
 * 提取上传或后续业务接入的安全错误文案。
 *
 * API 业务错误可能是 `{ msg }`，浏览器和 Uppy 错误通常是 `Error`；
 * 统一转换后队列无需理解不同错误来源。
 */
export function getUploadErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; msg?: unknown };
    if (typeof value.msg === 'string' && value.msg) return value.msg;
    if (typeof value.message === 'string' && value.message) return value.message;
  }
  return fallback;
}
