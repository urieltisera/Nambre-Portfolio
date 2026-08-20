FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=$API_PROXY_TARGET

RUN npm run build
CMD npm run start
