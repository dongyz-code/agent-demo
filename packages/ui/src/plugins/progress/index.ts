/**
 * 记得引入下 CSS
 *
 * https://github.com/rstacruz/nprogress/blob/master/nprogress.css
 */

import NProgress from 'nprogress';

import type { NProgressOptions } from 'nprogress';

export class Progress {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private count: number;
  constructor(config?: Partial<NProgressOptions>) {
    this.count = 0;

    NProgress.configure(
      Object.assign(
        {
          easing: 'ease',
        },
        config,
      ),
    );
  }
  private clear() {
    clearTimeout(this.timer);
  }
  /** 启动进度条 bool 仅用于API计数 */
  start(bool?: boolean) {
    this.clear();
    NProgress.start();
    if (bool) {
      this.count += 1;
    }
  }
  /** 关闭进度条 bool 仅用于API计数 */
  close(bool?: boolean) {
    if (bool) {
      this.count -= 1;
    }
    if (this.count <= 0) {
      this.clear();
      this.timer = setTimeout(() => {
        NProgress.done(true);
        this.count = 0;
      }, 100);
    }
  }
}
