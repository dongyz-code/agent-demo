/**
 * documents 域公共出口。
 *
 * 文件上传、文件管理、文档实体、内容处理、知识库与文件处理任务的全部实现
 * 收口到本域，按 storage/upload/files/preview/content/processing/knowledge/documents
 * 子模块组织。路由与其他业务模块统一从本入口调用。
 *
 * 详见 openspec/changes/consolidate-documents-domain。
 */
export * from './errors.js';
export * from './storage/index.js';
export * from './upload/index.js';
export * from './files/index.js';
export * from './preview/index.js';
export * from './content/index.js';
export * from './knowledge/index.js';
export * from './processing/index.js';
export * from './documents/index.js';
