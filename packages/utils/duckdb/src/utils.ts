import type { Merge, Simplify } from '@repo/types';
import type { DuckDB, DataModel } from './client.js';

/** SQL 生成 对应 where 子句 */
function getFilterQuery(
  callback?: (filter: string[], params: unknown[]) => void,
) {
  const filter: string[] = [];
  const params: unknown[] = [];
  callback?.(filter, params);

  const filterStr = filter.length ? ` WHERE ${filter.join(' AND ')} ` : '';

  return {
    filter: filterStr,
    params,
    filterSource: {
      filter,
      params,
    },
  };
}

export type FilterItem<K, T> =
  | {
      key: K;
      val: T | T[];
    }
  | {
      key: K;
      role: '=' | 'ilike' | 'like' | '<>' | '>' | '<' | '>=' | '<=';
      val: T;
    }
  | {
      key: K;
      role: 'in' | 'not in';
      val: T[];
    }
  | {
      key: K;
      role: 'between';
      val: [T, T];
    }
  | {
      filter: string;
      params: unknown[];
    };

export type FilterItems<Key, Val> =
  | FilterItem<Key, Val>
  | {
      relation: 'OR' | 'AND';
      items: FilterItem<Key, Val>[][];
    };

/** 一些常用方法 */
export function initDuckDbUtils<SqlData extends DataModel>({
  client,
}: {
  client: DuckDB<SqlData>;
}) {
  type CustomField = {
    sql: string;
    params?: unknown[];
    /** 自定义返回类型，类型断言 */
    $res?: unknown;
  };

  type Field<T extends keyof SqlData, Table extends keyof SqlData[T]> =
    | (keyof SqlData[T][Table])[]
    | '*'
    | CustomField;

  type FilterModel<
    T extends keyof SqlData,
    Table extends keyof SqlData[T],
  > = NonNullable<
    {
      [key in keyof SqlData[T][Table]]?: FilterItems<
        key,
        SqlData[T][Table][key]
      >;
    }[keyof SqlData[T][Table]]
  >[];

  type HelperBase<
    T extends keyof SqlData,
    Table extends keyof SqlData[T],
    U extends Record<string, unknown> = Record<string, unknown>,
  > = Merge<
    {
      db: T;
      suffix?: string | number;
      /** 数据表 */
      table: Table;
      /** 复制条件过滤（自定义） */
      where?: Parameters<typeof getFilterQuery>[0];
      /** 简单过滤辅助 */
      whereHelper?: FilterModel<T, Table>;
      /** 打印拼接后的查询字符串 */
      logFormat?: boolean;
    },
    U
  >;

  type GetHelper<
    T extends keyof SqlData,
    Table extends keyof SqlData[T],
    U extends Field<T, Table>,
  > = HelperBase<
    T,
    Table,
    {
      /** 字段 */
      fields: U;
      sqlSuffix?: {
        sql?: string;
        params?: unknown[];
      };
    }
  >;

  type CountHelper<
    T extends keyof SqlData,
    Table extends keyof SqlData[T],
  > = HelperBase<T, Table, Record<string, unknown>>;

  type GetHelperRes<
    T extends keyof SqlData,
    Table extends keyof SqlData[T],
    U extends Field<T, Table>,
  > = U extends '*'
    ? SqlData[T][Table]
    : U extends (keyof SqlData[T][Table])[]
      ? Simplify<Pick<SqlData[T][Table], U[number]>>
      : U extends CustomField
        ? NonNullable<U['$res']>
        : never;

  function filterModel<
    T extends keyof SqlData,
    Table extends keyof SqlData[T],
  >({
    db,
    table,
    filter,
  }: {
    db: T;
    table: Table;
    filter?: NoInfer<FilterModel<T, Table>>;
  }) {
    const filterStr: string[] = [];
    const filterParams: unknown[] = [];
    if (filter) {
      filter.forEach((item) => {
        if ('filter' in item) {
          filterStr.push(item.filter);
          filterParams.push(...item.params);
        } else if ('relation' in item) {
          const temp = item.items.map((x) =>
            filterModel({ db, table, filter: x }),
          );
          filterStr.push(
            `(${temp.map((x) => `(${x.filterStr.join(' AND ')})`).join(` ${item.relation} `)})`,
          );
          filterParams.push(...temp.map((x) => x.filterParams).flat());
        } else {
          const { key, val } = item;
          if ('role' in item && item.role === 'between') {
            filterStr.push(`${key as string} between ? and ?`);
            filterParams.push(...item.val);
          } else {
            const role =
              'role' in item ? item.role : Array.isArray(val) ? 'in' : '=';
            filterStr.push(`${key as string} ${role} ?`);
            filterParams.push(val);
          }
        }
      });
    }
    return {
      filterStr,
      filterParams,
    };
  }

  function whereHelper<
    T extends keyof SqlData,
    Table extends keyof SqlData[T],
  >({ filter }: { db: T; table: Table; filter: FilterModel<T, Table> }) {
    return filter;
  }

  async function getHelper<
    T extends keyof SqlData,
    Table extends keyof SqlData[T],
    U extends Field<T, Table>,
  >({
    db,
    table,
    suffix,
    fields,
    where,
    whereHelper,
    sqlSuffix = {},
    logFormat,
  }: GetHelper<T, Table, U>) {
    type Val = GetHelperRes<T, Table, U>;

    const { filter, params } = getFilterQuery((filter, params) => {
      if (whereHelper) {
        const temp = filterModel({ db, table, filter: whereHelper });
        filter.push(...temp.filterStr);
        params.push(...temp.filterParams);
      }
      where?.(filter, params);
    });

    let fieldsStr = '';
    let fieldsParams: unknown[] = [];
    if (fields === '*') {
      fieldsStr = '*';
    } else if (Array.isArray(fields)) {
      fieldsStr = `${fields.map((x) => `"${x as string}"`).join(', ')}`;
    } else {
      fieldsStr = fields.sql;
      fieldsParams = fields.params ?? fieldsParams;
    }

    const finalSql = `select ${fieldsStr} from "${table as string}" ${filter} ${
      sqlSuffix?.sql ?? ''
    }`;

    const finalParams = [
      ...fieldsParams,
      ...params,
      ...(sqlSuffix.params ?? []),
    ];

    if (logFormat) {
      console.log({
        getHelper: client.format(finalSql, finalParams),
      });
    }

    const resp = await client.useReadOnly({
      db,
      suffix,
      async handler({ instance }) {
        const result = await client.query({
          instance,
          query: finalSql,
          params: finalParams,
        });
        return await result.getRowObjectsJS();
      },
    });

    return resp as Val[];
  }

  async function countHelper<
    T extends keyof SqlData,
    Table extends keyof SqlData[T],
  >({ db, suffix, table, logFormat, ...rest }: CountHelper<T, Table>) {
    const { filter, params } = getFilterQuery((filter, params) => {
      const whereHelper = rest.whereHelper;
      const where = rest.where;

      if (whereHelper) {
        const temp = filterModel({ db, table, filter: whereHelper });
        filter.push(...temp.filterStr);
        params.push(...temp.filterParams);
      }
      where?.(filter, params);
    });

    const finalSql = `select count(*) as count from ${table as string}${filter}`;
    const finalParams = [...params];

    if (logFormat) {
      console.log({
        countHelper: client.format(finalSql, finalParams),
      });
    }

    const [cur] = await client.useReadOnly({
      db,
      suffix,
      async handler({ instance }) {
        const result = await client.query({
          instance,
          query: finalSql,
          params: finalParams,
        });
        return await client.rows(result);
      },
    });

    return Number(cur.count);
  }

  return {
    /** WHERE 辅助函数 */
    whereHelper,
    /** GET 辅助函数 */
    getHelper,
    /** COUNT 辅助函数 */
    countHelper,
    getFilterQuery,
    filterModel,
  };
}
