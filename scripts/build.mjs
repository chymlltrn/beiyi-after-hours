import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = root + 'dist';
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const [html, css, canvas, app, favicon, readme] = await Promise.all(['index.html', 'style.css', 'assets/universe.js', 'app.js', 'assets/favicon.svg', 'README.md'].map(name => readFile(root + name, 'utf8')));
const bundledScript = canvas + '\n' + app.replace(/^import \{ Universe \} from '.\/assets\/universe.js';\s*/m, '');
const standalone = html
  .replace('<link rel="stylesheet" href="./style.css">', `<style>\n${css}\n</style>`)
  .replace('href="./assets/favicon.svg"', `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`)
  .replace('<script type="module" src="./app.js"></script>', `<script type="module">\n${bundledScript.replace(/<\/script/gi, '<\\/script')}\n</script>`);
await writeFile(destination + '/index.html', standalone);
await writeFile(destination + '/README.md', readme + '\n## Offline distribution\n\nThis folder contains the complete self-contained website in `index.html`. Its CSS, Canvas artwork and JavaScript are embedded so it works as a single file without a server or dependencies. The repository root keeps the modular source and is published by GitHub Pages.\n');
await writeFile(destination + '/.nojekyll', '');
console.log('Self-contained static site built in dist/index.html. No runtime dependencies.');
