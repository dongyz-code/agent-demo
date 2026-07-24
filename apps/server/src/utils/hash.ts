import crypto from 'node:crypto';
import { v7 } from 'uuid';

import type { BinaryLike } from 'node:crypto';

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
 * 生成 RFC 9562 UUIDv7，作为 agent 会话与消息的主键。
 *
 * v7 前 48 位为毫秒时间戳，使 id 天然按生成时间单调递增，可直接用作主键并支撑
 * keyset 翻页（`WHERE ... AND id < ? ORDER BY id DESC`）；剩余位随机，保证同毫秒内唯一。
 *
 * 服务端其余表仍用 `node:crypto` 的 v4 uuid，本工具仅供需要时序主键的 agent 表使用。
 *
 * @returns 形如 019f5b12-07ed-7xxx-... 的 v7 UUID 字符串。
 */
export function uuidv7(): string {
  return v7();
}
