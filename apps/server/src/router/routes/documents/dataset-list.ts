import { and, desc, ilike, inArray } from 'drizzle-orm';

import { countRows, db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-list',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.dataset'),
  handler: async ({ body }) => {
    const [start = 0, end = 20] = body.limit ?? [];
    const where = and(
      body.search?.trim()
        ? ilike(schema.rag_datasets.name, `%${body.search.trim()}%`)
        : undefined,
      body.status?.length
        ? inArray(schema.rag_datasets.status, body.status)
        : undefined,
    );
    const [list, count] = await Promise.all([
      db
        .select({
          datasetId: schema.rag_datasets.dataset_id,
          name: schema.rag_datasets.name,
          description: schema.rag_datasets.description,
          status: schema.rag_datasets.status,
          createdAt: schema.rag_datasets.create_timestamp,
        })
        .from(schema.rag_datasets)
        .where(where)
        .orderBy(desc(schema.rag_datasets.create_timestamp))
        .offset(start)
        .limit(Math.max(0, end - start)),
      body.withCount
        ? countRows(schema.rag_datasets, where)
        : Promise.resolve(0),
    ]);
    return { list, count };
  },
});

export default api;
