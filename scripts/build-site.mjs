import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'site');
const destination = join(source, 'dist');
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const escape = (value) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const releases = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
if (!releases.length || releases[0][1] !== metadata.version) {
  throw new Error('The latest dated changelog entry must match package.json.');
}
const notes = releases.map(([, version, date, body]) => {
  const bullets = body.split(/^### /m)[0].split('\n').filter((line) => line.startsWith('- '));
  return `<article class="release"><div><span class="release-label">RELEASE</span><h3>v${escape(version)}</h3><time datetime="${date}">${date}</time></div><div><h4>${version === '0.1.0' ? 'The first public release' : 'What changed'}</h4><ul>${bullets.map((line) => `<li>${escape(line.slice(2))}</li>`).join('')}</ul><a class="text-link" href="https://github.com/ervin-khamoido/money-query-parser/releases/tag/v${version}">Release on GitHub <span aria-hidden="true">↗</span></a></div></article>`;
}).join('\n');

rmSync(destination, { recursive: true, force: true });
mkdirSync(join(destination, 'library'), { recursive: true });
for (const file of ['styles.css', 'app.mjs', 'favicon.svg']) cpSync(join(source, file), join(destination, file));
for (const file of readdirSync(join(root, 'dist')).filter((name) => name.endsWith('.js'))) {
  cpSync(join(root, 'dist', file), join(destination, 'library', file));
}
mkdirSync(join(destination, 'examples'), { recursive: true });
const example = readFileSync(join(root, 'examples/transaction-search.mjs'), 'utf8')
  .replace("from 'money-query-parser'", "from '../library/index.js'");
writeFileSync(join(destination, 'examples/transaction-search.mjs'), example);
const html = readFileSync(join(source, 'index.html'), 'utf8')
  .replaceAll('{{VERSION}}', escape(metadata.version))
  .replaceAll('{{SITE_URL}}', escape(metadata.homepage))
  .replace('{{RELEASES}}', notes);
if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('Unresolved site template token.');
writeFileSync(join(destination, 'index.html'), html);
writeFileSync(join(destination, '.nojekyll'), '');
writeFileSync(join(destination, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${metadata.homepage}sitemap.xml\n`);
writeFileSync(join(destination, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(metadata.homepage)}</loc><lastmod>${releases[0][2]}</lastmod></url></urlset>`);
console.log(`Built documentation for ${metadata.name}@${metadata.version} in site/dist.`);
