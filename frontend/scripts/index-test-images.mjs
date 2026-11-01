/** Index existing assets, preserving real path casing and SHA-256 identity. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../public/images/', import.meta.url));
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))).flat();
}
const assets = [];
for (const file of (await walk(root)).sort()) {
  if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(file)) continue;
  const relative = path.relative(root, file).split(path.sep).join('/');
  assets.push({ path: relative, sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
}
await writeFile(fileURLToPath(new URL('../src/lib/images/assetManifest.json', import.meta.url)), JSON.stringify(assets, null, 2) + '\n');
console.log(`Indexed ${assets.length} existing image assets`);