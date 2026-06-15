import { globalSet } from '../utils/global-set';

import type { Router } from 'vue-router';

export const { useRouter, installRouter } = globalSet<'router', Router>(
  'router',
);
