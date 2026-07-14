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
  ],
});

/** createDomainError 可用的 ROOT_ERROR 注册键（决定 HTTP 状态码）。 */
type DomainErrorKey =
  | '非法参数'
  | '认证: 权限不足'
  | '相关文件不存在'
  | '数据异常'
  | '服务异常';

/**
 * 创建统一业务错误，直接复用 ROOT_ERROR 已注册的键决定 HTTP 状态码。
 *
 * @param code 稳定错误码，供日志和管理端定位阶段。
 * @param message 面向用户的中文说明，不得包含签名 URL 和存储凭证。
 * @param key ROOT_ERROR 注册键，决定 HTTP 状态码，默认 '非法参数'(400)。
 */
export function createDomainError(
  code: string,
  message: string,
  key: DomainErrorKey = '非法参数',
) {
  return new ROOT_ERROR(key, `${code}: ${message}`);
}
