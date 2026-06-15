import { loginHandle } from '@/hooks/login';
import { routerGo } from '@/router';

export function loginHandleRedirect(
  info: Parameters<typeof loginHandle>[0],
  redirect?: string | null,
) {
  loginHandle(info);
  if (redirect) {
    location.href = redirect;
  } else {
    routerGo();
  }
}
