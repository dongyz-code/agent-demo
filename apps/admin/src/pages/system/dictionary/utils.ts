import type { SchemaFormColumn, TableRow } from '@repo/ui';
import type { DictionaryQuery } from '@/types';

/** 搜索表单的状态选项由 schema-form 以字符串提交。 */
export type DictionarySearchForm = {
  search?: string;
  enabled?: string;
};

/** 类型和字典项共用名称/值关键词与启停筛选。 */
export const searchColumns: SchemaFormColumn<DictionarySearchForm>[] = [
  {
    dataIndex: 'search',
    title: '关键词',
    valueType: 'text',
    fieldProps: { clearable: true },
  },
  {
    dataIndex: 'enabled',
    title: '状态',
    valueType: 'select',
    valueEnum: { true: '启用', false: '停用' },
    fieldProps: { clearable: true },
  },
];

/** 将表单状态选项转换为接口布尔值，空选项不参与筛选。 */
export function dictionaryQuery(form: DictionarySearchForm): DictionaryQuery {
  const query: DictionaryQuery = { search: form.search };
  if (form.enabled === 'true') {
    query.enabled = true;
  } else if (form.enabled === 'false') {
    query.enabled = false;
  }
  return query;
}

/** 类型列表，字典项通过行内入口维护。 */
export const dictionaryRows: TableRow[] = [
  { label: '字典名称', value: 'name', minWidth: 160 },
  { label: '字典编码', value: 'code', minWidth: 180 },
  { label: '状态', value: 'enabled', slot: 'enabled', width: 90 },
  { label: '备注', value: 'remark', minWidth: 180 },
  {
    label: '操作',
    value: 'actions',
    slot: 'actions',
    width: 200,
    fixed: 'right',
  },
];

/** 选项按排序升序展示，值保持字符串格式。 */
export const itemRows: TableRow[] = [
  { label: '标签', value: 'label', minWidth: 140 },
  { label: '字典值', value: 'value', minWidth: 140 },
  { label: '排序', value: 'sort', width: 80 },
  { label: '状态', value: 'enabled', slot: 'enabled', width: 80 },
  { label: '备注', value: 'remark', minWidth: 160 },
  {
    label: '操作',
    value: 'actions',
    slot: 'actions',
    width: 130,
    fixed: 'right',
  },
];
