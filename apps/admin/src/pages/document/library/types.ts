import type { LibraryGrantRole, LibraryGrantSubjectType } from '@/types';

/** 授权搜索候选项，标识需要与主体类型一起使用。 */
export interface GrantSubject {
  /** 用户或用户组的稳定标识。 */
  id: string;
  /** 供授权管理员辨认的名称。 */
  name: string;
}

/** 新增授权弹窗交给权限页保存的选择结果。 */
export interface GrantSelection {
  /** 本批选择的主体类型，不允许混合用户与用户组。 */
  subjectType: LibraryGrantSubjectType;
  /** 已勾选对象，保留跨关键词搜索的选择。 */
  subjects: GrantSubject[];
  /** 给本批对象分配的库内身份。 */
  role: LibraryGrantRole;
}

/** 资料库列表筛选条件，状态与来源相互独立。 */
export interface LibrarySearchForm extends Record<string, unknown> {
  /** 资料库名称关键词。 */
  search?: string;
  /** 我创建的或其他可访问资料库；不传表示全部来源。 */
  scope?: 'created' | 'joined';
  /** 默认展示正常资料库，可切换到已归档。 */
  status: 'active' | 'archived';
}
