import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

test('documentation build uses the exact library and current changelog version', () => {
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'pipe' });
  const metadata = JSON.parse(readFileSync('package.json', 'utf8'));
  const html = readFileSync('site/dist/index.html', 'utf8');
  assert.ok(html.includes(`v${metadata.version}`));
  assert.ok(html.includes('The first public release'));
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
  for (const file of readdirSync('dist').filter((name) => name.endsWith('.js'))) {
    assert.equal(readFileSync(`site/dist/library/${file}`, 'utf8'), readFileSync(`dist/${file}`, 'utf8'));
  }
  const example = readFileSync('site/dist/examples/transaction-search.mjs', 'utf8');
  assert.match(example, /from '\.\.\/library\/index\.js'/);
  assert.equal(example.replace("from '../library/index.js'", "from 'money-query-parser'"), readFileSync('examples/transaction-search.mjs', 'utf8'));
});
