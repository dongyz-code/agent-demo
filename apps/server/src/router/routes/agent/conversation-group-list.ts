import { count, eq, inArray, isNull, max } from 'drizzle-orm';

import { buildWhere, db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/agent/conversation-group-list',
  method: 'POST',
  handler: async ({ body, __token }) => {
    const statuses = body.status ?? ['active', 'archived'];
    const where = buildWhere((filter) => {
      if (__token.user_id) {
        filter.push(eq(schemas.agent_conversations.user_id, __token.user_id));
      } else {
        filter.push(isNull(schemas.agent_conversations.user_id));
      }
      filter.push(inArray(schemas.agent_conversations.status, statuses));
    });

    const list = await db
      .select({
        scenario: schemas.agent_conversations.scenario,
        count: count(),
        last_message_timestamp: max(
          schemas.agent_conversations.last_message_timestamp,
        ),
      })
      .from(schemas.agent_conversations)
      .where(where)
      .groupBy(schemas.agent_conversations.scenario);

    return { list };
  },
});

export default api;
