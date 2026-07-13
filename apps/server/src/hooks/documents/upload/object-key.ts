import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';

/** S3 Multipart 最小分片大小。 */
const MIN_PART_SIZE = 5 * 1024 * 1024;
/** S3 Multipart 最大分片数量。 */
const MAX_PART_COUNT = 10_000;
/** 分片大小向上取整粒度，便于观察与运维。 */
const PART_SIZE_STEP = 1024 * 1024;

const illegalFilenameChars = /[<>:"/\\|?*]/g;
const controlChars = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * 清洗仅用于展示和 Content-Disposition 的原始文件名。
 *
 * @param filename 客户端提交的文件名。
 * @returns 不包含路径分隔符和控制字符的文件名。
 */
export function sanitizeUploadFilename(filename: string): string {
  const normalized = filename
    .trim()
    .replace(illegalFilenameChars, '_')
    .replace(controlChars, '_');
  return normalized.slice(0, 255) || 'file';
}

/**
 * 提取并规范化文件扩展名。
 *
 * @param filename 已清洗或原始文件名。
 * @returns 小写且不包含点的扩展名；没有扩展名时返回 bin。
 */
export function normalizeExtension(filename: string): string {
  const extension = extname(filename).slice(1).toLowerCase();
  return /^[a-z0-9]{1,16}$/.test(extension) ? extension : 'bin';
}

/**
 * 构造服务端控制的不可猜测对象路径。
 *
 * @param tenantId 当前逻辑租户。
 * @param fileId 通用文件标识。
 * @param extension 已规范化扩展名。
 * @param now 用于稳定生成日期分区的当前时间。
 * @returns 不依赖用户文件名的对象路径。
 */
export function buildObjectKey({
  tenantId,
  fileId,
  extension,
  now,
}: {
  tenantId: string;
  fileId: string;
  extension: string;
  now: Date;
}): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const tenant = createHash('sha256').update(tenantId).digest('hex').slice(0, 16);
  return `tenants/${tenant}/files/${year}/${month}/${fileId}/${randomUUID()}.${extension}`;
}

/**
 * 根据文件大小计算符合 S3 上限的分片策略。
 *
 * @param fileSize 文件总字节数。
 * @param preferredPartSize 策略首选分片字节数。
 * @returns 分片大小和总数量。
 */
export function calculateMultipartPlan(
  fileSize: number,
  preferredPartSize: number,
): { partSize: number; partCount: number } {
  const minimumForCount = Math.ceil(fileSize / MAX_PART_COUNT);
  const required = Math.max(MIN_PART_SIZE, preferredPartSize, minimumForCount);
  const partSize = Math.ceil(required / PART_SIZE_STEP) * PART_SIZE_STEP;
  return {
    partSize,
    partCount: Math.ceil(fileSize / partSize),
  };
}

/**
 * 生成服务端可复核的文件指纹摘要。
 *
 * @param values 不含文件二进制的稳定文件属性。
 * @returns SHA-256 十六进制摘要。
 */
export function createFileFingerprint(values: {
  filename: string;
  size: number;
  contentType: string;
  clientFingerprint: string;
}): string {
  return createHash('sha256')
    .update(JSON.stringify(values))
    .digest('hex');
}
