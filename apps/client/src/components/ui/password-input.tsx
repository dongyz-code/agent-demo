import { EyeIcon, EyeOffIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/utils';

import { Button } from './button';
import { Input } from './input';

/** 密码输入框的显隐按钮文案配置。 */
type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'> & {
  /** 密码隐藏时显示的按钮文案。 */
  showPasswordLabel?: string;
  /** 密码显示时显示的按钮文案。 */
  hidePasswordLabel?: string;
};

/**
 * 提供带显隐切换能力的密码输入框。
 *
 * @param props 输入框属性及显隐按钮文案配置。
 * @param ref 输入框元素引用，便于表单库管理焦点和字段状态。
 * @returns 带小眼睛切换按钮的密码输入框节点。
 */
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      showPasswordLabel = '显示密码',
      hidePasswordLabel = '隐藏密码',
      disabled,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const toggleLabel = showPassword ? hidePasswordLabel : showPasswordLabel;

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          className={cn('pr-10', className)}
          disabled={disabled}
          type={showPassword ? 'text' : 'password'}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={toggleLabel}
          aria-pressed={showPassword}
          title={toggleLabel}
          disabled={disabled}
          onClick={() => setShowPassword((visible) => !visible)}
        >
          {showPassword ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
        </Button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
