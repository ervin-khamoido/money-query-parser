import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'money-query-github-'));
const mirror = join(temporary, 'package');
try {
  execFileSync(process.execPath, [join(root, 'scripts/prepare-github-package.mjs'), root, mirror], { stdio: 'inherit' });
  for (const file of readdirSync(join(root, 'dist'))) {
    assert.deepEqual(readFileSync(join(root, 'dist', file)), readFileSync(join(mirror, 'dist', file)));
  }
  const original = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const metadata = JSON.parse(readFileSync(join(mirror, 'package.json'), 'utf8'));
  assert.equal(metadata.version, original.version);
  assert.deepEqual(metadata.exports, original.exports);
  assert.equal(metadata.publishConfig.registry, 'https://npm.pkg.github.com');
  assert.equal(metadata.scripts, undefined);
  execFileSync(process.execPath, [join(root, 'scripts/check-package.mjs'), mirror], { stdio: 'inherit' });
  console.log('GitHub Packages mirror: byte-identical library, scoped ESM import and declarations passed.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
