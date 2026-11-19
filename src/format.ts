import { configureSeparators } from './config.js';
import { validateMoneyQuery } from './validation.js';
import type { MoneyQuery, MoneyQueryFormatOptions } from './types.js';

/** Format a validated query as a deterministic, parseable major-unit string. */
export function formatMoneyQuery(query: MoneyQuery, options: MoneyQueryFormatOptions = {}): string {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Format options must be an object.');
  }
  const { decimalSeparator } = configureSeparators(options);
  const checked = validateMoneyQuery(query, options);
  if (!checked.ok) {
    throw new TypeError(`Invalid money query at ${checked.error.path} (${checked.error.code}): ${checked.error.message}`, { cause: checked.error });
  }
  const safe = checked.query;
  const separator = options.groupSeparator ?? null;
  const amount = (minorUnits: string): string => {
    const negative = minorUnits.startsWith('-');
    const magnitude = negative ? minorUnits.slice(1) : minorUnits;
    const padded = magnitude.padStart(safe.scale + 1, '0');
    const integerLength = padded.length - safe.scale;
    let whole = padded.slice(0, integerLength);
    if (separator !== null) {
      const groups: string[] = [];
      const first = whole.length % 3 || 3;
      groups.push(whole.slice(0, first));
      for (let start = first; start < whole.length; start += 3) groups.push(whole.slice(start, start + 3));
      whole = groups.join(separator);
    }
    const fraction = safe.scale === 0 ? '' : decimalSeparator + padded.slice(integerLength);
    return (negative ? '-' : '') + whole + fraction;
  };

  switch (safe.kind) {
    case 'currency': return safe.currency;
    case 'exact': return `${amount(safe.amount)} ${safe.currency}`;
    case 'range': return `${amount(safe.min)}..${amount(safe.max)} ${safe.currency}`;
    case 'comparison': {
      const operators = { gt: '>', gte: '>=', lt: '<', lte: '<=' } as const;
      return `${operators[safe.operator]} ${amount(safe.amount)} ${safe.currency}`;
    }
  }
}
