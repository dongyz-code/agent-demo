import { eq, ne } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import { getDocumentDetail } from '@/hooks/documents/document/read.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-rag-default-update',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.dataset-document-manage'),
  handler: async ({ body, __token }) => {
    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.documents.document_id, body.documentId),
        eq(schemas.documents.create_user_id, __token.user_id),
        ne(schemas.documents.status, 'deleted'),
      );
    });
    const [updated] = await db
      .update(schemas.documents)
      .set({
        rag_enabled: body.ragEnabled,
        last_update_user_id: __token.user_id,
        last_update_timestamp: new Date(),
      })
      .where(where)
      .returning({ id: schemas.documents.document_id });
    if (!updated) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    return await getDocumentDetail(body.documentId, __token.user_id);
  },
});

export default api;
