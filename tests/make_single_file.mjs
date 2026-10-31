/**
 * Builds ONE self-contained game.html that runs anywhere — including file://
 * and sandboxed iframes — by bundling to a classic (non-module) IIFE script
 * with the CSS inlined. No external requests, no ES modules.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const target = process.argv[2] || 'game.html';

// 1. bundle TS + CSS to plain JS (iife => works without type="module")
const result = await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: ['chrome90', 'firefox90', 'safari15'],
  minify: true,
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
  plugins: [
    {
      // styles are inlined separately from src/style.css
      name: 'drop-css-imports',
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'css-stub' }));
        build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({ contents: '', loader: 'js' }));
      },
    },
  ],
});

let js = '';
let css = fs.readFileSync('src/style.css', 'utf8');
for (const f of result.outputFiles) {
  if (!f.path.endsWith('.css')) js += f.text;
}
js = js.replace(/<\/script/gi, '<\\/script');

// 2. inline everything into the page shell
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/gi, '');
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, '');
// NB: use callback replacements — minified JS contains `$&`/`$'` sequences that
// String.replace would otherwise expand into the page markup.
html = html.replace('</head>', () => `<style>\n${css}\n</style>\n</head>`);
html = html.replace('</body>', () => `<script>\n${js}\n</script>\n</body>`);

fs.writeFileSync(target, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
const externals = [...html.matchAll(/(?:src|href)="(?!data:|#)([^"]+)"/g)].map((m) => m[1]);
console.log(`wrote ${target}: ${kb} KB, classic script, external refs: ${externals.length ? externals.join(', ') : 'none'}`);
