/** 解构 promise */
export function usePromise<T = unknown>() {
  let resolve!: (val: T) => void;
  let reject!: (val: unknown) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
}

export * from './runtime.js';
