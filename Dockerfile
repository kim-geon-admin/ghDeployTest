# 의존성 설치와 실행을 나눠, 실행 이미지에는 필요한 것만 담습니다.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY . .
USER node
EXPOSE 3000
CMD ["npm","run","start"]
