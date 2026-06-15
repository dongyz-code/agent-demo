import { api } from '@/api';
import { CacheById } from '@repo/ui';

export const httpCache = {
  /** 用户基础信息, 仅 名称 */
  user: new CacheById({
    get: async ({ ids, full }) => {
      const res = await api('/sys/user/names', {
        ids: ids ?? [],
        full,
      });
      return res;
    },
    label: 'nickname',
    key: 'user_id',
  }),
  /** 角色基础信息，仅 名称 */
  role: new CacheById({
    get: async ({ ids, full }) => {
      const res = await api('/sys/role/names', {
        ids: ids ?? [],
        full,
      });
      return res;
    },
    label: 'name',
    key: 'role_id',
  }),
  /** ai app detail cache */
  aiAppDetail: new CacheById({
    get: async ({ ids = [], full }) => {
      const res = await api('/main/app-detail', {
        ids,
      });
      return res;
    },
    key: 'id',
    label: 'name',
  }),
  /** ai app version cache */
  aiAppVersion: new CacheById({
    get: async ({ ids = [], full }) => {
      const res = await api('/main/app-version', {
        ids,
      });
      return res;
    },
    key: 'id',
    label: 'id',
  }),
};
