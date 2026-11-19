import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [sourceArgument, destinationArgument] = process.argv.slice(2);
assert.ok(sourceArgument && destinationArgument, 'Usage: node scripts/prepare-github-package.mjs SOURCE NEW_DESTINATION');
const source = resolve(sourceArgument);
const destination = resolve(destinationArgument);
const metadata = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
assert.equal(metadata.name, 'money-query-parser');
assert.equal(metadata.repository.url, 'git+https://github.com/ervin-khamoido/money-query-parser.git');
assert.match(metadata.version, /^\d+\.\d+\.\d+$/);
assert.equal(Object.keys(metadata.dependencies ?? {}).length, 0);

const files = ['config', 'format', 'index', 'parser', 'types', 'validation']
  .flatMap((name) => [`${name}.js`, `${name}.d.ts`]);
assert.deepEqual(readdirSync(join(source, 'dist')).sort(), [...files].sort(), 'Unexpected compiled files.');
// Refuse an existing destination instead of accidentally including stale files.
mkdirSync(destination);
mkdirSync(join(destination, 'dist'));
for (const file of files) copyFileSync(join(source, 'dist', file), join(destination, 'dist', file));
copyFileSync(join(source, 'LICENSE'), join(destination, 'LICENSE'));

const mirror = {
  ...metadata,
  name: '@ervin-khamoido/money-query-parser',
  publishConfig: { registry: 'https://npm.pkg.github.com', access: 'public' },
};
// This is a ready-to-publish artifact; source-only build hooks do not belong here.
delete mirror.scripts;
delete mirror.devDependencies;
writeFileSync(join(destination, 'package.json'), `${JSON.stringify(mirror, null, 2)}\n`);
const notice = `> **GitHub Packages mirror: \`${mirror.name}@${mirror.version}\`.**\n> Configure \`@ervin-khamoido:registry=https://npm.pkg.github.com\`, authenticate with a classic GitHub token with \`read:packages\`, then install \`npm install ${mirror.name}@${mirror.version}\`.\n> Import from \`'${mirror.name}'\` instead of \`'money-query-parser'\` in the examples below. The unscoped npm package remains the recommended, authentication-free installation.\n\n`;
writeFileSync(join(destination, 'README.md'), notice + readFileSync(join(source, 'README.md'), 'utf8'));
console.log(`Prepared ${mirror.name}@${mirror.version}; compiled JavaScript and declarations are unchanged.`);
