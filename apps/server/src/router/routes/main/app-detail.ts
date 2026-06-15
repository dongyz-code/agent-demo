import { db, schema, whereAll } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { desc, inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/main/app-detail',
  method: 'POST',
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const list = await db
      .select({
        id: schema.ai_app.id,
        name: schema.ai_app.name,
        desc: schema.ai_app.desc,
        domain: schema.ai_app.domain,
        available: schema.ai_app.available,
        create_timestamp: schema.ai_app.create_timestamp,
        last_update_timestamp: schema.ai_app.last_update_timestamp,
        create_user_id: schema.ai_app.create_user_id,
        last_update_user_id: schema.ai_app.last_update_user_id,
        deploy_hash: schema.ai_app.deploy_hash,
      })
      .from(schema.ai_app)
      .where(inArray(schema.ai_app.id, ids));

    /** 每个应用最近一次 appBuildDeploy 任务状态（pending_uuid 即应用 id） */
    const deployTasks = await db
      .selectDistinctOn([schema.tasks.pending_uuid], {
        pending_uuid: schema.tasks.pending_uuid,
        status: schema.tasks.status,
      })
      .from(schema.tasks)
      .where(
        whereAll(
          inArray(schema.tasks.pending_uuid, ids),
          inArray(schema.tasks.task_key, ['appBuildDeploy']),
        ),
      )
      .orderBy(schema.tasks.pending_uuid, desc(schema.tasks.create_timestamp));
    const deployTaskStatusByAppId = new Map(
      deployTasks.map((row) => [row.pending_uuid, row.status]),
    );

    return list.map(({ deploy_hash, ...rest }) => {
      return {
        ...rest,
        deploy_hash: deploy_hash ? deploy_hash.toString('hex') : null,
        deploy_status: deployTaskStatusByAppId.get(rest.id) ?? null,
      };
    });
  },
});

export default api;
