import crypto from 'node:crypto';
import { v5, v7 } from 'uuid';

import type { BinaryLike } from 'node:crypto';

/** 由 DNS 命名空间中的 `deploy-console` 派生，禁止修改以免既有稳定 ID 漂移。 */
const UUID_V5_NAMESPACE = 'e8971f20-b399-511f-9de1-208d43866c81';

/**
 * 计算数据的 SHA-256 十六进制摘要。
 *
 * @param data 需要参与摘要计算的二进制数据。
 * @returns 小写十六进制格式的 SHA-256 摘要。
 */
export function getSha256Hex(data: BinaryLike) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * 计算数据的 MD5 十六进制摘要，仅用于兼容已有摘要格式，不应用于密码安全场景。
 *
 * @param data 需要参与摘要计算的二进制数据。
 * @returns 小写十六进制格式的 MD5 摘要。
 */
export function getMd5Hex(data: BinaryLike) {
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * 生成 RFC 9562 UUIDv7，供服务端需要 UUID 的主键和运行标识统一使用。
 *
 * v7 前 48 位为毫秒时间戳，使 id 天然按生成时间单调递增，可直接用作主键并支撑
 * keyset 翻页（`WHERE ... AND id < ? ORDER BY id DESC`）；剩余位随机，保证同毫秒内唯一。
 *
 * @returns 形如 019f5b12-07ed-7xxx-... 的 v7 UUID 字符串。
 */
export function uuidv7(): string {
  return v7();
}

/**
 * 根据稳定名称生成 RFC 9562 UUIDv5，适用于需要可重复计算的数据库 UUID。
 *
 * 相同名称始终得到相同结果；名称组成发生变化时会得到新的 UUID。该函数不用于
 * 随机主键、密码摘要或内容完整性校验。
 *
 * @param value 参与确定性标识计算的稳定名称。
 * @returns deploy-console 固定命名空间下生成的 UUIDv5。
 */
export function uuidv5(value: string): string {
  return v5(value, UUID_V5_NAMESPACE);
}
