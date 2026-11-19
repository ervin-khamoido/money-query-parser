import { createMoneyQueryParser, formatMoneyQuery, validateMoneyQuery } from '../../src/index.js';
import type { MoneyQuery, ParseErrorCode } from '../../src/index.js';

const parse = createMoneyQueryParser({ currencies: { EUR: 2 }, decimalSeparator: ',' });
const result = parse('>= 12,50 EUR');
if (result.ok) {
  const query: MoneyQuery = result.query;
  if (query.kind === 'exact' || query.kind === 'comparison') {
    const amount: string = query.amount;
    void amount;
    // @ts-expect-error Amounts deliberately cannot be treated as JS numbers.
    const unsafe: number = query.amount;
    void unsafe;
  }
  // @ts-expect-error The discriminated union requires narrowing before reading range bounds.
  void query.min;
} else {
  const code: ParseErrorCode = result.error.code;
  void code;
  // @ts-expect-error Failures have no query.
  void result.query;
}
// @ts-expect-error Callers must pass strings, never pre-rounded numbers.
parse(12.50);
// @ts-expect-error A currency scale must be a number.
createMoneyQueryParser({ currencies: { EUR: '2' } });
// @ts-expect-error Only supported separators are accepted.
createMoneyQueryParser({ currencies: { EUR: 2 }, decimalSeparator: ';' });

const payload: unknown = { kind: 'exact', currency: 'EUR', scale: 2, amount: '1250' };
const validated = validateMoneyQuery(payload, { currencies: { EUR: 2 } });
if (validated.ok) {
  const formatted: string = formatMoneyQuery(validated.query, { decimalSeparator: ',' });
  void formatted;
  // @ts-expect-error Validation output is readonly.
  validated.query.currency = 'USD';
} else {
  const path: string = validated.error.path;
  void path;
  // @ts-expect-error A failed validation does not contain a query.
  void validated.query;
}
// @ts-expect-error Unknown input must be validated before formatting.
formatMoneyQuery(payload);
// @ts-expect-error Decimal amount numbers are not canonical minor-unit strings.
formatMoneyQuery({ kind: 'exact', currency: 'EUR', scale: 2, amount: 1250 });
// @ts-expect-error Only dot/comma decimal separators are supported.
formatMoneyQuery({ kind: 'currency', currency: 'EUR', scale: 2 }, { decimalSeparator: ';' });
