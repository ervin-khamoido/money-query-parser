import { createMoneyQueryParser } from '../../src/index.js';
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
