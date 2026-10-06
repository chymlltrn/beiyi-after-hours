import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = root + 'dist';
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const [html, css, personas, canvas, app, favicon, readme] = await Promise.all(['index.html', 'style.css', 'assets/personas.js', 'assets/universe.js', 'app.js', 'assets/favicon.svg', 'README.md'].map(name => readFile(root + name, 'utf8')));
const character = await readFile(root + 'assets/teacher-character.png');
const characterData = `data:image/png;base64,${character.toString('base64')}`;
const bundledCanvas = canvas.replace(/new URL\('\.\/teacher-character\.png\?v=4', import\.meta\.url\)\.href/g, JSON.stringify(characterData));
const bundledScript = personas + '\n' + bundledCanvas + '\n' + app.replace(/^import \{ (?:Universe|PERSONAS) \} from '.\/assets\/(?:universe|personas).js\?v=4';\s*/gm, '');
const standalone = html
  .replace('<link rel="stylesheet" href="./style.css?v=4">', `<style>\n${css}\n</style>`)
  .replace('href="./assets/favicon.svg?v=4"', `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`)
  .replace('<script type="module" src="./app.js?v=4"></script>', `<script type="module">\n${bundledScript.replace(/<\/script/gi, '<\\/script')}\n</script>`);
if (!standalone.includes(characterData) || /<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(standalone)) {
  throw new Error('The offline file must embed its scripts, styles and character image.');
}
await writeFile(destination + '/index.html', standalone);
await writeFile(destination + '/README.md', readme + '\n## Offline distribution\n\nThis folder contains the complete self-contained website in `index.html`. Its CSS, Canvas artwork and JavaScript are embedded so it works as a single file without a server or dependencies. The repository root keeps the modular source and is published by GitHub Pages.\n');
await writeFile(destination + '/.nojekyll', '');
console.log('Self-contained static site built in dist/index.html. No runtime dependencies.');
