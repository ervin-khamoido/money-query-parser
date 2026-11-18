import { configure } from './config.js';
import type { ParserConfig } from './config.js';
import type {
  FailedParse,
  MoneyQueryParser,
  MoneyQueryParserOptions,
  ParseErrorCode,
  ParseResult,
} from './types.js';

function fail(code: ParseErrorCode, message: string): FailedParse {
  return { ok: false, error: { code, message } };
}

type AmountResult = { readonly ok: true; readonly value: string } | FailedParse;

function parseAmount(input: string, scale: number, config: ParserConfig): AmountResult {
  let unsigned = input.trim();
  const negative = unsigned.startsWith('-');
  if (negative || unsigned.startsWith('+')) unsigned = unsigned.slice(1);

  const parts = unsigned.split(config.decimalSeparator);
  const integer = parts[0] ?? '';
  const fraction = parts[1] ?? '';
  if (parts.length > 2 || (parts.length === 2 && !/^[0-9]+$/.test(fraction))) {
    return fail('INVALID_SYNTAX', 'Expected digits after a single decimal separator.');
  }

  const grouped = config.groupSeparator === ' ' ? integer.replace(/[\u00a0\u202f]/g, ' ') : integer;
  let whole = grouped;
  if (config.groupSeparator !== null && grouped.includes(config.groupSeparator)) {
    const groups = grouped.split(config.groupSeparator);
    if (!/^[0-9]{1,3}$/.test(groups[0] ?? '') || !groups.slice(1).every((group) => /^[0-9]{3}$/.test(group))) {
      return fail('INVALID_GROUPING', 'Use groups of three digits after the first group.');
    }
    whole = groups.join('');
  }
  if (!/^[0-9]+$/.test(whole)) {
    return fail('INVALID_SYNTAX', 'Expected a signed decimal amount using the configured separators.');
  }
  if (fraction.length > scale) {
    return fail('PRECISION_EXCEEDED', `This currency supports at most ${scale} fractional digits; rounding is disabled.`);
  }

  // Manipulate decimal strings; Number/parseFloat would lose monetary precision.
  const magnitude = (whole + fraction.padEnd(scale, '0')).replace(/^0+/, '') || '0';
  if (magnitude.length > config.maxAmountDigits) {
    return fail('AMOUNT_TOO_LARGE', 'The amount exceeds the configured minor-unit digit limit.');
  }
  return { ok: true, value: negative && magnitude !== '0' ? `-${magnitude}` : magnitude };
}

/** Build once per application format; options are validated and snapshotted. */
export function createMoneyQueryParser(options: MoneyQueryParserOptions): MoneyQueryParser {
  const config = configure(options);

  return (input: string): ParseResult => {
    if (input.length > config.maxInputLength) {
      return fail('INPUT_TOO_LONG', 'The query exceeds the configured input length.');
    }
    if (/[\r\n]/.test(input)) return fail('INVALID_SYNTAX', 'Queries must be single-line strings.');
    let expression = input.trim();
    if (expression.length === 0) return fail('EMPTY_INPUT', 'Enter an amount or currency.');

    let code = config.defaultCurrency;
    const currencyOnly = /^[a-z]{3,8}$/i.test(expression);
    if (currencyOnly) {
      code = expression.toUpperCase();
      expression = '';
    } else {
      const prefix = /^([a-z]{3,8})[ \t\u00a0\u202f]+(.+)$/i.exec(expression);
      if (prefix) {
        code = prefix[1]!.toUpperCase();
        expression = prefix[2]!;
        if (/[ \t\u00a0\u202f]+[a-z]{3,8}$/i.test(expression)) {
          return fail('INVALID_SYNTAX', 'Specify a currency once, as a prefix or suffix.');
        }
      } else {
        const suffix = /^(.+?)[ \t\u00a0\u202f]+([a-z]{3,8})$/i.exec(expression);
        if (suffix) {
          expression = suffix[1]!;
          code = suffix[2]!.toUpperCase();
        }
      }
    }
    if (code === undefined) {
      return fail('MISSING_CURRENCY', 'Specify a currency or configure defaultCurrency.');
    }
    const scale = config.currencies.get(code);
    if (scale === undefined) return fail('UNKNOWN_CURRENCY', 'The currency is not configured.');
    const context = { currency: code, scale };
    if (currencyOnly) return { ok: true, query: { kind: 'currency', ...context } };

    if (expression.includes('..')) {
      const bounds = expression.split('..');
      if (bounds.length !== 2) return fail('INVALID_SYNTAX', 'Expected one inclusive range: minimum..maximum.');
      const min = parseAmount(bounds[0]!, scale, config);
      if (!min.ok) return min;
      const max = parseAmount(bounds[1]!, scale, config);
      if (!max.ok) return max;
      if (BigInt(min.value) > BigInt(max.value)) {
        return fail('REVERSED_RANGE', 'The minimum must not exceed the maximum.');
      }
      return { ok: true, query: { kind: 'range', ...context, min: min.value, max: max.value } };
    }

    const comparison = /^(>=|<=|>|<)\s*(.*)$/.exec(expression);
    const amount = parseAmount(comparison ? comparison[2]! : expression, scale, config);
    if (!amount.ok) return amount;
    if (comparison) {
      const operators = { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' } as const;
      const operator = operators[comparison[1] as keyof typeof operators];
      return { ok: true, query: { kind: 'comparison', ...context, operator, amount: amount.value } };
    }
    return { ok: true, query: { kind: 'exact', ...context, amount: amount.value } };
  };
}
