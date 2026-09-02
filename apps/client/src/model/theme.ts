import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 客户端支持的主题模式。默认使用暗色，以保持现有界面外观。 */
export type ThemeMode = 'dark' | 'light';

/**
 * 将主题模式同步到文档节点，使 shadcn 的 dark 变体、业务变量和原生控件保持一致。
 *
 * @param themeMode 要应用的主题模式。
 * @param target 承载主题状态的根节点，默认使用当前文档根节点。
 */
export function applyThemeMode(
  themeMode: ThemeMode,
  target: HTMLElement = document.documentElement,
): void {
  target.dataset.theme = themeMode;
  target.classList.toggle('dark', themeMode === 'dark');
  target.classList.toggle('light', themeMode === 'light');
  target.style.colorScheme = themeMode;
}

/**
 * 计算主题切换后的模式。
 *
 * @param themeMode 当前主题模式。
 * @returns 与当前模式相反的主题模式。
 */
function getNextThemeMode(themeMode: ThemeMode): ThemeMode {
  if (themeMode === 'dark') {
    return 'light';
  }

  return 'dark';
}

/** 主题状态模型，负责保存当前模式及主题切换操作。 */
type ThemeState = {
  /** 当前应用主题模式。 */
  themeMode: ThemeMode;
  /** 在暗色和浅色主题之间切换。 */
  toggleTheme: () => void;
  /** 设置应用主题模式并持久化到本地存储。 */
  setThemeMode: (themeMode: ThemeMode) => void;
};

/**
 * 管理客户端主题模式，并在刷新后恢复用户上次的选择。
 *
 * @returns 主题状态及其操作方法。
 */
export const useThemeModel = create<ThemeState>()(
  persist(
    (set) => ({
      themeMode: 'dark',
      toggleTheme: () =>
        set((state) => ({
          themeMode: getNextThemeMode(state.themeMode),
        })),
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: 'client-theme',
      partialize: ({ themeMode }) => ({ themeMode }),
    },
  ),
);
