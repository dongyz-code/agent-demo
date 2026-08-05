<template>
  <main
    class="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-primary)_14%,transparent),transparent_38%),linear-gradient(315deg,color-mix(in_srgb,var(--color-warning)_10%,transparent),transparent_42%),var(--color-background)] px-5 py-10 text-tcolor"
  >
    <div
      class="pointer-events-none absolute inset-0 bg-[linear-gradient(color-mix(in_srgb,var(--color-primary)_8%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--color-primary)_8%,transparent)_1px,transparent_1px)] bg-[length:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]"
      aria-hidden="true"
    ></div>

    <section
      class="relative mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]"
    >
      <div class="max-w-xl">
        <div
          class="inline-flex items-center gap-2 rounded-full border border-primary-white bg-white/80 px-3 py-1.5 text-xs font-bold tracking-[0.18em] text-primary shadow-sm backdrop-blur"
        >
          <span class="size-2 rounded-full bg-primary"></span>
          PAGE NOT FOUND
        </div>

        <p class="mt-6 text-sm font-semibold tracking-widest text-primary">
          错误代码 · 404
        </p>
        <h1
          class="mt-3 text-4xl leading-tight font-bold text-tcolor-dark sm:text-5xl"
        >
          页面走丢了
        </h1>
        <p class="mt-5 max-w-lg text-base leading-7 text-tcolor-light">
          你访问的页面不存在、已被移动，或者当前账号没有访问权限。请检查地址，也可以返回管理台继续操作。
        </p>

        <div class="mt-8 flex flex-wrap items-center gap-3">
          <el-button
            class="!m-0 !h-11 !rounded-lg !px-5 !font-semibold !shadow-[0_12px_24px_color-mix(in_srgb,var(--color-primary)_22%,transparent)]"
            type="primary"
            size="large"
            @click="routerGoHome"
          >
            <LucideHouse class="mr-1 size-4" aria-hidden="true" />
            返回首页
          </el-button>
          <el-button
            class="!m-0 !h-11 !rounded-lg !border-tcolor-white !bg-white/80 !px-5 !font-semibold !text-tcolor"
            size="large"
            @click="routeGoBack"
          >
            <LucideArrowLeft class="mr-1 size-4" aria-hidden="true" />
            返回上一页
          </el-button>
        </div>
      </div>

      <div class="relative mx-auto w-full max-w-[560px]" aria-hidden="true">
        <div
          class="absolute -top-8 -right-5 size-32 rounded-full bg-warning-soft blur-2xl"
        ></div>
        <div
          class="absolute -bottom-10 -left-8 size-40 rounded-full bg-primary-soft blur-3xl"
        ></div>

        <div
          class="relative overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-[0_28px_90px_rgb(15_23_42_/_16%)] backdrop-blur"
        >
          <div
            class="flex h-14 items-center gap-4 border-b border-tcolor-white px-5"
          >
            <div class="flex gap-1.5">
              <span class="size-2.5 rounded-full bg-error-lighter"></span>
              <span class="size-2.5 rounded-full bg-warning-lighter"></span>
              <span class="size-2.5 rounded-full bg-success-lighter"></span>
            </div>
            <div
              class="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs text-tcolor-light"
            >
              <LucideLockKeyhole class="size-3.5 shrink-0" />
              <span class="truncate">{{ route.path }}</span>
            </div>
          </div>

          <div
            class="relative flex min-h-[360px] flex-col items-center justify-center overflow-hidden px-6 py-12"
          >
            <div
              class="absolute top-10 left-10 size-3 rounded-full bg-primary-lighter"
            ></div>
            <div
              class="absolute right-14 bottom-14 size-5 rounded-md border-2 border-warning-lighter rotate-12"
            ></div>
            <div
              class="absolute top-20 right-12 h-px w-16 bg-tcolor-white -rotate-12"
            ></div>

            <div class="relative">
              <div
                class="bg-[linear-gradient(135deg,var(--color-primary),var(--color-primary-dark))] bg-clip-text text-[clamp(7rem,18vw,10rem)] leading-none font-black tracking-[-0.08em] text-transparent select-none"
              >
                404
              </div>
              <div
                class="absolute -right-3 -bottom-1 flex size-16 items-center justify-center rounded-2xl border-4 border-white bg-primary-white text-primary shadow-lg rotate-6"
              >
                <LucideFileQuestion class="size-8" />
              </div>
            </div>

            <div
              class="mt-8 h-1.5 w-44 rounded-full bg-[linear-gradient(90deg,transparent,var(--color-primary-lighter),transparent)]"
            ></div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ElButton } from 'element-plus';
import { useRoute } from 'vue-router';
import LucideArrowLeft from '~icons/lucide/arrow-left';
import LucideFileQuestion from '~icons/lucide/file-question';
import LucideHouse from '~icons/lucide/house';
import LucideLockKeyhole from '~icons/lucide/lock-keyhole';

import { routeGoBack, routerGoHome } from '@/router';

const route = useRoute();
</script>
