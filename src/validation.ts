import { boundedInteger, configureCurrencies } from './config.js';
import type {
  MoneyQueryField,
  MoneyQueryValidationErrorCode,
  MoneyQueryValidationOptions,
  MoneyQueryValidationResult,
  ParseErrorDetails,
} from './types.js';

type Failure = Extract<MoneyQueryValidationResult, { ok: false }>;

function fail(code: MoneyQueryValidationErrorCode, path: MoneyQueryField, message: string, details: ParseErrorDetails = {}): Failure {
  return { ok: false, error: { code, path, message, details } };
}

/** Validate an unknown AST and return a clean, independent snapshot. */
export function validateMoneyQuery(value: unknown, options: MoneyQueryValidationOptions = {}): MoneyQueryValidationResult {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Validation options must be an object.');
  }
  const currencies = options.currencies === undefined ? undefined : configureCurrencies(options.currencies);
  const limit = boundedInteger(options.maxAmountDigits === undefined ? 38 : options.maxAmountDigits, 'maxAmountDigits', 1000);

  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return fail('INVALID_QUERY', '$', 'Expected a money query object.');
    }
    // Read each known own data property once. Accessors are not executed, and
    // inherited or extra properties never enter the returned query.
    const field = (name: MoneyQueryField): unknown => {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (descriptor && !Object.hasOwn(descriptor, 'value')) throw new TypeError('Accessor field.');
      return descriptor?.value;
    };
    const kind = field('kind');
    if (kind !== 'exact' && kind !== 'comparison' && kind !== 'range' && kind !== 'currency') {
      return fail('INVALID_KIND', 'kind', 'Expected exact, comparison, range or currency.');
    }
    const currency = field('currency');
    if (typeof currency !== 'string' || currency.length < 3 || currency.length > 8 || !/^[A-Z]+$/.test(currency)) {
      return fail('INVALID_CURRENCY', 'currency', 'Expected a canonical uppercase currency code of 3–8 ASCII letters.');
    }
    if (currencies && !currencies.has(currency)) {
      return fail('UNKNOWN_CURRENCY', 'currency', 'The currency is not configured.', { currency });
    }
    const rawScale = field('scale');
    const scale = rawScale === 0 ? 0 : rawScale;
    if (typeof scale !== 'number' || !Number.isInteger(scale) || scale < 0 || scale > 18) {
      return fail('INVALID_SCALE', 'scale', 'Expected an integer scale between 0 and 18.');
    }
    const configuredScale = currencies?.get(currency);
    const allowedScale = configuredScale === 0 ? 0 : configuredScale;
    if (allowedScale !== undefined && scale !== allowedScale) {
      return fail('SCALE_MISMATCH', 'scale', 'The scale does not match the configured currency.', { currency, allowedScale, actualScale: scale });
    }
    const context = { currency, scale };
    if (kind === 'currency') return { ok: true, query: { kind, ...context } };

    const amount = (name: 'amount' | 'min' | 'max'): { ok: true; value: string } | Failure => {
      const candidate = field(name);
      if (typeof candidate !== 'string') {
        return fail('INVALID_AMOUNT', name, 'Expected a canonical integer string in minor units.');
      }
      const digits = candidate.length - (candidate.startsWith('-') ? 1 : 0);
      if (digits > limit) return fail('AMOUNT_TOO_LARGE', name, 'The amount exceeds the configured digit limit.', { limit, actual: digits });
      if (!/^(0|-?[1-9][0-9]*)$/.test(candidate)) {
        return fail('INVALID_AMOUNT', name, 'Expected a canonical integer string without plus signs, leading zeros or negative zero.');
      }
      return { ok: true, value: candidate };
    };

    if (kind === 'range') {
      const min = amount('min');
      if (!min.ok) return min;
      const max = amount('max');
      if (!max.ok) return max;
      if (BigInt(min.value) > BigInt(max.value)) {
        return fail('REVERSED_RANGE', 'min', 'The minimum must not exceed the maximum.', { expected: 'ascending-range' });
      }
      return { ok: true, query: { kind, ...context, min: min.value, max: max.value } };
    }
    if (kind === 'comparison') {
      const operator = field('operator');
      if (operator !== 'gt' && operator !== 'gte' && operator !== 'lt' && operator !== 'lte') {
        return fail('INVALID_OPERATOR', 'operator', 'Expected gt, gte, lt or lte.');
      }
      const parsed = amount('amount');
      if (!parsed.ok) return parsed;
      return { ok: true, query: { kind, ...context, operator, amount: parsed.value } };
    }
    const parsed = amount('amount');
    if (!parsed.ok) return parsed;
    return { ok: true, query: { kind, ...context, amount: parsed.value } };
  } catch {
    return fail('INVALID_QUERY', '$', 'Query fields must be accessible own data properties.');
  }
}
