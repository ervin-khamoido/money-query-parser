import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script with npm run check:package.');
const temporary = mkdtempSync(join(tmpdir(), 'money-query-consumer-'));
const npm = (args, cwd = root) => execFileSync(process.execPath, [npmCli, ...args], {
  cwd,
  encoding: 'utf8',
  env: { ...process.env, npm_config_cache: join(temporary, 'npm-cache') },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  // Build happens in the npm script. Avoid re-running prepack validation here.
  const report = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary]));
  // npm 12 returns a name-keyed object; earlier versions return an array.
  const packed = Array.isArray(report) ? report[0] : Object.values(report)[0];
  assert.ok(packed && Array.isArray(packed.files), 'Unexpected npm pack report.');
  const allowed = new Set([
    'LICENSE', 'README.md', 'package.json',
    ...['config', 'format', 'index', 'parser', 'types', 'validation'].flatMap((name) => [`dist/${name}.js`, `dist/${name}.d.ts`]),
  ]);
  for (const file of packed.files) assert.ok(allowed.delete(file.path), `Unexpected package file: ${file.path}`);
  assert.equal(allowed.size, 0, `Missing package files: ${[...allowed].join(', ')}`);

  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  npm(['install', join(temporary, packed.filename), '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], temporary);
  const metadata = JSON.parse(readFileSync(join(temporary, 'node_modules/money-query-parser/package.json'), 'utf8'));
  assert.equal(Object.keys(metadata.dependencies ?? {}).length, 0);

  const consumer = `
    import assert from 'node:assert/strict';
    import { createMoneyQueryParser, formatMoneyQuery, validateMoneyQuery } from 'money-query-parser';
    const parse = createMoneyQueryParser({ currencies: { EUR: 2 } });
    const result = parse('9007199254740993.01 EUR');
    assert.deepEqual(result, { ok: true, query: {
      kind: 'exact', currency: 'EUR', scale: 2, amount: '900719925474099301'
    } });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    assert.equal(formatMoneyQuery(result.query), '9007199254740993.01 EUR');
    assert.deepEqual(validateMoneyQuery(result.query, { currencies: { EUR: 2 } }), result);
    assert.deepEqual(parse('12.345 EUR').error.span, { start: 5, end: 6 });
  `;
  writeFileSync(join(temporary, 'consumer.mjs'), consumer);
  execFileSync(process.execPath, ['consumer.mjs'], { cwd: temporary, stdio: 'pipe' });
  writeFileSync(join(temporary, 'consumer.ts'), `
    import { createMoneyQueryParser, formatMoneyQuery, validateMoneyQuery } from 'money-query-parser';
    import type { MoneyQuery } from 'money-query-parser';
    const parse = createMoneyQueryParser({ currencies: { EUR: 2 } });
    const result = parse('12.50 EUR');
    if (result.ok) {
      const query: MoneyQuery = result.query;
      if (query.kind === 'exact') {
        const amount: string = query.amount;
        // @ts-expect-error Public declarations must reject numeric amounts.
        const unsafe: number = query.amount;
      }
    }
    // @ts-expect-error Public declarations must reject numeric input.
    parse(12.50);
    const payload: unknown = {};
    const validated = validateMoneyQuery(payload);
    if (validated.ok) {
      const text: string = formatMoneyQuery(validated.query);
    }
    // @ts-expect-error The published formatter declarations reject unknown payloads.
    formatMoneyQuery(payload);
  `);
  execFileSync(process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022', '--lib', 'ES2022',
    join(temporary, 'consumer.ts'),
  ], { cwd: temporary, stdio: 'pipe' });
  console.log(`Package verified: ${packed.files.length} allowlisted files, ${packed.size} bytes compressed.`);
  console.log('Isolated offline install, ESM import and public TypeScript declarations passed.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
