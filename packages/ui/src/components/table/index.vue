<template>
  <el-table
    class="medomino-table"
    ref="table"
    @selection-change="emits('selection-change', $event)"
    @row-dblclick="emits('row-dblclick', $event)"
    @row-click="emits('row-click', $event)"
    @sort-change="sortChange"
    :data="tableData"
    :max-height="maxHeight"
    :default-expand-all="defaultExpandAll"
    :size="size"
    :default-sort="defaultSort"
    v-loading="loading"
    v-bind="$props.props"
  >
    <slot></slot>

    <template v-for="e in tableRows" :key="e.value">
      <el-table-column
        v-if="e.slot"
        :fixed="e.fixed"
        :label="e.label"
        :width="e.width"
        :type="e.type"
        :min-width="e.minWidth"
        :prop="e.value"
        :sortable="e.sort"
        :align="e.align"
      >
        <template #header>
          <slot :name="e.slot + '-header'" :label="e.label">
            <v-tips :title="e.label" :tips="e.tips"></v-tips>
          </slot>
        </template>
        <template #default="{ row, column, $index }">
          <!-- prettier-ignore -->
          <slot :name="e.slot" :row="(row as T)" :column="column" :$index="($index as number)" :label="e.label"></slot>
        </template>
      </el-table-column>

      <el-table-column
        v-else
        :key="e.value"
        :type="e.type"
        :fixed="e.fixed"
        :label="e.label"
        :width="e.width"
        :min-width="e.minWidth"
        :prop="e.value"
        :sortable="e.sort"
        :align="e.align"
      >
        <template #header>
          <slot :name="e.value + '-header'" :label="e.label">
            <v-tips :title="e.label" :tips="e.tips"></v-tips>
          </slot>
        </template>
      </el-table-column>
    </template>
  </el-table>
</template>

<script setup lang="ts" generic="T extends Record<string, unknown>">
import { ElTable, ElTableColumn } from 'element-plus';
import { computed, reactive } from 'vue';
import { handleRows } from './utils';
import VTips from './components/tips/index.vue';

import type { SortChange, Props } from './types';

const props = defineProps<Props<T>>();
const emits = defineEmits<{
  'sort-change': [sort: SortChange];
  'selection-change': [selection: T[]];
  'row-dblclick': [row: T];
  'row-click': [row: T];
}>();

const sortRole = reactive<SortChange>({
  prop: '',
  order: 'ascending',
});

const tableRows = computed(() => handleRows(props.data ?? [], props.rows));

const tableData = computed(() => {
  const tableData = props.data ?? [];
  const { prop, order } = sortRole;
  const row = tableRows.value.find((x) => x.value === prop);
  if (prop && order && row) {
    const data = tableData.map((x, index) => {
      return {
        index,
        key: x[prop] as any,
      };
    });
    if (row.sortType === 'number') {
      if (order === 'ascending') {
        data.sort((a, b) => (+a.key > +b.key ? 1 : -1));
      } else {
        data.sort((a, b) => (+b.key > +a.key ? 1 : -1));
      }
    } else {
      if (order === 'ascending') {
        data.sort((a, b) => (a.key > b.key ? 1 : -1));
      } else {
        data.sort((a, b) => (b.key > a.key ? 1 : -1));
      }
    }
    return data.map(({ index }) => tableData[index]);
  }
  return tableData;
});

function sortChange({ order, prop }: SortChange) {
  const item = tableRows.value.find((e) => e.value === prop);
  if (item) {
    const { sort } = item;
    if (sort === 'custom') {
      emits('sort-change', {
        order,
        prop,
      });
    } else {
      Object.assign(sortRole, {
        order,
        prop,
      });
    }
  }
}
</script>

<style lang="postcss" scoped>
.medomino-table {
  --el-table-header-bg-color: #fff;
  --el-table-bg-color: #fff;
  --el-table-tr-bg-color: #fff;
}
</style>
