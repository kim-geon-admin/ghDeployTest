import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const deployScript = await readFile(new URL('../infra/synology/deploy.sh', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('records the rollback target as the current tag after a verified rollback', () => {
  assert.match(
    deployScript,
    /verify_stack "\$rollback_tag"; then[\s\S]*?echo "\$rollback_tag" > "\$STATE_DIR\/current-tag"/,
  );
});

test('does not reclaim a lock before its owner publishes a pid', () => {
  assert.match(deployScript, /holder=.*\n\s+\[\[ -n "\$holder" \]\] \|\| die/);
});

test('does not overwrite an existing image for the same commit SHA', () => {
  assert.match(workflow, /docker manifest inspect/);
  assert.match(workflow, /if: steps\.image\.outputs\.exists != 'true'/);
  assert.match(workflow, /docker buildx imagetools inspect/);
});

test('documents the NAS-owned environment path and independent host-key verification', () => {
  assert.match(readme, /\/volume1\/docker\/ghdeploytest\/\.env/);
  assert.match(readme, /independent|trusted.*fingerprint|fingerprint.*trusted/i);
});
