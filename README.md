# money-query-parser

[![CI](https://github.com/ervin-khamoido/money-query-parser/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ervin-khamoido/money-query-parser/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/money-query-parser)](https://www.npmjs.com/package/money-query-parser)

Turn monetary search expressions into exact, typed filters. Zero runtime dependencies. TypeScript declarations included.

```text
"12.50 EUR"       → exact amount: 1250 minor units
"-10..20 EUR"     → inclusive range: -1000 to 2000 minor units
">= 100 EUR"      → comparison: at least 10000 minor units
"USD"            → currency filter
```

Useful for transaction search, invoice dashboards, expense tools and administrative filters where interpreting a monetary amount incorrectly would be worse than asking the user to clarify it.

[Documentation & playground](https://ervin-khamoido.github.io/money-query-parser/) · [npm](https://www.npmjs.com/package/money-query-parser) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/ervin-khamoido/money-query-parser/issues)

## Install

```sh
npm install money-query-parser
```

The 0.x API is intentionally small. Interpretation changes are documented in the changelog; pin a compatible version range and review release notes when upgrading.

### GitHub Packages

The same library is also mirrored to [GitHub Packages](https://github.com/ervin-khamoido/money-query-parser/pkgs/npm/money-query-parser) as `@ervin-khamoido/money-query-parser`. Its compiled JavaScript and TypeScript declarations are checked byte-for-byte against the npm release before publishing.

GitHub requires authentication even for public npm packages. Create a **personal access token (classic)** with `read:packages`, then run:

```sh
npm login --scope=@ervin-khamoido --auth-type=legacy --registry=https://npm.pkg.github.com
# Username: your GitHub username; password: the classic token.
```

In the consuming project's `.npmrc`, add only the scope mapping:

```ini
@ervin-khamoido:registry=https://npm.pkg.github.com
```

```sh
npm install @ervin-khamoido/money-query-parser
```

Use `from '@ervin-khamoido/money-query-parser'` in imports instead of the unscoped name shown below. Choose one distribution per project. Keep tokens in your user-level npm configuration or CI secrets, never in a committed `.npmrc`. See [GitHub's authentication documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry) for GitHub Actions installation with `GITHUB_TOKEN`. Installing from npm above needs no GitHub login.

## Try it

Node.js 22 or newer is supported for development and Node consumers. This is an ESM package; use `import`. The library itself uses standard ECMAScript APIs, with no Node, DOM, network or storage dependency. The documentation playground executes the built library directly in a browser. Automated cross-browser compatibility tests are not included.

From the repository root:

```sh
npm ci
npm run check
npm run demo
npm run demo -- ">= 12.50 EUR"
npm run preview:site
```

The demo prints the parsed filter, matching synthetic transactions and a PostgreSQL `WHERE` clause with bind values. It needs no account, API key, database or service.

To test the package in another project:

```sh
npm pack
# In the consuming project; replace this path with the generated tarball path:
npm install /path/to/money-query-parser-0.2.0.tgz
```

## Usage

```ts
import { createMoneyQueryParser } from 'money-query-parser';

const parse = createMoneyQueryParser({
  currencies: { EUR: 2, USD: 2, JPY: 0, BTC: 8 },
  defaultCurrency: 'EUR',
});

const result = parse('-12.50 EUR');
// {
//   ok: true,
//   query: { kind: 'exact', currency: 'EUR', scale: 2, amount: '-1250' }
// }

if (!result.ok) {
  // Localize errors using error.code. No exception handling needed for strings.
  console.log(result.error.code, result.error.message);
} else {
  // Safe to put in JSON: amount fields are integer strings, not JS bigint.
  console.log(JSON.stringify(result.query));
}
```

Build a parser once per configuration and reuse it. Currency metadata is supplied by your application. This library does not maintain an ISO currency database or infer currency scales from a device's locale.

## Supported expressions

The following examples use `{ currencies: { EUR: 2, USD: 2 }, defaultCurrency: 'EUR' }`.

| Input | Interpretation |
| --- | --- |
| `12`, `12.5`, `+12.50` | Exactly `1200`, `1250`, `1250` minor units |
| `-12.50 EUR` | Exactly `-1250` EUR minor units |
| `EUR 12.50` | Currency prefix; same result as the suffix form |
| `10..20 EUR` | Inclusive range `[1000, 2000]` |
| `-10 .. -5` | Inclusive range `[-1000, -500]` in the default currency |
| `> 10`, `>= 10`, `< 10`, `<= 10` | Strict or inclusive comparisons |
| `USD`, `usd` | Currency-only filter |

Rules:

- Amounts are always entered in **major units**. `1250 EUR` means 1,250 euros, not 12.50 euros.
- A leading ASCII `+` or `-` is supported. Sign is a numeric value; the application decides whether a negative amount means a debit, reversal or another domain concept.
- Specify a currency once, before or after the entire expression, separated by whitespace. Currency codes contain 3–8 ASCII letters and are case-insensitive. Only configured codes are accepted.
- Without an explicit currency, `defaultCurrency` is required. There is no fallback scale of two.
- Ranges have two bounds in the same currency. Equal bounds are valid. Reversed bounds are rejected. Use comparisons for open-ended bounds.
- Leading zeros are removed and negative zero becomes `"0"`. Fractional digits are padded to the configured scale.
- Input is a single line. Surrounding whitespace is trimmed after the input-length check.
- Currency symbols, exponent notation, accounting parentheses, Unicode digits/minus signs, `.5`, `1.`, `= 10` and combined text/amount expressions are outside the grammar.

## Decimal and grouping separators

The default format uses a decimal dot and **disallows grouping**. A default parser rejects `1,234` rather than guessing its meaning.

```ts
const parseEuropean = createMoneyQueryParser({
  currencies: { EUR: 2 },
  defaultCurrency: 'EUR',
  decimalSeparator: ',',
  groupSeparator: '.',
});

parseEuropean('1.234,50');
// { ok: true, query: { kind: 'exact', currency: 'EUR', scale: 2, amount: '123450' } }

parseEuropean('1,234');
// { ok: false, error: { code: 'PRECISION_EXCEEDED', message: ... } }
```

Grouping is opt-in and follows groups of three digits: `1,234,567` is valid with comma grouping; `12,34` is not. An ungrouped integer remains valid. Space grouping accepts ordinary space, NBSP (`U+00A0`) and narrow NBSP (`U+202F`), including mixtures. Tabs are not numeric grouping separators. Indian digit grouping and automatic locale detection are not supported.

Choose the format from explicit product settings, not from a guess based on each query. Changing `decimalSeparator` can change the meaning of the same string.

## Exactness and limits

```ts
parse('9007199254740993.01 EUR');
// amount: '900719925474099301' — preserved beyond Number.MAX_SAFE_INTEGER

parse('1.001 EUR');
// PRECISION_EXCEEDED — no silent rounding

parse('-0.00 EUR');
// amount: '0'
```

Decimal conversion uses string operations. Range ordering uses `BigInt` after length and digit limits have been applied. No amount is converted through `Number`, `parseFloat` or binary floating-point multiplication. Inputs with too many fractional digits are rejected even when the extra digits are zeros (`1.000 EUR`).

| Option | Default | Accepted values |
| --- | --- | --- |
| `currencies` | Required | Non-empty map of code → integer scale, from 0 to 18 |
| `defaultCurrency` | None | A code present in `currencies` |
| `decimalSeparator` | `'.'` | `'.'` or `','` |
| `groupSeparator` | `null` | `null`, `'.'`, `','`, space, NBSP or narrow NBSP; must differ from decimal separator |
| `maxInputLength` | `256` | Integer 1–4096, measured in UTF-16 code units before trimming |
| `maxAmountDigits` | `38` | Integer 1–1000; canonical minor-unit magnitude digits per operand, excluding sign and leading zeros |

Configuration is validated at construction and copied into a private snapshot. Invalid options throw `TypeError` or `RangeError`. String input errors return a failure result. Non-string inputs are outside the API contract.

## Result types

```ts
type MoneyQuery =
  | { kind: 'exact'; currency: string; scale: number; amount: string }
  | { kind: 'comparison'; currency: string; scale: number;
      operator: 'gt' | 'gte' | 'lt' | 'lte'; amount: string }
  | { kind: 'range'; currency: string; scale: number; min: string; max: string }
  | { kind: 'currency'; currency: string; scale: number };

type ParseResult =
  | { ok: true; query: MoneyQuery }
  | { ok: false; error: ParseError };

interface ParseError {
  code: ParseErrorCode;
  message: string;
  span?: { start: number; end: number };
  details?: ParseErrorDetails;
}
```

The actual exported types are readonly. Readonly is a TypeScript constraint; returned objects are not frozen at runtime. `amount`, `min` and `max` are signed, canonical, base-10 integer strings in minor units. `scale` records the interpretation used by the parser.

### Error codes

| Code | Meaning |
| --- | --- |
| `EMPTY_INPUT` | Nothing remains after trimming |
| `INPUT_TOO_LONG` | Raw input exceeds the configured length |
| `UNKNOWN_CURRENCY` | A recognized currency token is not configured |
| `MISSING_CURRENCY` | Neither explicit nor default currency is available |
| `INVALID_SYNTAX` | Input does not match the grammar |
| `INVALID_GROUPING` | Configured grouping is present but malformed |
| `PRECISION_EXCEEDED` | More fractional digits than the currency supports |
| `AMOUNT_TOO_LARGE` | Canonical minor-unit magnitude exceeds the digit limit |
| `REVERSED_RANGE` | Minimum exceeds maximum |

The first detected error is returned. Error messages are English explanations; use codes for UI logic. A word such as `refund` can be interpreted as an unknown currency token. Free-text classification and deciding when to attempt monetary parsing belong to the host application's search UI. Do not silently send every invalid amount to a free-text search, especially after a precision error.

### Source positions and structured details (0.2)

```ts
const result = parse('12.345 EUR');
// {
//   ok: false,
//   error: {
//     code: 'PRECISION_EXCEEDED',
//     message: 'This currency supports at most 2 fractional digits; rounding is disabled.',
//     span: { start: 5, end: 6 },
//     details: { currency: 'EUR', allowedScale: 2, actualScale: 3 }
//   }
// }
```

`span` is a half-open `[start, end)` range in the **original, untrimmed input**, measured in UTF-16 code units. It works with `input.slice(start, end)` and a browser input's `setSelectionRange(start, end)`. It is not a byte offset or a grapheme index. An empty span marks an insertion point, such as a missing operand. Input-length errors mark the excess suffix; reversed ranges mark the range expression.

All parser-created failures include `span` and `details`. These fields remain optional in the exported `ParseError` interface so existing callers can still construct 0.1-compatible error objects. Existing codes and messages are unchanged; exact-object comparisons or snapshots of failures will see the additional properties.

| Error | Details |
| --- | --- |
| `PRECISION_EXCEEDED` | `currency`, `allowedScale`, `actualScale` |
| `UNKNOWN_CURRENCY` | `currency` |
| `INPUT_TOO_LONG`, `AMOUNT_TOO_LARGE` | `limit`, `actual` |
| `INVALID_GROUPING` | `expected: 'digit-groups-of-three'`, `groupSize: 3` |
| Other syntax/range errors | `expected`, describing the expected token or ordering |

## Format a query (0.2)

```ts
import { formatMoneyQuery } from 'money-query-parser';

formatMoneyQuery({
  kind: 'range', currency: 'EUR', scale: 2, min: '-1000', max: '2000',
});
// '-10.00..20.00 EUR'

formatMoneyQuery(
  { kind: 'exact', currency: 'EUR', scale: 2, amount: '123450' },
  { decimalSeparator: ',', groupSeparator: '.' },
);
// '1.234,50 EUR'
```

`formatMoneyQuery(query, options?)` returns a deterministic, parseable string. It writes an explicit uppercase currency suffix, all fractional digits required by `scale`, and a single space after comparison operators. Currency-only queries become the code alone. Formatting never converts money through a JavaScript `number` and never rounds.

Options are `decimalSeparator` (dot by default), `groupSeparator` (disabled by default), plus the validator's optional `currencies` and `maxAmountDigits`. A requested NBSP or narrow NBSP is preserved in the output. Default formatting is a canonical decimal-dot representation; supplying separators produces a representation for that explicit format.

The formatter validates its input defensively. Invalid ASTs throw a `TypeError` whose `cause` contains the validation error (`code`, `path`, `message`, `details`). Invalid configuration throws `TypeError` or `RangeError`. For untrusted input, call `validateMoneyQuery()` first to handle input failures as results.

For a valid, clean AST, `parse(formatMoneyQuery(query))` preserves the query when the parser has matching currency scales, separators and sufficient resource limits. If you opt into 1000-digit operands, also raise the parser's input-length limit; grouping and two range operands increase the formatted length.

## Validate a saved or received AST (0.2)

```ts
import { validateMoneyQuery, formatMoneyQuery } from 'money-query-parser';

const payload: unknown = JSON.parse(
  '{"kind":"exact","currency":"EUR","scale":2,"amount":"1250","label":"ignored"}',
);
const checked = validateMoneyQuery(payload, { currencies: { EUR: 2, JPY: 0 } });

if (checked.ok) {
  // A new object containing only the fields for its query kind.
  console.log(checked.query);
  console.log(formatMoneyQuery(checked.query)); // '12.50 EUR'
} else {
  console.log(checked.error.code, checked.error.path, checked.error.details);
}
```

`validateMoneyQuery(value: unknown, options?)` checks the kind, uppercase currency code, scale, canonical integer strings, comparison operator and range order. It returns `{ ok: true, query }` or `{ ok: false, error: { code, path, message, details } }`, reporting the first error. `path` is a top-level field name or `$` for the whole value.

By default, validation is **structural**: it checks scales 0–18 but does not know which scale your application uses for EUR. Supply `currencies` on the server to enforce both the currency allowlist and its authoritative scale. Lowercase configuration keys are accepted; AST currency values must already be uppercase. `maxAmountDigits` defaults to 38 and accepts 1–1000, excluding sign. A negative zero scale is normalized to numeric zero.

Canonical amount strings permit `"0"`, `"1250"` and `"-1250"`; they reject `"-0"`, `"+1"`, `"01"`, decimals, whitespace and numeric values. Digit limits are checked before range comparisons. Validation does not repair or round amounts.

Only known **own data properties** are read, once each. Inherited fields and accessors cannot supply required values. Extra fields, including prototype-related keys, are discarded. Accessors are not executed; inaccessible/revoked proxies produce `INVALID_QUERY`. The returned AST is a fresh snapshot; neither source objects nor options are mutated. Readonly is a TypeScript guarantee, not runtime freezing.

| Validation code | Meaning |
| --- | --- |
| `INVALID_QUERY` | Not an object, or known fields cannot be read as own data properties |
| `INVALID_KIND` | Unsupported or missing query kind |
| `INVALID_CURRENCY` | Noncanonical or missing currency code |
| `UNKNOWN_CURRENCY` | Currency is absent from the supplied allowlist |
| `INVALID_SCALE` | Scale is not an integer from 0 to 18 |
| `SCALE_MISMATCH` | Scale differs from the supplied currency configuration |
| `INVALID_AMOUNT` | Missing or noncanonical integer-string amount |
| `AMOUNT_TOO_LARGE` | Operand exceeds the configured digit limit |
| `INVALID_OPERATOR` | Comparison operator is not `gt`, `gte`, `lt` or `lte` |
| `REVERSED_RANGE` | Minimum exceeds maximum |

Malformed values return failures. Invalid validation options throw. JSON decoding errors must be handled before AST validation. A valid AST describes a filter; account and tenant authorization still belong to your backend.

## Connect it to your search backend

The [transaction search example](examples/transaction-search.mjs) demonstrates both in-memory matching and compilation to a parameterized PostgreSQL predicate:

```js
const result = parse('10..20 EUR');
if (result.ok) {
  toPostgresWhere(result.query);
  // {
  //   text: 'currency = $1 AND amount_minor BETWEEN $2::numeric AND $3::numeric',
  //   values: ['EUR', '1000', '2000']
  // }
}
```

This is an example for a fixed schema with `currency TEXT` and `amount_minor NUMERIC(38, 0)`, not a public SQL adapter or ORM integration. Its SQL and parameters are tested; queries have not been executed against a real PostgreSQL server. Always bind the values with your database driver. Keep the parser's currency scale consistent with storage. Validate ASTs received from clients; parsing on the server avoids trusting a client-generated filter. Apply authorization and other tenant/account constraints separately.

For Elasticsearch or another backend, compile the same AST into that backend's typed filters. Check the backend's numeric limits before forwarding large amounts: string precision in the parser does not make a floating-point index field exact. This package does not perform FX conversion, execute searches, implement authorization or provide ledger arithmetic.

## Development and verification

```sh
npm run check          # strict type checks, build, runtime and example tests
npm run test:coverage  # optional Node test coverage report
npm run check:package  # real tarball → isolated offline install → import + declarations
npm run check:github-package # scoped mirror → offline install → import + declarations
npm run demo          # end-to-end synthetic search examples
npm run preview:site  # build and serve the documentation locally
```

Tests cover sign/zero normalization, precision boundaries, malformed grouping, range ordering, large integers, configuration snapshots, source positions, untrusted ASTs, parameterized SQL output and public type narrowing. Formatter round trips cover all scales 0–18, filter kinds and separators. Independent formatting checks use `BigInt` division/modulo and `Intl.NumberFormat`; malformed strings and AST cases exercise resource limits, prototypes and accessors. These are deterministic test samples, not an exhaustive proof of correctness.

The [CI workflow](https://github.com/ervin-khamoido/money-query-parser/actions/workflows/ci.yml) checks Node 22, 24 and 26. Package checks inspect an explicit file allowlist, install the actual tarball without registry access, then check ESM imports and the shipped TypeScript declarations in a separate consumer project.

CI also compares the parser with the immutable published 0.1.0 baseline, checking 50,070 cases across five configurations. It compares successful ASTs and existing error codes/messages while allowing the additive diagnostic fields. To reproduce this check locally (requires `tar`):

```sh
npm pack money-query-parser@0.1.0 --ignore-scripts --pack-destination /tmp
npm run check:compatibility -- /tmp/money-query-parser-0.1.0.tgz
```

The baseline integrity hash is verified before extracting or loading its code.

For a short code review, start with [design decisions](docs/design.md), then [the parser](src/parser.ts), [boundary tests](test/parser.test.mjs) and [the integration example](examples/transaction-search.mjs).

## Documentation, releases and contributing

The [documentation website](https://ervin-khamoido.github.io/money-query-parser/) includes a live parser, format presets, shareable examples, API reference and release notes generated from `CHANGELOG.md`. It bundles the same version of the parser built from this repository, with no CDN or external API calls. Run `npm run preview:site` to work on it locally.

See [CONTRIBUTING.md](CONTRIBUTING.md) for grammar-change expectations and [the release guide](docs/releasing.md) for verification, npm trusted publishing and website deployment. Releases are available on [GitHub](https://github.com/ervin-khamoido/money-query-parser/releases), including an [Atom feed](https://github.com/ervin-khamoido/money-query-parser/releases.atom). Scope limitations are listed separately in [the changelog](CHANGELOG.md).

This is an independently implemented, general-purpose library with synthetic examples. No production adoption, performance improvement or user count is claimed for this package.

MIT licensed. See [LICENSE](LICENSE).

Created and maintained by [Ervin Khamoido](https://github.com/ervin-khamoido).
