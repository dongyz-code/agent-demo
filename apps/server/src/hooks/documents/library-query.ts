import { and, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import {
  libraryAdminListWhere,
  resolveLibraryAccess,
} from './library-access.js';

import type {
  LibraryInfo,
  LibraryStatus,
  LibraryVisibility,
} from '@repo/types';

/** 资料库列表查询条件。 */
export interface SearchLibrariesInput {
  /** 名称关键词。 */
  search?: string;
  /** 可见性筛选。 */
  visibility?: LibraryVisibility[];
  /** 状态筛选。不传时只看未归档库。 */
  status?: LibraryStatus[];
  /** 列表范围。created 为我创建的，joined 为我参与的，archived 为已归档。 */
  scope?: 'created' | 'joined' | 'archived';
  /** 左闭右开分页。 */
  limit?: number[];
  /** 是否返回总数。 */
  withCount?: boolean;
}

/**
 * 查询当前用户能看到的资料库。
 *
 * @param input 筛选和分页。
 * @param userId 当前用户。
 * @returns 资料库列表和可选总数。
 */
export async function searchLibraries(
  input: SearchLibrariesInput,
  userId: string,
): Promise<{ list: LibraryInfo[]; count: number }> {
  const [start = 0, end = 20] = input.limit ?? [];
  let statuses: LibraryStatus[] = ['active'];
  if (input.scope === 'archived') statuses = ['archived'];
  if (input.scope !== 'archived' && input.status?.length)
    statuses = input.status;
  const where = buildWhere((filter) => {
    const access = libraryAdminListWhere(userId);
    if (access) filter.push(access);
    const search = input.search?.trim();
    if (search) filter.push(ilike(schemas.libraries.name, `%${search}%`));
    if (input.visibility?.length) {
      filter.push(inArray(schemas.libraries.visibility, input.visibility));
    }
    filter.push(inArray(schemas.libraries.status, statuses));
    if (input.scope === 'created') {
      filter.push(eq(schemas.libraries.create_user_id, userId));
    }
    if (input.scope === 'joined') {
      filter.push(sql`${schemas.libraries.create_user_id} <> ${userId}`);
    }
  });
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(schemas.libraries)
      .where(where)
      .orderBy(desc(schemas.libraries.create_timestamp))
      .offset(start)
      .limit(Math.max(0, end - start)),
    input.withCount
      ? db.select({ value: count() }).from(schemas.libraries).where(where)
      : Promise.resolve([]),
  ]);
  return {
    list: await toLibraryInfos(rows, userId),
    count: countRows[0]?.value ?? 0,
  };
}

/**
 * 读取一个当前用户可见的资料库。
 *
 * @param libraryId 资料库标识。
 * @param userId 当前用户。
 * @returns 资料库详情。
 */
export async function getLibrary(libraryId: string, userId: string) {
  const access = await resolveLibraryAccess(libraryId, userId, 'admin');
  if (!access) throw new ROOT_ERROR('资料库不存在');
  const [library] = await db
    .select()
    .from(schemas.libraries)
    .where(eq(schemas.libraries.library_id, libraryId))
    .limit(1);
  if (!library) throw new ROOT_ERROR('资料库不存在');
  const [info] = await toLibraryInfos([library], userId);
  return info!;
}

/**
 * 给资料库行补上文档数、授权数和当前身份。
 *
 * @param rows 已经过权限过滤的资料库行。
 * @param userId 当前用户。
 * @returns 列表项。
 */
async function toLibraryInfos(
  rows: (typeof schemas.libraries.$inferSelect)[],
  userId: string,
): Promise<LibraryInfo[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.library_id);
  const [documents, grants] = await Promise.all([
    db
      .select({
        libraryId: schemas.documents.library_id,
        value: count(),
      })
      .from(schemas.documents)
      .where(
        and(
          inArray(schemas.documents.library_id, ids),
          sql`${schemas.documents.status} <> 'deleted'`,
        ),
      )
      .groupBy(schemas.documents.library_id),
    db
      .select({
        libraryId: schemas.library_grants.library_id,
        value: count(),
      })
      .from(schemas.library_grants)
      .where(inArray(schemas.library_grants.library_id, ids))
      .groupBy(schemas.library_grants.library_id),
  ]);
  const documentCount = new Map(
    documents.map((row) => [row.libraryId, row.value]),
  );
  const grantCount = new Map(grants.map((row) => [row.libraryId, row.value]));
  const infos: LibraryInfo[] = [];
  for (const row of rows) {
    const access = await resolveLibraryAccess(row.library_id, userId, 'admin');
    const myRole = userId === ROOT.SYS_ADMIN_USER_ID ? 'manager' : access?.role;
    if (!myRole) continue;
    infos.push({
      libraryId: row.library_id,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      status: row.status,
      myRole,
      documentCount: documentCount.get(row.library_id) ?? 0,
      grantCount: grantCount.get(row.library_id) ?? 0,
      createdAt: row.create_timestamp,
      createdBy: row.create_user_id,
    });
  }
  return infos;
}
