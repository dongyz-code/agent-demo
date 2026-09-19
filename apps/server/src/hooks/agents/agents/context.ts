import { and, eq, desc, lte } from 'drizzle-orm';
import { ModelMessage } from 'ai';
import { db, schemas } from '@/database/index.js';

/**
 * 查找消息记录：取最近 100 条（DESC 新→旧），再 reverse 成正序（旧→新）喂模型。
 * 不能用 ASC + LIMIT——那会取到最老的 100 条，历史超长时反而丢掉最新消息。
 * MVP 按条数 limit；后续 tokens 列有值后改 token 预算，从最新往前回溯。
 */
export async function getMessages({
  conversation_id,
  before_message_id,
}: {
  conversation_id: string;
  /** 截止消息 ID；返回该消息及其之前的历史，用于重新生成时排除旧回复。 */
  before_message_id?: string;
}) {
  const where = before_message_id
    ? and(
        eq(schemas.agent_messages.conversation_id, conversation_id),
        lte(schemas.agent_messages.message_id, before_message_id),
      )
    : eq(schemas.agent_messages.conversation_id, conversation_id);
  const list = await db.query.agent_messages.findMany({
    columns: {
      role: true,
      content: true,
    },
    where,
    orderBy: desc(schemas.agent_messages.message_id),
    limit: 100,
  });

  // DESC 取最新 100 条后 reverse 成正序，保证上下文时序正确且不丢最新消息。
  return list
    .map((item) => ({
      role: item.role,
      content: item.content,
    }))
    .reverse() as ModelMessage[];
}
