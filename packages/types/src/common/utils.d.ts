import type { Simplify } from './module.js';
export type {
  ApiConfig,
  ApiMultAction,
  ApiMultActionToApi,
} from './api.js';

/** 将 T 转换为字符串 */
export type BeString<T> = T extends string ? T : never;

export type SplitObj<T> = Simplify<
  {
    [key in keyof T]: {
      [key2 in key]: T[key];
    };
  }[keyof T]
>;
