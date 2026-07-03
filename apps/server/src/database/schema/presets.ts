import { trigger, triggerFunction } from './declaration.js';
import { validateSqlIdentifier } from './descriptor.js';

import type { SchemaTriggerFunction } from './types.js';

/** trigger 名默认前缀，挂在各自表上，同名不会跨表冲突。 */
const DEFAULT_TRIGGER_NAME = 'trg_touch_timestamps';
/** trigger function 名默认前缀，拼上列名后形成确定性函数名。 */
const DEFAULT_FUNCTION_PREFIX = 'fn_touch_timestamps';

/** timestampsTrigger 的可选项，列名必传，不再从 baseCols 隐式约定。 */
export type TimestampsTriggerOptions = {
  /** 创建时间列名，必传。 */
  createColumn: string;
  /** 更新时间列名，必传。 */
  updateColumn: string;
  /** trigger function 名；不传时按列名派生为 fn_touch_timestamps_<create>_<update>。 */
  functionName?: string;
  /** trigger 名，默认 trg_touch_timestamps。 */
  triggerName?: string;
};

/**
 * 通用时间戳维护预设：insert 时写入创建/更新时间，update 时刷新更新时间并冻结创建时间。
 *
 * 列名必须显式传入，产物可直接 `...spread` 进 pgTable 第三个参数。多张表传相同列名时
 * 派生出相同函数名，DB 层 `create or replace function` 天然幂等，多表共用同一份函数。
 *
 * @param options 列名与命名覆盖，列名必传。
 * @returns trigger function 与 trigger 声明数组，元素带内部标记，供 splitExtraConfig 识别。
 */
export function timestampsTrigger({
  createColumn,
  updateColumn,
  functionName,
  triggerName,
}: TimestampsTriggerOptions) {
  validateSqlIdentifier(createColumn, '创建时间列名');
  validateSqlIdentifier(updateColumn, '更新时间列名');

  const resolvedFunctionName =
    functionName ?? `${DEFAULT_FUNCTION_PREFIX}_${createColumn}_${updateColumn}`;
  const resolvedTriggerName = triggerName ?? DEFAULT_TRIGGER_NAME;

  const fn: SchemaTriggerFunction = {
    name: resolvedFunctionName,
    returns: 'trigger',
    language: 'plpgsql',
    body: buildTimestampsBody({ createColumn, updateColumn }),
  };

  return [
    triggerFunction(fn),
    trigger({
      name: resolvedTriggerName,
      timing: 'before',
      events: ['insert', 'update'],
      execute: fn,
    }),
  ];
}

/**
 * 拼接时间戳 trigger function 的 plpgsql 函数体。
 *
 * insert 写入两个时间戳为 now()；update 冻结创建时间、刷新更新时间，保证创建时间不可被覆盖。
 */
function buildTimestampsBody({
  createColumn,
  updateColumn,
}: {
  /** 创建时间列名。 */
  createColumn: string;
  /** 更新时间列名。 */
  updateColumn: string;
}) {
  return [
    'begin',
    '  if tg_op = \'INSERT\' then',
    `    new.${createColumn} = now();`,
    `    new.${updateColumn} = now();`,
    '  else',
    `    new.${createColumn} = old.${createColumn};`,
    `    new.${updateColumn} = now();`,
    '  end if;',
    '  return new;',
    'end',
  ].join('\n');
}
