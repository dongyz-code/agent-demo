/** 全局安装的模块统一放在 window[ROOT_KEY] */
const ROOT_KEY = Symbol('ROOT_KEY');

declare global {
  interface Window {
    [ROOT_KEY]: Record<symbol, unknown>;
  }
}

window[ROOT_KEY] = {};

/** 首字母大写 */
function capitalize<T extends string>(str: T) {
  return (
    str.length ? `${str[0]!.toUpperCase()}${str.slice(1)}` : str
  ) as Capitalize<T>;
}

/** 全局安装模块，setup 之外调用 */
export function globalSet<K extends string, T>(key: K) {
  const symbolKey = Symbol(key);

  const useKey = `use${capitalize(key)}` as const;
  const installKey = `install${capitalize(key)}` as const;

  return {
    [installKey](data: T) {
      window[ROOT_KEY][symbolKey] = data;
    },
    [useKey]: () => {
      if (!window[ROOT_KEY][symbolKey]) {
        throw new Error(`${key} is not ready!!!`);
      }
      return window[ROOT_KEY][symbolKey] as T;
    },
  } as {
    [key in `install${Capitalize<K>}`]: (data: T) => void;
  } & {
    [key in `use${Capitalize<K>}`]: () => T;
  };
}
