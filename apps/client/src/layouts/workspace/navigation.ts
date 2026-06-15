import { routePathMap, routes } from '@/router/routes';

import type {
  IconComponent,
  RouteMeta,
  RouteName,
  RoutePath,
} from '@/router/type';

export type WorkspaceNavItem = {
  name: RouteName;
  label: string;
  to: RoutePath;
  icon: IconComponent;
};

export const workspaceNavigation: WorkspaceNavItem[] = routes
  .map((route) => ({
    ...route,
    meta: route.meta as RouteMeta,
  }))
  .filter(
    ({ layout, meta }) =>
      layout === 'workspace' && meta.nav && meta.nav.hidden !== true,
  )
  .sort((a, b) => (a.meta.nav?.order ?? 0) - (b.meta.nav?.order ?? 0))
  .map(({ name, meta }) => {
    return {
      name,
      label: meta.title,
      to: routePathMap[name],
      icon: meta.nav!.icon,
    };
  });
