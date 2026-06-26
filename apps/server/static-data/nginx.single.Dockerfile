FROM nginx:1-alpine-slim

COPY . /app/dist/
COPY ./nginx.conf /etc/nginx/nginx.conf

RUN echo '#!/bin/sh' > /docker-entrypoint.d/20-replace-env.sh && \
  echo 'sed -i "s/__BACKEND__/${HOST_SERVER:-localhost}/g" /etc/nginx/nginx.conf' >> /docker-entrypoint.d/20-replace-env.sh && \
  chmod +x /docker-entrypoint.d/20-replace-env.sh
