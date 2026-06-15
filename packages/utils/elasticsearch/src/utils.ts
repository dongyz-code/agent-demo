import { sleep } from '@repo/utils-node';
import type { TransportRequestOptions } from '@elastic/elasticsearch';

export type { TransportRequestOptions } from '@elastic/elasticsearch';

/** 健康检测 */
export async function healthCheck(opts: {
  /** label */
  label: string;
  /** 校验函数, 抛出异常或者结果不为 true，视为校验失败 */
  verify: () => Promise<boolean> | boolean;
  /** 间隔次数 */
  step?: number;
  /** 重试次数 */
  retry?: number;
  /** 已经重试次数，请不要设置 */
  retryCount?: number;
}) {
  const { label, verify, step = 1e3 * 5, retry = 1e3, retryCount = 1 } = opts;

  const next = async (error?: unknown) => {
    if (error) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(error);
      }
    }
    console.error(
      `WaitReady:`,
      `${label} 尚未就绪，${step / 1e3}s 后进行第 ${retryCount} 次尝试`,
    );
    await sleep(step);
    if (retry > 1) {
      return await healthCheck({
        ...opts,
        retry: retry - 1,
        retryCount: retryCount + 1,
      });
    }
    throw new Error(`WaitReady: ${label} 检查失败`);
  };

  try {
    const resp = await verify();
    if (!resp) {
      await next();
    }
  } catch (error) {
    await next(error);
  }
}

export function baseTransportRequestOptions(extra?: TransportRequestOptions) {
  const transportRequestOptions: TransportRequestOptions = {
    signal: new AbortController().signal,
    requestTimeout: 1e3 * 60 * 10,
    ...extra,
  };
  return transportRequestOptions;
}
