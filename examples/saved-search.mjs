import { createMoneyQueryParser, formatMoneyQuery, validateMoneyQuery } from 'money-query-parser';

const currencies = { EUR: 2, JPY: 0, BTC: 8 };
const parse = createMoneyQueryParser({ currencies });
const initial = parse('-10..20 EUR');
if (!initial.ok) throw new Error(initial.error.message);

// JSON decoding and authorization belong to the host application.
const saved = JSON.stringify(initial.query);
const restored = validateMoneyQuery(JSON.parse(saved), { currencies });
if (restored.ok) {
  console.log('Saved filter:', restored.query);
  console.log('Editable search:', formatMoneyQuery(restored.query));
  console.log('Decimal-comma presentation:', formatMoneyQuery(restored.query, { decimalSeparator: ',' }));
}

const failure = parse('12.345 EUR');
if (!failure.ok) {
  console.log('Diagnostic:', failure.error);
  console.log('Offending text:', '12.345 EUR'.slice(failure.error.span.start, failure.error.span.end));
}
