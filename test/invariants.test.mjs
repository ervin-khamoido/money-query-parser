import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyQueryParser } from 'money-query-parser';

// Fixed seed makes failures reproducible without adding a test dependency.
function random(seed) {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

test('2,004 generated Intl-formatted amounts round-trip to the original integer units', () => {
  const next = random(0x51a7);
  for (const [locale, decimalSeparator, groupSeparator] of [
    ['en-US', '.', ','], ['de-DE', ',', '.'], ['fr-FR', ',', ' '],
  ]) {
    for (const scale of [0, 2, 3, 8]) {
      const format = new Intl.NumberFormat(locale, { minimumFractionDigits: scale, maximumFractionDigits: scale });
      const parse = createMoneyQueryParser({ currencies: { TST: scale }, defaultCurrency: 'TST', decimalSeparator, groupSeparator });
      for (let index = 0; index < 167; index += 1) {
        // Keep the oracle's Number arithmetic within a small, precisely recoverable range.
        const units = (next() % 200_000_001) - 100_000_000;
        const input = format.format(units / 10 ** scale);
        const result = parse(input);
        assert.equal(result.ok, true, input);
        assert.equal(result.query.amount, String(units), input);
      }
    }
  }
});

test('generated ranges preserve numeric ordering across signs and safe-integer boundaries', () => {
  const parse = createMoneyQueryParser({ currencies: { TST: 0 }, defaultCurrency: 'TST' });
  const values = [-900719925474099301n, -999n, -1n, 0n, 1n, 999n, 900719925474099301n];
  for (const a of values) {
    for (const b of values) {
      const result = parse(`${a}..${b}`);
      if (a > b) {
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'REVERSED_RANGE');
      } else {
        assert.equal(result.ok, true);
        assert.equal(result.query.min, String(a));
        assert.equal(result.query.max, String(b));
      }
    }
  }
});

test('10,000 generated strings return serializable results without throwing', () => {
  const next = random(0xc0ffee);
  const alphabet = [...'0123456789+-.,<> EURUSD\t\n\r€１２−\u00a0\u202f;()'];
  const parse = createMoneyQueryParser({ currencies: { EUR: 2, USD: 2 }, defaultCurrency: 'EUR' });
  for (let index = 0; index < 10_000; index += 1) {
    const length = next() % 300;
    let input = '';
    for (let position = 0; position < length; position += 1) input += alphabet[next() % alphabet.length];
    const result = parse(input);
    assert.equal(typeof result.ok, 'boolean');
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    if (result.ok) {
      for (const key of ['amount', 'min', 'max']) {
        if (key in result.query) {
          assert.match(result.query[key], /^(0|-?[1-9][0-9]*)$/);
          assert.doesNotThrow(() => BigInt(result.query[key]));
        }
      }
    } else {
      assert.equal(typeof result.error.code, 'string');
    }
  }
});
