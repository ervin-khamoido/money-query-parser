# Design decisions

## Problem and boundary

A transaction search box accepts a short human expression; storage expects exact numeric predicates. Interpreting `1,234` as the wrong amount or truncating a large value changes which records appear. The library's job is to make that interpretation deterministic and inspectable.

The public API has a parser factory, an AST validator and an exact formatter. Configuration is application-owned. None calls a provider, queries a database, reads device locale or caches user data.

```text
application currency/format configuration
                    ↓ validated once, copied
search string → length/line validation → currency extraction
                    → exact / comparison / inclusive range
                    → separator and precision validation
                    → canonical minor-unit strings
                    → typed AST or typed error
                                  ↓
                      application-owned backend adapter
```

## 1. Integer strings at the API boundary

`12.50` with scale 2 becomes `1250` through decimal-string concatenation and padding. Using `Math.round(Number(input) * 100)` first loses precision for sufficiently large inputs and can accept malformed input depending on the conversion method.

Public `BigInt` amounts would preserve precision but complicate JSON transport. Integer strings work in HTTP payloads, logs and database bind parameters. Internally, `BigInt` compares range bounds numerically; lexical comparison would order `100` before `20` and mishandle negative values.

The cost is that consumers must not compare amount strings lexicographically or call `Number()` on them without a verified range. The integration example demonstrates explicit `BigInt` conversion. Storage adapters must check their own numeric limits.

## 2. Explicit format over guessing

The parser has one configured decimal separator and optional grouping separator. It never tries several interpretations and chooses one by probability. A banking product can select the format from account/product settings; another product can make the setting explicit in its UI.

Grouping requires groups of three digits. Space variants are normalized only when space grouping is enabled. This accommodates copy/paste from common formatted amounts while keeping the default grammar restrictive. Indian grouping, currency symbols and locale detection would require explicit new rules and tests.

One query cannot change its interpretation halfway through. Mixed-currency ranges and implicit FX conversion are excluded.

## 3. Currency metadata belongs to the application

Currency codes and scales are supplied at construction, with no bundled currency database. This avoids an implicit two-decimal assumption and supports custom units while keeping metadata ownership clear. Configuration accepts 3–8 ASCII-letter codes and scales from 0 to 18; these are library bounds, not a statement about ISO standards.

The private map is copied so later changes to the caller's object do not change an already-created parser. It is not exposed by the API. A map also avoids property-prototype collisions during lookups.

Changing a configured scale can change results. A persisted search should therefore retain its currency/scale interpretation or the host application's configuration version. Migrating stored queries is outside this package.

## 4. Expected input errors are data

Search strings are user input, so malformed amounts return a discriminated result. Invalid construction settings are programmer/configuration errors and throw early. The API requires a string; request body type validation remains the host's responsibility.

Stable error codes and structured details support UI localization. Messages do not echo the full query. Parser failures include half-open UTF-16 source spans in the original input, retaining offsets through trimming, signs, currency extraction and grouping. Empty spans identify insertion points. The metadata fields are optional in the public interface for compatibility with caller-created 0.1 error objects. Multi-error recovery is deferred.

There is no automatic text-search fallback. Otherwise a mistyped amount could silently change search mode and produce surprising results. The host decides how users enter monetary versus free-text searches.

## 5. Bounded work and a small grammar

Raw length is checked before trimming or parsing. Each operand's canonical digit count is checked before constructing a `BigInt` for ordering. Defaults allow a 256-code-unit query and a 38-digit minor-unit magnitude. Configurable upper bounds prevent an integration from accidentally opting into unlimited input.

The parser uses fixed regular expressions and bounded string operations; it does not evaluate input or construct regular expressions from user strings. This is not a benchmark or a formal worst-case complexity proof. The tests exercise limits and deterministic malformed samples.

A parser generator would add machinery without simplifying four expression kinds. A handwritten parser makes the accepted grammar and error precedence easy to inspect. If the language grows to boolean expressions and nested groups, reconsider that choice rather than extending ad hoc splitting indefinitely.

## 6. Separate parsing from execution

The AST describes intent; it has no SQL field names, database connection or tenant identifiers. A PostgreSQL example maps it to a fixed schema using bound parameters and a fixed operator allowlist. Adapters are application-specific and do not belong in the core yet.

Authorization belongs to the backend, regardless of whether the same parser also runs in a browser. A valid filter grants no access to data. A client-supplied AST is untrusted; reparse the string or validate the AST against server rules.

`validateMoneyQuery()` checks a bounded set of own data fields and constructs a clean snapshot. Unknown keys are dropped and required fields cannot come from a prototype or accessor. Validation can check a server currency allowlist and its scale; without that option it validates structure only. It never infers a currency registry from the code. Digit limits precede `BigInt` comparison. Invalid input is a result; invalid configuration throws.

## Formatting and saved searches

`formatMoneyQuery()` first validates its input, then converts integer strings into major-unit text with string slicing and padding. It uses explicit currency suffixes, complete fractional precision and deterministic operator/range spacing. Grouping is optional and follows the same explicit format as parsing. A requested NBSP variant is preserved.

The round-trip contract concerns meaning, not preserving the user's original spelling: `+0012.5 eur` formats as `12.50 EUR`. A clean AST round-trips when parser currency scales, separators and resource limits match. Formatting a 1000-digit range can exceed the parser's default input length, so those custom configurations must raise the matching length limit too. Invalid formatter input throws `TypeError` with a structured validation error as its cause.

## 7. Small distribution, inspectable verification

ESM keeps the published surface simple. A separate CommonJS build is deferred until a consumer needs one. Strict TypeScript uses NodeNext module resolution with explicit `.js` imports and generated declarations. See [TypeScript's module reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html) for the module/declaration contract.

Tests use the [Node test runner](https://nodejs.org/api/test.html), with handpicked regressions, generated inputs and negative type assertions. A separate script uses [npm pack](https://docs.npmjs.com/cli/commands/npm-pack/) to validate what a consumer actually receives. Passing source tests alone would not catch missing declarations or broken exports.

The core has no runtime dependencies. TypeScript is the sole direct development dependency. Runtime/browser behavior, supported TypeScript compiler versions and database execution should gain explicit integration tests before making broader compatibility claims.
