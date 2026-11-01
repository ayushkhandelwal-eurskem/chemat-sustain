// Verify gallery overlays emit real CSS with the installed Tailwind version.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('tailwindcss');

async function main() {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components/tests/shared/UniversalImagesTab.tsx'), 'utf8');
  assert.doesNotMatch(source, /\bbg-opacity-\d+/, 'Removed opacity utilities must not cover thumbnails with opaque black');
  const overlay = source.match(/<div className="([^"]*group-hover:bg-black\/20[^"]*)"/);
  assert(overlay, 'Thumbnail must retain its hover affordance');
  const classes = overlay[1].split(/\s+/);
  assert(classes.includes('bg-black/0'), 'Thumbnail overlay must be transparent at rest');
  assert(!classes.includes('bg-black'), 'Opaque black must not cover the thumbnail');
  const compiler = await compile('@theme { --color-black: #000; } @tailwind utilities;');
  const css = compiler.build([...classes, 'bg-black/90', 'bg-black/50', 'bg-black/70', 'hover:bg-black/70']);
  assert.match(css, /\.bg-black\\\/0\s*\{\s*background-color:\s*(?:#[0-9a-f]{4,8}|color-mix\([^;]+\));/i);
  assert.match(css, /\.group-hover\\:bg-black\\\/20/);
  assert.match(css, /\.bg-black\\\/90/);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], css);
  console.log('PASS gallery: transparent thumbnails, hover tint and lightbox opacity compile with installed Tailwind');
}
main().catch(error => { console.error(error); process.exitCode = 1; });