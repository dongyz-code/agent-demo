type RootErrorOpts = {
  /** 错误字符串列表。 */
  vals: (
    | {
        /** 错误唯一标识，业务抛错时使用。 */
        key: string;
        /** 返回给调用方的错误码。 */
        code: string;
        /** HTTP 状态码；不传时会优先从数字型 code 推导。 */
        statusCode?: number;
      }
    | string
  )[];
  /** 错误默认编码，默认 500。 */
  default_code?: string;
  /** 未显式声明状态码时使用的默认 HTTP 状态码。 */
  defaultStatusCode?: number;
};

export function initRootError<const T extends RootErrorOpts>({
  vals,
  default_code = '500',
  defaultStatusCode = 500,
}: T) {
  type ErrorKey = T['vals'][number] extends infer Item
    ? Item extends string
      ? Item
      : Item extends { key: infer Key }
        ? Key
        : never
    : never;

  /** 判断 HTTP 状态码是否是合法错误状态。 */
  function isErrorStatusCode(value: unknown): value is number {
    return typeof value === 'number' && value >= 400 && value <= 599;
  }

  /** 从错误码或显式配置中解析 HTTP 状态码。 */
  function resolveStatusCode(code: string, statusCode: number | undefined) {
    if (isErrorStatusCode(statusCode)) {
      return statusCode;
    }
    const parsed = Number(code);
    return isErrorStatusCode(parsed) ? parsed : defaultStatusCode;
  }

  const list = vals.map((key) => {
    if (typeof key === 'string') {
      return {
        key,
        code: default_code,
        statusCode: defaultStatusCode,
      };
    }
    return {
      ...key,
      statusCode: resolveStatusCode(key.code, key.statusCode),
    };
  });

  const listMap = new Map(
    list.map(({ key, code, statusCode }) => [key, { code, statusCode }]),
  );

  class ROOT_ERROR<T extends ErrorKey> extends Error {
    /** 返回给调用方的错误码。 */
    code: string;
    /** Fastify 错误处理使用的 HTTP 状态码。 */
    statusCode: number;
    constructor(...items: [T, unknown?]) {
      const [key, info] = items;
      let msg = key as string;
      if (info !== undefined) {
        msg += ` (${typeof info === 'object' ? JSON.stringify(info) : info})`;
      }
      super(msg);
      const config = listMap.get(key as string);
      this.code = config?.code ?? default_code;
      this.statusCode = config?.statusCode ?? defaultStatusCode;
    }
  }

  return {
    /** 全局错误。 */
    ROOT_ERROR,
    /** 全局错误默认 CODE。 */
    ROOT_ERROR_DEFAULT_CODE: default_code,
  };
}
