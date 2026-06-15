/**
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-params.html
 *
 *
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/number.html
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/doc-values.html
 */

import { getKeys } from '@repo/utils-node';

import type { estypes } from '@elastic/elasticsearch';

function helper<T extends Record<string, estypes.MappingProperty>>(data: T) {
  return data;
}

/**
 * https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/keyword
 *
 *
 * 字段映射
 */
export const ES_BASE_PROPERTIES = helper({
  /** 日期 */
  date: {
    type: 'date',
  },
  /** -2**31 - 2**31-1 */
  integer: {
    type: 'integer',
  },
  /** -2**63 - 2**63-1 */
  long: {
    type: 'long',
  },
  /** A single-precision 32-bit IEEE 754 floating point number, restricted to finite values */
  float: {
    type: 'float',
  },
  boolean: {
    type: 'boolean',
  },
  /** 通配符 */
  wildcard: {
    type: 'wildcard',
  },
  keyword: {
    type: 'keyword',
  },
  /** 文本信息，仅存储，不参与检索、聚合、脚本使用 */
  'disable-text': {
    type: 'text',
    index: false,
    norms: false,
    analyzer: 'keyword',
  },
  /** 对象结构，仅存储，不参与检索、聚合、脚本使用 */
  'disable-object': {
    type: 'object',
    enabled: false,
  },
});

type BaseProperty = keyof typeof ES_BASE_PROPERTIES;

type BasePropertyWithSource =
  | BaseProperty
  | {
      role: 'es.mapping';
      data: estypes.MappingProperty;
    };

export type BasePropertyWithNested<Nested extends string = string> =
  | BasePropertyWithSource
  | {
      role: 'es.nested';
      data: Record<Nested, BasePropertyWithSource>;
    };

/** 获取 setting.properties Record<string, setting.properties> */
export function getProperties<T extends Record<string, BasePropertyWithNested>>(
  config: T,
) {
  const obj = {} as Record<keyof T, estypes.MappingProperty>;

  getKeys(config).forEach((key) => {
    const val = config[key];
    if (typeof val === 'string') {
      obj[key] = ES_BASE_PROPERTIES[val as BaseProperty];
    } else {
      const { role, data } = val;
      if (role === 'es.mapping') {
        obj[key] = data;
      } else {
        obj[key] = {
          type: 'nested',
          properties: getProperties(data),
        };
      }
    }
  });
  return obj;
}
