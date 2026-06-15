/**
 * 缓存函数调用结果
 *
 * 仅无参数且固定输出的情况下
 */
export function promiseCacheCallback<T extends () => Promise<unknown>>(
  callback: T,
) {
  type Resp = Awaited<ReturnType<T>>;

  let cache: Resp | undefined = undefined;
  let cachePromise: Promise<Resp> | undefined = undefined;

  const callbackNext = async () => {
    if (cache) {
      return cache;
    }

    if (!cachePromise) {
      cachePromise = (async () => {
        try {
          cache = (await callback()) as Resp;
          return cache;
        } catch (error) {
          cache = undefined;
          throw error;
        } finally {
          cachePromise = undefined;
        }
      })() as Promise<Resp>;
    }

    return await cachePromise;
  };

  return callbackNext as T;
}
