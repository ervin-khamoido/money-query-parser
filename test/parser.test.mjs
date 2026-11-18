import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyQueryParser } from 'money-query-parser';

const currencies = { EUR: 2, USD: 2, JPY: 0, KWD: 3, BTC: 8 };
const parse = createMoneyQueryParser({ currencies, defaultCurrency: 'EUR' });
const context = { currency: 'EUR', scale: 2 };

function query(input, parser = parse) {
  const result = parser(input);
  assert.equal(result.ok, true, `${JSON.stringify(input)}: ${JSON.stringify(result)}`);
  return result.query;
}

function error(input, code, parser = parse) {
  const result = parser(input);
  assert.equal(result.ok, false, JSON.stringify(input));
  assert.equal(result.error.code, code, JSON.stringify(input));
  assert.equal(typeof result.error.message, 'string');
}

const exactCases = [
  ['12.50', '1250'], ['EUR 12.50', '1250'], ['12.50 eur', '1250'],
  ['\t+0012.5 EUR\u00a0', '1250'], ['-0.01', '-1'], ['-000.00', '0'],
  ['0', '0'], ['000', '0'], ['12', '1200'], ['-12.50', '-1250'],
  ['9007199254740993.01 EUR', '900719925474099301'],
  ['999999999999999999999999999999999999.99', '99999999999999999999999999999999999999'],
];
for (const [input, amount] of exactCases) {
  test(`exact: ${JSON.stringify(input)}`, () => {
    assert.deepEqual(query(input), { kind: 'exact', ...context, amount });
  });
}

for (const [input, currency, scale, amount] of [
  ['123 JPY', 'JPY', 0, '123'], ['1.234 KWD', 'KWD', 3, '1234'],
  ['0.00000001 BTC', 'BTC', 8, '1'], ['1 USD', 'USD', 2, '100'],
]) {
  test(`currency scale: ${input}`, () => {
    assert.deepEqual(query(input), { kind: 'exact', currency, scale, amount });
  });
}

for (const [token, operator] of [['>', 'gt'], ['>=', 'gte'], ['<', 'lt'], ['<=', 'lte']]) {
  test(`comparison: ${token}`, () => {
    assert.deepEqual(query(`EUR ${token} -12.50`), {
      kind: 'comparison', ...context, operator, amount: '-1250',
    });
  });
}

for (const [input, min, max] of [
  ['10..20', '1000', '2000'], ['-10 .. -5 EUR', '-1000', '-500'],
  ['-0..0', '0', '0'], ['1.20..1.20', '120', '120'],
  ['9007199254740992.99..9007199254740993.01', '900719925474099299', '900719925474099301'],
]) {
  test(`inclusive range: ${input}`, () => {
    assert.deepEqual(query(input), { kind: 'range', ...context, min, max });
  });
}

test('currency-only queries and no-default configuration', () => {
  const explicit = createMoneyQueryParser({ currencies });
  assert.deepEqual(query('usd', explicit), { kind: 'currency', currency: 'USD', scale: 2 });
  assert.deepEqual(query('EUR 1', explicit), { kind: 'exact', ...context, amount: '100' });
  error('1', 'MISSING_CURRENCY', explicit);
});

const invalidCases = [
  ['', 'EMPTY_INPUT'], [' \t\u00a0 ', 'EMPTY_INPUT'], ['GBP', 'UNKNOWN_CURRENCY'],
  ['12 GBP', 'UNKNOWN_CURRENCY'], ['GBP 12', 'UNKNOWN_CURRENCY'],
  ['EUR 10 USD', 'INVALID_SYNTAX'], ['EUR 10 EUR', 'INVALID_SYNTAX'],
  ['12EUR', 'INVALID_SYNTAX'], ['€ 12', 'INVALID_SYNTAX'], ['1,234', 'INVALID_SYNTAX'],
  ['.5', 'INVALID_SYNTAX'], ['1.', 'INVALID_SYNTAX'], ['1.2.3', 'INVALID_SYNTAX'],
  ['1e3', 'INVALID_SYNTAX'], ['Infinity', 'UNKNOWN_CURRENCY'], ['NaN', 'UNKNOWN_CURRENCY'],
  ['--1', 'INVALID_SYNTAX'], ['+ 1', 'INVALID_SYNTAX'], ['−1', 'INVALID_SYNTAX'],
  ['１２', 'INVALID_SYNTAX'], ['1 000', 'INVALID_SYNTAX'], ['(12)', 'INVALID_SYNTAX'],
  ['1.001', 'PRECISION_EXCEEDED'], ['1.000', 'PRECISION_EXCEEDED'], ['1.0 JPY', 'PRECISION_EXCEEDED'],
  ['..10', 'INVALID_SYNTAX'], ['10..', 'INVALID_SYNTAX'], ['1..2..3', 'INVALID_SYNTAX'],
  ['1...2', 'INVALID_SYNTAX'], ['>=1..2', 'INVALID_SYNTAX'], ['2..1', 'REVERSED_RANGE'],
  ['-5..-10', 'REVERSED_RANGE'], ['>=', 'INVALID_SYNTAX'], ['=>1', 'INVALID_SYNTAX'],
  ['=1', 'INVALID_SYNTAX'], ['1\n', 'INVALID_SYNTAX'], ['1\r2', 'INVALID_SYNTAX'],
  ['1; DROP TABLE transactions', 'INVALID_SYNTAX'],
  ['1' + '0'.repeat(36), 'AMOUNT_TOO_LARGE'], ['x'.repeat(257), 'INPUT_TOO_LONG'],
];
for (const [input, code] of invalidCases) {
  test(`failure: ${JSON.stringify(input).slice(0, 65)} → ${code}`, () => error(input, code));
}

test('grouping is opt-in and validated, with explicit decimal format', () => {
  const en = createMoneyQueryParser({ currencies, defaultCurrency: 'EUR', groupSeparator: ',' });
  const de = createMoneyQueryParser({ currencies, defaultCurrency: 'EUR', decimalSeparator: ',', groupSeparator: '.' });
  assert.equal(query('1,234,567.89', en).amount, '123456789');
  assert.equal(query('1.234.567,89', de).amount, '123456789');
  assert.equal(query('1,234', en).amount, '123400');
  error('1,234', 'PRECISION_EXCEEDED', de);
  for (const input of ['12,34', ',123', '1,234,', '1234,567', '1,,234']) error(input, 'INVALID_GROUPING', en);
  error('1.23,456', 'INVALID_SYNTAX', en);
  error('1,2x3', 'INVALID_GROUPING', en);
});

test('space grouping accepts NBSP variants, not tabs or arbitrary whitespace', () => {
  for (const separator of [' ', '\u00a0', '\u202f']) {
    const spaced = createMoneyQueryParser({ currencies, defaultCurrency: 'EUR', decimalSeparator: ',', groupSeparator: separator });
    for (const input of ['1 234,50', '1\u00a0234,50', '1\u202f234,50', '1 234\u202f567,89']) {
      assert.equal(query(input, spaced).amount, input.includes('567') ? '123456789' : '123450');
    }
    error('1\t234,50', 'INVALID_SYNTAX', spaced);
    error('1  234,50', 'INVALID_GROUPING', spaced);
  }
});

test('resource limits are exact and enforced before trimming', () => {
  const limited = createMoneyQueryParser({ currencies, defaultCurrency: 'EUR', maxInputLength: 8, maxAmountDigits: 3 });
  assert.equal(query('9.99', limited).amount, '999');
  assert.equal(query('000.01', limited).amount, '1');
  error('10', 'AMOUNT_TOO_LARGE', limited);
  error('0'.repeat(9), 'INPUT_TOO_LONG', limited);
  error(' '.repeat(9), 'INPUT_TOO_LONG', limited);
  assert.equal(query(' '.repeat(7) + '0', limited).amount, '0');
});

test('configuration is snapshotted and currency codes are case-insensitive', () => {
  const source = { currencies: { eur: 2 }, defaultCurrency: 'eur', decimalSeparator: '.' };
  const local = createMoneyQueryParser(source);
  source.currencies.eur = 0;
  source.defaultCurrency = 'XXX';
  source.decimalSeparator = ',';
  assert.equal(query('1.25', local).amount, '125');
  assert.equal(query('EUR', local).scale, 2);
});

test('custom currency codes do not interact with object prototypes', () => {
  const local = createMoneyQueryParser({ currencies: { tostring: 2 }, defaultCurrency: 'TOSTRING' });
  assert.equal(query('1 TOSTRING', local).amount, '100');
});

for (const options of [
  undefined, null, {}, { currencies: [] }, { currencies: {} },
  { currencies: { '€': 2 } }, { currencies: { EUR: -1 } }, { currencies: { EUR: 19 } },
  { currencies: { EUR: 1.5 } }, { currencies: { EUR: NaN } }, { currencies: { EUR: '2' } },
  { currencies: { EUR: 2, eur: 2 } }, { currencies, defaultCurrency: 'GBP' },
  { currencies, defaultCurrency: 1 }, { currencies, decimalSeparator: ';' }, { currencies, decimalSeparator: null },
  { currencies, groupSeparator: '.' }, { currencies, groupSeparator: '*' },
  { currencies, maxInputLength: 0 }, { currencies, maxInputLength: 4097 }, { currencies, maxInputLength: null },
  { currencies, maxAmountDigits: 0 }, { currencies, maxAmountDigits: Infinity }, { currencies, maxAmountDigits: null },
]) {
  test(`invalid configuration: ${JSON.stringify(options)}`, () => {
    assert.throws(() => createMoneyQueryParser(options), { name: /^(TypeError|RangeError)$/ });
  });
}
