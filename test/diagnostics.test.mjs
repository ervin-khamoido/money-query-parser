import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyQueryParser } from 'money-query-parser';

const currencies = { EUR: 2, JPY: 0 };
const parse = createMoneyQueryParser({ currencies, defaultCurrency: 'EUR' });

const cases = [
  ['12.345 EUR', 'PRECISION_EXCEEDED', 5, 6, '5'],
  ['  EUR >= -12.3456  ', 'PRECISION_EXCEEDED', 15, 17, '56'],
  ['  -10 .. 12.345 EUR  ', 'PRECISION_EXCEEDED', 14, 15, '5'],
  ['EUR\t\u00a0<=\t1.234', 'PRECISION_EXCEEDED', 12, 13, '4'],
  ['1.0 JPY', 'PRECISION_EXCEEDED', 2, 3, '0'],
  ['  1 GBP  ', 'UNKNOWN_CURRENCY', 4, 7, 'GBP'],
  ['  gbp 1  ', 'UNKNOWN_CURRENCY', 2, 5, 'gbp'],
  [' GBP ', 'UNKNOWN_CURRENCY', 1, 4, 'GBP'],
  ['EUR 1 USD', 'INVALID_SYNTAX', 6, 9, 'USD'],
  ['1.2.3', 'INVALID_SYNTAX', 3, 4, '.'],
  ['1.a', 'INVALID_SYNTAX', 2, 3, 'a'],
  ['1.', 'INVALID_SYNTAX', 2, 2, ''],
  ['.5', 'INVALID_SYNTAX', 0, 0, ''],
  ['--1', 'INVALID_SYNTAX', 1, 2, '-'],
  ['💶12', 'INVALID_SYNTAX', 0, 2, '💶'],
  ['1..2..3', 'INVALID_SYNTAX', 4, 6, '..'],
  ['10..', 'INVALID_SYNTAX', 4, 4, ''],
  ['  >=  ', 'INVALID_SYNTAX', 4, 4, ''],
  ['1\r\n2', 'INVALID_SYNTAX', 1, 3, '\r\n'],
  ['  2 .. 1 EUR ', 'REVERSED_RANGE', 2, 8, '2 .. 1'],
  ['', 'EMPTY_INPUT', 0, 0, ''],
  [' \t\u00a0 ', 'EMPTY_INPUT', 4, 4, ''],
];
for (const [input, code, start, end, selection] of cases) {
  test(`diagnostic span: ${JSON.stringify(input)}`, () => {
    const result = parse(input);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
    assert.deepEqual(result.error.span, { start, end });
    assert.equal(input.slice(start, end), selection);
  });
}

test('precision details are structured and do not depend on English messages', () => {
  assert.deepEqual(parse('12.345 EUR').error.details, { currency: 'EUR', allowedScale: 2, actualScale: 3 });
  assert.deepEqual(parse('GBP').error.details, { currency: 'GBP' });
});

test('grouping spans retain offsets through signs, prefix currency and NBSP', () => {
  const grouped = createMoneyQueryParser({ currencies, defaultCurrency: 'EUR', groupSeparator: ',' });
  for (const [input, expected] of [
    ['EUR -1,23.00', { start: 7, end: 9 }],
    ['1,,234', { start: 2, end: 3 }],
    ['1,234,', { start: 6, end: 6 }],
  ]) {
    const result = grouped(input);
    assert.equal(result.error.code, 'INVALID_GROUPING');
    assert.deepEqual(result.error.span, expected);
    assert.equal(result.error.details.groupSize, 3);
  }
  const spaced = createMoneyQueryParser({ currencies, defaultCurrency: 'EUR', decimalSeparator: ',', groupSeparator: ' ' });
  assert.deepEqual(spaced('  EUR 1\u202f23,00').error.span, { start: 8, end: 10 });
});

test('missing currency and resource errors identify the insertion point or offending input', () => {
  const explicit = createMoneyQueryParser({ currencies });
  assert.deepEqual(explicit('  1.25  ').error.span, { start: 6, end: 6 });
  const limited = createMoneyQueryParser({ currencies, defaultCurrency: 'EUR', maxInputLength: 8, maxAmountDigits: 3 });
  assert.deepEqual(limited('123456789').error.span, { start: 8, end: 9 });
  assert.deepEqual(limited('123456789').error.details, { limit: 8, actual: 9 });
  assert.deepEqual(limited('  10 ').error.span, { start: 2, end: 4 });
  assert.deepEqual(limited('  10 ').error.details, { limit: 3, actual: 4 });
});
