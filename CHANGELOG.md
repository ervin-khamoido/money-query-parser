# Changelog

## 0.2.0 — 2026-11-19

- Parser failures now include half-open UTF-16 source spans and structured details for localization and input highlighting.
- Added `formatMoneyQuery()` for exact, deterministic major-unit expressions with explicit currency, full fractional precision and optional grouping.
- Added `validateMoneyQuery()` for unknown ASTs, optional currency/scale allowlists, canonical amounts, resource limits and clean output snapshots.
- Preserved the 0.1 parsing grammar, successful ASTs, error codes and messages; new diagnostic fields are additive.
- Added round-trip, independent numeric formatting, malformed AST, prototype/accessor, source-position and public declaration checks.
- Updated the playground and documentation for formatting, source highlighting and saved-filter validation.

## 0.1.0 — 2026-11-18

- Exact amounts, four comparisons, inclusive ranges and currency-only filters.
- Explicit currency scales, decimal/group separators and resource limits.
- Canonical integer-string minor units, typed errors and JSON-safe ASTs.
- Synthetic transaction search and parameterized PostgreSQL examples.
- Strict TypeScript, runtime/generated/type tests, CI configuration and isolated tarball verification.
- Documentation website with a live parser, format presets, shareable examples and release notes.

### Deferred

Not implemented: automated cross-browser tests, real database execution tests, CommonJS distribution, automatic locale/currency metadata, free-text classification, currency symbols, multi-currency ranges, FX conversion and public backend adapters.
