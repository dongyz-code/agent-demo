import { and, desc, eq, inArray } from 'drizzle-orm';

import { countRows, db, schema } from '@/database/index.js';
import { getOwnedSession, toUploadSessionInfo } from './shared.js';

import type {
  UploadPolicyKey,
  UploadSessionStatus,
} from '@repo/types';
import type { UploadActor } from './types.js';

/** 查询单个上传会话状态。 */
export async function getUploadSessionInfo(
  sessionId: string,
  actor: UploadActor,
) {
  return toUploadSessionInfo(await getOwnedSession(sessionId, actor));
}

/** 查询当前调用者的上传会话列表。 */
export async function listUploadSessions(
  form: {
    /** 状态筛选。 */
    status?: UploadSessionStatus[];
    /** 策略筛选。 */
    policyKey?: UploadPolicyKey[];
    /** 分页范围。 */
    limit?: number[];
    /** 是否返回总数。 */
    withCount?: boolean;
  },
  actor: UploadActor,
) {
  const [start = 0, end = 20] = form.limit ?? [];
  const where = and(
    eq(schema.file_upload_sessions.tenant_id, actor.tenantId),
    eq(schema.file_upload_sessions.create_user_id, actor.userId),
    form.status?.length
      ? inArray(schema.file_upload_sessions.status, form.status)
      : undefined,
    form.policyKey?.length
      ? inArray(schema.file_upload_sessions.policy_key, form.policyKey)
      : undefined,
  );
  const [list, count] = await Promise.all([
    db
      .select()
      .from(schema.file_upload_sessions)
      .where(where)
      .orderBy(desc(schema.file_upload_sessions.create_timestamp))
      .offset(start)
      .limit(Math.max(0, end - start)),
    form.withCount
      ? countRows(schema.file_upload_sessions, where)
      : Promise.resolve(0),
  ]);
  return { list: list.map(toUploadSessionInfo), count };
}
