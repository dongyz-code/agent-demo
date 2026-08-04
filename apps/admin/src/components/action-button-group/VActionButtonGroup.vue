<template>
  <div
    class="inline-flex items-center gap-1 whitespace-nowrap [&_.el-button]:ml-0 [&_.el-button]:px-1.5"
  >
    <el-button
      v-for="(action, index) in visibleActions"
      :key="getActionKey(action, index)"
      link
      :type="action.type"
      :icon="action.icon"
      :disabled="action.disabled"
      @click="runAction(action)"
    >
      {{ action.label }}
    </el-button>
    <el-dropdown
      v-if="overflowActions.length"
      trigger="click"
      @command="runOverflowAction"
    >
      <el-button link>
        {{ moreLabel }}
        <lucide-chevron-down class="ml-1 h-3.5 w-3.5" />
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="(action, index) in overflowActions"
            :key="getActionKey(action, index)"
            :command="index"
            :disabled="action.disabled"
          >
            <span
              class="flex items-center gap-2"
              :class="{ 'text-red-500': action.type === 'danger' }"
            >
              <component
                :is="action.icon"
                v-if="action.icon"
                class="h-4 w-4"
              />
              {{ action.label }}
            </span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
} from 'element-plus';
import LucideChevronDown from '~icons/lucide/chevron-down';

import type { ActionButtonItem } from './types';

const props = withDefaults(defineProps<{
  /** 按期望展示顺序排列的操作配置。 */
  actions: readonly ActionButtonItem[];
  /** 直接展示的最大操作数，超出部分进入下拉菜单。 */
  maxVisible?: number;
  /** 溢出菜单触发按钮文案。 */
  moreLabel?: string;
}>(), {
  maxVisible: 3,
  moreLabel: '更多',
});

/** 过滤掉显式隐藏的操作后再分配到按钮区与溢出菜单。 */
const shownActions = computed(() =>
  props.actions.filter((action) => action.isShow !== false),
);
const visibleActions = computed(() =>
  shownActions.value.slice(0, Math.max(0, props.maxVisible)),
);
const overflowActions = computed(() =>
  shownActions.value.slice(Math.max(0, props.maxVisible)),
);

/**
 * 生成同一按钮组内稳定的 Vue key。
 *
 * @param action 当前操作配置。
 * @param index 当前操作在所在区域的顺序。
 * @returns 优先使用显式 key，否则组合文案与顺序。
 */
function getActionKey(action: ActionButtonItem, index: number): string {
  return action.key ?? `${action.label}-${index}`;
}

/**
 * 执行未禁用的操作并交由调用方处理异步异常。
 *
 * @param action 被点击的操作配置。
 * @returns 无返回值。
 */
function runAction(action: ActionButtonItem): void {
  if (action.disabled) return;
  void action.handler();
}

/**
 * 根据下拉菜单索引执行对应溢出操作。
 *
 * @param index Element Plus 下拉菜单回传的操作索引。
 * @returns 无返回值。
 */
function runOverflowAction(index: number): void {
  const action = overflowActions.value[index];
  if (action) runAction(action);
}
</script>
