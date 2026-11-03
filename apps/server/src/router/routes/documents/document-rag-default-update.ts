import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { documentAccessWhere, lockDocument } from '@/hooks/documents/access.js';
import { documentAction } from '@/hooks/documents/document-action.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-rag-default-update',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.dataset-document-manage'),
  handler: async ({ body, __token }) => {
    const where = documentAccessWhere(__token.user_id, body.documentId);
    await db.transaction(async (transaction) => {
      await lockDocument(transaction, body.documentId);
      const [updated] = await transaction
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
    });
    return await documentAction.getDetail(body.documentId, __token.user_id);
  },
});

export default api;
