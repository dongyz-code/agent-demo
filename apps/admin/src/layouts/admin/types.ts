import type { IconType } from '@repo/ui';

/**
 * children / groups 都不存在的时候，该项为 el-menu-item，才承担路由跳转逻辑
 */
export type MenuItem<K extends string = string, T = {}> = T & {
  label: string;
  icon?: IconType;
} & (
    | {
        /** 叶子菜单使用受泛型约束的路由名，便于安全推导默认入口。 */
        value: K;
      }
    | {
        /** 存在的时候，该项为子菜单 el-sub-menu */
        children: MenuItem<K, T>[];
      }
  );

export type MenuItemValue = {
  label: string;
  icon?: IconType;
  value: string;
};

export type Props = {
  items: MenuItem[];
};
