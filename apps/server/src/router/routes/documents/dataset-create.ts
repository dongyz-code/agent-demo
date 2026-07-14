import { randomUUID } from 'node:crypto';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { toDatasetInfo } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-create',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.dataset-create'),
  handler: async ({ body, __token }) => {
    const name = body.name.trim();
    if (!name) {
      throw new ROOT_ERROR('非法参数', 'RAG_DATASET_NAME_REQUIRED: 知识库名称不能为空');
    }
    const now = new Date();
    const [created] = await db
      .insert(schema.rag_datasets)
      .values({
        dataset_id: randomUUID(),
        name,
        description: body.description?.trim() || null,
        status: 'active',
        create_user_id: __token.user_id,
        create_timestamp: now,
        last_update_user_id: __token.user_id,
        last_update_timestamp: now,
      })
      .returning();
    if (!created) {
      throw new Error('知识库创建失败');
    }
    return toDatasetInfo(created);
  },
});

export default api;
