import type { SchemaFormColumn, TableRow } from '@repo/ui';
import type {
  LibraryGrantInfo,
  LibraryGrantInput,
  LibraryGrantRole,
  LibraryStatus,
  LibraryVisibility,
} from '@/types';
import type { GrantSelection, LibrarySearchForm } from './types';

/** 列表与授权管理共用的库内身份名称。 */
export const libraryRoleLabels: Record<LibraryGrantRole, string> = {
  manager: '管理员',
  user: '使用者',
};

/** 资料库访问范围的列表文案。 */
export const libraryVisibilityLabels: Record<LibraryVisibility, string> = {
  restricted: '指定成员',
  published: '全员可使用',
};

/** 资料库生命周期的列表文案。 */
export const libraryStatusLabels: Record<LibraryStatus, string> = {
  active: '正常',
  archived: '已归档',
};

/** 资料库来源与状态独立筛选，归档不会改变创建人范围。 */
export const librarySearchColumns: SchemaFormColumn<LibrarySearchForm>[] = [
  {
    dataIndex: 'search',
    title: '资料库名称',
    valueType: 'text',
    fieldProps: { clearable: true },
  },
  {
    dataIndex: 'scope',
    title: '来源',
    valueType: 'select',
    valueEnum: { created: '我创建的', joined: '其他资料库' },
    fieldProps: { clearable: true },
  },
  {
    dataIndex: 'status',
    title: '状态',
    valueType: 'select',
    valueEnum: libraryStatusLabels,
  },
];

/** 说明并入名称列，避免为少量文本占用整列。 */
export const libraryColumns: TableRow[] = [
  { label: '资料库名称', value: 'name', slot: 'name', minWidth: 24 },
  { label: '访问范围', value: 'visibility', slot: 'visibility', minWidth: 12 },
  { label: '我的身份', value: 'myRole', slot: 'myRole', minWidth: 10 },
  { label: '文档数', value: 'documentCount', minWidth: 8 },
  { label: '授权数', value: 'grantCount', minWidth: 8 },
  { label: '状态', value: 'status', slot: 'status', minWidth: 8 },
  { label: '创建时间', value: 'createdAt', slot: 'createdAt', minWidth: 14 },
  {
    label: '操作',
    value: 'actions',
    slot: 'actions',
    minWidth: 22,
    fixed: 'right',
  },
];

/**
 * 以主体类型和标识组合识别授权，允许用户和用户组恰好拥有相同标识。
 * @param grant 需要识别的授权主体。
 * @returns 仅用于本地比较的稳定键。
 */
export function grantKey(
  grant: Pick<LibraryGrantInput, 'subjectType' | 'subjectId'>,
): string {
  return `${grant.subjectType}:${grant.subjectId}`;
}

/**
 * 生成授权名单的可读名称，内置系统管理员不依赖用户表。
 * @param grant 服务端返回的完整授权行。
 * @returns 名称为空时使用主体标识兜底。
 */
export function grantLabel(grant: LibraryGrantInfo): string {
  if (grant.subjectType === 'user' && grant.subjectId === '-')
    return '系统管理员';
  return grant.subjectName.trim() || grant.subjectId;
}

/**
 * 去掉展示和审计字段，生成完整授权保存参数。
 * @param grants 当前需要保留的授权名单。
 * @returns 可直接提交保存接口的授权输入。
 */
export function toGrantInputs(
  grants: LibraryGrantInput[],
): LibraryGrantInput[] {
  return grants.map((grant) => ({
    subjectType: grant.subjectType,
    subjectId: grant.subjectId,
    role: grant.role,
  }));
}

/**
 * 将弹窗选择合并到已有授权，保留已有对象身份，不产生重复授权。
 * @param grants 当前完整名单。
 * @param selection 同一类型、同一身份的新增选择。
 * @returns 尚未写入服务端的完整目标名单。
 */
export function mergeGrantSelection(
  grants: LibraryGrantInput[],
  selection: GrantSelection,
): LibraryGrantInput[] {
  const result = toGrantInputs(grants);
  const existing = new Set(result.map(grantKey));
  for (const subject of selection.subjects) {
    const grant = {
      subjectType: selection.subjectType,
      subjectId: subject.id,
      role: selection.role,
    };
    if (existing.has(grantKey(grant))) continue;
    result.push(grant);
    existing.add(grantKey(grant));
  }
  return result;
}
