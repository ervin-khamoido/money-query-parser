/** Application-owned currency codes and their number of fractional digits. */
export interface MoneyQueryParserOptions {
  readonly currencies: Readonly<Record<string, number>>;
  readonly defaultCurrency?: string;
  readonly decimalSeparator?: '.' | ',';
  /** A space accepts ordinary, non-breaking and narrow non-breaking spaces. */
  readonly groupSeparator?: '.' | ',' | ' ' | '\u00a0' | '\u202f' | null;
  /** UTF-16 code units, before trimming. Default: 256. Maximum: 4096. */
  readonly maxInputLength?: number;
  /** Canonical minor-unit magnitude digits per operand. Default: 38. */
  readonly maxAmountDigits?: number;
}

interface CurrencyContext {
  readonly currency: string;
  readonly scale: number;
}

/** All amount strings are signed, canonical base-10 integers in minor units. */
export type MoneyQuery =
  | (CurrencyContext & { readonly kind: 'exact'; readonly amount: string })
  | (CurrencyContext & {
      readonly kind: 'comparison';
      readonly operator: 'gt' | 'gte' | 'lt' | 'lte';
      readonly amount: string;
    })
  | (CurrencyContext & {
      readonly kind: 'range';
      readonly min: string;
      readonly max: string;
    })
  | (CurrencyContext & { readonly kind: 'currency' });

export type ParseErrorCode =
  | 'EMPTY_INPUT'
  | 'INPUT_TOO_LONG'
  | 'UNKNOWN_CURRENCY'
  | 'MISSING_CURRENCY'
  | 'INVALID_SYNTAX'
  | 'INVALID_GROUPING'
  | 'PRECISION_EXCEEDED'
  | 'AMOUNT_TOO_LARGE'
  | 'REVERSED_RANGE';

export interface ParseError {
  readonly code: ParseErrorCode;
  readonly message: string;
}

export type FailedParse = { readonly ok: false; readonly error: ParseError };
export type ParseResult =
  | { readonly ok: true; readonly query: MoneyQuery }
  | FailedParse;

/** Invalid search strings return a failure; invalid configuration throws. */
export type MoneyQueryParser = (input: string) => ParseResult;
