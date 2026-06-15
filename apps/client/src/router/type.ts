import type { RouteComponent } from '@tanstack/react-router';
import type { ComponentType, SVGProps } from 'react';
import type { routes } from './routes';

export type PermissionKey = 'settings.view';

export type RouteLayout = 'workspace' | 'auth';
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type RouteMeta = {
  title: string;
  auth?: boolean;
  guestOnly?: boolean;
  permissions?: readonly PermissionKey[];
  nav?: {
    icon: IconComponent;
    order?: number;
    hidden?: boolean;
  };
};

export type RouteConfig = {
  name: string;
  path: `/${string}` | '/';
  layout: RouteLayout;
  component: RouteComponent;
  meta: RouteMeta;
};

type RouteItem = (typeof routes)[number];

export type RouteName = RouteItem['name'];
export type RoutePath = RouteItem['path'];

type RouteByName<Name extends RouteName> = Extract<RouteItem, { name: Name }>;

export type RoutePathMap = {
  [Name in RouteName]: RouteByName<Name>['path'];
};

export type RouteMetaMap = {
  [Name in RouteName]: RouteByName<Name>['meta'];
};
