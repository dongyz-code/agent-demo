import { existsSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { TaskHandler } from './types.js';

/** 任务脚本只允许从服务端 `hooks` 目录加载。 */
const TASK_SCRIPT_ROOT = resolve(import.meta.dirname, '..');
/** 持久化入口统一去掉构建相关扩展名。 */
const TASK_SCRIPT_EXTENSION_PATTERN = /\.(?:[cm]?[jt]sx?)$/u;
/** 当前运行环境可能使用的脚本扩展名，按开发环境优先级排列。 */
const TASK_SCRIPT_EXTENSIONS = ['.ts', '.js'] as const;

/**
 * 把脚本 URL 或路径归一化为 `hooks` 下无扩展名的稳定入口。
 *
 * @param script `import.meta.url`、绝对路径或相对 `hooks` 的脚本路径。
 * @returns 可持久化并在后续部署中重新解析的相对入口。
 * @throws 脚本位于 `hooks` 外或入口不是规范相对路径时抛出稳定错误。
 */
export function normalizeTaskScript(script: string | URL): string {
  let absolutePath: string;
  if (script instanceof URL || script.startsWith('file:')) {
    absolutePath = fileURLToPath(script);
  } else if (isAbsolute(script)) {
    absolutePath = resolve(script);
  } else {
    absolutePath = resolve(TASK_SCRIPT_ROOT, script);
  }
  const relativePath = relative(TASK_SCRIPT_ROOT, absolutePath);
  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`TASK_SCRIPT_INVALID: 任务脚本必须在 hooks 目录内`);
  }
  const normalized = relativePath
    .replaceAll('\\', '/')
    .replace(TASK_SCRIPT_EXTENSION_PATTERN, '');
  const segments = normalized.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`TASK_SCRIPT_INVALID: 任务脚本入口必须是规范相对路径`);
  }
  if (normalized.length > 255) {
    throw new Error('TASK_SCRIPT_INVALID: 任务脚本入口不能超过 255 个字符');
  }
  return normalized;
}

/**
 * 按持久化脚本入口加载默认执行函数。
 *
 * @param scriptPath 相对于 `hooks` 目录且不含扩展名的任务脚本入口。
 * @returns 子进程直接调用的默认导出函数。
 * @throws 脚本不存在或默认导出不是函数时抛出稳定错误。
 */
export async function loadTaskScript(scriptPath: string): Promise<TaskHandler> {
  const fileUrl = resolveTaskScriptUrl(scriptPath);
  const taskModule = (await import(fileUrl)) as { default?: unknown };
  if (typeof taskModule.default !== 'function') {
    throw new Error(
      `TASK_SCRIPT_INVALID: 任务脚本 ${scriptPath} 必须默认导出执行函数`,
    );
  }
  return taskModule.default as TaskHandler;
}

/**
 * 把逻辑脚本入口解析为当前运行环境可导入的文件 URL。
 *
 * @param scriptPath 已校验的无扩展名相对入口。
 * @returns 开发环境 `.ts` 或构建环境 `.js` 的 file URL。
 * @throws 入口逃逸 `hooks` 根目录或目标文件不存在时抛出稳定错误。
 */
function resolveTaskScriptUrl(scriptPath: string): string {
  const basePath = resolve(TASK_SCRIPT_ROOT, scriptPath);
  const relativePath = relative(TASK_SCRIPT_ROOT, basePath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(
      `TASK_SCRIPT_INVALID: 任务脚本入口 ${scriptPath} 超出 hooks 根目录`,
    );
  }
  for (const extension of TASK_SCRIPT_EXTENSIONS) {
    const filePath = `${basePath}${extension}`;
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return pathToFileURL(filePath).href;
    }
  }
  throw new Error(`TASK_SCRIPT_NOT_FOUND: 任务脚本 ${scriptPath} 不存在`);
}
