import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = process.argv[2];
if (!baseline) throw new Error('Usage: npm run check:compatibility -- /path/to/money-query-parser-0.1.0.tgz');
// Pin the published baseline before extraction or module execution.
const expected = 'sha512-uTnOrXlsmWebXs8dInV7ybpq7tGLf4sLQhthTcnNYMA3S9dpoxuvvkQ5JwUdY6TYRDGOtv8DrdHt8MgiG9fxsg==';
assert.equal(`sha512-${createHash('sha512').update(readFileSync(baseline)).digest('base64')}`, expected, 'Baseline must be the published 0.1.0 tarball.');
const temporary = mkdtempSync(join(tmpdir(), 'mqp-legacy-'));
try {
  execFileSync('tar', ['-xzf', resolve(baseline), '-C', temporary]);
  const old = await import(pathToFileURL(join(temporary, 'package/dist/index.js')).href);
  const current = await import(pathToFileURL(join(root, 'dist/index.js')).href);
  let seed = 0x51a7;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const inputs = ['', '12.50 EUR', '  EUR >= -12.3456  ', '-10 .. -5', 'EUR 10 USD', '\n', 'EUR\u2028 1', '>=\u2028 12', '1..2..3', '--1', '1,234', '💶12', 'JPY 1.0', 'TST -0'];
  const alphabet = [...'0123456789+-.,<> EURUSDGBPJPYBTC\t\n\r€１２−💶\u00a0\u202f;()'];
  for (let index = 0; index < 10000; index += 1) {
    if (index % 2 === 0) {
      const body = `${next() % 1000000}.${next() % 100000}`;
      const currency = ['EUR', 'JPY', 'BTC', 'GBP', ''][next() % 5];
      const expression = [body, `-${body}`, `>= ${body}`, `${body}..${next() % 1000000}`, `+000${body}`][next() % 5];
      inputs.push(`  ${next() % 2 ? `${currency} ${expression}` : `${expression} ${currency}`}  `);
    } else {
      let input = '';
      const length = next() % 300;
      for (let p = 0; p < length; p += 1) input += alphabet[next() % alphabet.length];
      inputs.push(input);
    }
  }
  const currencies = { EUR: 2, JPY: 0, BTC: 8, TST: -0 };
  const configurations = [
    { currencies, defaultCurrency: 'EUR' },
    { currencies },
    { currencies, defaultCurrency: 'EUR', groupSeparator: ',' },
    { currencies, defaultCurrency: 'EUR', decimalSeparator: ',', groupSeparator: '.' },
    { currencies, defaultCurrency: 'EUR', decimalSeparator: ',', groupSeparator: ' ' },
  ];
  const legacyShape = (result) => result.ok ? result : { ok: false, error: { code: result.error.code, message: result.error.message } };
  let comparisons = 0;
  for (const options of configurations) {
    const before = old.createMoneyQueryParser(options);
    const after = current.createMoneyQueryParser(options);
    for (const input of inputs) {
      assert.deepEqual(legacyShape(after(input)), legacyShape(before(input)), JSON.stringify({ input, options }));
      comparisons += 1;
    }
  }
  console.log(`0.1.0 compatibility passed: ${comparisons} comparisons across ${configurations.length} configurations; ASTs, error codes and messages preserved.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
