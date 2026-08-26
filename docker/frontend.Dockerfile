FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

ARG API_PROXY_TARGET
ARG FRONTEND_BASE_URL
ENV API_PROXY_TARGET=$API_PROXY_TARGET
ENV FRONTEND_BASE_URL=$FRONTEND_BASE_URL

RUN npm run build
CMD npm run start
