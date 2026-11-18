import type { MoneyQueryParserOptions } from './types.js';

export interface ParserConfig {
  readonly currencies: ReadonlyMap<string, number>;
  readonly defaultCurrency: string | undefined;
  readonly decimalSeparator: '.' | ',';
  readonly groupSeparator: '.' | ',' | ' ' | null;
  readonly maxInputLength: number;
  readonly maxAmountDigits: number;
}

function boundedInteger(value: number, name: string, max: number): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(`${name} must be an integer between 1 and ${max}.`);
  }
  return value;
}

export function configure(options: MoneyQueryParserOptions): ParserConfig {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Parser options are required.');
  }
  if (!options.currencies || typeof options.currencies !== 'object' || Array.isArray(options.currencies)) {
    throw new TypeError('currencies must be a non-empty code-to-scale object.');
  }
  const currencies = new Map<string, number>();
  for (const [rawCode, scale] of Object.entries(options.currencies)) {
    if (!/^[a-z]{3,8}$/i.test(rawCode)) {
      throw new TypeError('Currency codes must contain 3–8 ASCII letters.');
    }
    const code = rawCode.toUpperCase();
    if (currencies.has(code)) throw new TypeError(`Duplicate currency: ${code}.`);
    if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
      throw new RangeError(`Scale for ${code} must be an integer between 0 and 18.`);
    }
    currencies.set(code, scale);
  }
  if (currencies.size === 0) throw new TypeError('At least one currency is required.');

  let defaultCurrency: string | undefined;
  if (options.defaultCurrency !== undefined) {
    if (typeof options.defaultCurrency !== 'string') {
      throw new TypeError('defaultCurrency must be a configured currency code.');
    }
    defaultCurrency = options.defaultCurrency.toUpperCase();
    if (!currencies.has(defaultCurrency)) {
      throw new TypeError('defaultCurrency must be a configured currency code.');
    }
  }

  const decimalSeparator = options.decimalSeparator === undefined ? '.' : options.decimalSeparator;
  if (decimalSeparator !== '.' && decimalSeparator !== ',') {
    throw new TypeError('decimalSeparator must be a dot or comma.');
  }
  const rawGroup = options.groupSeparator ?? null;
  const groupSeparator = rawGroup === '\u00a0' || rawGroup === '\u202f' ? ' ' : rawGroup;
  if (groupSeparator !== null && groupSeparator !== '.' && groupSeparator !== ',' && groupSeparator !== ' ') {
    throw new TypeError('Unsupported groupSeparator.');
  }
  if (groupSeparator === decimalSeparator) {
    throw new TypeError('Decimal and grouping separators must differ.');
  }

  return {
    currencies,
    defaultCurrency,
    decimalSeparator,
    groupSeparator,
    maxInputLength: boundedInteger(options.maxInputLength === undefined ? 256 : options.maxInputLength, 'maxInputLength', 4096),
    maxAmountDigits: boundedInteger(options.maxAmountDigits === undefined ? 38 : options.maxAmountDigits, 'maxAmountDigits', 1000),
  };
}
