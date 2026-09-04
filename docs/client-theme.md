# Client 主题规范

## 目标与范围

Client 使用 shadcn/ui 官方 `radix-nova` preset：Radix 提供无障碍交互原语，Nova 提供组件的结构化视觉风格（圆角、间距、字体和交互状态），业务主题只负责颜色和明暗模式。

Client 图标统一使用 Lucide 官方 React 包 `lucide-react`；Admin 保留 Vue 侧的 Iconify（`unplugin-icons`）方案。Client 不再使用 `~icons/lucide/*`，以便与 shadcn CLI 生成的组件保持一致。

本规范适用于 `apps/client` 的页面、布局和 `components/ui` 组件。`packages/ui` 是共享包，保留历史业务色阶供 Admin/Element Plus 使用；Client 页面不得绕过自己的语义 token 直接使用共享色阶。

## 主题分层

主题变量按职责分成三层，修改时只改对应层：

| 文件 | 责任 | 允许修改的内容 |
| --- | --- | --- |
| `apps/client/src/styles/variables.css` | 应用外壳的明暗模式 | 页面底色、表面层级、文字层级、边界、状态文字和品牌色引用 |
| `apps/client/src/styles/tailwind.css` | shadcn token 到 Tailwind utility 的映射 | `--background`、`--card`、`--primary`、`--border` 等语义角色及其前景配对 |
| `apps/client/src/styles/reset.css` | 浏览器默认样式和页面基础行为 | margin、字体回退、点击高亮等 reset；不放颜色体系 |

入口文件 `apps/client/src/styles/index.css` 固定按 `tailwind → variables → reset` 引入。组件和页面只使用语义类名（例如 `bg-card`、`text-muted-foreground`）；`--app-*`、`--theme-*` 是实现细节，只能在主题 CSS 或运行时主题 API 中使用。装饰性背景允许使用 `var(--primary)`、`var(--warning)` 和 `var(--border)` 等语义变量。

## Token 体系

### 基础角色

| 角色 | 用途 | 常用类名 |
| --- | --- | --- |
| `background` / `foreground` | 页面根背景和正文 | `bg-background text-foreground` |
| `card` / `card-foreground` | 独立内容表面 | `bg-card text-card-foreground` |
| `popover` / `popover-foreground` | 弹层、菜单和浮层 | `bg-popover text-popover-foreground` |
| `muted` / `muted-foreground` | 次级背景和辅助说明 | `bg-muted text-muted-foreground` |
| `secondary` / `secondary-foreground` | 次级操作或次级表面 | `bg-secondary text-secondary-foreground` |
| `accent` / `accent-foreground` | hover、选中和强调背景 | `bg-accent text-accent-foreground` |
| `border` / `input` / `ring` | 分隔线、输入边界和焦点 | `border-border border-input ring-ring` |
| `primary` / `primary-foreground` | 品牌主操作 | `bg-primary text-primary-foreground` |

`surface` / `surface-foreground` 用于需要区别于 `muted` 的抬升区域；`sidebar-*` 只用于工作区导航；`chart-1` 到 `chart-5` 只用于数据可视化。除这些明确角色外，不新增按页面或组件命名的颜色 token。

### 状态角色

| 状态 | 实色背景 | 浅色提示背景 | 文字/前景 | 推荐组件 |
| --- | --- | --- | --- | --- |
| 成功 | `bg-success` | `bg-success/10` | `text-success` / `text-success-foreground` | `Badge variant="success"` |
| 警告 | `bg-warning` | `bg-warning/10` | `text-warning` / `text-warning-foreground` | `Badge variant="warning"` |
| 信息 | `bg-info` | `bg-info/10` | `text-info` / `text-info-foreground` | `Badge variant="info"` |
| 错误/危险 | `bg-destructive` | `bg-destructive/10` | `text-destructive` / `text-destructive-foreground` | `Alert variant="destructive"` |
| 链接 | — | — | `text-link` | 原生链接或路由链接 |

优先使用组件内置 variant，例如 `Badge`、`Alert`、`Button` 的 variant；调用处只负责布局，不重新拼接状态颜色。没有对应 variant 时，使用上述语义 token，不使用原始色值。

### 品牌色阶

品牌色由 `packages/ui/src/styles/tailwind.css` 中的 `--theme-*-base` 提供，当前默认值为：

```css
--theme-primary-base: #165dff;
--theme-success-base: #00b42a;
--theme-warning-base: #ff7d00;
--theme-error-base: #f53f3f;
```

Client 入口会在运行时注入与 `ai-pptx` 对齐的完整基础色板：Purple `#a855f7`、Green `#22c55e`、Amber `#f59e0b` 和 Red `#ef4444`。共享包中的默认色板仍只作为未覆盖时的回退值，不会影响 Admin。

`1–5` 为向白色混合的浅阶，`6` 为基础色，`7–10` 为向黑色混合的深阶，使用 OKLCH `color-mix` 派生。业务换肤只调用 `applyThemeBaseColors` 或修改基础色，不在页面中复制色阶。

## 明暗模式

- 当前默认模式为 `light`，与 `ai-pptx` 工作台一致；用户选择持久化在 `client-theme`。如果产品改为跟随系统，必须新增 `system` 模式并明确无持久化值时的回退规则。
- `applyThemeMode` 是唯一的 DOM 同步入口，同时维护根节点的 `data-theme`、`.dark`、`.light` 和 `color-scheme`。
- 浅色模式使用根节点默认 token，深色模式通过 `:root[data-theme='dark']` 调整表面、文字和主色配对；组件代码不写颜色用途的 `dark:` 覆盖。官方生成的 shadcn 原语若包含必要的 `dark:` 状态样式，保留上游实现，不在业务调用处追加覆盖。
- 每个新增颜色角色必须同时提供暗色、浅色和 `*-foreground` 配对，并验证实色背景上的对比度。
- 主题切换按钮必须有中文 `aria-label`，图标表示将要切换的模式；Sonner 的 toaster 主题必须读取同一个 `themeMode`。

## 组件与页面规则

- 颜色、边界、圆角和阴影由 `components/ui` 的 shadcn 实现统一决定；页面使用 `Card`、`Alert`、`Badge`、`Skeleton` 等官方组件，不复制 Nova 的内部样式。
- 新表单使用 shadcn 的 `FieldGroup + Field + FieldLabel` 组合，字段校验同时设置 `data-invalid` 和控件的 `aria-invalid`；布局使用 `flex flex-col gap-*`，不使用 `space-y-*`。
- 输入控件只保留一层边界：外层容器不得再添加 `border` 或 `ring`，焦点由组件自身的 `focus-visible:ring-*` 处理。
- 组件变体优先于调用处样式覆盖；确需产品差异时，新增语义 variant，而不是新增 `success-green`、`app-success-text` 等平行命名。
- 图标只表达辅助信息，不能作为状态唯一载体；装饰图标可使用低对比度 `text-muted-foreground`，重要状态必须同时有文字或可访问名称。
- 通用图标从 `lucide-react` 导入（例如 `import { SettingsIcon } from 'lucide-react'`）；自定义 SVG 放在 `apps/client/src/components/icons`，组件 API 使用 `ComponentProps<'svg'>` 并保持 `currentColor`。

## 可访问性与视觉验收

- 正文与背景对比度至少 `4.5:1`，大字号文本至少 `3:1`。
- 输入框、按钮边界和焦点指示等非文本 UI 至少 `3:1`；低对比度边界必须由填充、阴影或焦点状态提供额外区分。
- `primary-foreground`、`destructive-foreground` 和状态色前景针对实色背景验证，不能只验证透明 `/10` 背景。
- 在浅色和暗色各检查：页面、Card、Popover、Input、Button、Alert、Badge、Toast、Skeleton，以及 hover、focus、disabled、error 状态。

## 禁止事项

- 不在页面或组件中使用 `bg-blue-500`、`text-[#...]`、`border-gray-*` 等原始颜色。
- 业务调用处不通过 `dark:` 重写颜色语义；修改 `:root` 与 `:root[data-theme='light']` 的 token 配对。官方生成的基础组件若包含必要的 `dark:` 交互状态，保留上游实现。
- 不在业务页面直接读取 `--app-*` 或 `--theme-*`；装饰性渐变除外，且只能读取语义变量。
- 不把 `bg-black/10`、`bg-white` 等原始颜色带入业务页面；官方生成的 Dialog/Sheet 遮罩等基础实现若需要固定遮罩色，可保留上游代码。
- 不在 `components/ui` 外复制 shadcn 组件源码；需要新组件时使用官方 CLI：`pnpm dlx shadcn@latest add <component>`，并检查生成文件是否匹配当前 Radix/Nova 配置。
- 不在 Client 业务代码中引入 `~icons/*`、Iconify 图标或第二套图标集合；自定义图标不得通过字符串动态渲染，后端图标名称必须先经过白名单映射。

## 新增主题角色流程

1. 先确认现有 token 无法表达该语义，并为角色命名（例如 `info`），不要按颜色命名。
2. 在 `tailwind.css` 的 `:root` 中定义角色及 `*-foreground`，在浅色模式中补充必要的对比度配对。
3. 在 `@theme inline` 中暴露 `--color-*` 别名，使 Tailwind 生成对应 utility。
4. 在组件 variant 或页面中使用语义类名，并补充 hover、focus、disabled 和错误状态。
5. 用浏览器分别检查两种模式和对比度，再运行验证命令。

## 变更验收

```bash
pnpm --filter @repo/client lint
pnpm --filter @repo/client build
git diff --check
```
