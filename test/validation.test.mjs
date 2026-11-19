import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyQueryParser, validateMoneyQuery } from 'money-query-parser';

const context = { currency: 'EUR', scale: 2 };
const exact = { kind: 'exact', ...context, amount: '1250' };
const currencies = { EUR: 2, JPY: 0, BTC: 8 };

function failure(value, code, path, options) {
  const result = validateMoneyQuery(value, options);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  assert.equal(result.error.path, path);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
}

test('all parser output variants validate and return an independent snapshot', () => {
  const parse = createMoneyQueryParser({ currencies, defaultCurrency: 'EUR' });
  for (const input of ['12.50', '-10..20 EUR', '> 1', '>= 1', '< 1', '<= 1', 'EUR', '1 JPY', '0.00000001 BTC']) {
    const parsed = parse(input);
    assert.equal(parsed.ok, true);
    const result = validateMoneyQuery(parsed.query, { currencies });
    assert.deepEqual(result, parsed);
    assert.notEqual(result.query, parsed.query);
    assert.ok(Object.isFrozen(parsed.query) === false);
  }
  const result = validateMoneyQuery(exact);
  const source = { ...exact };
  const snapshot = validateMoneyQuery(source);
  source.amount = '999';
  assert.equal(snapshot.query.amount, result.query.amount);
  assert.deepEqual(validateMoneyQuery(Object.freeze({ ...exact })), { ok: true, query: exact });
});

for (const value of [null, undefined, false, 1, 1n, 'EUR', Symbol('x'), [], () => exact]) {
  test(`invalid root: ${String(value)}`, () => failure(value, 'INVALID_QUERY', '$'));
}
for (const [value, code, path] of [
  [{}, 'INVALID_KIND', 'kind'],
  [{ ...exact, kind: 'sql' }, 'INVALID_KIND', 'kind'],
  [{ ...exact, currency: 'eur' }, 'INVALID_CURRENCY', 'currency'],
  [{ ...exact, currency: '€' }, 'INVALID_CURRENCY', 'currency'],
  [{ ...exact, currency: 'E'.repeat(10000) }, 'INVALID_CURRENCY', 'currency'],
  [{ ...exact, currency: null }, 'INVALID_CURRENCY', 'currency'],
  [{ ...exact, scale: '2' }, 'INVALID_SCALE', 'scale'],
  [{ ...exact, scale: 1.5 }, 'INVALID_SCALE', 'scale'],
  [{ ...exact, scale: -1 }, 'INVALID_SCALE', 'scale'],
  [{ ...exact, scale: 19 }, 'INVALID_SCALE', 'scale'],
  [{ ...exact, scale: NaN }, 'INVALID_SCALE', 'scale'],
  [{ ...exact, scale: Infinity }, 'INVALID_SCALE', 'scale'],
  [{ kind: 'range', ...context, min: '20', max: '10' }, 'REVERSED_RANGE', 'min'],
  [{ kind: 'range', ...context, min: '-10', max: '-20' }, 'REVERSED_RANGE', 'min'],
  [{ kind: 'range', ...context, min: '900719925474099301', max: '900719925474099300' }, 'REVERSED_RANGE', 'min'],
  [{ kind: 'range', ...context, min: '0' }, 'INVALID_AMOUNT', 'max'],
  [{ kind: 'range', ...context, min: 'x', max: '10' }, 'INVALID_AMOUNT', 'min'],
  [{ kind: 'comparison', ...context, amount: '1', operator: '> 0 OR 1=1' }, 'INVALID_OPERATOR', 'operator'],
  [{ kind: 'comparison', ...context, amount: '1', operator: 'toString' }, 'INVALID_OPERATOR', 'operator'],
]) {
  test(`invalid AST: ${code} at ${path}, ${JSON.stringify(value).slice(0, 80)}`, () => failure(value, code, path));
}

for (const amount of ['', '+1', '01', '-01', '-0', '1.0', '1e2', 'NaN', 'Infinity', ' 1', '١', '１２', 1, 1n, null, undefined, {}]) {
  test(`noncanonical amount: ${String(amount)}`, () => failure({ ...exact, amount }, 'INVALID_AMOUNT', 'amount'));
}

test('allowlist checks both currency and its authoritative scale', () => {
  failure({ ...exact, currency: 'GBP' }, 'UNKNOWN_CURRENCY', 'currency', { currencies });
  failure({ ...exact, scale: 0 }, 'SCALE_MISMATCH', 'scale', { currencies });
  assert.deepEqual(validateMoneyQuery({ ...exact, scale: 0 }).query, { ...exact, scale: 0 });
  assert.deepEqual(validateMoneyQuery(exact, { currencies: { eur: 2 } }).query, exact);
  assert.deepEqual(validateMoneyQuery({ ...exact, scale: 0 }, { currencies }).error.details, { currency: 'EUR', allowedScale: 2, actualScale: 0 });
});

test('a negative zero scale normalizes to JSON-safe zero', () => {
  const result = validateMoneyQuery({ ...exact, scale: -0 });
  assert.equal(result.ok, true);
  assert.ok(Object.is(result.query.scale, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('digit limits apply before numeric comparisons and can be explicitly raised', () => {
  failure({ ...exact, amount: '1'.repeat(1000000) }, 'AMOUNT_TOO_LARGE', 'amount');
  failure(exact, 'AMOUNT_TOO_LARGE', 'amount', { maxAmountDigits: 3 });
  assert.equal(validateMoneyQuery({ ...exact, amount: '-999' }, { maxAmountDigits: 3 }).ok, true);
  assert.equal(validateMoneyQuery({ ...exact, amount: '1'.repeat(1000) }, { maxAmountDigits: 1000 }).ok, true);
  assert.equal(validateMoneyQuery({ kind: 'range', ...context, min: '-900719925474099301', max: '900719925474099301' }).ok, true);
});

test('extra fields and prototype-related payloads are removed from successful output', () => {
  const dirty = JSON.parse('{"kind":"exact","currency":"EUR","scale":2,"amount":"1250","__proto__":{"polluted":true},"operator":"DROP","metadata":"private"}');
  const result = validateMoneyQuery(dirty);
  assert.deepEqual(result, { ok: true, query: exact });
  assert.equal(Object.getPrototypeOf(result.query), Object.prototype);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(validateMoneyQuery({ kind: 'currency', ...context, amount: 'not-an-amount' }).query, { kind: 'currency', ...context });
  failure(Object.create(exact), 'INVALID_KIND', 'kind');
  failure(Object.assign(Object.create({ amount: '1' }), { kind: 'exact', ...context }), 'INVALID_AMOUNT', 'amount');
});

test('accessors are not executed, unknown fields are not inspected, and revoked proxies return failures', () => {
  let reads = 0;
  const dangerous = { ...exact, get amount() { reads += 1; throw new Error('secret'); } };
  failure(dangerous, 'INVALID_QUERY', '$');
  assert.equal(reads, 0);
  const extra = { ...exact, get unused() { throw new Error('unused'); } };
  assert.equal(validateMoneyQuery(extra).ok, true);
  const noGet = new Proxy(exact, { get() { throw new Error('No property reads'); } });
  assert.equal(validateMoneyQuery(noGet).ok, true);
  failure(new Proxy(exact, { getOwnPropertyDescriptor() { throw new Error('secret'); } }), 'INVALID_QUERY', '$');
  const revoked = Proxy.revocable(exact, {});
  revoked.revoke();
  failure(revoked.proxy, 'INVALID_QUERY', '$');
});

test('invalid validation configuration throws instead of masquerading as an input error', () => {
  for (const options of [null, [], { currencies: {} }, { currencies: null }, { currencies: { EUR: 19 } }, { currencies: { EUR: 2, eur: 2 } }, { maxAmountDigits: 0 }, { maxAmountDigits: 1001 }, { maxAmountDigits: null }]) {
    assert.throws(() => validateMoneyQuery(exact, options), { name: /^(TypeError|RangeError)$/ });
  }
});

test('10000 generated unknown payloads produce JSON-safe errors or round-trippable snapshots', async () => {
  const { formatMoneyQuery } = await import('money-query-parser');
  let seed = 0x512ac;
  const choose = (values) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return values[(seed >>> 0) % values.length];
  };
  const parse = createMoneyQueryParser({ currencies });
  for (let index = 0; index < 10000; index += 1) {
    const value = {
      kind: choose(['exact', 'range', 'comparison', 'currency', null, 'other']),
      currency: choose(['EUR', 'JPY', 'BTC', 'eur', null, 12]),
      scale: choose([0, 2, 8, -0, 1.5, -1, 19, null]),
      amount: choose(['0', '1', '-1', '1250', '01', '-0', 1250, null]),
      operator: choose(['gt', 'gte', 'lt', 'lte', 'toString', null]),
      min: choose(['0', '-1', '1250', '01', null]),
      max: choose(['0', '1', '2000', '-0', null]),
      extra: { ignored: true },
    };
    const result = validateMoneyQuery(value, { currencies });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    if (result.ok) {
      assert.ok(!Object.hasOwn(result.query, 'extra'));
      assert.deepEqual(parse(formatMoneyQuery(result.query)), result);
    } else {
      assert.equal(typeof result.error.path, 'string');
    }
  }
});
