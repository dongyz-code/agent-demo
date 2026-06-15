import { ROOT } from '@/configs/env.js';
import { db, schema } from '@/database/index.js';
import { taskAddHelper } from '@/hooks/task/index.js';
import { routerHandler } from '@/router/utils.js';
import { eq } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/main/app-deploy',
  method: 'POST',
  handler: async ({ body: { id, hash }, operator }) => {
    const [item] = await db
      .update(schema.ai_app)
      .set({
        deploy_hash: Buffer.from(hash, 'hex'),
        available: true,
      })
      .where(eq(schema.ai_app.id, id))
      .returning();

    await taskAddHelper({
      key: 'appBuildDeploy',
      args: [{ id, purpose: 'deploy', name: item.name }],
      sqlInfo: {
        trigger_method: 'manual',
        execution_user_id:
          operator === ROOT.SYS_ADMIN_USER_ID ? null : operator,
      },
    });

    return 'ok';
  },
});

export default api;
