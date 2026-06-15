import type { RouteItem, RouteRecordRaw } from './type';

type GetRoutes<
  Name extends string = string,
  Meta extends Record<string, unknown> = Record<string, unknown>,
> = {
  list: RouteItem<Name, Meta>[];
  depth?: number;
};

/** 递归获取 root 节点, 多级嵌套，定位到最深的一个 */
function getRootChild(children?: RouteItem[]): string | null {
  const root = children?.find((x) => x.root);
  if (root) {
    if (root.children) {
      return getRootChild(root.children);
    }
    return root.name;
  }
  return null;
}

function _getRoutes<
  Name extends string = string,
  Meta extends Record<string, unknown> = Record<string, unknown>,
>({ list, depth = 0 }: GetRoutes<Name, Meta>): RouteRecordRaw[] {
  const routes: RouteRecordRaw[] = [];

  list.forEach(
    ({ props, path, name, meta, component, root, children, pathMatch }) => {
      /** 第一级必须是 / 开头 */
      if (depth === 0 && !path.startsWith('/')) {
        path = '/' + path;
      }

      const base: RouteRecordRaw = {
        path: path.replace(/\/+/g, '/'),
        name,
        component,
      };

      if (meta) {
        base.meta = meta;
      }
      if (props) {
        base.props = props;
      }

      let childRootName: string | null = null;

      if (children?.length) {
        childRootName = getRootChild(children);

        (base.children! as RouteRecordRaw[]) = _getRoutes<Name, Meta>({
          list: children,
          depth: depth + 1,
        });
      }

      if (root) {
        const target = childRootName ?? name;
        routes.push({
          path: '',
          name: `redirect-${target}-${Math.random()}`,
          redirect: { name: target },
        });
      }

      if (pathMatch && depth === 0) {
        routes.push(base, {
          path: `/:pathMatch(.*)*`,
          name,
          component,
        });
        return;
      }

      routes.push(base);
    },
  );

  return routes;
}

/** 获取路由 */
export function getRoutes<
  Name extends string = string,
  Meta extends Record<string, unknown> = Record<string, unknown>,
>(list: RouteItem<Name, Meta>[]) {
  return _getRoutes({ list });
}
