import { Simplify, UnionToIntersection } from 'type-fest';

type BaseModel =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | BaseModel[];

type Model = {
  [key: string]: BaseModel | Model | Model[];
};

/** 字符串，断言 */
export type MustS<T> = T extends string ? T : never;

/** 前缀处理 */
type HandlePrefix<P extends string> = P extends '' ? P : `${P}.`;

/** 给对象的键添加前缀 */
type AddPrefix<T, P extends string> = keyof T extends never
  ? {}
  : UnionToIntersection<
      {
        [key in keyof T]: {
          [key2 in `${HandlePrefix<P>}${MustS<key>}`]: T[key];
        };
      }[keyof T]
    >;

/** 获取对象的长键 ?.?.?.?
 *
 * 一个复杂对象，按路径铺平
 *
 * ts 实现：，实现一个泛型结构，传入一个复杂对象结构，生成按 key1.key2.key3 的完成一维对象结构，路径铺平，每个key对应的value都是原来的 source[key1][key2][key3]
 *
 */
type _RecursionFlat<T extends Model, P extends string = ''> = AddPrefix<T, P> &
  UnionToIntersection<
    {
      [key in keyof AddPrefix<T, P>]: AddPrefix<T, P>[key] extends Model
        ? _RecursionFlat<AddPrefix<T, P>[key], MustS<key>>
        : {};
    }[keyof AddPrefix<T, P>]
  >;

export type RecursionFlat<T extends Model, P extends string = ''> = Simplify<
  _RecursionFlat<T, P>
>;
