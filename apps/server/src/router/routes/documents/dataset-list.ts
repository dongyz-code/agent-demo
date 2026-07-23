import { and, desc, ilike, inArray } from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';
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
        ? ilike(schemas.rag_datasets.name, `%${body.search.trim()}%`)
        : undefined,
      body.status?.length
        ? inArray(schemas.rag_datasets.status, body.status)
        : undefined,
    );
    const [list, count] = await Promise.all([
      db
        .select({
          datasetId: schemas.rag_datasets.dataset_id,
          name: schemas.rag_datasets.name,
          description: schemas.rag_datasets.description,
          status: schemas.rag_datasets.status,
          createdAt: schemas.rag_datasets.create_timestamp,
        })
        .from(schemas.rag_datasets)
        .where(where)
        .orderBy(desc(schemas.rag_datasets.create_timestamp))
        .offset(start)
        .limit(Math.max(0, end - start)),
      body.withCount
        ? db.$count(schemas.rag_datasets, where)
        : Promise.resolve(0),
    ]);
    return { list, count };
  },
});

export default api;
