import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'public/assets');
const sceneFile = path.join(root, 'generated/scenes.json');
const scenes = JSON.parse(await fs.readFile(sceneFile, 'utf8'));
const filename = url => path.join(root, 'public', url.split('?')[0]);
const writeHashed = async (name, buffer) => {
  const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 10);
  const url = `/assets/${name}-${digest}.webp`;
  await fs.writeFile(filename(url), buffer);
  return url;
};

// Encode from the approved originals at their native resolution, never from a previous lossy copy.
const report = [];
for (const scene of scenes) {
  const buffer = await sharp(filename(scene.image)).webp({ quality: 94, effort: 6, smartSubsample: true }).toBuffer();
  scene.optimizedImage = await writeHashed(scene.id, buffer);
  report.push({ id: scene.id, bytes: buffer.length, width: scene.width, height: scene.height });
}
const floorPlan = await writeHashed('planta-3d', await sharp(path.join(assets, 'planta-3d-referencia.png')).webp({ quality: 90, effort: 6 }).toBuffer());
await fs.writeFile(path.join(root, 'generated/media.json'), JSON.stringify({ floorPlan, panoramas: report }, null, 2) + '\n');
await fs.writeFile(sceneFile, JSON.stringify(scenes, null, 2) + '\n');

// Render the existing facade panorama with the same rectilinear camera as the viewer.
// This is a projection of approved pixels, not a newly generated architectural image.
const facade = scenes.find(scene => scene.id === 'exterior_fachada');
const { data, info } = await sharp(filename(facade.image)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const width = 1200, height = 630, output = Buffer.alloc(width * height * 3);
const yaw = 0, pitch = .12, tangent = Math.tan(100 * Math.PI / 360);
const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const dx = (2 * (x + .5) / width - 1) * tangent;
  const dy = (1 - 2 * (y + .5) / height) * tangent * height / width;
  const length = Math.hypot(dx, dy, 1), yy = (cp * dy + sp) / length, zz = (-sp * dy + cp) / length;
  const xx = cy * dx / length + sy * zz, z = -sy * dx / length + cy * zz;
  const u = ((.5 + Math.atan2(xx, z) / (2 * Math.PI)) % 1 + 1) % 1;
  const v = .5 - Math.asin(Math.max(-1, Math.min(1, yy))) / Math.PI;
  const sx = u * info.width - .5, py = Math.max(0, Math.min(info.height - 1, v * info.height - .5));
  const x0 = Math.floor(sx), y0 = Math.floor(py), fx = sx - x0, fy = py - y0;
  const at = (a, b, c) => data[(Math.min(info.height - 1, b) * info.width + (a + info.width) % info.width) * 3 + c];
  for (let c = 0; c < 3; c++) output[(y * width + x) * 3 + c] =
    (at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) +
    (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy;
}
const overlay = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade" x2="0" y2="1"><stop stop-color="#15241c" stop-opacity="0"/><stop offset="1" stop-color="#15241c" stop-opacity=".85"/></linearGradient></defs><path fill="url(#shade)" d="M0 390h1200v240H0z"/><g fill="white" font-family="Arial,sans-serif"><text x="48" y="544" font-size="40" letter-spacing="5">DOMAINE XXV</text><text x="50" y="582" font-size="21" letter-spacing="1.4">Oliveirinha, Aveiro · Visita em 360°</text></g></svg>`);
await sharp(output, { raw: { width, height, channels: 3 } }).composite([{ input: overlay }]).jpeg({ quality: 91, mozjpeg: true }).toFile(path.join(assets, 'domaine-xxv-fachada-social.jpg'));
console.log(JSON.stringify({ panoramas: report.length, totalBytes: report.reduce((n, x) => n + x.bytes, 0), smallest: Math.min(...report.map(x => x.bytes)), largest: Math.max(...report.map(x => x.bytes)), floorPlan }, null, 2));
