import { ROOT } from '@/configs/env.js';
import { useOAuth2 } from '@repo/openid';

let openidIns: ReturnType<typeof useOAuth2> | undefined = undefined;

export function useOpenid() {
  if (openidIns) {
    return openidIns;
  }
  if (!ROOT.openid) {
    throw new Error('openid not found');
  }
  openidIns = useOAuth2({
    configs: ROOT.openid.configs,
  });
  return openidIns;
}
