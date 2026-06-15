import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

type InitDirOpts<T extends string> = {
  /** 应用根路径（package.json 所在目录） */
  root: string;
  /** 补充目录配置, static/extra 下 */
  extra?: T[];
  /** 启动时确保所有目录存在(默认 true) */
  ensure?: boolean;
};

export function initDirs<K extends string = string>({
  root,
  extra = [],
  ensure = true,
}: InitDirOpts<K>) {
  const STATIC_DATA = join(root, 'static-data');
  const STATIC = join(root, 'static');
  const LOG = join(STATIC, 'logs');
  const TEMP = join(STATIC, 'temp');

  const EXTRA = {} as Record<K, string>;
  extra.forEach((key) => {
    EXTRA[key] = join(STATIC, 'extra', key);
  });

  if (ensure) {
    const list = [LOG, TEMP, ...(Object.values(EXTRA) as string[])];
    list.forEach((dir) => {
      mkdirSync(dir, { recursive: true });
    });
  }

  return {
    /** 全局目录配置 */
    DIRS: {
      /** 应用根路径（package.json 所在目录） */
      ROOT: root,
      /** 应用静态数据目录 */
      STATIC_DATA,
      /** 应用运行过程中产生的文件夹, 静态目录 */
      STATIC,
      /** 日志文件夹 */
      LOG,
      /** 临时文件夹，需要定期清理 */
      TEMP,
      /** 补充的文件夹 */
      EXTRA,
    },
  };
}
