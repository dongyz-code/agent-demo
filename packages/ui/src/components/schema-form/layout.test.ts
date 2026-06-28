import { describe, expect, it } from 'vitest';
import {
  buildLayoutItems,
  resolveColumnCount,
  resolveSearchLabelPosition,
} from './layout';

import type { RuntimeSchemaFormField } from './type';

/** 创建测试用运行时字段，避免测试依赖组件渲染。 */
function createField(
  key: string,
  span?: number,
  collapsed?: boolean,
  valueType: RuntimeSchemaFormField['valueType'] = 'text',
): RuntimeSchemaFormField {
  return {
    column: {
      colProps: span ? { span } : undefined,
      dataIndex: key,
      search: collapsed ? { collapsed: true } : undefined,
    },
    dataIndex: key,
    disabled: false,
    fieldProps: {},
    formItemProps: {},
    hidden: false,
    index: 0,
    key,
    readonly: false,
    title: key,
    useLegacyData: false,
    value: undefined,
    valueType,
  };
}

describe('schema-form layout utils', () => {
  it('解析固定列数和响应式断点列数', () => {
    expect(resolveColumnCount({ columns: 4, mode: 'search' })).toBe(4);
    expect(resolveColumnCount({ mode: 'search', width: 500 })).toBe(1);
    expect(resolveColumnCount({ mode: 'search', width: 700 })).toBe(2);
    expect(resolveColumnCount({ mode: 'search', width: 1000 })).toBe(3);
    expect(resolveColumnCount({ mode: 'search', width: 1400 })).toBe(4);
    expect(
      resolveColumnCount({
        columns: { md: 3, xs: 1 },
        mode: 'search',
        width: 500,
      }),
    ).toBe(1);
  });

  it('查询表单在窄容器下切换为上下 label', () => {
    expect(resolveSearchLabelPosition({ width: 500 })).toBe('top');
    expect(resolveSearchLabelPosition({ width: 700 })).toBe('top');
    expect(resolveSearchLabelPosition({ width: 1000 })).toBe('left');
  });

  it('按 span 计算 grid 位置并支持收起行', () => {
    const items = buildLayoutItems({
      collapsed: true,
      collapsedRows: 1,
      columns: 4,
      fields: [createField('a', 2), createField('b', 2), createField('c')],
      mode: 'search',
    });

    expect(items[0]!.style.gridColumn).toBe('1 / span 2');
    expect(items[1]!.style.gridColumn).toBe('3 / span 2');
    expect(items[2]!.visibleWhenCollapsed).toBe(false);
  });

  it('dateRange 在查询模式下默认占一个格子', () => {
    const [item] = buildLayoutItems({
      collapsed: false,
      collapsedRows: 2,
      columns: 4,
      fields: [createField('date', undefined, false, 'dateRange')],
      mode: 'search',
    });

    expect(item!.style.gridColumn).toBe('1 / span 1');
  });

  it('收起两行时为内联操作区预留一个格子', () => {
    const items = buildLayoutItems({
      collapsed: true,
      collapsedRows: 2,
      columns: 4,
      fields: [
        createField('a'),
        createField('b'),
        createField('c'),
        createField('d'),
        createField('e'),
        createField('f'),
        createField('g'),
        createField('h'),
      ],
      mode: 'search',
      reserveActionSlot: true,
    });

    expect(items.slice(0, 7).every((item) => item.visibleWhenCollapsed)).toBe(
      true,
    );
    expect(items[7]!.visibleWhenCollapsed).toBe(false);
  });

  it('字段级 collapsed 会在收起态隐藏字段', () => {
    const [item] = buildLayoutItems({
      collapsed: true,
      collapsedRows: 2,
      columns: 4,
      fields: [createField('advanced', 1, true)],
      mode: 'search',
    });

    expect(item!.visibleWhenCollapsed).toBe(false);
  });
});
