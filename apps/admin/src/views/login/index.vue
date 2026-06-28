<template>
  <main
    class="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-primary)_16%,transparent),transparent_42%),linear-gradient(225deg,color-mix(in_srgb,var(--color-warning)_10%,transparent),transparent_38%),var(--color-background)] text-tcolor before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(color-mix(in_srgb,var(--color-primary)_10%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--color-primary)_10%,transparent)_1px,transparent_1px)] before:bg-[length:44px_44px] before:content-[''] before:[mask-image:linear-gradient(to_bottom,black,transparent_72%)]"
  >
    <section
      class="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_420px]"
    >
      <div class="hidden lg:block">
        <div
          class="inline-flex h-10 items-center gap-2 rounded-lg border border-primary-white bg-white/80 px-3 text-sm font-semibold text-primary shadow-sm"
        >
          <LucideShieldCheck class="size-4" aria-hidden="true" />
          AI Deploy
        </div>
        <h1 class="mt-6 max-w-xl text-4xl leading-tight font-bold text-tcolor-dark">
          统一管理发布、任务与权限
        </h1>
        <p class="mt-4 max-w-lg text-base leading-7 text-tcolor-light">
          使用同一套主题色驱动管理台界面，登录后进入部署工作区。
        </p>
        <div class="mt-8 grid max-w-xl grid-cols-3 gap-3">
          <div class="rounded-lg border border-white/80 bg-white/75 p-4 shadow-sm">
            <div class="text-lg font-bold text-primary">Live</div>
            <div class="mt-1 text-xs text-tcolor-light">应用发布</div>
          </div>
          <div class="rounded-lg border border-white/80 bg-white/75 p-4 shadow-sm">
            <div class="text-lg font-bold text-success">Ready</div>
            <div class="mt-1 text-xs text-tcolor-light">任务调度</div>
          </div>
          <div class="rounded-lg border border-white/80 bg-white/75 p-4 shadow-sm">
            <div class="text-lg font-bold text-warning">Guard</div>
            <div class="mt-1 text-xs text-tcolor-light">权限控制</div>
          </div>
        </div>
      </div>

      <div
        class="mx-auto w-full max-w-[420px] rounded-lg border border-white/80 bg-white/95 p-7 shadow-[0_24px_80px_rgb(15_23_42_/_16%)] backdrop-blur"
      >
        <div class="mb-7 flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-primary">欢迎回来</p>
            <h2 class="mt-2 text-2xl font-bold text-tcolor-dark">登录管理台</h2>
            <p class="mt-1 text-sm text-tcolor-light">AI Deploy workspace</p>
          </div>
          <div
            class="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-white text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_16%,transparent)]"
          >
            <LucideLogIn class="size-5" aria-hidden="true" />
          </div>
        </div>

        <div
          class="space-y-4 [&_.el-input__inner]:text-tcolor-dark [&_.el-input__inner::placeholder]:text-tcolor-light [&_.el-input__prefix]:text-tcolor-light [&_.el-input__wrapper]:min-h-[46px] [&_.el-input__wrapper]:rounded-lg [&_.el-input__wrapper]:border [&_.el-input__wrapper]:border-tcolor-white [&_.el-input__wrapper]:bg-white/90 [&_.el-input__wrapper]:shadow-none [&_.el-input__wrapper]:transition [&_.el-input__wrapper.is-focus]:border-primary [&_.el-input__wrapper.is-focus]:shadow-[0_0_0_3px_var(--color-primary-soft)]"
        >
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-tcolor">用户名</span>
            <el-input
              v-model="sysForm.username"
              size="large"
              autocomplete="username"
              :prefix-icon="LucideUserRound"
              placeholder="请输入用户名"
            ></el-input>
          </label>

          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-tcolor">密码</span>
            <el-input
              v-model="sysForm.password"
              size="large"
              type="password"
              autocomplete="current-password"
              show-password
              :prefix-icon="LucideLockKeyhole"
              :validate-event="false"
              placeholder="请输入密码"
              @keyup.enter="sysSubmit()"
            ></el-input>
          </label>

          <el-button
            class="w-full !h-[46px] !rounded-lg !font-bold !shadow-[0_14px_28px_color-mix(in_srgb,var(--color-primary)_24%,transparent)]"
            type="primary"
            size="large"
            :loading="submitting"
            @click="sysSubmit()"
          >
            登录
          </el-button>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { sha256 } from '@/plugins/sha256';
import { ref } from 'vue';
import { api } from '@/api';
import { notify } from '@/plugins/notify';
import LucideLockKeyhole from '~icons/lucide/lock-keyhole';
import LucideLogIn from '~icons/lucide/log-in';
import LucideShieldCheck from '~icons/lucide/shield-check';
import LucideUserRound from '~icons/lucide/user-round';

import { ElButton, ElInput } from 'element-plus';
import { loginHandleRedirect } from './utils';

const sysForm = ref({
  username: '',
  password: '',
});
const submitting = ref(false);

/**
 * 校验登录表单并提交认证请求，成功后按 redirect 参数跳转。
 */
async function sysSubmit() {
  if (submitting.value) {
    return;
  }

  let { username, password } = sysForm.value;
  username = username.trim();
  password = password.trim();
  if (!username || !password) {
    notify('error', '请完整输入用户名和密码');
    return;
  }

  submitting.value = true;

  try {
    const info = await api('/login/login', {
      username,
      password: await sha256(`${username}${password}`),
    });

    loginHandleRedirect(
      info,
      new URLSearchParams(location.search).get('redirect'),
    );
  } finally {
    submitting.value = false;
  }
}
</script>
