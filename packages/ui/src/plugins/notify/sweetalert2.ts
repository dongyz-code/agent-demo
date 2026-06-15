import Swal from 'sweetalert2';

import type { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';

type Opts = {
  toast?: SweetAlertOptions;
};

export class Notify {
  swal: typeof Swal;
  private toast: typeof Swal;
  constructor(opts?: Opts) {
    this.swal = Swal;
    this.toast = Swal.mixin({
      toast: true,
      position: 'top-right',
      timer: 1e3 * 1.5,
      showConfirmButton: false,
      timerProgressBar: true,
      didOpen(toast) {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      },
      ...opts?.toast,
    });
    this.notify = this.notify.bind(this);
    this.confirm = this.confirm.bind(this);
  }
  /** 基础提示 */
  notify(
    type: SweetAlertIcon,
    title: string,
    opt?: Omit<
      SweetAlertOptions,
      'title' | 'icon' | 'input' | 'inputValidator'
    >,
  ) {
    const baseOpts: SweetAlertOptions = {
      icon: type,
      title,
    };
    if (type === 'error') {
      baseOpts.timer = 1e3 * 3;
    }
    return this.toast.fire({
      customClass: {
        icon: `swal2-${type}`,
      },
      ...baseOpts,
      ...opt,
    });
  }
  /** 提示确认组件，需要提交内容的话传入 input 相关即可 */
  async confirm({
    title = '提示',
    message = '',
    opt,
    confirmCallback,
  }: {
    /** 标题 */
    title?: string;
    /** 内容 */
    message?: string;
    /** 额外选项 */
    opt?: Omit<
      SweetAlertOptions,
      'title' | 'text' | 'input' | 'inputValidator'
    >;
    /** 确认回调 */
    confirmCallback?: () => unknown | Promise<unknown>;
  }) {
    const status = await this.swal.fire({
      showCancelButton: true,
      cancelButtonText: '取消',
      confirmButtonText: '确认',
      title,
      text: message,
      icon: 'warning',
      ...opt,
    });
    if (status.isConfirmed) {
      await confirmCallback?.();
    }
    return status;
  }
}
