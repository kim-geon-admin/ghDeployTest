FROM nginx:1.27-alpine

COPY site/ /usr/share/nginx/html/
# 빌드한 커밋을 화면에 보여 주기 위해 파일로 남깁니다.
ARG GIT_SHA=local
RUN printf '%s\n' "$GIT_SHA" > /usr/share/nginx/html/version.txt \
  && printf 'server {\n  listen 8080;\n  root /usr/share/nginx/html;\n  location /health { default_type text/plain; return 200 "ok\n"; }\n}\n' > /etc/nginx/conf.d/default.conf \
  && rm -f /etc/nginx/conf.d/default.conf.bak
EXPOSE 8080
