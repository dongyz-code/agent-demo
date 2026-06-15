type Key = string | number | symbol;

export function getKeys<T extends Record<Key, unknown>>(data: T) {
  return Object.keys(data) as (keyof T)[];
}

export function arrUnique<T>(list: T[]) {
  return Array.from(new Set(list));
}

export function arrConcatSet<T>(list: T[][]) {
  return list.reduce<T[]>((res, item) => {
    res.push(...item);
    return res;
  }, []);
}

export function arrChunk<T>(list: T[], size: number) {
  if (size <= 0) {
    throw new Error('chunk size must be greater than 0');
  }
  const res: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    res.push(list.slice(i, i + size));
  }
  return res;
}

export function arrObject<T extends Record<Key, unknown>, K extends keyof T>(
  list: T[],
  key: K,
): Record<string, T>;
export function arrObject<
  T extends Record<Key, unknown>,
  K extends keyof T,
  V extends keyof T,
>(list: T[], key: K, value: V): Record<string, T[V]>;
export function arrObject<T extends Key>(list: T[]): Record<string, T>;
export function arrObject(
  list: unknown[],
  key?: Key,
  value?: Key,
): Record<string, unknown> {
  const res: Record<string, unknown> = {};
  list.forEach((item) => {
    if (key === undefined) {
      res[String(item)] = item;
      return;
    }
    if (!item || typeof item !== 'object') {
      return;
    }
    const record = item as Record<Key, unknown>;
    const id = record[key];
    if (id === undefined || id === null) {
      return;
    }
    res[String(id)] = value === undefined ? item : record[value];
  });
  return res;
}

export function deepCopy<T>(data: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as T;
}

export function debounce<T extends (...args: any[]) => unknown>(
  func: T,
  wait = 300,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      func(...args);
    }, wait);
  }) as (...args: Parameters<T>) => void;
}

export function sleep(duration: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, duration));
}

export function pickObj<T extends object, K extends keyof T>(
  data: T,
  keys: readonly K[],
) {
  const res = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in data) {
      res[key] = data[key];
    }
  });
  return res;
}

export function numSplit(value: number | string, step = 3) {
  const [integer, decimal] = String(value).split('.');
  const sign = integer.startsWith('-') ? '-' : '';
  const body = sign ? integer.slice(1) : integer;
  const chars = body.split('').reverse();
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += step) {
    groups.push(chars.slice(i, i + step).reverse().join(''));
  }
  const formatted = sign + groups.reverse().join(',');
  return decimal === undefined ? formatted : `${formatted}.${decimal}`;
}

export function byteConversion(value: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let index = 0;
  let num = value;
  while (Math.abs(num) >= 1024 && index < units.length - 1) {
    num /= 1024;
    index += 1;
  }
  const text = index === 0 ? String(num) : num.toFixed(num >= 10 ? 1 : 2);
  return `${text.replace(/\.0+$/, '')} ${units[index]}`;
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0');
}

export function dayJsformat(
  value?: string | number | Date,
  format = 'YYYY-MM-DD HH:mm:ss',
) {
  const date = value === undefined ? new Date() : new Date(value);
  const map: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    SSS: pad(date.getMilliseconds(), 3),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss|SSS/g, (key) => map[key]);
}

export function reTryFunc<T extends (...args: any[]) => Promise<unknown>>(
  func: T,
  opts: {
    label?: string;
    count?: number;
    duration?: number;
  } = {},
) {
  const { label = 'retry', count = 3, duration = 0 } = opts;
  return (async (...args: Parameters<T>) => {
    let lastError: unknown;
    for (let i = 0; i < count; i += 1) {
      try {
        return await func(...args);
      } catch (error) {
        lastError = error;
        if (i < count - 1) {
          console.warn(`${label} retry ${i + 1}/${count}`);
          if (duration > 0) {
            await sleep(duration);
          }
        }
      }
    }
    throw lastError;
  }) as T;
}

export async function taskLoop<T extends (...args: any[]) => Promise<unknown>>({
  func,
  tasks,
  options,
}: {
  func: T;
  tasks: Parameters<T>[];
  options?: {
    speed?: number;
  };
}) {
  const speed = Math.max(1, options?.speed ?? 1);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const current = tasks[index]!;
      index += 1;
      await func(...current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(speed, tasks.length) }, () => worker()),
  );
}

export function initQueueTask<T extends (...args: any[]) => Promise<unknown>>(
  func: T,
  opts: {
    worker?: number;
  } = {},
) {
  type Item = {
    args: Parameters<T>;
    resolve: (value: Awaited<ReturnType<T>>) => void;
    reject: (reason: unknown) => void;
  };

  const workerCount = Math.max(1, opts.worker ?? 1);
  const queue: Item[] = [];
  let running = 0;

  const next = () => {
    if (running >= workerCount) {
      return;
    }
    const item = queue.shift();
    if (!item) {
      return;
    }
    running += 1;
    func(...item.args)
      .then((value) => item.resolve(value as Awaited<ReturnType<T>>))
      .catch(item.reject)
      .finally(() => {
        running -= 1;
        next();
      });
    next();
  };

  return (...args: Parameters<T>) =>
    new Promise<Awaited<ReturnType<T>>>((resolve, reject) => {
      queue.push({ args, resolve, reject });
      next();
    });
}
