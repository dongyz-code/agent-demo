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
  # docker https://docs.docker.com/engine/install/debian/
  # https://developer.aliyun.com/mirror/docker-ce?spm=a2c6h.13651102.0.0.57e31b11KrmvsA
  apt-get install -y ca-certificates curl gnupg && \
  install -m 0755 -d /etc/apt/keyrings && \
  curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
  chmod a+r /etc/apt/keyrings/docker.gpg && \
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list && \
  apt-get update && \
  apt-get install -y docker-ce-cli docker-compose-plugin && \
  # apt-get clean
  apt-get clean && rm -rf /var/lib/apt/lists/*

RUN npm config set registry https://registry.npmmirror.com && \
  npm i -g pnpm@10 && \
  pnpm config set store-dir /pnpm-store 
