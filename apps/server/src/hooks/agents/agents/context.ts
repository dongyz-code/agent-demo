import { and, eq, desc } from 'drizzle-orm';
import { ModelMessage } from 'ai';
import { db, schemas } from '@/database/index.js';

/**
 * 查找消息记录：取最近 100 条（DESC 新→旧），再 reverse 成正序（旧→新）喂模型。
 * 不能用 ASC + LIMIT——那会取到最老的 100 条，历史超长时反而丢掉最新消息。
 * MVP 按条数 limit；后续 tokens 列有值后改 token 预算，从最新往前回溯。
 */
export async function getMessages({
  conversation_id,
}: {
  conversation_id: string;
}) {
  const list = await db.query.agent_messages.findMany({
    columns: {
      role: true,
      content: true,
    },
    where: and(eq(schemas.agent_messages.conversation_id, conversation_id)),
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
