import { configure } from './config.js';
import type { ParserConfig } from './config.js';
import type {
  FailedParse,
  MoneyQueryParser,
  MoneyQueryParserOptions,
  ParseErrorCode,
  ParseErrorDetails,
  ParseResult,
  SourceSpan,
} from './types.js';

interface Token {
  readonly text: string;
  readonly start: number;
}

function trim(token: Token): Token {
  return { text: token.text.trim(), start: token.start + token.text.length - token.text.trimStart().length };
}

function span(token: Token): SourceSpan {
  return { start: token.start, end: token.start + token.text.length };
}

function character(text: string, index: number, start: number): SourceSpan {
  const width = index >= text.length ? 0 : (text.codePointAt(index)! > 0xffff ? 2 : 1);
  return { start: start + index, end: start + index + width };
}

function fail(code: ParseErrorCode, message: string, location: SourceSpan, details: ParseErrorDetails = {}): FailedParse {
  return { ok: false, error: { code, message, span: location, details } };
}

type AmountResult = { readonly ok: true; readonly value: string } | FailedParse;

function parseAmount(input: Token, scale: number, currency: string, config: ParserConfig): AmountResult {
  const token = trim(input);
  let unsigned = token.text;
  let unsignedStart = token.start;
  const negative = unsigned.startsWith('-');
  if (negative || unsigned.startsWith('+')) {
    unsigned = unsigned.slice(1);
    unsignedStart += 1;
  }

  const parts = unsigned.split(config.decimalSeparator);
  const integer = parts[0] ?? '';
  const fraction = parts[1] ?? '';
  const decimalIndex = unsigned.indexOf(config.decimalSeparator);
  if (parts.length > 2 || (parts.length === 2 && !/^[0-9]+$/.test(fraction))) {
    const index = parts.length > 2
      ? unsigned.indexOf(config.decimalSeparator, decimalIndex + 1)
      : decimalIndex + 1 + Math.max(0, fraction.search(/[^0-9]/));
    return fail('INVALID_SYNTAX', 'Expected digits after a single decimal separator.', character(unsigned, index, unsignedStart), { expected: 'fraction-digits' });
  }

  const grouped = config.groupSeparator === ' ' ? integer.replace(/[\u00a0\u202f]/g, ' ') : integer;
  let whole = grouped;
  if (config.groupSeparator !== null && grouped.includes(config.groupSeparator)) {
    const groups = grouped.split(config.groupSeparator);
    let offset = 0;
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index]!;
      if (!(index === 0 ? /^[0-9]{1,3}$/ : /^[0-9]{3}$/).test(group)) {
        const location = group.length === 0
          ? character(integer, offset, unsignedStart)
          : { start: unsignedStart + offset, end: unsignedStart + offset + group.length };
        return fail('INVALID_GROUPING', 'Use groups of three digits after the first group.', location, { expected: 'digit-groups-of-three', groupSize: 3 });
      }
      offset += group.length + 1;
    }
    whole = groups.join('');
  }
  if (!/^[0-9]+$/.test(whole)) {
    return fail('INVALID_SYNTAX', 'Expected a signed decimal amount using the configured separators.', character(integer, Math.max(0, integer.search(/[^0-9]/)), unsignedStart), { expected: 'integer-digits' });
  }
  if (fraction.length > scale) {
    return fail('PRECISION_EXCEEDED', `This currency supports at most ${scale} fractional digits; rounding is disabled.`, {
      start: unsignedStart + decimalIndex + 1 + scale,
      end: unsignedStart + decimalIndex + 1 + fraction.length,
    }, { currency, allowedScale: scale === 0 ? 0 : scale, actualScale: fraction.length });
  }

  // Manipulate decimal strings; Number/parseFloat would lose monetary precision.
  const magnitude = (whole + fraction.padEnd(scale, '0')).replace(/^0+/, '') || '0';
  if (magnitude.length > config.maxAmountDigits) {
    return fail('AMOUNT_TOO_LARGE', 'The amount exceeds the configured minor-unit digit limit.', span(token), { limit: config.maxAmountDigits, actual: magnitude.length });
  }
  return { ok: true, value: negative && magnitude !== '0' ? `-${magnitude}` : magnitude };
}

/** Build once per application format; options are validated and snapshotted. */
export function createMoneyQueryParser(options: MoneyQueryParserOptions): MoneyQueryParser {
  const config = configure(options);

  return (input: string): ParseResult => {
    if (input.length > config.maxInputLength) {
      return fail('INPUT_TOO_LONG', 'The query exceeds the configured input length.', { start: config.maxInputLength, end: input.length }, { limit: config.maxInputLength, actual: input.length });
    }
    const lineBreak = /\r\n|[\r\n]/.exec(input);
    if (lineBreak) return fail('INVALID_SYNTAX', 'Queries must be single-line strings.', { start: lineBreak.index, end: lineBreak.index + lineBreak[0].length }, { expected: 'single-line' });
    let expression = trim({ text: input, start: 0 });
    if (expression.text.length === 0) return fail('EMPTY_INPUT', 'Enter an amount or currency.', span(expression), { expected: 'amount-or-currency' });

    let code = config.defaultCurrency;
    let currencySpan = { start: expression.start + expression.text.length, end: expression.start + expression.text.length };
    const currencyOnly = /^[a-z]{3,8}$/i.test(expression.text);
    if (currencyOnly) {
      code = expression.text.toUpperCase();
      currencySpan = span(expression);
    } else {
      const prefix = /^([a-z]{3,8})[ \t\u00a0\u202f]+(.+)$/i.exec(expression.text);
      if (prefix) {
        code = prefix[1]!.toUpperCase();
        currencySpan = { start: expression.start, end: expression.start + prefix[1]!.length };
        expression = { text: prefix[2]!, start: expression.start + expression.text.length - prefix[2]!.length };
        const duplicate = /[ \t\u00a0\u202f]+([a-z]{3,8})$/i.exec(expression.text);
        if (duplicate) {
          return fail('INVALID_SYNTAX', 'Specify a currency once, as a prefix or suffix.', {
            start: expression.start + expression.text.length - duplicate[1]!.length,
            end: expression.start + expression.text.length,
          }, { expected: 'single-currency' });
        }
      } else {
        const suffix = /^(.+?)[ \t\u00a0\u202f]+([a-z]{3,8})$/i.exec(expression.text);
        if (suffix) {
          code = suffix[2]!.toUpperCase();
          currencySpan = { start: expression.start + expression.text.length - suffix[2]!.length, end: expression.start + expression.text.length };
          expression = { text: suffix[1]!, start: expression.start };
        }
      }
    }
    if (code === undefined) {
      return fail('MISSING_CURRENCY', 'Specify a currency or configure defaultCurrency.', currencySpan, { expected: 'currency' });
    }
    const scale = config.currencies.get(code);
    if (scale === undefined) return fail('UNKNOWN_CURRENCY', 'The currency is not configured.', currencySpan, { currency: code });
    const context = { currency: code, scale };
    if (currencyOnly) return { ok: true, query: { kind: 'currency', ...context } };

    if (expression.text.includes('..')) {
      const bounds = expression.text.split('..');
      const separator = expression.text.indexOf('..');
      if (bounds.length !== 2) {
        const extra = expression.start + expression.text.indexOf('..', separator + 2);
        return fail('INVALID_SYNTAX', 'Expected one inclusive range: minimum..maximum.', { start: extra, end: extra + 2 }, { expected: 'single-range' });
      }
      const min = parseAmount({ text: bounds[0]!, start: expression.start }, scale, code, config);
      if (!min.ok) return min;
      const max = parseAmount({ text: bounds[1]!, start: expression.start + separator + 2 }, scale, code, config);
      if (!max.ok) return max;
      if (BigInt(min.value) > BigInt(max.value)) {
        return fail('REVERSED_RANGE', 'The minimum must not exceed the maximum.', span(trim(expression)), { expected: 'ascending-range' });
      }
      return { ok: true, query: { kind: 'range', ...context, min: min.value, max: max.value } };
    }

    const comparison = /^(>=|<=|>|<)\s*(.*)$/.exec(expression.text);
    const operand = comparison
      ? { text: comparison[2]!, start: expression.start + expression.text.length - comparison[2]!.length }
      : expression;
    const amount = parseAmount(operand, scale, code, config);
    if (!amount.ok) return amount;
    if (comparison) {
      const operators = { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' } as const;
      const operator = operators[comparison[1] as keyof typeof operators];
      return { ok: true, query: { kind: 'comparison', ...context, operator, amount: amount.value } };
    }
    return { ok: true, query: { kind: 'exact', ...context, amount: amount.value } };
  };
}
