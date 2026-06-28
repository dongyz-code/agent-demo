import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Suspense, type ReactNode } from 'react';

import { AuthLayout } from '@/layouts/auth/AuthLayout';
import { WorkspaceLayout } from '@/layouts/workspace/WorkspaceLayout';
import { routeGuard } from './guard';
import { LazyNotFoundPage, routes } from './routes';

import type { RouteComponent } from '@tanstack/react-router';
import type { RouteConfig } from './type';

/**
 * 渲染路由懒加载期间的主题化骨架屏。
 *
 * @returns 路由加载占位节点。
 */
function RoutePending() {
  return (
    <div
      className="h-24 animate-pulse rounded border border-app-border bg-app-surface"
      aria-label="Loading page"
    />
  );
}

/**
 * 为需要登录的页面包裹工作区布局。
 *
 * @param children 路由页面节点。
 * @returns 工作区布局后的路由节点。
 */
function withWorkspaceLayout(children: ReactNode) {
  return (
    <WorkspaceLayout>
      <Suspense fallback={<RoutePending />}>{children}</Suspense>
    </WorkspaceLayout>
  );
}

/**
 * 为认证页面包裹认证布局。
 *
 * @param children 路由页面节点。
 * @returns 认证布局后的路由节点。
 */
function withAuthLayout(children: ReactNode) {
  return (
    <AuthLayout>
      <Suspense fallback={<RoutePending />}>{children}</Suspense>
    </AuthLayout>
  );
}

/**
 * 按路由配置选择对应布局并渲染页面。
 *
 * @param routeConfig 当前路由配置。
 * @returns 带布局的路由节点。
 */
function renderRoute(routeConfig: RouteConfig) {
  const { component: Page, layout } = routeConfig;

  return layout === 'auth'
    ? withAuthLayout(<Page />)
    : withWorkspaceLayout(<Page />);
}

/**
 * 创建带预加载能力的路由组件。
 *
 * @param item 路由配置项。
 * @returns TanStack Router 可使用的路由组件。
 */
function createLayoutRouteComponent(item: RouteConfig): RouteComponent {
  const LayoutRoute = () => renderRoute(item);

  LayoutRoute.preload = item.component.preload;

  return LayoutRoute;
}

const rootRoute = createRootRoute({
  notFoundComponent: () => withWorkspaceLayout(<LazyNotFoundPage />),
});

const routeTree = rootRoute.addChildren(
  routes.map((item) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: item.path,
      beforeLoad: () => routeGuard(item.meta),
      component: createLayoutRouteComponent(item),
    }),
  ),
);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
