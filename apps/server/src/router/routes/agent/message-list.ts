import { desc, eq, inArray } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { ROOT } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/agent/message-list',
  method: 'POST',
  handler: async ({ body, __token }) => {
    const [conversation] = await db
      .select({ user_id: schemas.agent_conversations.user_id })
      .from(schemas.agent_conversations)
      .where(
        eq(schemas.agent_conversations.conversation_id, body.conversation_id),
      )
      .limit(1);
    const isRootAdmin = __token.user_id === ROOT.SYS_ADMIN_USER_ID;
    if (
      !conversation ||
      (!isRootAdmin && conversation.user_id !== __token.user_id)
    ) {
      throw new ROOT_ERROR('Agent: 会话不存在');
    }

    const [start = 0, end = 50] = body.limit ?? [];
    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.agent_messages.conversation_id, body.conversation_id),
      );
      if (body.status?.length) {
        filter.push(inArray(schemas.agent_messages.status, body.status));
      }
    });

    const [latestList, count] = await Promise.all([
      db
        .select({
          message_id: schemas.agent_messages.message_id,
          conversation_id: schemas.agent_messages.conversation_id,
          role: schemas.agent_messages.role,
          content: schemas.agent_messages.content,
          metadata: schemas.agent_messages.metadata,
          status: schemas.agent_messages.status,
          create_timestamp: schemas.agent_messages.create_timestamp,
        })
        .from(schemas.agent_messages)
        .where(where)
        .orderBy(desc(schemas.agent_messages.message_id))
        .offset(start)
        .limit(Math.max(0, end - start)),
      body.with_count
        ? db.$count(schemas.agent_messages, where)
        : Promise.resolve(0),
    ]);

    const list = [...latestList].reverse();
    return { list, count };
  },
});

export default api;
