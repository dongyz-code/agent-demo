import type { adminPermissionTree } from './tree.js';

/** 权限树节点。父节点和叶子节点都使用同一种结构，避免维护额外分类模型。 */
export type AdminPermissionNode = {
  /** 权限 key。只要出现在权限树中，就是可被校验和保存的权限。 */
  key: string;
  /** 展示给管理员看的中文名称。 */
  label: string;
  /** 绑定到 admin 路由名时，该节点可被路由 meta 直接引用。 */
  route?: string;
  /** 子权限节点，用于表达功能层级。 */
  children?: readonly AdminPermissionNode[];
};

/** 从权限树节点中递归提取 key。 */
type NodeKey<Node> =
  Node extends {
    key: infer Key extends string;
    children?: infer Children extends readonly unknown[];
  }
    ? Key | TreeKey<Children>
    : never;

/** 从权限树中递归提取所有权限 key。 */
type TreeKey<Tree extends readonly unknown[]> = Tree[number] extends infer Node
  ? NodeKey<Node>
  : never;

/** 从权限树节点中递归提取 route。 */
type NodeRoute<Node> =
  Node extends {
    route: infer Route extends string;
    children?: infer Children extends readonly unknown[];
  }
    ? Route | TreeRoute<Children>
    : Node extends {
          children?: infer Children extends readonly unknown[];
        }
      ? TreeRoute<Children>
      : never;

/** 从权限树中递归提取所有绑定过权限的 route name。 */
type TreeRoute<Tree extends readonly unknown[]> = Tree[number] extends infer Node
  ? NodeRoute<Node>
  : never;

/** admin 权限 key，由 `adminPermissionTree` 自动推导。 */
export type AdminPermissionKey = TreeKey<typeof adminPermissionTree>;

/** 绑定到权限树的 admin 业务 route name，由 `adminPermissionTree` 自动推导。 */
export type AdminPermissionRouteName = TreeRoute<typeof adminPermissionTree>;
