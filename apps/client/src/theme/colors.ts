/** 可动态注入的语义主题基础色名称。 */
const themeColorNames = ['primary', 'success', 'warning', 'error'] as const;

/** 十六进制颜色校验规则，支持 #rgb 和 #rrggbb。 */
const hexColorPattern = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;

/** 语义主题基础色名称。 */
export type ThemeColorName = (typeof themeColorNames)[number];

/** 运行时主题基础色输入，派生色由 CSS 变量自动计算。 */
export type ThemeBaseColors = {
  /** 品牌主色，对应 Arco 风格色板的第 6 阶。 */
  primary: string;
  /** 成功状态基础色，用于成功按钮、提示与正向状态。 */
  success: string;
  /** 警告状态基础色，用于风险提醒与需要关注的状态。 */
  warning: string;
  /** 错误状态基础色，用于错误提示、危险操作与失败状态。 */
  error: string;
};

/** Arco Design 风格的默认基础色，业务可用同名字段覆盖。 */
export const defaultThemeBaseColors = {
  primary: '#165dff',
  success: '#00b42a',
  warning: '#ff7d00',
  error: '#f53f3f',
} as const satisfies ThemeBaseColors;

/**
 * 将用户输入的基础色标准化为 #rrggbb。
 *
 * @param color 用户输入的十六进制颜色。
 * @returns 可直接写入 CSS 变量的标准颜色值。
 */
function normalizeThemeColor(color: string): string {
  const value = color.trim();

  if (!hexColorPattern.test(value)) {
    throw new Error(`Invalid theme color: ${color}`);
  }

  if (value.length === 4) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return value.toLowerCase();
}

/**
 * 把基础色写入目标节点，CSS 会自动派生完整主题色板。
 *
 * @param baseColors 需要覆盖的主题基础色，未传字段保持当前值。
 * @param target 承载主题变量的 DOM 节点，默认使用文档根节点。
 */
export function applyThemeBaseColors(
  baseColors: Partial<ThemeBaseColors>,
  target: HTMLElement = document.documentElement,
): void {
  for (const name of themeColorNames) {
    const color = baseColors[name];

    if (!color) {
      continue;
    }

    target.style.setProperty(`--theme-${name}-base`, normalizeThemeColor(color));
  }
}
