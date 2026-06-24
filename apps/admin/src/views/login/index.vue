<template>
  <div class="mx-auto flex w-250 justify-center py-30">
    <div class="w-100 rounded-xl border border-gray-200 bg-white p-8 shadow-xl">
      <div class="mb-6 w-full text-xl leading-6 font-bold opacity-80 last:mb-0">
        登录
      </div>
      <el-input
        size="large"
        class="mb-2 w-full last:mb-0"
        v-model="sysForm.username"
        placeholder="用户名"
      ></el-input>
      <el-input
        size="large"
        class="mb-2 w-full last:mb-0"
        v-model="sysForm.password"
        type="password"
        :validate-event="false"
        @keypress.enter="sysSubmit()"
        placeholder="密码"
      ></el-input>
      <div class="mb-2 flex justify-between">
        <el-button
          @click="sysSubmit()"
          class="item w-full font-bold dark:text-gray-200"
          type="primary"
        >
          登录
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sha256 } from '@/plugins/sha256';
import { ref } from 'vue';
import { api } from '@/api';
import { notify } from '@/plugins/notify';

import { ElButton, ElInput } from 'element-plus';
import { loginHandleRedirect } from './utils';

const sysForm = ref({
  username: '',
  password: '',
});

async function sysSubmit() {
  let { username, password } = sysForm.value;
  username = username.trim();
  password = password.trim();
  if (!username || !password) {
    notify('error', '请完整输入用户名和密码');
    return;
  }

  const info = await api('/login/login', {
    username,
    password: await sha256(`${username}${password}`),
  });

  loginHandleRedirect(
    info,
    new URLSearchParams(location.search).get('redirect'),
  );
}
</script>
