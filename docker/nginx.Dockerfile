FROM nginx:1-alpine-slim

COPY ./apps/client/dist /app/dist
COPY ./docker/nginx/nginx.conf /etc/nginx/nginx.conf
