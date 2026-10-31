// Bundles the built game into ONE self-contained .html (JS + CSS inlined),
// so it can be opened in the chat viewer / from disk with no server at all.
import fs from 'node:fs';
import path from 'node:path';

const dist = 'dist';
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsFile = fs.readdirSync(path.join(dist, 'assets')).find((f) => f.endsWith('.js'));
const cssFile = fs.readdirSync(path.join(dist, 'assets')).find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('build first: npm run build');

let js = fs.readFileSync(path.join(dist, 'assets', jsFile), 'utf8');
const css = fs.readFileSync(path.join(dist, 'assets', cssFile), 'utf8');

// inline scripts must not contain a literal closing tag
js = js.replace(/<\/script/gi, '<\\/script');

let out = html
  .replace(/<script[^>]*src="\.\/assets\/[^"]+"[^>]*><\/script>/i, '')
  .replace(/<link[^>]*href="\.\/assets\/[^"]+\.css"[^>]*>/i, '');

out = out.replace('</head>', `<style>\n${css}\n</style>\n</head>`);
out = out.replace('</body>', `<script type="module">\n${js}\n</script>\n</body>`);

const target = process.argv[2] || 'game.html';
fs.writeFileSync(target, out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`wrote ${target} (${kb} KB, js ${jsFile}, css ${cssFile})`);

// sanity: no external references left
const externals = [...out.matchAll(/(?:src|href)="(?!data:|#)([^"]+)"/g)].map((m) => m[1]);
console.log('remaining external refs:', externals.length ? externals.join(', ') : 'none');
