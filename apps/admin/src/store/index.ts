import { defineStore, createPinia } from 'pinia';
import { allPage } from '@/router/type';
import { usePermission } from '@/permission';

import type { StoreData } from './type';
import type { PKey } from '@/permission';

const defaultData: StoreData = {
  permission: [],
  SYS_CONF: {},
  MEDO_ENV: 'default',
  user: null,
  NAV_MODE: 'horizontal',
  NAV_COLLAPSE: false,
};

const allPagesSet = new Set(allPage);

const pinia = createPinia();

/** 全局共享 */
const store = defineStore('main', {
  state: () => defaultData,
  getters: {
    userPage(state: StoreData) {
      if (state.user?.sys_admin) {
        return allPagesSet;
      }
      // TODO:
      return allPagesSet;
      // return new Set(
      //   usePermission(state.permission as unknown as PKey[]).routes,
      // );
    },
  },
  actions: {
    stateSet(val: Partial<StoreData>) {
      Object.assign(this.$state, val);
    },
  },
});

export const useStore = () => store(pinia);
