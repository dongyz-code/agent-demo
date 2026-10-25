import { and, eq, ne } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';

/** 文档版本解析可复用的数据库查询能力。 */
type DocumentVersionExecutor = Pick<typeof db, 'select'>;

/**
 * 查询当前或显式指定的文档版本及其源文件。
 *
 * @param documentId 文档稳定标识。
 * @param documentVersionId 可选显式版本；为空时使用 activeVersion。
 * @param userId 当前用户，现阶段数据范围为创建人。
 * @param executor 可选入队或业务事务。
 * @returns 通过数据范围校验的文档、版本和源文件联合行。
 * @throws 文档、版本或源文件不属于当前用户时抛出业务错误。
 */
export async function resolveDocumentVersion(
  documentId: string,
  documentVersionId: string | undefined,
  userId: string,
  executor: DocumentVersionExecutor = db,
) {
  const where = buildWhere((filter) => {
    filter.push(
      eq(schemas.documents.document_id, documentId),
      eq(schemas.documents.create_user_id, userId),
      ne(schemas.documents.status, 'deleted'),
    );
  });
  const [row] = await executor
    .select({
      document: schemas.documents,
      version: schemas.document_versions,
      file: schemas.files,
    })
    .from(schemas.documents)
    .innerJoin(
      schemas.document_versions,
      and(
        eq(schemas.document_versions.document_id, schemas.documents.document_id),
        documentVersionId
          ? eq(
              schemas.document_versions.document_version_id,
              documentVersionId,
            )
          : eq(
              schemas.document_versions.document_version_id,
              schemas.documents.active_version_id,
            ),
      ),
    )
    .innerJoin(
      schemas.files,
      eq(schemas.files.file_id, schemas.document_versions.source_file_id),
    )
    .where(where)
    .limit(1);
  if (!row) {
    throw new ROOT_ERROR('相关文件不存在');
  }
  return row;
}
