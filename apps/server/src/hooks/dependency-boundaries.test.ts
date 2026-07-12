import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/** 递归读取目录中的 TypeScript 源文件。 */
async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return await listTypeScriptFiles(path);
      }
      return entry.name.endsWith('.ts') ? [path] : [];
    }),
  );
  return nested.flat();
}

/** 断言目录下源码不包含被禁止的静态导入。 */
async function assertNoImport(directory: string, pattern: RegExp) {
  const files = await listTypeScriptFiles(directory);
  const violations: string[] = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (pattern.test(source)) {
      violations.push(file);
    }
  }
  assert.deepEqual(violations, []);
}

/** 断言指定文件名前缀的 route 不导入基础设施实现。 */
async function assertThinRoutes(directory: string) {
  const files = (await listTypeScriptFiles(directory)).filter((file) =>
    /\/(?:upload|file|document|rag)[^/]*\.ts$/.test(file),
  );
  const violations: string[] = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/from\s+['"](?:@aws-sdk\/|@\/database\/|@\/hooks\/upload\/(?!index\.js['"]))/.test(source)) {
      violations.push(file);
    }
  }
  assert.deepEqual(violations, []);
}

describe('上传、文档与 RAG 三层依赖边界', () => {
  it('通用上传模块不导入文档或 RAG', async () => {
    await assertNoImport(
      join(import.meta.dirname, 'upload'),
      /from\s+['"](?:@\/hooks\/(?:document|rag)|\.\.\/(?:document|rag))/,
    );
  });

  it('文档模块不导入 RAG，且只能导入上传公共入口', async () => {
    await assertNoImport(
      join(import.meta.dirname, 'document'),
      /from\s+['"](?:@\/hooks\/rag|@\/hooks\/upload\/(?!index\.js['"]))/,
    );
  });

  it('RAG 不导入上传模块，且只能导入文档公共入口', async () => {
    await assertNoImport(
      join(import.meta.dirname, 'rag'),
      /from\s+['"](?:@\/hooks\/upload|@\/hooks\/document\/(?!index\.js['"]))/,
    );
  });

  it('业务 routes 不导入 S3 或数据库基础设施', async () => {
    await assertThinRoutes(
      join(import.meta.dirname, '..', 'router', 'routes'),
    );
  });
});
