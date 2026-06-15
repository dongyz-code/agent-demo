import { computed, onMounted } from 'vue';
import { httpCache } from '@/cache';

/** options, 先 粗暴吧，获取所有选项 */
export function useOptions() {
  const allOptions = computed(() => {
    return {
      role: httpCache.role.data.value.map(
        ({ role_id: value, name: label, ...rest }) => ({
          label,
          value,
          ...rest,
        }),
      ),
      user: httpCache.user.data.value.map(
        ({ user_id: value, nickname: label, ...rest }) => ({
          label,
          value,
          ...rest,
        }),
      ),
    };
  });

  onMounted(() => {
    httpCache.role.get({ full: true });
    httpCache.user.get({ full: true });
  });

  return {
    allOptions,
  };
}
