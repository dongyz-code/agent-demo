import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { pickObj } from '@repo/utils-node';

import { domainRegex, domainRegexError } from './app-create.js';
import { taskAddHelper } from '@/hooks/task/index.js';
import { eq } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/main/app-update',
  method: 'POST',
  handler: async ({ body: { id, update }, operator, now }) => {
    const updateForm = pickObj(update, ['name', 'desc', 'available', 'domain']);
    if (Object.keys(updateForm).length) {
      if (
        'domain' in updateForm &&
        updateForm.domain &&
        updateForm.domain.match(domainRegex)
      ) {
        throw new Error(domainRegexError);
      }

      await db
        .update(schema.ai_app)
        .set({
          ...updateForm,
          last_update_user_id: operator,
          last_update_timestamp: now,
        })
        .where(eq(schema.ai_app.id, id));

      if ('available' in updateForm) {
        await taskAddHelper({
          key: 'appBuildDeploy',
          args: [
            {
              id,
              purpose: updateForm.available ? 'restart' : 'stop',
              name: updateForm.name ?? '-',
            },
          ],
          sqlInfo: {
            trigger_method: 'manual',
            execution_user_id: operator,
          },
        });
      }
    }

    return 'ok';
  },
});

export default api;
