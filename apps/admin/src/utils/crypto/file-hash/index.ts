import hashWorker from './worker?worker';

import type { ParamsMethod, Message } from './worker';

export * from './constants';

type Result = Extract<Message, { key: 'result' }>['data'];

/** 拿到文件的 hash */
export async function getFileHash({ progressFn, ...rest }: ParamsMethod) {
  return new Promise<Result>((resolve, reject) => {
    const worker = new hashWorker();
    worker.onmessage = async ({ data }) => {
      const res = data as Message;

      if (res.key === 'progress') {
        progressFn?.(res.data);
      } else if (res.key === 'result') {
        worker.terminate();
        resolve(res.data);
      } else if (res.key === 'error') {
        worker.terminate();
        reject(res.data);
      }
    };
    worker.postMessage(rest);
  });
}
