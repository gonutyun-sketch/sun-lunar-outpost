#!/usr/bin/env node
/**
 * Packs the production build (dist/) into ONE self-contained HTML file that can be
 * opened by double-click (file://) or uploaded anywhere. Game code is unchanged.
 *   npm run build && node tools/make-single-file.mjs [outFile] [--fragment]
 * --fragment writes only <title>/<style>/<div id=root>/<script> (for hosts that add their own <html> skeleton).
 */
import fs from 'node:fs';

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'release/sun-lunar-outpost-play.html';
const fragment = process.argv.includes('--fragment');
const files = fs.readdirSync('dist/assets');
const js = fs.readFileSync(`dist/assets/${files.find((f) => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(`dist/assets/${files.find((f) => f.endsWith('.css'))}`, 'utf8');
let html = fs.readFileSync('dist/index.html', 'utf8');

// Function replacers: the bundle contains `$&`/`$'` sequences that string replacers would expand.
html = html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>\s*/, () => '');
html = html.replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, () => `<style>${css}</style>`);
html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`);
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('unresolved asset reference');

if (fragment) {
  const pick = (re) => (html.match(re) || [''])[0];
  html = [
    pick(/<title>[\s\S]*?<\/title>/),
    pick(/<meta name="description"[^>]*>/),
    '<style>:root{color-scheme:dark}</style>',
    pick(/<style>[\s\S]*?<\/style>/),
    '<div id="root"></div>',
    pick(/<script type="module">[\s\S]*<\/script>/),
  ].join('\n');
}
fs.mkdirSync(out.replace(/[\\/][^\\/]+$/, '') || '.', { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes)`);
