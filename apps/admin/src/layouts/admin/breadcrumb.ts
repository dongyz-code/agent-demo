import { ref } from 'vue';

import { adminMenu, isShellRoute } from './menu';
import { routeNameMap } from '@/router/types';

import type { RouteName } from '@/router/types';

/** 当前页最后一级的动态名称，例如正在预览的文档名。 */
const leafLabel = ref('');

/**
 * 详情页把最后一级换成具体对象名称。离开页面时要清空。
 * @param label 面包屑最后一级文案。空字符串恢复路由名。
 */
export function setBreadcrumbLeaf(label: string) {
  leafLabel.value = label;
}

/** 没有独立页面的子路由，挂到它所属的列表页后面。 */
const breadcrumbParent: Partial<Record<RouteName, RouteName>> = {
  'documents.detail': 'documents.list',
};

/** 面包屑上的一节。没有路由名时只展示，不跳转。 */
export interface BreadcrumbItem {
  /** 展示文案。 */
  label: string;
  /** 可点击时前往的页面。 */
  to?: RouteName;
}

/**
 * 按菜单分组和页面父子关系生成面包屑。
 * @param name 当前页面路由名。
 * @returns 从分组到当前页的条目，最后一项不可点。
 */
export function buildBreadcrumb(name: string): BreadcrumbItem[] {
  if (!isRouteName(name) || isShellRoute(name)) return [];
  const pages = pageChain(name);
  const items: BreadcrumbItem[] = [];
  const group = groupLabel(pages[0] ?? name);
  if (group) items.push({ label: group });
  pages.forEach((page, index) => {
    const last = index === pages.length - 1;
    let label = routeNameMap[page];
    if (last && leafLabel.value) label = leafLabel.value;
    const item: BreadcrumbItem = { label };
    if (!last) item.to = page;
    items.push(item);
  });
  return items;
}

/** 供顶栏读取最后一级动态文案。 */
export function useBreadcrumbLeaf() {
  return leafLabel;
}

/**
 * 从当前页沿配置的父页面向上收集可展示页面。
 * @param name 当前页面路由名。
 * @returns 从祖先到当前页的路由名。
 */
function pageChain(name: RouteName) {
  const chain: RouteName[] = [];
  const seen = new Set<string>();
  let current: RouteName | undefined = name;
  while (current && !seen.has(current) && !isShellRoute(current)) {
    seen.add(current);
    chain.unshift(current);
    current = breadcrumbParent[current];
  }
  return chain;
}

/**
 * 找到页面所属的侧栏分组名称。
 * @param name 列表页路由名。
 * @returns 分组文案；不在菜单里时为空。
 */
function groupLabel(name: RouteName) {
  for (const group of adminMenu) {
    if (!('children' in group)) continue;
    if (containsRoute(group.children, name)) return group.label;
  }
  return '';
}

/**
 * 判断菜单树里是否包含这个页面。
 * @param items 当前层菜单。
 * @param name 要查找的路由名。
 * @returns 找到时返回 true。
 */
/** 侧栏节点，只取面包屑需要的字段。 */
interface MenuNode {
  /** 叶子页面路由名。 */
  value?: string;
  /** 子菜单。 */
  children?: readonly MenuNode[];
}

function containsRoute(items: readonly MenuNode[], name: string): boolean {
  for (const item of items) {
    if ('children' in item && item.children) {
      if (containsRoute(item.children, name)) return true;
      continue;
    }
    if (item.value === name) return true;
  }
  return false;
}

/**
 * 判断字符串是不是已登记的路由名。
 * @param name 路由名。
 * @returns 在路由表中时返回 true。
 */
function isRouteName(name: string): name is RouteName {
  return name in routeNameMap;
}
