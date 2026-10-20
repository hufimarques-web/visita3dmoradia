import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenes = JSON.parse(fs.readFileSync(path.join(root, 'generated/scenes.json'), 'utf8'));
const byId = new Map(scenes.map(scene => [scene.id, scene]));
assert.equal(byId.size, scenes.length, 'Duplicate scene identifiers');
assert.equal(scenes[0]?.id, 'exterior_fachada', 'The tour must start at the exterior');
let links = 0;
const assets = new Set(['/assets/planta-3d-referencia.png', '/assets/mark.svg']);

for (const scene of scenes) {
  assert(scene.title && scene.floor, `Missing scene label: ${scene.id}`);
  for (const field of ['yaw', 'pitch', 'fov']) assert(Number.isFinite(scene.view[field]), `Invalid ${field}: ${scene.id}`);
  assert(scene.view.fov >= 65 && scene.view.fov <= 120, `Unsupported field of view: ${scene.id}`);
  for (const field of ['image', 'optimizedImage', 'thumb']) { assert(scene[field], `Missing ${field}: ${scene.id}`); assets.add(scene[field]); }
  for (const detail of scene.details || []) assets.add(detail.image);
  for (const point of scene.hotspots) {
    assert(byId.has(point.target), `Unknown destination ${scene.id} → ${point.target}`);
    assert(point.label && Number.isFinite(point.yaw) && Number.isFinite(point.pitch), `Invalid floor point: ${scene.id}`);
    links++;
  }
}

for (const asset of assets) {
  const pathname = asset.split('?')[0];
  assert(pathname.startsWith('/assets/'), `Asset must be local: ${asset}`);
  const file = path.resolve(root, 'public', '.' + pathname);
  assert(file.startsWith(path.join(root, 'public/assets') + path.sep), `Asset escapes public directory: ${asset}`);
  assert(fs.statSync(file).isFile(), `Missing asset: ${asset}`);
}

for (const start of scenes) {
  const visited = new Set(), queue = [start.id];
  while (queue.length) {
    const id = queue.shift(); if (visited.has(id)) continue;
    visited.add(id); queue.push(...byId.get(id).hotspots.map(point => point.target));
  }
  assert.equal(visited.size, scenes.length, `A destination is unreachable from ${start.id}`);
}
console.log(`Verified ${scenes.length} panoramas, ${links} links and ${assets.size} asset references. Every scene can reach every other scene.`);
