/** documents 域统一错误分类，映射到 HTTP 状态码。 */
export type DomainErrorKind =
  /** 非法参数，映射 HTTP 400。 */
  | 'bad-request'
  /** 权限不足，映射 HTTP 403。 */
  | 'forbidden'
  /** 资源不存在，映射 HTTP 404。 */
  | 'not-found'
  /** 资源状态冲突，映射 HTTP 409。 */
  | 'conflict'
  /** 服务端异常，映射 HTTP 500。 */
  | 'internal'
  /** 服务暂不可用，映射 HTTP 500。 */
  | 'unavailable';

/**
 * documents 域稳定业务错误码。
 *
 * 迁移期保留原字符串值以兼容日志与管理端错误码判断，集中定义以取代散落字面量；
 * 随实现迁入逐步补充。
 */
export type DocumentsErrorCode =
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_VERSION_NOT_FOUND'
  | 'DOCUMENT_NOT_READY'
  | 'DOCUMENT_JOB_NOT_FOUND'
  | 'DOCUMENT_JOB_STATE_CONFLICT'
  | 'DOCUMENT_JOB_CANCELED'
  | 'DOCUMENT_PARSER_NOT_SUPPORTED'
  | 'DOCUMENT_PARSER_UNAVAILABLE'
  | 'DOCUMENT_PARSER_INVALID_RESPONSE'
  | 'DOCUMENT_TEXT_TOO_LARGE'
  | 'DOCUMENT_PROCESSING_FAILED'
  | 'FILE_PROCESSING_DISABLED'
  | 'FILE_PROCESSING_DATASET_REQUIRED'
  | 'FILE_PROCESSING_DATASET_DISABLED'
  | 'FILE_PROCESSING_TASK_NOT_FOUND'
  | 'FILE_PROCESSING_TASK_STATE_CONFLICT'
  | 'FILE_PROCESSING_TASK_CANCELED'
  | 'FILE_PROCESSING_CONTEXT_INVALID'
  | 'FILE_PROCESSING_FAILED';
