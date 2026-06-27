import { describe, expect, it } from 'vitest';
import { buildSubmitParams, getFormValue, setFormValue } from './value';

describe('schema-form value utils', () => {
  it('按点路径读取和写入表单值，且不修改原对象', () => {
    const form = {
      user: {
        name: 'old',
      },
    };

    const next = setFormValue(form, 'user.name', 'new');

    expect(getFormValue(next, 'user.name')).toBe('new');
    expect(getFormValue(form, 'user.name')).toBe('old');
    expect(next).not.toBe(form);
    expect(next.user).not.toBe(form.user);
  });

  it('提交时支持字段 transform 合并查询参数', () => {
    const form = {
      keyword: 'abc',
      range: ['2026-01-01', '2026-01-02'],
    };

    const params = buildSubmitParams({
      fields: [
        { dataIndex: 'keyword' },
        {
          dataIndex: 'range',
          search: {
            transform(value) {
              const [start, end] = value as string[];
              return {
                end_time: end,
                start_time: start,
              };
            },
          },
        },
      ],
      form,
    });

    expect(params).toEqual({
      end_time: '2026-01-02',
      keyword: 'abc',
      start_time: '2026-01-01',
    });
  });
});
