import { onMounted, onUnmounted } from 'vue';

const EVENTS: {
  [key in string]: {
    name: string;
    event: (event: Event) => void;
  };
} = {};

/** 设置全局事件（不允许局部事件，当然可以绑定到 dom，没有必要）
 *
 * 1. 保证一个事件仅一个处理程序，避免混乱
 * 2. 事件参数以对象形式传递，仅一个参数
 * 3. 默认是注册到全局的
 */
export function initGlobalEvent<T extends Record<string, unknown>>({
  group,
}: {
  /** 分组标识 */
  group: string;
}) {
  /** 获取 EVENTS key */
  function getEventKey(key: keyof T) {
    return `${group}.${key as string}`;
  }

  /** 获取事件名称 */
  function getEventName(key: keyof T) {
    return `${getEventKey(key)}-${Date.now()}-${Math.random()}`;
  }

  /** 移除事件 */
  function remove(key: keyof T) {
    const eventKey = getEventKey(key);
    if (EVENTS[eventKey]) {
      const { name, event } = EVENTS[eventKey];
      window.removeEventListener(name, event);
    }
  }

  /** 触发事件 */
  function dispatch<Key extends keyof T>(key: Key, detail: T[Key]) {
    const eventKey = getEventKey(key);
    if (!EVENTS[eventKey]) {
      throw new Error(`${key as string} 事件尚未注册！`);
    }
    window.dispatchEvent(
      new CustomEvent(EVENTS[eventKey].name, {
        detail,
      }),
    );
  }

  /** 添加前会移除已经存在的事件，确保全局只有一个存在
   *
   * 需要在 setup 内调用，可以视为事件注册
   */
  function add<Key extends keyof T>(
    key: Key,
    callback: (event: CustomEvent<T[Key]>) => void | Promise<void>,
  ) {
    const set = () => {
      const eventKey = getEventKey(key);

      if (EVENTS[eventKey]) {
        remove(key);
      }

      const event = (item: Event) => {
        callback(item as CustomEvent<T[Key]>);
      };

      const name = getEventName(key);

      EVENTS[eventKey] = { name, event };

      window.addEventListener(name, event);
    };

    onMounted(set);
    onUnmounted(() => remove(key));
  }

  return {
    /** 添加事件 */
    add,
    /** 移除事件 */
    remove,
    /** 触发事件 */
    dispatch,
  };
}
