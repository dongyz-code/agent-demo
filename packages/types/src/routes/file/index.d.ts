import type { ApiMultAction } from '../../common/index.js';
import type {
  FileVariantStatus,
  FileVariantType,
  StoredFileInfo,
} from '../upload/index.js';
import type {
  FileProcessingStage,
  FileProcessingTriggerSource,
  TaskStatus,
} from '../models.js';

/** 文件列表展示的当前或历史任务摘要。 */
export interface ManagedFileTaskSummary {
  /** 通用任务标识。 */
  taskId: string;
  /** 同一文件的执行序号。 */
  executionNo: number;
  /** 当前任务状态。 */
  status: TaskStatus;
  /** 当前执行阶段。 */
  stage: FileProcessingStage;
  /** 整数进度。 */
  progress: number;
  /** 任务创建来源。 */
  triggerSource: FileProcessingTriggerSource;
  /** 目标知识库标识。 */
  datasetId: string | null;
  /** 目标知识库名称。 */
  datasetName: string | null;
  /** 任务创建时间。 */
  createdAt: Date;
}

/** 文件管理列表的聚合结果。 */
export interface ManagedFileInfo extends StoredFileInfo {
  /** 上传或手动处理是否要求进入 RAG。 */
  enterRag: boolean;
  /** 当前等待或执行中的任务。 */
  activeTask: ManagedFileTaskSummary | null;
  /** 最近创建的任务，不限状态。 */
  latestTask: ManagedFileTaskSummary | null;
  /** 累计创建的文件处理任务数。 */
  executionCount: number;
  /** 最近一次成功任务。 */
  lastSuccessfulTask: ManagedFileTaskSummary | null;
  /** 历史任务涉及的知识库摘要。 */
  datasets: { datasetId: string; name: string }[];
}

/** 在线查看使用的统一预览模式。 */
export type FilePreviewMode =
  | 'direct'
  | 'generated'
  | 'text'
  | 'pending'
  | 'failed'
  | 'unsupported';

/** 文件预览接口返回的安全描述。 */
export interface FilePreviewDescriptor {
  /** 当前预览模式。 */
  mode: FilePreviewMode;
  /** 派生物状态；直接预览时为空。 */
  status: FileVariantStatus | null;
  /** 浏览器应使用的可信 MIME。 */
  contentType: string | null;
  /** 短期预览 URL。 */
  url: string | null;
  /** 内联文本内容，仅限受控大小的安全文本。 */
  text: string | null;
  /** URL 过期时间。 */
  expiresAt: Date | null;
  /** 当前派生物类型。 */
  variantType: FileVariantType | null;
  /** 无法预览或失败时的可读原因。 */
  reason: string | null;
}

/** 通用文件操作接口集合。 */
export type FileAction = ApiMultAction<{
  'processing-options': {
    body: {};
    resp: {
      /** 上传知识文档时是否默认进入 RAG 接入流程。 */
      defaultEnterRag: boolean;
      /** 当前用户可选择的启用知识库。 */
      datasets: { datasetId: string; name: string }[];
    };
  };
  detail: {
    body: { fileId: string };
    resp: StoredFileInfo;
  };
  list: {
    body: {
      /** 文件名关键词。 */
      search?: string;
      /** 文件可信状态筛选。 */
      status?: StoredFileInfo['status'][];
      /** 文件处理任务状态筛选。 */
      processingStatus?: TaskStatus[];
      /** 目标知识库筛选。 */
      datasetId?: string;
      /** 文件创建时间范围。 */
      createdAt?: (Date | null)[];
      /** 左闭右开的分页范围。 */
      limit?: number[];
      /** 是否返回符合条件的总数。 */
      withCount?: boolean;
    };
    resp: { list: ManagedFileInfo[]; count: number };
  };
  preview: {
    body: { fileId: string };
    resp: FilePreviewDescriptor;
  };
  download: {
    body: { fileId: string };
    resp: { url: string; expiresAt: Date };
  };
  remove: {
    body: { fileId: string };
    resp: 'ok';
  };
}>;
