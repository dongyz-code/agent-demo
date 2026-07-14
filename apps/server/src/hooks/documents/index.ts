/**
 * documents 域公共出口。
 *
 * 文件上传、文件管理、文档实体、知识库与文件处理任务的全部实现收口到本域，
 * 按 storage/upload/files/preview/processing/knowledge 子模块组织
 * （content 流水线已并入 processing/pipeline，文档/版本查询已并入 files）。
 * 路由与其他业务模块统一从本入口调用。
 *
 * 详见 openspec/changes/consolidate-documents-domain。
 */
export * from './storage/index.js';
export * from './upload/index.js';
export * from './files/index.js';
export * from './preview/index.js';
export * from './knowledge/index.js';
export * from './processing/index.js';
