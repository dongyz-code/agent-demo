/**
 * Office 文件转 PDF 的独立转换模块。
 *
 * 与 preview/converter.ts 的 PDF→图片 流程分离：本模块只负责把 Office 源文件
 * 转为 PDF 字节，主流程拿到 PDF 后交给 convertPdf 继续渲染页面。
 *
 * 当前实现为本地 soffice 子进程；对外函数契约 `source → PDF Buffer` 稳定，
 * 将来替换转换引擎只需改本模块内部，不影响主流程与 convertPdf。
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT_ERROR } from '@/configs/index.js';
import { readStreamToBuffer } from '@/utils/index.js';
import { spawnAsync } from '@repo/utils-node';
import { getFileExtension } from '@repo/shared';

import { documentsConfig } from '../config.js';

import type { DocumentPageSource } from './shared.js';

/** soffice 可执行名；本地唯一选项，生产装 libreoffice 使其在 PATH 即可。 */
const SOFFICE_BINARY = 'soffice';
/** 源文件字节数上限，与上传限制一致，防止异常大文件撑爆临时盘与内存。 */
const MAX_SOURCE_BYTES = documentsConfig.upload.maxFileSizeBytes;
/** PDF 文件头魔数，用于校验 soffice 输出。 */
const PDF_MAGIC = Buffer.from('%PDF-');

/** filename 无扩展名时按 MIME 兜底 Office 扩展名，soffice 靠扩展名识别格式。 */
const OFFICE_EXT_BY_MIME: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/msword': 'doc',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.ms-excel': 'xls',
};

/** 调用本地 soffice 把可信 Office 源文件转换为 PDF 字节。 */
export async function convertOfficeToPdf(
  source: DocumentPageSource,
): Promise<Buffer> {
  const workdir = await mkdtemp(join(tmpdir(), 'office-preview-'));
  try {
    const ext =
      getFileExtension(source.filename) ||
      OFFICE_EXT_BY_MIME[source.contentType] ||
      'bin';
    const inputPath = join(workdir, `input.${ext}`);
    // soffice 输出名 = 输入 basename 去原扩展名 + .pdf，固定输入名后输出可确定。
    const outputPath = join(workdir, 'input.pdf');
    const buffer = await readStreamToBuffer(
      await source.open(),
      MAX_SOURCE_BYTES,
    );
    await writeFile(inputPath, buffer);
    // 独立 user profile 规避 soffice 全局配置文件锁，支持并发任务互不阻塞。
    const profileUrl = pathToFileURL(join(workdir, 'profile')).href;
    const { promise, stats } = await spawnAsync({
      cmd: SOFFICE_BINARY,
      args: [
        '--headless',
        '--norestore',
        '--nodefault',
        '--nolockcheck',
        '--convert-to',
        'pdf',
        '--outdir',
        workdir,
        inputPath,
        `-env:UserInstallation=${profileUrl}`,
      ],
      spawnOptions: { cwd: workdir },
      timeout: documentsConfig.document.officePreviewTimeoutMs,
      log: false,
    });
    await promise;
    if (stats.status !== 'success') {
      throw new ROOT_ERROR('文件处理: SOFFICE转换失败', {
        status: stats.status,
        code: stats.code,
        signal: stats.signal,
        stderr: stats.stderr.join('\n').slice(0, 2000),
      });
    }
    let content: Buffer;
    try {
      content = await readFile(outputPath);
    } catch {
      throw new ROOT_ERROR('文件处理: SOFFICE转换失败', {
        reason: 'soffice 未产出 PDF',
      });
    }
    if (!content.subarray(0, PDF_MAGIC.byteLength).equals(PDF_MAGIC)) {
      throw new ROOT_ERROR('文件处理: SOFFICE转换失败', {
        reason: 'soffice 未输出有效 PDF',
      });
    }
    return content;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
