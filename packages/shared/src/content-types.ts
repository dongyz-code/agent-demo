const jpegContentTypes = ['image/jpeg', 'image/jpg', 'image/pjpeg'] as const;
const compoundFileContentType = 'application/x-cfb';

/**
 * 扩展名对应的可接受 MIME，首项是缺省声明和入库使用的规范 MIME。
 *
 * 旧版 Office 的通用 CFB 签名由服务端结合扩展名归一化。
 */
export const contentTypesByExtension = {
  jpg: jpegContentTypes,
  jpeg: jpegContentTypes,
  png: ['image/png', 'image/x-png'],
  webp: ['image/webp'],
  pdf: ['application/pdf', 'application/x-pdf'],
  doc: [
    'application/msword',
    'application/x-msword',
    'application/vnd.ms-word',
    compoundFileContentType,
  ],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  ppt: [
    'application/vnd.ms-powerpoint',
    'application/mspowerpoint',
    'application/powerpoint',
    'application/x-mspowerpoint',
    compoundFileContentType,
  ],
  pptx: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  xls: [
    'application/vnd.ms-excel',
    'application/msexcel',
    'application/x-msexcel',
    'application/x-ms-excel',
    'application/x-excel',
    compoundFileContentType,
  ],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  txt: ['text/plain'],
  md: ['text/markdown', 'text/x-markdown', 'text/plain'],
  csv: ['text/csv', 'application/csv', 'text/x-csv', 'text/plain'],
} as const;

/** 注册表支持的文件扩展名。 */
export type SupportedFileExtension = keyof typeof contentTypesByExtension;

/**
 * 提取不带点的小写文件扩展名。
 *
 * @param filename 用户上传时提供的文件名。
 * @returns 注册表支持的小写扩展名；缺失或不支持时返回空。
 */
export function getFileExtension(
  filename: string,
): SupportedFileExtension | undefined {
  const index = filename.lastIndexOf('.');
  if (index < 0) return undefined;
  const extension = filename.slice(index + 1).toLowerCase();
  if (!isSupportedFileExtension(extension)) return undefined;
  return extension;
}

/**
 * 合并扩展名对应的全部 MIME 并去重。
 *
 * @param extensions 调用方明确支持的文件扩展名。
 * @returns 保持注册顺序的 MIME 列表。
 */
export function collectContentTypes(
  extensions: readonly SupportedFileExtension[],
): string[] {
  const contentTypes = new Set<string>();
  for (const extension of extensions) {
    for (const contentType of contentTypesByExtension[extension]) {
      contentTypes.add(contentType);
    }
  }
  return [...contentTypes];
}

/**
 * 判断字符串是否为注册表支持的扩展名。
 *
 * @param extension 不带点的小写扩展名候选。
 * @returns 候选存在于注册表时返回真，并收窄其类型。
 */
function isSupportedFileExtension(
  extension: string,
): extension is SupportedFileExtension {
  return Object.hasOwn(contentTypesByExtension, extension);
}
