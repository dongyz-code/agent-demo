import { desc, eq, ilike, inArray } from 'drizzle-orm';

import { buildWhere, db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/agent/conversation-list',
  method: 'POST',
  handler: async ({ body, __token: { user_id } }) => {
    const { search, status, scenario, limit } = body;
    const [start = 0, end = 20] = limit ?? [];
    const statuses = status ?? ['active', 'archived'];

    const where = buildWhere((filter) => {
      filter.push(eq(schemas.agent_conversations.user_id, user_id));

      if (search?.trim()) {
        filter.push(
          ilike(schemas.agent_conversations.title, `%${search.trim()}%`),
        );
      }

      if (scenario) {
        filter.push(eq(schemas.agent_conversations.scenario, scenario));
      }

      filter.push(inArray(schemas.agent_conversations.status, statuses));
    });

    const [list, count] = await Promise.all([
      db
        .select({
          conversation_id: schemas.agent_conversations.conversation_id,
          scenario: schemas.agent_conversations.scenario,
          title: schemas.agent_conversations.title,
          status: schemas.agent_conversations.status,
          last_message_timestamp:
            schemas.agent_conversations.last_message_timestamp,
          last_update_timestamp:
            schemas.agent_conversations.last_update_timestamp,
        })
        .from(schemas.agent_conversations)
        .where(where)
        .orderBy(desc(schemas.agent_conversations.last_message_timestamp))
        .offset(start)
        .limit(Math.max(0, end - start)),
      body.with_count
        ? db.$count(schemas.agent_conversations, where)
        : Promise.resolve(0),
    ]);

    return { list, count };
  },
});

export default api;
