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
await writeFile(destination + '/README.md', readme + '\n## GitHub Pages distribution\n\nThis repository contains the complete self-contained website in `index.html`. Its CSS, Canvas artwork and JavaScript are embedded so it also works as a single file with no build or dependencies. Enable Pages from the `main` branch, repository root. The modular development version is maintained locally.\n');
await writeFile(destination + '/.nojekyll', '');
console.log('Self-contained static site built in dist/index.html. No runtime dependencies.');
