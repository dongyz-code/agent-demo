<template>
  <div class="mx-auto flex w-250 justify-center py-30">
    <div class="flex items-center gap-2 font-bold">
      <IconParkOutlineLoading class="animate-spin" />
      正在登录中...
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { api } from '@/api';
import { loginHandleRedirect } from './utils';
import { DEV } from '@/configs';

import IconParkOutlineLoading from '~icons/icon-park-outline/loading';

async function codeLogin(url: string, state: string) {
  const info = await api('/login/login', { state, url });

  loginHandleRedirect(info, localStorage.getItem('redirect'));
}

const loginUrl = DEV
  ? 'https://authing.medomino.com/login/oauth/authorize?redirect_uri=http%3A%2F%2F192.168.1.34%3A5173%2Flogin&scope=openid+profile+email&code_challenge=aEY72FwPeIbDIPKA_aqmtbRqdu_LzbKTip80krr9Wgk&code_challenge_method=S256&state=Casdoor&client_id=714b3a56-c6da-436e-8561-fd301e44c14c&response_type=code'
  : 'https://authing.medomino.com/login/oauth/authorize?redirect_uri=https%3A%2F%2Fai-deploy.medomino.com%2Flogin&scope=openid+profile+email&code_challenge=aEY72FwPeIbDIPKA_aqmtbRqdu_LzbKTip80krr9Wgk&code_challenge_method=S256&state=Casdoor&client_id=714b3a56-c6da-436e-8561-fd301e44c14c&response_type=code';

onMounted(async () => {
  const search = new URLSearchParams(location.search);
  const state = search.get('state');
  const code = search.get('code');
  if (state && code) {
    await codeLogin(location.href, state);
  } else {
    const redirect = search.get('redirect');
    if (redirect) {
      localStorage.setItem('redirect', redirect);
    }

    if (loginUrl) {
      location.href = loginUrl;
    }
  }
});
</script>
