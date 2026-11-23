import type { AdminPermissionKey } from '@repo/shared/permission';
import type { SchemaFormColumn, TableRow } from '@repo/ui';
import type {
  DocumentInfo,
  DocumentPreviewStatus,
  DocumentRagStatus,
  LibraryInfo,
} from '@/types';
import type { DocumentCapabilities, DocumentSearchForm } from './types';

/** 页面生成与问答索引是独立流程，列表和详情统一使用这组预览状态。 */
export const previewStatusLabels: Record<DocumentPreviewStatus, string> = {
  pending: '等待生成',
  processing: '生成中',
  ready: '可预览',
  failed: '生成失败',
};

/** 版本索引进度；是否实际参与检索还需检查文档的 indexedVersionId。 */
export const ragStatusLabels: Record<DocumentRagStatus, string> = {
  pending: '等待索引',
  processing: '索引中',
  ready: '已索引',
  failed: '索引失败',
};

/**
 * 合并文档所属库身份与账号操作权限。
 * @param document 当前文档，尚未加载时可以为空。
 * @param hasPermission 账号权限检查，系统管理员由全局 store 统一放行。
 * @returns 列表和详情共用的操作能力。
 */
export function getDocumentCapabilities(
  document: Pick<DocumentInfo, 'myRole'> | undefined,
  hasPermission: (key: AdminPermissionKey) => boolean,
): DocumentCapabilities {
  const manager = document?.myRole === 'manager';
  return {
    canUpdate: manager && hasPermission('actions.documents.upload'),
    canDelete: manager && hasPermission('actions.documents.delete'),
    canProcess: manager && hasPermission('actions.documents.process'),
  };
}

/**
 * 根据列表所在范围构造统一搜索表单。
 * @param libraries 全局列表可筛选的资料库。
 * @param inLibrary 是否已由资料库上下文固定范围。
 * @returns 交给 schema-form 的搜索字段。
 */
export function getDocumentSearchColumns(
  libraries: LibraryInfo[],
  inLibrary: boolean,
): SchemaFormColumn<DocumentSearchForm>[] {
  const columns: SchemaFormColumn<DocumentSearchForm>[] = [
    {
      dataIndex: 'search',
      title: '文档名称',
      valueType: 'text',
      fieldProps: { clearable: true },
    },
  ];
  if (!inLibrary) {
    columns.push({
      dataIndex: 'libraryId',
      title: '资料库',
      valueType: 'select',
      valueEnum: Object.fromEntries(
        libraries.map((library) => [library.libraryId, library.name]),
      ),
      fieldProps: { clearable: true, filterable: true },
    });
  }
  columns.push(
    {
      dataIndex: 'previewStatus',
      title: '预览状态',
      valueType: 'select',
      valueEnum: previewStatusLabels,
      fieldProps: { clearable: true },
    },
    { dataIndex: 'createdAt', title: '创建时间', valueType: 'dateRange' },
  );
  return columns;
}

/**
 * 构造紧凑的文档列，文件大小和封面合并进名称列，避免横向堆叠。
 * @param inLibrary 库内列表省略重复的资料库列。
 * @param canSelect 是否显示批量移动选择列。
 * @returns 两种列表一致的列定义。
 */
export function getDocumentColumns(
  inLibrary: boolean,
  canSelect: boolean,
): TableRow[] {
  const columns: TableRow[] = [];
  if (canSelect) {
    columns.push({
      type: 'selection',
      value: 'selection',
      width: 44,
      /**
       * 只允许批量移动当前用户管理的文档。
       * @param row 文档表格行。
       * @returns 使用者不可选择，管理员可以选择。
       */
      selectable(row) {
        return row.myRole === 'manager';
      },
    });
  }
  columns.push({
    label: '文档名称',
    value: 'name',
    slot: 'name',
    minWidth: 250,
  });
  if (!inLibrary)
    columns.push({
      label: '资料库',
      value: 'library',
      slot: 'library',
      minWidth: 140,
    });
  columns.push(
    { label: '当前版本', value: 'version', slot: 'version', width: 110 },
    { label: '预览', value: 'preview', slot: 'preview', width: 115 },
    { label: '问答检索', value: 'retrieval', slot: 'retrieval', width: 125 },
    { label: '创建时间', value: 'createdAt', slot: 'createdAt', width: 175 },
    {
      label: '操作',
      value: 'actions',
      slot: 'actions',
      width: 480,
      fixed: 'right',
    },
  );
  return columns;
}

/**
 * 展示实际可参与检索的版本状态，新版本未完成时保留旧版可检索的事实。
 * @param document 文档聚合摘要。
 * @returns 适合列表显示的检索状态。
 */
export function getRetrievalLabel(document: DocumentInfo): string {
  if (document.indexedVersionId === document.activeVersion.documentVersionId)
    return '可检索';
  if (document.indexedVersionId) return '旧版可检索';
  return ragStatusLabels[document.activeVersion.ragStatus];
}

/**
 * 为真实的检索可用状态选择标签颜色。
 * @param document 文档聚合摘要。
 * @returns Element Plus 支持的语义标签类型。
 */
export function getRetrievalTagType(document: DocumentInfo) {
  if (document.indexedVersionId === document.activeVersion.documentVersionId)
    return 'success';
  if (document.indexedVersionId) return 'warning';
  return getPreviewTagType(document.activeVersion.ragStatus);
}

/**
 * 为预览或索引进度选择统一的状态颜色。
 * @param status 相互独立的处理阶段枚举。
 * @returns Element Plus 支持的语义标签类型。
 */
export function getPreviewTagType(status: DocumentPreviewStatus) {
  if (status === 'ready') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'processing') return 'warning';
  return 'info';
}

/**
 * 将源文件大小格式化为紧凑的二进制单位。
 * @param size 已验证文件的字节数。
 * @returns 使用 B、KiB、MiB 或 GiB 的展示文案。
 */
export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KiB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MiB`;
  return `${(size / 1024 ** 3).toFixed(1)} GiB`;
}

/**
 * 将接口日期转换为当前浏览器的本地时间。
 * @param value 服务端返回的日期对象或序列化字符串。
 * @returns 本地日期时间文案。
 */
export function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
