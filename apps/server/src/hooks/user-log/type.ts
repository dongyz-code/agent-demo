import { getKeys } from '@repo/utils-node';

import type { Simplify, UnionToIntersection } from '@/types/index.js';

type Item = {
  /** 描述 */
  label: string;
  /** detail 类型 */
  detail?: unknown;
};

export type LogTypeObj = {
  [key: string]: Item | LogTypeObj;
};

type MustString<T> = T extends string ? T : never;
type AddPrefix<P, K> = P extends ''
  ? MustString<K>
  : `${MustString<P>}.${MustString<K>}`;

export type RecursionFlat<T extends LogTypeObj, Prefix = ''> = Simplify<
  UnionToIntersection<
    {
      [key in keyof T]: T[key] extends Item
        ? {
            [key2 in `${AddPrefix<Prefix, key>}`]: T[key];
          }
        : T[key] extends LogTypeObj
          ? RecursionFlat<T[key], AddPrefix<Prefix, key>>
          : never;
    }[keyof T]
  >
>;

export function logHelper<T extends LogTypeObj>(CONF: T) {
  type LogConf = RecursionFlat<T>;
  type LogType = MustString<keyof LogConf>;

  const CONF_MAP = (() => {
    const obj = {} as any;
    const min = (val: LogTypeObj, prefix = '') => {
      getKeys(val).forEach((key) => {
        const id = (prefix ? `${prefix}.${key}` : key) as LogType;
        if ('label' in val[key]) {
          obj[id] = val[key] as any;
        } else {
          min(val[key] as LogTypeObj, id);
        }
      });
    };
    min(CONF);
    return obj as LogConf;
  })();

  return {
    CONF,
    CONF_MAP,
  };
}
