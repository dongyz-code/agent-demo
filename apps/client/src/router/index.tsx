import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Suspense, type ReactNode } from 'react';

import { AuthLayout } from '@/layouts/auth/AuthLayout';
import { WorkspaceLayout } from '@/layouts/workspace/WorkspaceLayout';
import { routeGuard } from './guard';
import { LazyNotFoundPage, routes } from './routes';

import type { RouteComponent } from '@tanstack/react-router';
import type { RouteConfig } from './type';

function RoutePending() {
  return (
    <div
      className="h-24 animate-pulse rounded border border-zinc-800 bg-zinc-900/70"
      aria-label="Loading page"
    />
  );
}

function withWorkspaceLayout(children: ReactNode) {
  return (
    <WorkspaceLayout>
      <Suspense fallback={<RoutePending />}>{children}</Suspense>
    </WorkspaceLayout>
  );
}

function withAuthLayout(children: ReactNode) {
  return (
    <AuthLayout>
      <Suspense fallback={<RoutePending />}>{children}</Suspense>
    </AuthLayout>
  );
}

function renderRoute({ component: Page, layout }: RouteConfig) {
  return layout === 'auth'
    ? withAuthLayout(<Page />)
    : withWorkspaceLayout(<Page />);
}

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
