import { and, eq } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/agent/conversation-delete',
  method: 'POST',
  handler: async ({ body, __token }) => {
    const andWhere: Parameters<typeof and> = [];
    andWhere.push(
      eq(schemas.agent_conversations.conversation_id, body.conversation_id),
    );

    if (__token.user_id !== ROOT.SYS_ADMIN_USER_ID) {
      andWhere.push(eq(schemas.agent_conversations.user_id, __token.user_id));
    }

    const [deleted] = await db
      .update(schemas.agent_conversations)
      .set({ status: 'deleted' })
      .where(and(...andWhere))
      .returning({
        conversation_id: schemas.agent_conversations.conversation_id,
      });

    console.log('deleted', deleted);

    if (!deleted) {
      throw new ROOT_ERROR('Agent: 会话不存在');
    }

    return { ok: true };
  },
});

export default api;
