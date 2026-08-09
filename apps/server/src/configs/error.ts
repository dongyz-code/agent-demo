import { initRootError } from '@repo/utils-node';

/** 参数或请求体错误，同时映射到 HTTP 400。 */
export const ROOT_ERROR_CODE_BAD_REQUEST = '400';
/** 身份认证失败错误码，同时映射到 HTTP 401。 */
export const ROOT_ERROR_CODE_AUTHENTICATION_FAILED = '401';
/** 权限不足错误码，同时映射到 HTTP 403。 */
export const ROOT_ERROR_CODE_FORBIDDEN = '403';
/** 资源不存在错误码，同时映射到 HTTP 404。 */
export const ROOT_ERROR_CODE_NOT_FOUND = '404';
/** 资源冲突错误码，同时映射到 HTTP 409。 */
export const ROOT_ERROR_CODE_CONFLICT = '409';
/** 服务端异常错误码，同时映射到 HTTP 500。 */
export const ROOT_ERROR_CODE_INTERNAL = '500';

export const { ROOT_ERROR, ROOT_ERROR_DEFAULT_CODE } = initRootError({
  default_code: ROOT_ERROR_CODE_INTERNAL,
  vals: [
    {
      key: '暂未开放',
      code: ROOT_ERROR_CODE_FORBIDDEN,
    },
    {
      key: '非法参数',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },
    {
      key: '校验失败',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },
    {
      key: '服务异常',
      code: ROOT_ERROR_CODE_INTERNAL,
    },
    {
      key: '系统配置: 配置文件不存在',
      code: ROOT_ERROR_CODE_INTERNAL,
    },
    {
      key: '系统配置: PG 配置不存在',
      code: ROOT_ERROR_CODE_INTERNAL,
    },
    {
      key: '认证: 身份校验失败',
      code: ROOT_ERROR_CODE_AUTHENTICATION_FAILED,
    },
    {
      key: '认证: 未授权登录',
      code: ROOT_ERROR_CODE_AUTHENTICATION_FAILED,
    },
    {
      key: '认证: 权限不足',
      code: ROOT_ERROR_CODE_FORBIDDEN,
    },

    //
    {
      key: '用户管理: 已存在同名用户',
      code: ROOT_ERROR_CODE_CONFLICT,
    },
    {
      key: '用户管理: 用户ID重复',
      code: ROOT_ERROR_CODE_CONFLICT,
    },
    {
      key: '角色管理: 角色名称不能为空',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },
    {
      key: '角色管理: 角色名称重复',
      code: ROOT_ERROR_CODE_CONFLICT,
    },

    //
    {
      key: '文件处理: 子进程处理失败',
      code: ROOT_ERROR_CODE_INTERNAL,
    },
    {
      key: '文件处理: 不支持的文件类型',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },
    {
      key: '文件处理: PSD文件转换失败',
      code: ROOT_ERROR_CODE_INTERNAL,
    },
    {
      key: '文件处理: AI文件转换失败',
      code: ROOT_ERROR_CODE_INTERNAL,
    },
    {
      key: '文件处理: SOFFICE转换失败',
      code: ROOT_ERROR_CODE_INTERNAL,
    },
    {
      key: '文件处理: EXT重复映射',
      code: ROOT_ERROR_CODE_CONFLICT,
    },
    {
      key: '文件处理: GIF转换失败',
      code: ROOT_ERROR_CODE_INTERNAL,
    },
    {
      key: '文件上传: 文件分片校验不匹配，请重新上传',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },
    {
      key: '文件上传: 文件不能为空',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },
    {
      key: '文件上传: 文件大小超过限制',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },
    {
      key: '文件上传: 文件类型不受支持',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },
    {
      key: '文件上传: 上传会话已过期，请重新选择文件',
      code: ROOT_ERROR_CODE_CONFLICT,
    },
    {
      key: '文件上传: 上传会话已结束，请重新选择文件',
      code: ROOT_ERROR_CODE_CONFLICT,
    },
    {
      key: '文件上传: 上传会话正在确认，请稍后重试',
      code: ROOT_ERROR_CODE_CONFLICT,
    },
    {
      key: '文件上传: 对象大小不匹配',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },
    {
      key: '文件上传: 文件内容与声明类型不匹配',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },

    {
      key: '数据异常',
      code: ROOT_ERROR_CODE_CONFLICT,
    },
    {
      key: '相关文件不存在',
      code: ROOT_ERROR_CODE_NOT_FOUND,
    },
    {
      key: '文件上传失败',
      code: ROOT_ERROR_CODE_BAD_REQUEST,
    },

    // 文档任务（任务内部错误码，仅写入 tasks/stage_runs 的 error_code，不回 HTTP，statusCode 默认 500）
    {
      key: '只有已逻辑删除的文档可以清理',
      code: 'DOCUMENT_CLEANUP_NOT_DELETED',
    },
    {
      key: '文档状态已恢复，拒绝物理清理',
      code: 'DOCUMENT_CLEANUP_NOT_DELETED',
    },
    {
      key: '本地文本解析上限为 32 MiB',
      code: 'DOCUMENT_TEXT_TOO_LARGE',
    },
    {
      key: 'AI.textIn.baseUrl 未配置',
      code: 'DOCUMENT_PARSER_ENDPOINT_MISSING',
    },
    {
      key: 'AI.textIn.apiKey 未配置',
      code: 'DOCUMENT_PARSER_AUTH_MISSING',
    },
    {
      key: 'TextIn 异步任务恢复信息无效',
      code: 'DOCUMENT_PARSER_CHECKPOINT_INVALID',
    },
    {
      key: 'TextIn 未返回有效 job_id',
      code: 'DOCUMENT_PARSER_INVALID_RESPONSE',
    },
    {
      key: 'TextIn 异步解析等待超时',
      code: 'DOCUMENT_PARSER_ASYNC_TIMEOUT',
    },
    {
      key: 'TextIn 状态响应 job_id 不匹配',
      code: 'DOCUMENT_PARSER_INVALID_RESPONSE',
    },
    {
      key: 'TextIn 异步解析任务失败',
      code: 'DOCUMENT_PARSER_UPSTREAM_FAILED',
    },
    {
      key: 'TextIn 完成任务未返回 result_url',
      code: 'DOCUMENT_PARSER_INVALID_RESPONSE',
    },
    {
      key: 'TextIn 返回了未知任务状态',
      code: 'DOCUMENT_PARSER_INVALID_RESPONSE',
    },
    {
      key: 'TextIn 未返回 Markdown 内容',
      code: 'DOCUMENT_PARSER_INVALID_RESPONSE',
    },
    {
      key: '当前文件类型不支持页面预览',
      code: 'DOCUMENT_PREVIEW_TYPE_UNSUPPORTED',
    },
    {
      key: '无法读取转换后页面尺寸',
      code: 'DOCUMENT_PREVIEW_IMAGE_INVALID',
    },
    {
      key: 'PDF 页数超过上限',
      code: 'DOCUMENT_PREVIEW_PAGE_LIMIT',
    },
    {
      key: '未配置 Office 转换 Worker',
      code: 'DOCUMENT_PREVIEW_OFFICE_WORKER_MISSING',
    },
    {
      key: 'Office Worker 未返回有效 PDF',
      code: 'DOCUMENT_PREVIEW_OFFICE_INVALID',
    },
    {
      key: '文本预览页数超过上限',
      code: 'DOCUMENT_PREVIEW_PAGE_LIMIT',
    },
    {
      key: '源文件超过预览大小上限',
      code: 'DOCUMENT_PREVIEW_SOURCE_LIMIT',
    },
    {
      key: '文档已删除，不能生成预览',
      code: 'DOCUMENT_PREVIEW_DOCUMENT_DELETED',
    },
    {
      key: '只有验证成功的文件可以生成预览',
      code: 'DOCUMENT_PREVIEW_SOURCE_INVALID',
    },
    {
      key: '转换页面序号不连续',
      code: 'DOCUMENT_PREVIEW_PAGE_SEQUENCE_INVALID',
    },
    {
      key: '转换器没有生成任何页面',
      code: 'DOCUMENT_PREVIEW_EMPTY',
    },
    {
      key: '文档已删除，不能发布预览',
      code: 'DOCUMENT_PREVIEW_DOCUMENT_DELETED',
    },
    {
      key: '文档版本不存在',
      code: 'DOCUMENT_PREVIEW_VERSION_NOT_FOUND',
    },
    {
      key: '阶段恢复信息不是有效 JSON',
      code: 'FILE_PROCESSING_CHECKPOINT_INVALID',
    },
    {
      key: '阶段恢复信息无法序列化',
      code: 'FILE_PROCESSING_CHECKPOINT_INVALID',
    },
  ],
});
