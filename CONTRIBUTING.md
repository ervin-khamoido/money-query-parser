# Contributing

Use Node.js 22 or newer, then run `npm ci`, `npm run check` and `npm run check:package`.

For a bug report, include the exact input, currency/format configuration, actual result, expected result and Node/compiler version. Use synthetic examples rather than account identifiers or real financial records.

For a change to parsing:

1. Explain the user problem with one accepted example and one rejected example.
2. State whether existing strings change meaning. Interpretation changes can be breaking changes even when TypeScript types stay the same.
3. Update the README grammar/error documentation and add a regression test for the behavior.
4. Keep exact arithmetic, explicit configuration and JSON-safe output intact.
5. Run package verification so exports and declarations remain usable outside this checkout.

Use the formatting in surrounding files: two-space indentation and single-quoted TypeScript/JavaScript strings. Avoid adding a runtime dependency for a behavior the current grammar can express directly.

Backend-specific integrations start as examples. Promote one to the public API only after its schema, validation boundary and compatibility requirements are clear.
