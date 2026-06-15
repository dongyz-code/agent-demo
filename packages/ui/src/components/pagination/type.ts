export interface PageData {
  total: number;
  current: number;
  size: number;
  sizes?: number[];
  layout?: (
    | 'total'
    | 'sizes'
    | 'prev'
    | 'pager'
    | 'next'
    | 'jumper'
    | 'slot'
  )[];
  pagerCount?: number;
  /** 真实计数，用于上限限制, 即后端返回的 total 是上限，realCount 是真实计数  */
  realCount?: number;
}

export const defaultPageData: Required<Omit<PageData, 'realCount'>> = {
  total: 0,
  current: 1,
  sizes: [10, 20, 50, 100],
  size: 20,
  layout: ['slot', 'sizes', 'prev', 'pager', 'next', 'jumper'],
  pagerCount: 5,
};

export type Props = {
  align?: 'left' | 'center' | 'right';
  height?: string;
  modelValue?: PageData;
  size?: 'large' | 'default' | 'small';
};
