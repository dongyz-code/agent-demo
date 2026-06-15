/**
 * 权限两种:
 *
 * 1. 页面权限 page
 * 2. 模块权限 module
 * 3. 功能/数据权限 action
 *
 * 分组标记(无实际意义): group
 */

import type { Simplify, BeString, UnionToIntersection } from '@/types';

/** 权限类型 */
export type PType = 'page' | 'module' | 'action' | 'group';

export type PModel = {
  [key: string]: {
    type: PType;
    label: string;
    children?: PModel;
  };
};

export function helper<const T extends PModel>(data: T) {
  return data;
}

export type HandlePModel<
  T extends PModel,
  Prefix extends string = '',
> = Simplify<
  UnionToIntersection<
    | {
        -readonly [key in keyof T as `${Prefix}${BeString<key>}`]: T[key]['type'];
      }
    | {
        -readonly [key in keyof T]: T[key]['children'] extends PModel
          ? HandlePModel<T[key]['children'], `${Prefix}${BeString<key>}.`>
          : never;
      }[keyof T]
  >
>;
