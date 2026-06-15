import type { Simplify } from './module.js';

/** 将 T 转换为字符串 */
export type BeString<T> = T extends string ? T : never;

export type SplitObj<T> = Simplify<
  {
    [key in keyof T]: {
      [key2 in key]: T[key];
    };
  }[keyof T]
>;

type ApiConfig = Record<
  string,
  {
    req: unknown;
    /** 不填默认返回 ok */
    resp?: unknown;
  }
>;

/** 所有的 Action 操作 */
export type ApiMultAction<T extends ApiConfig> = T;

/** 所有的 Action 操作生成 API 接口定义 */
export type ApiMultActionToApi<T extends ApiConfig> = {
  [key in keyof T as `/${BeString<key>}`]: {
    method: 'POST';
    req: T[key]['req'];
    resp: T[key] extends { resp: unknown } ? T[key]['resp'] : 'ok';
  };
};
