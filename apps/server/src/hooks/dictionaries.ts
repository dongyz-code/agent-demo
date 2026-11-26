import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db, schemas } from '@/database/index.js';
import { ROOT_ERROR } from '@/configs/index.js';
import { defineCache } from '@/hooks/cache/index.js';
import type { DbTransaction } from '@/database/index.js';
import type {
  DictionaryInput,
  DictionaryItemInput,
  DictionaryItemInfo,
  DictionaryOption,
  DictionaryQuery,
} from '@repo/types';

const types = schemas.dictionary;
const items = schemas.dictionary_item;
/** 业务选项缓存；管理修改后失效，Redis 故障时回源，TTL 为一小时（毫秒）。 */
const optionsCache = defineCache<DictionaryOption[]>({
  name: 'system.dictionary',
  label: '数据字典',
  ttl: 60 * 60 * 1_000,
  inspectable: true,
});

/** 写操作锁定所属类型，串行处理类型删除、启停和字典项变更。 */
async function lockDictionary(tx: DbTransaction, id: string) {
  const [row] = await tx
    .select()
    .from(types)
    .where(eq(types.id, id))
    .for('update');
  if (!row) {
    throw new ROOT_ERROR('字典不存在');
  }
  return row;
}

/** 唯一约束冲突提供业务提示，其余异常保持原样。 */
function throwWriteError(error: unknown): never {
  let cause = error;
  if (error instanceof Error && error.cause) {
    cause = error.cause;
  }
  if (
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    cause.code === '23505'
  ) {
    throw new ROOT_ERROR('字典编码或字典值已存在');
  }
  throw error;
}

/** 按接口约定解析半开分页区间，限制单次查询数量。 */
function pageRange(limit: number[] = [0, 20]) {
  const [start, end] = limit;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end - start > 100
  ) {
    throw new ROOT_ERROR('非法参数', '每页需查询 1 至 100 条记录');
  }
  return { offset: start, size: end - start };
}

/** 分页查询字典类型，名称或编码按关键词匹配。 */
export async function listDictionaries(query: DictionaryQuery) {
  const page = pageRange(query.limit);
  const filters = [];
  const search = query.search?.trim();
  if (search) {
    filters.push(
      or(ilike(types.name, `%${search}%`), ilike(types.code, `%${search}%`)),
    );
  }
  if (query.enabled !== undefined) {
    filters.push(eq(types.enabled, query.enabled));
  }
  const where = and(...filters);
  const [list, totals] = await Promise.all([
    db
      .select({
        id: types.id,
        code: types.code,
        name: types.name,
        enabled: types.enabled,
        remark: types.remark,
      })
      .from(types)
      .where(where)
      .orderBy(desc(types.create_timestamp), asc(types.id))
      .offset(page.offset)
      .limit(page.size),
    db.select({ value: count() }).from(types).where(where),
  ]);
  return { list, count: totals[0].value };
}

/** 保存类型；code 在编辑时必须与原值一致，事务提交后删除业务选项缓存。 */
export async function saveDictionary(input: DictionaryInput, operator: string) {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!name || !/^[a-z][a-z0-9_]*$/.test(code)) {
    throw new ROOT_ERROR(
      '非法参数',
      '名称不能为空，编码需以小写字母开头且仅含小写字母、数字和下划线',
    );
  }
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      const data = {
        name,
        code,
        enabled: input.enabled,
        remark: input.remark.trim(),
        last_update_user_id: operator,
        last_update_timestamp: now,
      };
      if (input.id) {
        const current = await lockDictionary(tx, input.id);
        if (current.code !== code) {
          throw new ROOT_ERROR('字典编码不能修改');
        }
        await tx.update(types).set(data).where(eq(types.id, input.id));
      } else {
        await tx.insert(types).values({
          ...data,
          id: randomUUID(),
          create_user_id: operator,
          create_timestamp: now,
        });
      }
    });
  } catch (error) {
    throwWriteError(error);
  }
  await optionsCache.del(code);
}

/** 含字典项时拒绝删除类型，避免误删业务正在引用的选项。 */
export async function removeDictionary(id: string) {
  const code = await db.transaction(async (tx) => {
    const row = await lockDictionary(tx, id);
    const [existing] = await tx
      .select({ id: items.id })
      .from(items)
      .where(eq(items.dictionary_id, id))
      .limit(1);
    if (existing) {
      throw new ROOT_ERROR('请先删除该字典下的字典项');
    }
    await tx.delete(types).where(eq(types.id, id));
    return row.code;
  });
  await optionsCache.del(code);
}

/** 将数据库字段映射为管理接口中的字典项。 */
function itemInfo(row: typeof items.$inferSelect): DictionaryItemInfo {
  return {
    id: row.id,
    dictionaryId: row.dictionary_id,
    label: row.label,
    value: row.value,
    sort: row.sort,
    enabled: row.enabled,
    remark: row.remark,
  };
}

/** 查询某类型的字典项，管理端可查看停用项。 */
export async function listDictionaryItems(
  dictionaryId: string,
  query: DictionaryQuery,
) {
  const page = pageRange(query.limit);
  const filters = [eq(items.dictionary_id, dictionaryId)];
  const search = query.search?.trim();
  if (search) {
    const condition = or(
      ilike(items.label, `%${search}%`),
      ilike(items.value, `%${search}%`),
    );
    if (condition) {
      filters.push(condition);
    }
  }
  if (query.enabled !== undefined) {
    filters.push(eq(items.enabled, query.enabled));
  }
  const where = and(...filters);
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(items)
      .where(where)
      .orderBy(asc(items.sort), asc(items.create_timestamp), asc(items.id))
      .offset(page.offset)
      .limit(page.size),
    db.select({ value: count() }).from(items).where(where),
  ]);
  return { list: rows.map(itemInfo), count: totals[0].value };
}

/** 保存字典项；唯一值由数据库约束保护，禁止跨类型移动。 */
export async function saveDictionaryItem(
  input: DictionaryItemInput,
  operator: string,
) {
  const label = input.label.trim();
  const value = input.value.trim();
  if (!label || !value) {
    throw new ROOT_ERROR('非法参数', '标签和值不能为空');
  }
  let code: string;
  try {
    code = await db.transaction(async (tx) => {
      const parent = await lockDictionary(tx, input.dictionaryId);
      const now = new Date();
      const data = {
        label,
        value,
        sort: input.sort,
        enabled: input.enabled,
        remark: input.remark.trim(),
        last_update_user_id: operator,
        last_update_timestamp: now,
      };
      if (input.id) {
        const updated = await tx
          .update(items)
          .set(data)
          .where(
            and(eq(items.id, input.id), eq(items.dictionary_id, parent.id)),
          )
          .returning({ id: items.id });
        if (!updated.length) {
          throw new ROOT_ERROR('字典项不存在');
        }
      } else {
        await tx.insert(items).values({
          ...data,
          id: randomUUID(),
          dictionary_id: parent.id,
          create_user_id: operator,
          create_timestamp: now,
        });
      }
      return parent.code;
    });
  } catch (error) {
    throwWriteError(error);
  }
  await optionsCache.del(code);
}

/** 删除指定类型下的字典项并使业务读取缓存失效。 */
export async function removeDictionaryItem(dictionaryId: string, id: string) {
  const code = await db.transaction(async (tx) => {
    const parent = await lockDictionary(tx, dictionaryId);
    const removed = await tx
      .delete(items)
      .where(and(eq(items.dictionary_id, dictionaryId), eq(items.id, id)))
      .returning({ id: items.id });
    if (!removed.length) {
      throw new ROOT_ERROR('字典项不存在');
    }
    return parent.code;
  });
  await optionsCache.del(code);
}

/** 按稳定编码读取启用项；类型停用或不存在时返回空数组，业务无需管理权限。 */
export async function dictionaryOptions(
  code: string,
): Promise<DictionaryOption[]> {
  return await optionsCache.wrap(code, async () => {
    return await db
      .select({ label: items.label, value: items.value })
      .from(items)
      .innerJoin(types, eq(items.dictionary_id, types.id))
      .where(
        and(
          eq(types.code, code),
          eq(types.enabled, true),
          eq(items.enabled, true),
        ),
      )
      .orderBy(asc(items.sort), asc(items.create_timestamp), asc(items.id));
  });
}
