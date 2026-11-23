import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getDocumentCapabilities,
  getRetrievalLabel,
  getRetrievalTagType,
} from '../src/pages/document/utils';
import {
  grantKey,
  mergeGrantSelection,
} from '../src/pages/document/library/utils';

import type { DocumentInfo, LibraryGrantInput } from '@/types';

/**
 * 构造只用于验证操作规则和检索文案的完整文档摘要。
 * @param overrides 当前测试需要覆盖的字段。
 * @returns 不包含网络、存储或真实业务数据的文档。
 */
function createDocument(overrides: Partial<DocumentInfo> = {}): DocumentInfo {
  return {
    documentId: 'document-1',
    name: '测试文档',
    libraryId: 'library-1',
    libraryName: '测试资料库',
    myRole: 'manager',
    status: 'active',
    indexedVersionId: 'version-2',
    versionCount: 2,
    cover: null,
    createdAt: new Date('2026-11-19T00:00:00Z'),
    activeVersion: {
      documentVersionId: 'version-2',
      version: 2,
      filename: '测试文档.txt',
      extension: 'txt',
      contentType: 'text/plain',
      size: 100,
      previewStatus: 'ready',
      previewPageCount: 1,
      previewError: null,
      ragStatus: 'processing',
      ragError: null,
      createdAt: new Date('2026-11-19T00:00:00Z'),
    },
    ...overrides,
  };
}

test('使用者即使拥有操作权限，也不能维护资料库文档', () => {
  assert.deepEqual(
    getDocumentCapabilities({ myRole: 'user' }, () => true),
    {
      canUpdate: false,
      canDelete: false,
      canProcess: false,
    },
  );
});

test('库管理员仍按账号的具体操作权限显示维护入口', () => {
  assert.deepEqual(
    getDocumentCapabilities(
      { myRole: 'manager' },
      (key) => key === 'actions.documents.process',
    ),
    {
      canUpdate: false,
      canDelete: false,
      canProcess: true,
    },
  );
  assert.equal(getDocumentCapabilities(undefined, () => true).canUpdate, false);
});

test('检索仍使用旧版本时，不把新版本的处理中误报为不可检索', () => {
  const document = createDocument({ indexedVersionId: 'version-1' });
  assert.equal(getRetrievalLabel(document), '旧版可检索');
  assert.equal(getRetrievalTagType(document), 'warning');
});

test('当前版本成为实际检索版本后显示可检索，无检索版本时显示索引进度', () => {
  assert.equal(getRetrievalLabel(createDocument()), '可检索');
  assert.equal(getRetrievalTagType(createDocument()), 'success');
  assert.equal(
    getRetrievalLabel(createDocument({ indexedVersionId: null })),
    '索引中',
  );
});

test('新增授权保留系统管理员和原有身份，不修改调用方原名单', () => {
  const grants: LibraryGrantInput[] = [
    { subjectType: 'user', subjectId: '-', role: 'manager' },
    { subjectType: 'user', subjectId: 'user-1', role: 'manager' },
  ];
  const next = mergeGrantSelection(grants, {
    subjectType: 'user',
    subjects: [
      { id: 'user-1', name: '已有管理员' },
      { id: 'user-2', name: '新增成员' },
    ],
    role: 'user',
  });
  assert.equal(next.length, 3);
  assert.equal(next.find((grant) => grant.subjectId === '-')?.role, 'manager');
  assert.equal(
    next.find((grant) => grant.subjectId === 'user-1')?.role,
    'manager',
  );
  assert.equal(grants.length, 2);
});

test('用户和用户组的同名标识分别授权，并去重本批重复选择', () => {
  const existing: LibraryGrantInput[] = [
    { subjectType: 'group', subjectId: 'same-id', role: 'manager' },
  ];
  const next = mergeGrantSelection(existing, {
    subjectType: 'user',
    subjects: [
      { id: 'same-id', name: '用户' },
      { id: 'same-id', name: '重复用户' },
    ],
    role: 'user',
  });
  assert.equal(next.length, 2);
  assert.notEqual(grantKey(next[0]!), grantKey(next[1]!));
});
