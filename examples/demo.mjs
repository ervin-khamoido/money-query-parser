import { matches, parse, toPostgresWhere, transactions } from './transaction-search.mjs';
import { formatMoneyQuery, validateMoneyQuery } from 'money-query-parser';

const queries = process.argv.length > 2
  ? [process.argv.slice(2).join(' ')]
  : ['12.50 EUR', '-10..20 EUR', '>= 100 EUR', 'USD', '9007199254740993.01 EUR', '1,234 EUR'];

for (const input of queries) {
  const result = parse(input);
  console.log(`\nInput: ${input}`);
  console.log(JSON.stringify(result, null, 2));
  if (result.ok) {
    console.log('Formatted:', formatMoneyQuery(result.query));
    console.log('Validated snapshot:', validateMoneyQuery(result.query));
    console.log('Matched IDs:', transactions.filter((row) => matches(result.query, row)).map((row) => row.id));
    console.log('PostgreSQL WHERE:', toPostgresWhere(result.query));
  }
}
