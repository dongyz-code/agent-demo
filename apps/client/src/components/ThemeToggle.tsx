import { MoonIcon, SunIcon } from 'lucide-react';

import { useThemeModel } from '@/model/theme';
import { Button } from './ui/button';

/**
 * 渲染明暗主题切换按钮，图标表示点击后将要切换的主题。
 *
 * @returns 带无障碍标签的主题切换按钮。
 */
export function ThemeToggle() {
  const themeMode = useThemeModel((state) => state.themeMode);
  const toggleTheme = useThemeModel((state) => state.toggleTheme);

  let nextThemeLabel = '深色主题';
  let ThemeIcon = MoonIcon;

  if (themeMode === 'dark') {
    nextThemeLabel = '浅色主题';
    ThemeIcon = SunIcon;
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className="text-muted-foreground hover:text-foreground"
      aria-label={`切换到${nextThemeLabel}`}
      title={`切换到${nextThemeLabel}`}
      onClick={toggleTheme}
    >
      <ThemeIcon className="size-4" aria-hidden />
    </Button>
  );
}
