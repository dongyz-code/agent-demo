import type { ApiMultAction } from '../../common/index.js';

/** 字典类型，code 为业务读取使用的稳定编码。 */
export interface DictionaryInfo {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  remark: string;
}

/** 字典项；value 始终为字符串，sort 越小越靠前。 */
export interface DictionaryItemInfo {
  id: string;
  dictionaryId: string;
  label: string;
  value: string;
  sort: number;
  enabled: boolean;
  remark: string;
}

/** 新建时省略 id，编辑时提交完整表单，类型编码不能修改。 */
export type DictionaryInput = Omit<DictionaryInfo, 'id'> & { id?: string };
/** 字典项编辑不能改变所属类型。 */
export type DictionaryItemInput = Omit<DictionaryItemInfo, 'id'> & {
  id?: string;
};

/** 管理列表筛选和半开分页区间，单页最多 100 条。 */
export interface DictionaryQuery {
  search?: string;
  enabled?: boolean;
  limit?: number[];
}

/** 下拉框等业务场景使用的启用项，不含管理信息。 */
export interface DictionaryOption {
  label: string;
  value: string;
}

/** 字典类型、字典项管理与业务选项读取契约。 */
export type DictionaryAction = ApiMultAction<{
  list: {
    req: DictionaryQuery;
    resp: { list: DictionaryInfo[]; count: number };
  };
  save: { req: DictionaryInput; resp: 'ok' };
  remove: { req: { id: string }; resp: 'ok' };
  items: {
    req: DictionaryQuery & { dictionaryId: string };
    resp: { list: DictionaryItemInfo[]; count: number };
  };
  'item-save': { req: DictionaryItemInput; resp: 'ok' };
  'item-remove': { req: { id: string; dictionaryId: string }; resp: 'ok' };
  options: { req: { code: string }; resp: DictionaryOption[] };
}>;
