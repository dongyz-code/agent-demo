import { defineCache } from '@/hooks/cache/index.js';

/** 系统配置接口的缓存结果，数据库中未配置时为 null。 */
interface SettingsCacheValue {
  /** 数据库保存的配置文本，不向缓存管理页面开放内容。 */
  data: string | null;
}

/** 系统配置缓存；更新数据库后删除 current，使下一次读取回源。 */
export const settingsCache = defineCache<SettingsCacheValue>({
  name: 'system.settings',
  label: '系统配置',
  description: '系统配置读取缓存，修改后失效。',
  ttl: 30_000,
  inspectable: false,
});
