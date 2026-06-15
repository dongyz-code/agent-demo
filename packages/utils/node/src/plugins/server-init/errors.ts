type RootErrorOpts = {
  /** 错误字符串列表 */
  vals: (
    | {
        key: string;
        code: string;
      }
    | string
  )[];
  /** 错误默认编码, 默认 500 */
  default_code?: string;
};

export function initRootError<const T extends RootErrorOpts>({
  vals,
  default_code = '500',
}: T) {
  type ErrorKey = T['vals'][number] extends
    | infer U
    | {
        key: infer U;
      }
    ? U
    : never;

  const list = vals.map((key) => {
    if (typeof key === 'string') {
      return {
        key,
        code: default_code,
      };
    }
    return key;
  });

  const listMap = new Map(list.map(({ key, code }) => [key, code]));

  class ROOT_ERROR<T extends ErrorKey> extends Error {
    code: string;
    constructor(...items: [T, unknown?]) {
      const [key, info] = items;
      let msg = key as string;
      if (info) {
        msg += ` (${typeof info === 'object' ? JSON.stringify(info) : info})`;
      }
      super(msg);
      this.code = listMap.get(key as string)!;
    }
  }

  return {
    /** 全局错误 */
    ROOT_ERROR,
    /** 全局错误, 默认 CODE */
    ROOT_ERROR_DEFAULT_CODE: default_code,
  };
}
