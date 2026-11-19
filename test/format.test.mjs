import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyQueryParser, formatMoneyQuery, validateMoneyQuery } from 'money-query-parser';

const context = { currency: 'EUR', scale: 2 };
const exact = { kind: 'exact', ...context, amount: '1250' };
for (const [query, expected] of [
  [exact, '12.50 EUR'],
  [{ ...exact, amount: '-1' }, '-0.01 EUR'],
  [{ ...exact, amount: '0' }, '0.00 EUR'],
  [{ ...exact, amount: '900719925474099301' }, '9007199254740993.01 EUR'],
  [{ ...exact, currency: 'JPY', scale: 0, amount: '123' }, '123 JPY'],
  [{ ...exact, currency: 'BTC', scale: 8, amount: '1' }, '0.00000001 BTC'],
  [{ ...exact, currency: 'TST', scale: 18, amount: '-1' }, '-0.000000000000000001 TST'],
  [{ kind: 'range', ...context, min: '-1000', max: '2000' }, '-10.00..20.00 EUR'],
  [{ kind: 'range', ...context, min: '0', max: '0' }, '0.00..0.00 EUR'],
  [{ kind: 'currency', ...context }, 'EUR'],
  ...[['gt', '>'], ['gte', '>='], ['lt', '<'], ['lte', '<=']].map(([operator, symbol]) => [{ kind: 'comparison', ...context, operator, amount: '-1250' }, `${symbol} -12.50 EUR`]),
]) {
  test(`canonical formatting: ${expected}`, () => assert.equal(formatMoneyQuery(query), expected));
}

test('formatting honors explicitly chosen separators, including the exact space variant', () => {
  const query = { ...exact, amount: '-123456789' };
  assert.equal(formatMoneyQuery(query, { groupSeparator: ',' }), '-1,234,567.89 EUR');
  assert.equal(formatMoneyQuery(query, { decimalSeparator: ',', groupSeparator: '.' }), '-1.234.567,89 EUR');
  for (const groupSeparator of [' ', '\u00a0', '\u202f']) {
    assert.equal(formatMoneyQuery(query, { decimalSeparator: ',', groupSeparator }), `-1${groupSeparator}234${groupSeparator}567,89 EUR`);
  }
});

test('formatting rejects invalid ASTs with a structured TypeError cause', () => {
  for (const query of [null, { ...exact, amount: '-0' }, { ...exact, amount: 1250 }, { ...exact, currency: 'eur' }, { kind: 'range', ...context, min: '2', max: '1' }]) {
    assert.throws(() => formatMoneyQuery(query), (error) => error instanceof TypeError && typeof error.cause.code === 'string');
  }
  assert.throws(() => formatMoneyQuery(exact, { currencies: { EUR: 0 } }), (error) => error.cause.code === 'SCALE_MISMATCH');
});

test('invalid format options fail early and source objects are not mutated', () => {
  for (const options of [null, [], { decimalSeparator: ';' }, { decimalSeparator: null }, { groupSeparator: '.' }, { groupSeparator: '*' }, { currencies: {} }, { maxAmountDigits: 0 }]) {
    assert.throws(() => formatMoneyQuery(exact, options), { name: /^(TypeError|RangeError)$/ });
  }
  const frozen = Object.freeze({ ...exact, extra: 'ignored' });
  const options = Object.freeze({ decimalSeparator: ',', groupSeparator: '.' });
  assert.equal(formatMoneyQuery(frozen, options), '12,50 EUR');
  assert.equal(frozen.extra, 'ignored');
});

test('generated round trips cover every scale, filter kind and separator without loss', () => {
  const styles = [{}, { groupSeparator: ',' }, { decimalSeparator: ',', groupSeparator: '.' }, ...[' ', '\u00a0', '\u202f'].map((groupSeparator) => ({ decimalSeparator: ',', groupSeparator }))];
  const amounts = ['0', '1', '-1', '1250', '-900719925474099301', '99999999999999999999999999999999999999'];
  for (let scale = 0; scale <= 18; scale += 1) {
    const currencies = { TST: scale };
    for (const style of styles) {
      const parse = createMoneyQueryParser({ currencies, ...style });
      for (const amount of amounts) {
        const context = { currency: 'TST', scale };
        const queries = [
          { kind: 'exact', ...context, amount },
          ...['gt', 'gte', 'lt', 'lte'].map((operator) => ({ kind: 'comparison', ...context, amount, operator })),
          { kind: 'range', ...context, min: BigInt(amount) < 0n ? amount : '0', max: BigInt(amount) < 0n ? '0' : amount },
          { kind: 'currency', ...context },
        ];
        for (const query of queries) {
          const formatted = formatMoneyQuery(query, { currencies, ...style });
          assert.deepEqual(parse(formatted), { ok: true, query }, formatted);
          assert.deepEqual(validateMoneyQuery(query, { currencies }), { ok: true, query });
          assert.equal(formatMoneyQuery(parse(formatted).query, style), formatted);
        }
      }
    }
  }
});

test('large decimal formatting agrees with independent BigInt division and Intl grouping', () => {
  const values = [0n, 1n, -1n, 900719925474099301n, -99999999999999999999999999999999999999n];
  for (let scale = 0; scale <= 18; scale += 1) {
    const divisor = 10n ** BigInt(scale);
    for (const units of values) {
      const magnitude = units < 0n ? -units : units;
      const whole = new Intl.NumberFormat('en-US').format(magnitude / divisor);
      const fraction = scale === 0 ? '' : '.' + (magnitude % divisor).toString().padStart(scale, '0');
      const expected = `${units < 0n ? '-' : ''}${whole}${fraction} TST`;
      assert.equal(formatMoneyQuery({ kind: 'exact', currency: 'TST', scale, amount: units.toString() }, { groupSeparator: ',' }), expected);
    }
  }
});

test('1000-digit operands round-trip when matching parser resource limits are supplied', () => {
  const query = { kind: 'range', currency: 'TST', scale: 18, min: '-' + '9'.repeat(1000), max: '9'.repeat(1000) };
  assert.throws(() => formatMoneyQuery(query), (error) => error.cause.code === 'AMOUNT_TOO_LARGE');
  const options = { currencies: { TST: 18 }, maxAmountDigits: 1000, groupSeparator: ',' };
  const text = formatMoneyQuery(query, options);
  assert.deepEqual(createMoneyQueryParser({ ...options, maxInputLength: 4096 })(text), { ok: true, query });
});
