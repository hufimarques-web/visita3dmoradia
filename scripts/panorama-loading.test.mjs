import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../lib/panorama.js', import.meta.url), 'utf8');
const { Panorama } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const requests = [];
class ImageMock {
  set src(value) { this.url = value; if (value) requests.push(this); }
  get src() { return this.url; }
  succeed() { this.onload?.(); }
  fail() { this.onerror?.(); }
}
globalThis.Image = ImageMock;
const renderer = () => Object.assign(Object.create(Panorama.prototype), { cache: new Map() });
const scene = id => ({ id, image: `/assets/${id}.png`, optimizedImage: `/assets/${id}.webp` });

test('changing scene cancels the pending image without downloading its fallback', async () => {
  requests.length = 0;
  const engine = renderer();
  const first = engine.load(scene('sala'));
  const rejected = assert.rejects(first, { name: 'AbortError' });
  const second = engine.load(scene('cozinha'));
  assert.equal(requests[0].url, '', 'Old image request must be cancelled');
  assert.equal(requests.length, 2, 'No unrelated panorama or PNG fallback');
  requests[1].succeed();
  assert.equal((await second).id, 'cozinha');
  await rejected;
});

test('a real WebP error falls back only to the selected original', async () => {
  requests.length = 0;
  const loading = renderer().load(scene('suite'));
  requests[0].fail();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests.map(image => image.url), ['/assets/suite.webp', '/assets/suite.png']);
  requests[1].succeed();
  assert.equal((await loading).id, 'suite');
});

test('returning to the current scene cancels a different in-flight destination', async () => {
  requests.length = 0;
  const engine = renderer(), current = { id: 'sala' };
  engine.cache.set('sala', current);
  const pending = engine.load(scene('suite'));
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  assert.equal(await engine.load(scene('sala')), current);
  assert.equal(requests[0].url, '');
  await rejected;
});
