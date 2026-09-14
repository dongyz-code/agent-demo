# syntax=docker/dockerfile:1.7
# 服务端生产镜像 —— 基于 turbo prune 的标准多阶段构建
# 构建：docker build -t server -f docker/server.Dockerfile .

######## base ########
# 运行期基础镜像：node + 阿里云源 + tini + pnpm；含 docker-ce-cli 供服务端运行期调用 docker/compose
FROM node:20-slim AS base

ENV LANG=C.UTF-8 \
  LC_ALL=C.UTF-8 \
  TZ=Asia/Shanghai \
  NODE_ENV=production

RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
  sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
  apt-get update && \
  # 时区 / tini
  apt-get install -y tzdata tini curl wget && \
  ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
  echo $TZ > /etc/timezone && \
  apt-get install -y unzip && \
  # docker-ce-cli：服务端运行期需要调用 docker / compose
  apt-get install -y ca-certificates curl gnupg && \
  install -m 0755 -d /etc/apt/keyrings && \
  curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
  chmod a+r /etc/apt/keyrings/docker.gpg && \
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list && \
  apt-get update && \
  apt-get install -y docker-ce-cli docker-compose-plugin && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

RUN npm config set registry https://registry.npmmirror.com && \
  npm i -g pnpm@11.7.0 && \
  pnpm config set store-dir /pnpm-store

######## pruner ########
# 裁出 @repo/server 的最小工作区子集（不含 client/admin），产出 out/json 与 out/full
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.9.6 prune @repo/server --docker

######## build ########
# 先装依赖（仅 out/json 变动才重装），再拷源码构建；devDependencies 保留以供 tsc/tsc-alias 使用
FROM base AS build
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm turbo build --filter=@repo/server

######## runner ########
# 整包拷贝：node_modules 与各工作区产物随 /app 一并带入，免去手维护 COPY 清单
FROM base AS runner
WORKDIR /app
COPY --from=build /app/ .
ENTRYPOINT ["tini", "--"]
CMD exec node --max-old-space-size=16000 apps/server/build/index.js --DEBUG-ID="$HOSTNAME"
