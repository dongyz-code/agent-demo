import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const serverRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const sourceRoot = join(serverRoot, 'src');
const documentsRoot = join(sourceRoot, 'hooks/documents');

const allowedDependencies: Record<string, ReadonlySet<string>> = {
  storage: new Set(),
  upload: new Set(),
  files: new Set(['storage']),
  preview: new Set(['storage']),
  knowledge: new Set(['storage', 'files']),
  processing: new Set(['storage', 'files', 'knowledge']),
};

/**
 * 递归列出目录下的 TypeScript 源文件。
 *
 * @param directory 需要遍历的绝对目录。
 * @returns 目录下全部 `.ts` 文件绝对路径。
 */
async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? await listTypeScriptFiles(path)
        : path.endsWith('.ts')
          ? [path]
          : [];
    }),
  );
  return nested.flat();
}

/**
 * 读取单个源文件中的静态 import 路径。
 *
 * @param path TypeScript 源文件绝对路径。
 * @returns 文件声明的模块路径列表。
 */
async function readImportSpecifiers(path: string): Promise<string[]> {
  const source = ts.createSourceFile(
    path,
    await readFile(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  return source.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
}

/**
 * 将本地 import 路径解析为不带扩展名差异的绝对 TypeScript 路径。
 *
 * @param importer 发起导入的源文件。
 * @param specifier import 中的模块路径。
 * @returns 非本地依赖返回空，本地依赖返回绝对路径。
 */
function resolveLocalImport(
  importer: string,
  specifier: string,
): string | undefined {
  let target: string;
  if (specifier.startsWith('@/')) {
    target = join(sourceRoot, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    target = resolve(dirname(importer), specifier);
  } else {
    return undefined;
  }
  return target.replace(/\.js$/, '.ts');
}

/** 返回文件在 documents 域中的一级职责目录。 */
function getDocumentsLayer(path: string): string | undefined {
  const local = relative(documentsRoot, path);
  if (local.startsWith('..') || local === 'index.ts') return undefined;
  return local.split(sep)[0];
}

test('documents 域内依赖遵守显式 DAG 且不反向导入根入口', async () => {
  const violations: string[] = [];
  const files = (await listTypeScriptFiles(documentsRoot)).filter(
    (path) => !path.includes(`${sep}tests${sep}`),
  );

  for (const importer of files) {
    const sourceLayer = getDocumentsLayer(importer);
    for (const specifier of await readImportSpecifiers(importer)) {
      const target = resolveLocalImport(importer, specifier);
      if (!target || !target.startsWith(`${documentsRoot}${sep}`)) continue;
      if (target === join(documentsRoot, 'index.ts')) {
        violations.push(`${relative(sourceRoot, importer)} -> ${specifier}`);
        continue;
      }
      const targetLayer = getDocumentsLayer(target);
      if (
        sourceLayer &&
        targetLayer &&
        sourceLayer !== targetLayer &&
        !allowedDependencies[sourceLayer]?.has(targetLayer)
      ) {
        violations.push(`${relative(sourceRoot, importer)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('documents 域外只能从根入口导入领域能力', async () => {
  const violations: string[] = [];
  const files = (await listTypeScriptFiles(sourceRoot)).filter(
    (path) => !path.startsWith(`${documentsRoot}${sep}`),
  );

  for (const importer of files) {
    for (const specifier of await readImportSpecifiers(importer)) {
      const target = resolveLocalImport(importer, specifier);
      if (
        target?.startsWith(`${documentsRoot}${sep}`) &&
        target !== join(documentsRoot, 'index.ts')
      ) {
        violations.push(`${relative(sourceRoot, importer)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('documents 根入口使用显式白名单且不公开内部控制函数', async () => {
  const rootSource = await readFile(join(documentsRoot, 'index.ts'), 'utf8');
  assert.doesNotMatch(rootSource, /export\s+(?:type\s+)?\*/);
  assert.match(rootSource, /checkUploadBucket/);
  assert.match(rootSource, /startFileProcessingWorker/);
  assert.doesNotMatch(rootSource, /getInternalS3Client/);
  assert.doesNotMatch(rootSource, /runFileProcessingTask/);
});
