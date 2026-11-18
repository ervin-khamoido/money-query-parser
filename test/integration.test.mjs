import assert from 'node:assert/strict';
import test from 'node:test';
import { matches, parse, toPostgresWhere, transactions } from '../examples/transaction-search.mjs';

const cases = [
  ['12.50 EUR', ['refund']], ['USD', ['other-currency']],
  ['-10..20 EUR', ['coffee', 'refund']], ['< 0', ['coffee']],
  ['<= -4.50', ['coffee']], ['> 200', ['large']], ['>= 200', ['invoice', 'large']],
  ['9007199254740993.01', ['large']],
];
for (const [input, ids] of cases) {
  test(`transaction search: ${input}`, () => {
    const result = parse(input);
    assert.equal(result.ok, true);
    assert.deepEqual(transactions.filter((row) => matches(result.query, row)).map((row) => row.id), ids);
  });
}

for (const [input, text, values] of [
  ['EUR', 'currency = $1', ['EUR']],
  ['12.50', 'currency = $1 AND amount_minor = $2::numeric', ['EUR', '1250']],
  ['-1..2', 'currency = $1 AND amount_minor BETWEEN $2::numeric AND $3::numeric', ['EUR', '-100', '200']],
  ...[['>', '>'], ['>=', '>='], ['<', '<'], ['<=', '<=']].map(([token, sql]) => [
    `${token} 9007199254740993.01`, `currency = $1 AND amount_minor ${sql} $2::numeric`, ['EUR', '900719925474099301'],
  ]),
]) {
  test(`parameterized SQL example: ${input}`, () => {
    const result = parse(input);
    assert.equal(result.ok, true);
    assert.deepEqual(toPostgresWhere(result.query), { text, values });
  });
}

test('SQL operator lookup rejects inherited names and arbitrary fragments', () => {
  for (const operator of ['toString', '> 0 OR 1=1']) {
    assert.throws(() => toPostgresWhere({ kind: 'comparison', currency: 'EUR', amount: '1', operator }));
  }
});
