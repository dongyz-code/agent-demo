import type { RouteRecordRaw } from 'vue-router';
export type { RouteRecordRaw } from 'vue-router';

export interface RouteItem<
  Name extends string = string,
  Meta extends Record<string, unknown> = Record<string, unknown>,
> {
  /** 路由名字 */
  name: Name;
  /** 路由路径 */
  path: string;
  /** 组件 */
  component: NonNullable<RouteRecordRaw['component']>;
  /** 元信息 */
  meta?: Meta;
  /** 子路由
   *
   * 注意，以 / 开头的嵌套路径将被视为根路径。这允许你利用组件嵌套，而不必使用嵌套的 URL。(即显示是组件嵌套，浏览器url是以/开头的嵌套路径)
   */
  children?: RouteItem<Name, Meta>[];
  /**
   * 路由组件传参
   *
   * 当 props 设置为 true 时，route.params 将被设置为组件的 props。可以不用使用 route.params.id 类似获取
   *
   * 请确保添加一个与路由参数完全相同的 prop 名
   *
   * https://router.vuejs.org/zh/guide/essentials/passing-props.html
   */
  props?: true;
  /**
   * 是否是默认路径，如果有多个路由在统一层级，path '' 会匹配 root 的路由（或者重定向）
   */
  root?: boolean;
  /**
   * 捕获所有路由，并将参数放置在对应值下，$route.params.pathMatch，简单应用就 404
   */
  pathMatch?: boolean;
}

/** 默认的路由元信息 */
export type RouteMeta<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** 路由名称 */
  title?: string;
  /** 是否需要权限认证, 默认是 true */
  withAuth?: boolean;
  /** 是否仅管理员可见, 默认是 false */
  onlyAdmin?: boolean;
} & T;
