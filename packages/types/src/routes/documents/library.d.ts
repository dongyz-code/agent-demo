import type { ApiMultAction } from '../../common/index.js';

/** 资料库可见性。 */
export type LibraryVisibility = 'restricted' | 'published';

/** 资料库生命周期。 */
export type LibraryStatus = 'active' | 'archived';

/** 资料库授权对象。 */
export type LibraryGrantSubjectType = 'user' | 'group';

/** 资料库身份。管理员高于使用者。 */
export type LibraryGrantRole = 'user' | 'manager';

/** 当前用户在资料库上的有效身份。 */
export type LibraryRole = LibraryGrantRole;

/** 资料库列表和详情。 */
export interface LibraryInfo {
  /** 资料库标识。 */
  libraryId: string;
  /** 资料库名称。 */
  name: string;
  /** 资料库说明。 */
  description: string | null;
  /** 仅授权或全员可使用。 */
  visibility: LibraryVisibility;
  /** 正常或已归档。 */
  status: LibraryStatus;
  /** 当前用户在该库的有效身份。 */
  myRole: LibraryRole;
  /** 未删除文档数量。 */
  documentCount: number;
  /** 显式授权行数量，不含全员可使用的隐式使用者。 */
  grantCount: number;
  /** 创建时间。 */
  createdAt: Date;
  /** 创建人标识。内置系统管理员为 -。 */
  createdBy: string;
}

/** 一条资料库授权及其展示名。 */
export interface LibraryGrantInfo {
  /** 授权标识。 */
  libraryGrantId: string;
  /** 用户或用户组。 */
  subjectType: LibraryGrantSubjectType;
  /** 用户或用户组标识。 */
  subjectId: string;
  /** 用户昵称或用户组名称。 */
  subjectName: string;
  /** 授权身份。 */
  role: LibraryGrantRole;
  /** 添加人标识。 */
  createdBy: string;
  /** 添加时间。 */
  createdAt: Date;
}

/** 授权保存时提交的一条主体。 */
export interface LibraryGrantInput {
  /** 用户或用户组。 */
  subjectType: LibraryGrantSubjectType;
  /** 用户或用户组标识。 */
  subjectId: string;
  /** 授权身份。 */
  role: LibraryGrantRole;
}

/** 资料库管理接口。 */
export type LibraryAction = ApiMultAction<{
  'library-list': {
    body: {
      /** 名称关键词。 */
      search?: string;
      /** 可见性筛选。 */
      visibility?: LibraryVisibility[];
      /** 状态筛选。不传时只返回未归档库。 */
      status?: LibraryStatus[];
      /** 列表范围。不传时看未归档库。 */
      scope?: 'created' | 'joined' | 'archived';
      /** 左闭右开分页。 */
      limit?: number[];
      /** 是否返回总数。 */
      withCount?: boolean;
    };
    resp: { list: LibraryInfo[]; count: number };
  };
  'library-detail': {
    body: { libraryId: string };
    resp: LibraryInfo;
  };
  'library-create': {
    body: {
      name: string;
      description?: string;
      visibility: LibraryVisibility;
    };
    resp: LibraryInfo;
  };
  'library-update': {
    body: {
      libraryId: string;
      name?: string;
      description?: string | null;
      visibility?: LibraryVisibility;
    };
    resp: LibraryInfo;
  };
  'library-archive': {
    body: { libraryId: string };
    resp: LibraryInfo;
  };
  'library-restore': {
    body: { libraryId: string };
    resp: LibraryInfo;
  };
  'library-grant-list': {
    body: { libraryId: string };
    resp: { list: LibraryGrantInfo[] };
  };
  'library-grant-save': {
    body: { libraryId: string; grants: LibraryGrantInput[] };
    resp: { list: LibraryGrantInfo[] };
  };
  'library-subject-search': {
    body: {
      libraryId: string;
      subjectType: LibraryGrantSubjectType;
      search?: string;
    };
    resp: { list: { id: string; name: string }[] };
  };
  /** 客户端检索范围。只返回当前用户可使用的未归档库。 */
  'library-usable-list': {
    body: Record<string, never>;
    resp: { list: { libraryId: string; name: string }[] };
  };
}>;
