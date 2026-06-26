import type { LiteralUnion, BeString } from '../../types';
import type { TableProps } from 'element-plus';

export type TableData = Record<string, unknown>[];

export type MinWidthKey = 'mini' | 'sm' | 'normal' | 'large' | 'xl';
export type MinWidth = LiteralUnion<MinWidthKey, number>;

export interface TableRow<T extends string = string> {
  label?: string;
  value?: T;
  width?: number | MinWidth; // 优先级比 minWidth 更高
  minWidth?: MinWidth;
  sortType?: 'number' | 'string'; // 数字比大小，字符串按编码
  sort?: boolean | 'custom'; // custom 自定义排序（远程排序）, true
  fixed?: boolean | 'right' | 'left';
  slot?: T;
  type?: 'expand' | 'selection' | 'index';
  /** 头部提示 */
  tips?: string;
  align?: 'left' | 'center' | 'right';
}

export interface SortChange {
  order: 'ascending' | 'descending';
  prop: string;
}

// import type { TableProps } from 'element-plus';

// export type Props = Writable<
//   Partial<
//     Pick<TableProps<any>, 'defaultExpandAll' | 'size' | 'maxHeight' | 'rowKey'>
//   >
// >;

export type Props<T extends Record<string, unknown>> = {
  defaultExpandAll?: boolean | undefined;
  size?: '' | 'large' | 'default' | 'small' | undefined;
  maxHeight?: string | number;
  rowKey?: string | undefined;
  data?: T[];
  rows?: TableRow<LiteralUnion<BeString<keyof T>, string>>[];
  loading?: boolean;
  defaultSort?: SortChange;
  /** https://element-plus.org/zh-CN/component/table.html#table-%E5%B1%9E%E6%80%A7 */
  props?: Partial<TableProps<T>>;
};
