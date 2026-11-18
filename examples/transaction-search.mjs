// This is an integration example, not part of the library's public API.
import { createMoneyQueryParser } from 'money-query-parser';

export const parse = createMoneyQueryParser({
  currencies: { EUR: 2, USD: 2, JPY: 0, BTC: 8 },
  defaultCurrency: 'EUR',
});

export const transactions = [
  { id: 'coffee', currency: 'EUR', minorUnits: '-450' },
  { id: 'refund', currency: 'EUR', minorUnits: '1250' },
  { id: 'invoice', currency: 'EUR', minorUnits: '20000' },
  { id: 'other-currency', currency: 'USD', minorUnits: '1250' },
  { id: 'large', currency: 'EUR', minorUnits: '900719925474099301' },
];

export function matches(query, transaction) {
  if (transaction.currency !== query.currency) return false;
  if (query.kind === 'currency') return true;
  const amount = BigInt(transaction.minorUnits);
  if (query.kind === 'exact') return amount === BigInt(query.amount);
  if (query.kind === 'range') return amount >= BigInt(query.min) && amount <= BigInt(query.max);
  const target = BigInt(query.amount);
  switch (query.operator) {
    case 'gt': return amount > target;
    case 'gte': return amount >= target;
    case 'lt': return amount < target;
    case 'lte': return amount <= target;
    default: throw new TypeError('Unsupported comparison.');
  }
}

/**
 * Fixed schema: transactions(currency TEXT, amount_minor NUMERIC(38, 0)).
 * Bind values with your PostgreSQL driver; never concatenate user input.
 * Only pass successful parser output. Validate ASTs received over a network.
 */
export function toPostgresWhere(query) {
  const currency = 'currency = $1';
  if (query.kind === 'currency') return { text: currency, values: [query.currency] };
  if (query.kind === 'exact') {
    return { text: `${currency} AND amount_minor = $2::numeric`, values: [query.currency, query.amount] };
  }
  if (query.kind === 'range') {
    return {
      text: `${currency} AND amount_minor BETWEEN $2::numeric AND $3::numeric`,
      values: [query.currency, query.min, query.max],
    };
  }
  const operators = { gt: '>', gte: '>=', lt: '<', lte: '<=' };
  if (!Object.hasOwn(operators, query.operator)) throw new TypeError('Unsupported comparison.');
  return {
    text: `${currency} AND amount_minor ${operators[query.operator]} $2::numeric`,
    values: [query.currency, query.amount],
  };
}
