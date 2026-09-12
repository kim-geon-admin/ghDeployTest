# 라이브러리가 없는 작은 서버라 그대로 복사해 실행합니다.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json server.js ./
# 빌드한 커밋을 화면에 표시하기 위해 넘겨받습니다.
ARG APP_VERSION=local
ENV APP_VERSION=$APP_VERSION

USER node
EXPOSE 3000
CMD ["node", "server.js"]
