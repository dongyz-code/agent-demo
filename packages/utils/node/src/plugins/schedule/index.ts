import { Schedule } from './schedule.js';

import type { ScheduleTaskAdd } from './schedule.js';

type Item = ScheduleTaskAdd & {
  enable?: boolean;
};

const schedule = new Schedule();

/** 全局定时任务
 *
 * install 后才会启动
 */
export const ROOT_SCHEDULE = {
  /** 任务列表 */
  list: [] as Item[],
  /** 添加到任务列表里 */
  add(...items: Item[]) {
    items.forEach((item) => {
      if (this.list.some((x) => x.name === item.name)) {
        throw new Error(`SCHEDULE 命名重复`);
      }
      this.list.push(item);
    });
  },
  /** 获取任务列表 */
  get() {
    return schedule.get();
  },
  /** 仅执行一次 */
  install() {
    this.list.forEach((item) => {
      if (item.enable !== false) {
        schedule.add(item);
      }
    });
    if (this.list.length) {
      console.log('Schedule:', this.get());
    }
  },
  /** 暂停任务 */
  pause(name: string) {
    schedule.cancel(name);
    console.log('ROOT_SCHEDULE PAUSE:', name);
    return this.get();
  },
  /** 恢复任务 */
  resume(name: string) {
    const item = this.list.find((x) => x.name === name);
    if (item) {
      schedule.add(item);
    }
    console.log('ROOT_SCHEDULE RESUME:', name);
    return this.get();
  },
  /** 执行一次 */
  runOnce(name: string) {
    const item = this.list.find((x) => x.name === name);
    if (item) {
      item.event();
    }
  },
  /** 取消所有任务 */
  clear() {
    this.list.forEach(({ name }) => {
      schedule.cancel(name);
    });
    if (this.list.length) {
      console.log(
        'Schedule Cancel:',
        this.list.map(({ name, cron }) => ({ name, cron })),
      );
    }
  },
};
