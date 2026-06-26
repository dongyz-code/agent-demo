import { pathToFileURL } from 'node:url';
import { join, relative, sep } from 'node:path';
import { readdir } from 'node:fs/promises';

import type { RouteOptions } from './types.js';

/** 判断文件名是否是可动态导入的路由模块。 */
function isRouteModuleFile(name: string) {
  if (!/\.(ts|js)$/.test(name)) {
    return false;
  }
  return !/(\.d\.ts|\.test\.(ts|js)|\.spec\.(ts|js)|\.schema\.(ts|js)|^schema\.(ts|js))$/.test(
    name,
  );
}

/** 递归收集路由文件，并保持跨平台稳定排序。 */
async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return await collectFiles(path);
      }
      if (entry.isFile() && isRouteModuleFile(entry.name)) {
        return [path];
      }
      return [];
    }),
  );
  return files.flat().sort((a, b) => {
    const normalizedA = a.replace(/[^A-Za-z0-9]/g, '');
    const normalizedB = b.replace(/[^A-Za-z0-9]/g, '');
    return normalizedA.localeCompare(normalizedB) || a.localeCompare(b);
  });
}

/** 根据路由文件路径生成聚合导出名称，保留旧 route:make 兼容能力。 */
function routeExportName(dir: string, file: string) {
  const parsed = relative(dir, file)
    .replace(/\.(ts|js)$/, '')
    .split(sep)
    .map((part) => part.replace(/[^A-Za-z0-9_$]/g, '_'))
    .join('_');
  return `routes_${parsed}`;
}

/** 生成单文件 route 聚合内容，兼容迁移期旧脚本。 */
export async function mergeAPIByDir({
  dir,
  target,
  ext = '.ts',
  esm = true,
}: {
  /** route 文件所在目录。 */
  dir: string;
  /** 写入目标文件；不传时仅返回内容。 */
  target?: string;
  /** 非 ESM 输出时使用的文件后缀。 */
  ext?: string;
  /** 是否把导入后缀转换为 .js。 */
  esm?: boolean;
}) {
  const files = await collectFiles(dir);
  const lines = ['/** 此文件自动生成，请勿修改 */'];
  files.forEach((file) => {
    const rel = './' + relative(join(dir, '..'), file).replaceAll(sep, '/');
    const modulePath = rel.replace(/\.(ts|js)$/, esm ? '.js' : ext);
    lines.push(
      `export { default as ${routeExportName(dir, file)} } from '${modulePath}';`,
    );
  });
  const content = lines.join('\n') + '\n';
  if (target) {
    const { fse } = await import('../../utils/runtime.js');
    await fse.writeFile(target, content, 'utf8');
  }
  return content;
}

/** 判断动态导入的值是否像 Fastify route。 */
function isRouteOptions(value: unknown): value is RouteOptions {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const route = value as Partial<RouteOptions>;
  return Boolean(route.method && route.url && route.handler);
}

/** 给 route 添加统一前缀。 */
function withPrefix(route: RouteOptions, prefix: string): RouteOptions {
  return {
    ...route,
    url: `${prefix}${route.url}`,
  };
}

/** 从单个聚合文件读取 route，兼容旧 routes-single-file 模式。 */
export async function getAPIBySingleFile({
  file,
  prefix = '',
  log,
}: {
  /** 聚合文件路径。 */
  file: string;
  /** 注册时追加的 API 前缀。 */
  prefix?: string;
  /** 是否打印 method/url 列表。 */
  log?: boolean;
}) {
  const module = (await import(pathToFileURL(file).href)) as Record<
    string,
    RouteOptions
  >;
  const routes = Object.values(module).map((route) => withPrefix(route, prefix));
  if (log) {
    console.table(routes.map(({ method, url }) => ({ method, url })));
  }
  return routes;
}

/** 从目录动态读取 route 文件，替代生成 routes-single-file 的流程。 */
export async function getAPIByDir({
  dir,
  prefix = '',
  log,
}: {
  /** route 文件所在目录。 */
  dir: string;
  /** 注册时追加的 API 前缀。 */
  prefix?: string;
  /** 是否打印 method/url 列表。 */
  log?: boolean;
}) {
  const files = await collectFiles(dir);
  const routeGroups = await Promise.all(
    files.map(async (file) => {
      const module = (await import(pathToFileURL(file).href)) as {
        default?: RouteOptions | RouteOptions[];
      };
      const routes = Array.isArray(module.default)
        ? module.default
        : [module.default];
      routes.forEach((route) => {
        if (!isRouteOptions(route)) {
          throw new Error(`${file}: default export is not a Fastify route`);
        }
      });
      return routes as RouteOptions[];
    }),
  );
  const routes = routeGroups.flat().map((route) => withPrefix(route, prefix));
  if (log) {
    console.table(routes.map(({ method, url }) => ({ method, url })));
  }
  return routes;
}
