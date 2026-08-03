import {
  binaryContentType,
  contentTypesByExtension,
  getFileExtension,
} from '@repo/shared';

/** 文档管理单文件上限，与服务端当前配置的 2 GiB 保持一致。 */
export const documentMaxFileSizeBytes = 2 * 1024 * 1024 * 1024;

/** 文件选择器的 accept 值，始终从共享扩展名注册表派生。 */
export const documentUploadAccept = Object.keys(contentTypesByExtension)
  .map((extension) => `.${extension}`)
  .join(',');

/**
 * 生成上传初始化使用的 MIME 声明。
 *
 * 浏览器声明在当前扩展名的兼容列表内时保留，否则回落到规范 MIME。
 *
 * @param file 浏览器选择的本地文件。
 * @returns 兼容的浏览器声明、规范 MIME 或通用二进制 MIME。
 */
export function resolveDeclaredContentType(file: File): string {
  const extension = getFileExtension(file.name);
  if (!extension) return file.type || binaryContentType;
  const contentType = contentTypesByExtension[extension];
  if (file.type && contentType.mime.includes(file.type)) {
    return file.type;
  }
  return contentType.mime[0];
}

/**
 * 在文件加入队列前执行可理解的快速校验。
 *
 * @param file 浏览器选择的本地文件。
 * @returns 校验通过返回空值，否则返回面向用户的中文原因。
 */
export function validateClientUploadFile(file: File): string | undefined {
  if (file.size <= 0) return `${file.name}：文件不能为空`;
  if (file.size > documentMaxFileSizeBytes) {
    return `${file.name}：文件大小超过 ${formatLimit(documentMaxFileSizeBytes)}`;
  }
  const extension = getFileExtension(file.name);
  if (!extension) {
    return `${file.name}：当前文档管理不支持该文件类型`;
  }
  return undefined;
}

/**
 * 将字节上限转换为简洁显示值。
 *
 * @param bytes 文件字节上限。
 * @returns 以 MiB 或 GiB 表达的限制文案。
 */
function formatLimit(bytes: number): string {
  const gib = bytes / 1024 / 1024 / 1024;
  if (Number.isInteger(gib) && gib >= 1) return `${gib} GiB`;
  return `${Math.round(bytes / 1024 / 1024)} MiB`;
}
