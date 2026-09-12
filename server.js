// NAS 배포를 확인하기 위한 아주 작은 웹 서버입니다. 외부 라이브러리를 쓰지 않습니다.
import { createServer } from 'node:http';
import os from 'node:os';

const port = Number(process.env.PORT ?? 3000);
const version = process.env.APP_VERSION ?? 'local';
const message = process.env.APP_MESSAGE ?? '배포 테스트 페이지';
const startedAt = new Date();
let visits = 0;

const page = () => `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ghDeployTest</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
             font-family: system-ui, sans-serif; background: #0b1020; color: #e8ecff; }
      main { width: min(92vw, 32rem); padding: 2rem; background: #131a33;
             border: 1px solid #26325c; border-radius: 1rem; }
      h1 { margin: 0 0 1rem; font-size: 1.5rem; }
      dl { display: grid; grid-template-columns: 7rem 1fr; gap: .5rem 1rem; margin: 0 0 1.5rem; }
      dt { color: #8fa1d8; } dd { margin: 0; font-variant-numeric: tabular-nums; word-break: break-all; }
      button { width: 100%; padding: .7rem; font-size: 1rem; border: 0; border-radius: .6rem;
               background: #3d6bff; color: #fff; cursor: pointer; }
      p { margin: 1rem 0 0; color: #8fa1d8; font-size: .85rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>${message}</h1>
      <dl>
        <dt>버전</dt><dd>${version}</dd>
        <dt>서버 이름</dt><dd>${os.hostname()}</dd>
        <dt>시작 시각</dt><dd>${startedAt.toLocaleString('ko-KR')}</dd>
        <dt>가동 시간</dt><dd>${Math.round(process.uptime())}초</dd>
        <dt>방문 수</dt><dd>${visits}</dd>
      </dl>
      <button id="ping">서버에 신호 보내기</button>
      <p id="result">버튼을 누르면 서버가 응답한 시각이 표시됩니다.</p>
    </main>
    <script>
      document.querySelector('#ping').addEventListener('click', async () => {
        const result = document.querySelector('#result');
        result.textContent = '보내는 중...';
        try {
          const response = await fetch('/api/ping');
          const data = await response.json();
          result.textContent = '서버 응답: ' + new Date(data.time).toLocaleString('ko-KR');
        } catch (error) {
          result.textContent = '실패: ' + error.message;
        }
      });
    </script>
  </body>
</html>`;

export const handler = (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }
  if (url.pathname === '/api/ping') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ time: new Date().toISOString(), version, host: os.hostname() }));
    return;
  }
  if (url.pathname === '/') {
    visits += 1;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page());
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('not found');
};

export const createApp = () => createServer(handler);

// 테스트에서 불러올 때는 서버를 띄우지 않습니다.
if (process.env.NODE_TEST_CONTEXT === undefined) {
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`listening on ${port} (version ${version})`);
  });
}
