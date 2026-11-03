import { logger, ROOT_ERROR } from '@/configs/index.js';
import { upload } from '@/hooks/upload/index.js';
import {
  DOCUMENT_PREVIEW_CONVERTER_VERSION,
  documentPageConverter,
} from './converter.js';

import {
  failPreview,
  loadPreviewPageRows,
  markPreviewProcessing,
  preparePreview,
  publishPreviewPages,
} from './database.js';

import type { UploadedPreviewPage } from './database.js';
import type { ConvertedDocumentPage } from './converter.js';

/** 文档预览生成所需的业务输入。 */
export interface DocumentPreviewProcessInput {
  /** 本次执行的稳定标识，用于隔离尚未发布的页面对象。 */
  executionId: string;
  /** 已验证源文件标识。 */
  fileId: string;
  /** 逻辑文档标识。 */
  documentId: string;
  /** 本次生成预览的不可变文档版本。 */
  documentVersionId: string;
  /** 写入预览状态的审计用户。 */
  userId: string;
  /** 确认当前调用仍允许继续执行，取消或失效时抛出错误。 */
  assertActive: () => Promise<void>;
}

/** 文档预览操作返回的稳定摘要。 */
export interface DocumentPreviewProcessResult {
  /** 实际发布的页面数量。 */
  pageCount: number;
  /** 本次页面集合使用的转换器版本。 */
  converterVersion: string;
}

/** 单次预览执行中两个层级的上传与发布边界。 */
interface PreviewGenerationState {
  /** 已上传的完整或部分快速页面。 */
  quickPages: UploadedPreviewPage[];
  /** 已上传的完整或部分清晰页面。 */
  clearPages: UploadedPreviewPage[];
  /** 快速页面是否已经由数据库行引用。 */
  quickPublished: boolean;
}

/** 文档预览支持检测、版本识别和页面发布的统一能力实现。 */
class DocumentPreview {
  /** 当前页面转换规则与底层渲染器组成的稳定版本。 */
  readonly configVersion = DOCUMENT_PREVIEW_CONVERTER_VERSION;

  /**
   * 判断可信 MIME 是否具备统一页面转换能力。
   *
   * @param contentType 服务端验证后的文件 MIME。
   * @returns 当前预览转换器是否支持该类型。
   */
  supports(contentType: string): boolean {
    return documentPageConverter.supports(contentType);
  }

  /** 事务内准备预览，与任务入队共享提交边界。 */
  prepare = preparePreview;

  /** 仅收敛尚未完成的预览状态。 */
  fail = failPreview;

  /** 读取已授权版本的有界页面窗口。 */
  loadPages = loadPreviewPageRows;

  /**
   * 先发布完整快速集合，再原子发布指定文档版本的清晰集合。
   *
   * @param input 文档版本、源文件、执行标识和通用存活检查。
   * @returns 已发布页面数量和转换器版本。
   */
  async process(
    input: DocumentPreviewProcessInput,
  ): Promise<DocumentPreviewProcessResult> {
    const state: PreviewGenerationState = {
      quickPages: [],
      clearPages: [],
      quickPublished: false,
    };
    let clearPublished = false;
    try {
      await markPreviewProcessing(input, input.assertActive);
      await generateAndUploadPages(input, state);
      const oldPages = await publishPreviewPages(
        input,
        state.clearPages,
        'clear',
        this.configVersion,
        input.assertActive,
      );
      clearPublished = true;
      const result = {
        pageCount: state.clearPages.length,
        converterVersion: this.configVersion,
      };
      deleteOldPagesInBackground(oldPages);
      return result;
    } catch (error) {
      const unpublishedPages = [...state.clearPages];
      if (!state.quickPublished) {
        unpublishedPages.push(...state.quickPages);
      }
      if (!clearPublished) await deleteUploadedPages(unpublishedPages);
      throw error;
    }
  }
}

/** 文档预览支持检测、配置版本与处理流程的统一入口。 */
export const documentPreview = new DocumentPreview();

/**
 * 逐页转换并上传到本任务独占对象前缀。
 *
 * @param input 当前预览操作输入。
 * @param state 用于记录两个层级上传与发布边界的可变状态。
 * @returns 快速层发布且清晰层全部上传后结束。
 */
async function generateAndUploadPages(
  input: DocumentPreviewProcessInput,
  state: PreviewGenerationState,
): Promise<void> {
  const file = await upload.getReadableSource(input.fileId);
  const source = {
    filename: file.filename,
    contentType: file.contentType,
    size: file.size,
    open: file.openStream,
  };
  let expectedQuickPage = 1;
  let expectedClearPage = 1;
  for await (const page of documentPageConverter.convert(source)) {
    await input.assertActive();
    if (page.variant === 'quick') {
      if (state.quickPublished || state.clearPages.length) {
        throw new ROOT_ERROR('转换页面序号不连续', {
          reason: '页面层级顺序无效',
        });
      }
      if (page.pageNumber !== expectedQuickPage) {
        throw new ROOT_ERROR('转换页面序号不连续', {
          variant: 'quick',
        });
      }
      const uploaded = await uploadPreviewPage(input, page);
      state.quickPages.push(uploaded);
      expectedQuickPage++;
      continue;
    }
    if (page.pageNumber !== expectedClearPage) {
      throw new ROOT_ERROR('转换页面序号不连续', {
        variant: 'clear',
      });
    }
    if (!state.quickPublished) {
      if (!state.quickPages.length || page.pageNumber !== 1) {
        throw new ROOT_ERROR('转换器没有生成任何页面', {
          variant: 'quick',
        });
      }
      const oldQuickPages = await publishPreviewPages(
        input,
        state.quickPages,
        'quick',
        DOCUMENT_PREVIEW_CONVERTER_VERSION,
        input.assertActive,
      );
      state.quickPublished = true;
      deleteOldPagesInBackground(oldQuickPages);
    }
    const uploaded = await uploadPreviewPage(input, page);
    state.clearPages.push(uploaded);
    expectedClearPage++;
  }
  if (!state.quickPublished || !state.clearPages.length) {
    throw new ROOT_ERROR('转换器没有生成任何页面', {
      reason: '缺少完整双层页面',
    });
  }
  if (state.quickPages.length !== state.clearPages.length) {
    throw new ROOT_ERROR('转换页面序号不连续', {
      reason: '快速与清晰页面数量不一致',
    });
  }
  await input.assertActive();
}

/**
 * 上传转换页面并获取独立句柄，每次执行都产生新的不可变文件。
 *
 * @param input 当前文档版本和审计用户。
 * @param page 带层级、尺寸与编码内容的页面。
 * @returns 可原子发布的页面摘要与通用文件句柄。
 */
async function uploadPreviewPage(
  input: DocumentPreviewProcessInput,
  page: ConvertedDocumentPage,
): Promise<UploadedPreviewPage> {
  if (page.pageNumber < 1) throw new ROOT_ERROR('转换页面序号不连续');
  const extension = page.contentType.split('/')[1] ?? 'webp';
  const stored = await upload.put(
    {
      filename: `page-${page.variant}-${page.pageNumber}.${extension}`,
      contentType: page.contentType,
      content: page.content,
      purpose: 'preview',
    },
    input.userId,
  );
  return {
    key: stored.key,
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    contentType: stored.contentType,
    size: stored.size,
  };
}

/**
 * 删除本次执行尚未被数据库行引用的临时页面对象。
 *
 * @param pages 需要尽力删除的私有页面对象摘要。
 * @returns 全部删除请求结束后完成；单个删除失败不覆盖原始任务错误。
 */
async function deleteUploadedPages(
  pages: UploadedPreviewPage[],
): Promise<void> {
  await Promise.allSettled(
    pages.map(async (page) => await upload.remove(page.key)),
  );
}

/**
 * 页面行提交后异步清理被替换的旧集合。
 *
 * @param pages 已不再被数据库行引用的旧对象摘要。
 * @returns 调度后台清理后立即返回；失败只写结构化日志。
 */
function deleteOldPagesInBackground(pages: { key: string }[]): void {
  if (!pages.length) return;
  queueMicrotask(() => {
    void Promise.allSettled(
      pages.map(async (page) => await upload.remove(page.key)),
    ).then((results) => {
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length) {
        logger.warn(
          {
            event: 'document.preview.old_pages_cleanup_failed',
            failedCount: failed.length,
          },
          '旧预览页面对象清理不完整',
        );
      }
    });
  });
}
