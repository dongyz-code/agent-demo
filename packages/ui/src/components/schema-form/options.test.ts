import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import {
  normalizeOptions,
  resolveDataOptions,
  resolveStaticOptions,
  valueEnumToOptions,
} from './options';

import type { NormalizedSchemaFormColumn } from './type';

describe('schema-form options utils', () => {
  it('把 valueEnum 转成标准选项', () => {
    expect(
      valueEnumToOptions({
        disabled: { disabled: true, text: '禁用' },
        enabled: '启用',
      }),
    ).toEqual([
      { label: '禁用', value: 'disabled', disabled: true },
      { label: '启用', value: 'enabled' },
    ]);
  });

  it('归一化普通数组选项并保留额外字段', () => {
    expect(
      normalizeOptions([
        {
          extra: 1,
          label: 'A',
          value: 'a',
        },
      ]),
    ).toEqual([
      {
        children: undefined,
        disabled: false,
        extra: 1,
        label: 'A',
        value: 'a',
      },
    ]);
  });

  it('同步读取 ref 和 computed data options', () => {
    const field = {
      column: {
        data: {
          options: computed(() => ref([{ label: 'A', value: 'a' }]).value),
          type: 'select',
        },
        dataIndex: 'status',
      },
      dataIndex: 'status',
      key: 'status',
      useDataControl: true,
      valueType: 'select',
    } as NormalizedSchemaFormColumn;

    expect(resolveStaticOptions(field)).toEqual([
      {
        children: undefined,
        disabled: false,
        label: 'A',
        value: 'a',
      },
    ]);
  });

  it('兼容异步函数形式 data options', async () => {
    const field = {
      column: {
        data: {
          async options() {
            return [{ label: 'A', value: 'a' }];
          },
          type: 'select',
        },
        dataIndex: 'status',
      },
      dataIndex: 'status',
      key: 'status',
      useDataControl: true,
      valueType: 'select',
    } as NormalizedSchemaFormColumn;

    await expect(resolveDataOptions(field)).resolves.toEqual([
      {
        children: undefined,
        disabled: false,
        label: 'A',
        value: 'a',
      },
    ]);
  });
});
