// 배포 전에 GitHub에서 돌아가는 검사입니다. 서버가 정상 응답하는지 확인합니다.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../server.js';

const withServer = async (run) => {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test('상태 확인 주소는 ok 를 돌려준다', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok');
  });
});

test('첫 화면은 HTML 을 돌려준다', async () => {
  await withServer(async (base) => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /ghDeployTest/);
  });
});

test('없는 주소는 404 를 돌려준다', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/없는주소`);
    assert.equal(response.status, 404);
  });
});
