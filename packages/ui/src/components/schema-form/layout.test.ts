import { describe, expect, it } from 'vitest';
import { buildLayoutItems, resolveColumnCount } from './layout';

import type { RuntimeSchemaFormField } from './type';

/** 创建测试用运行时字段，避免测试依赖组件渲染。 */
function createField(
  key: string,
  span?: number,
  collapsed?: boolean,
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
    valueType: 'text',
  };
}

describe('schema-form layout utils', () => {
  it('解析固定列数和断点列数', () => {
    expect(resolveColumnCount({ columns: 4, mode: 'search' })).toBe(4);
    expect(
      resolveColumnCount({
        columns: { md: 3, xs: 1 },
        mode: 'search',
      }),
    ).toBe(3);
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
