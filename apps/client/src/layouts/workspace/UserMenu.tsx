import { Link } from '@tanstack/react-router';
import { LogOutIcon, SettingsIcon } from 'lucide-react';
import { useState } from 'react';

import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { clearClientSession, useSessionModel } from '@/model';
import { routerGoLogin, routePathMap } from '@/router';
import { api } from '@/utils';

/**
 * 渲染顶栏用户下拉菜单：展示当前用户、跳转设置、退出登录。
 *
 * @returns 用户菜单节点。
 */
export function UserMenu() {
  const user = useSessionModel((state) => state.user);
  const [loggingOut, setLoggingOut] = useState(false);

  const displayName = user?.nickname ?? user?.username ?? '访客';
  const initial = displayName.slice(0, 1).toUpperCase();

  async function handleLogout() {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    try {
      await api('/login/logout', {});
    } catch {
      // 服务端不可用时也清理本地状态，避免继续使用旧会话。
    } finally {
      clearClientSession();
      await routerGoLogin({ replace: true });
      setLoggingOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="用户菜单">
          <Avatar size="sm">
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={routePathMap.settings}>
            <SettingsIcon className="size-4" aria-hidden />
            设置
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={handleLogout}
          disabled={loggingOut}
        >
          <LogOutIcon className="size-4" aria-hidden />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
