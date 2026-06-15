import { initRootError } from '@repo/utils-node';

export const ROOT_ERROR_CODE_AUTHENTICATION_FAILED = '401';

export const { ROOT_ERROR, ROOT_ERROR_DEFAULT_CODE } = initRootError({
  default_code: '500',
  vals: [
    '暂未开放',
    '非法参数',
    '校验失败',
    '服务异常',
    '系统配置: 配置文件不存在',
    '系统配置: PG 配置不存在',
    {
      key: '认证: 身份校验失败',
      code: ROOT_ERROR_CODE_AUTHENTICATION_FAILED,
    },
    '认证: 未授权登录',
    '认证: 权限不足',

    //
    '用户管理: 已存在同名用户',
    '用户管理: 用户ID重复',
    '角色管理: 角色名称不能为空',
    '角色管理: 角色名称重复',

    //
    '文件处理: 子进程处理失败',
    '文件处理: 不支持的文件类型',
    '文件处理: PSD文件转换失败',
    '文件处理: AI文件转换失败',
    '文件处理: SOFFICE转换失败',
    '文件处理: EXT重复映射',
    '文件处理: GIF转换失败',
    '文件上传: 文件分片校验不匹配，请重新上传',

    '数据异常',
    '相关文件不存在',
    '文件上传失败',
  ],
});
