import { and, eq, desc } from 'drizzle-orm';
import { ModelMessage } from 'ai';
import { db, schemas } from '@/database/index.js';

/** 查找消息记录 */
export async function getMessages({
  conversation_id,
}: {
  conversation_id: string;
}) {
  const list = await db.query.agent_messages.findMany({
    columns: {
      message_id: true,
      role: true,
      content: true,
      create_timestamp: true,
    },
    where: and(eq(schemas.agent_messages.conversation_id, conversation_id)),
    orderBy: desc(schemas.agent_messages.message_id),
    limit: 100,
  });

  return list.map((item) => ({
    role: item.role,
    content: item.content,
  })) as ModelMessage[];
}
