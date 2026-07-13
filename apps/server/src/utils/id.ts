import { v7 } from 'uuid';

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
