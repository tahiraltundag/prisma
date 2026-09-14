# Orphan slice: remove `dbgenerated("...")` from Prisma 8 and build the defaults it was standing in for

_Hand-off brief, written 2026-09-14 for an implementer who has not seen the `prisma7-contract-source` conversation. Orphan slice, one PR against `main`, independent of that project except for one file in it. No tracker._

## Outcome

`dbgenerated("...")` is not a Prisma 8 spelling. It is removed from every default-function registry, from `contract infer`'s output, from the Prisma 7 source's rule table, and from the documentation, and every default that real contracts expressed through it is expressed by a first-class Prisma 8 spelling instead. Database expressions get the spelling ADR 129 designed for them, `pg.sql\`...\``, canonicalised and content-addressed, not a raw string.

The rule this enforces, from the operator: Prisma 8 does not carry escape hatches for unimplemented features. A construct the language cannot express is a signal to build the feature, never a reason to accept raw text.

## Why

ADR 167 ("Typed default literal pipeline and extensibility") accepted `dbgenerated(...)` as a temporary escape hatch: "PSL parity for typed literals is deferred; PSL defaults will initially use `dbgenerated(...)`." It was never meant to be a Prisma 8 feature and it is undocumented in the CLI reference. It has since spread: the Postgres and SQLite adapters register it as a default function, `contract infer` emits it for any default it cannot classify, the shipped Supabase contract carries 21 uses, and the new Prisma 7 source maps Prisma 7's own `dbgenerated` onto it.

## Inventory of what depends on it today

- Registries: `packages/3-targets/6-adapters/postgres/src/core/control-mutation-defaults.ts` (`dbgeneratedSig`, `lowerDbgenerated`, registry entry) and `packages/3-targets/6-adapters/sqlite/src/core/control-mutation-defaults.ts` (same, plus a `NOW_SYNONYMS` rewrite that only exists to canonicalise `dbgenerated("CURRENT_TIMESTAMP")`).
- Infer: `packages/3-targets/3-targets/postgres/src/core/psl-infer/postgres-default-mapping.ts` maps `gen_random_uuid()` to `dbgenerated` and uses it as the fallback for every unclassified default; `infer-model-blocks.ts` mentions it for list defaults.
- Shipped contract: `packages/3-extensions/supabase/src/contract/contract.prisma`, 21 uses: `gen_random_uuid()` (10), JSON literals `'{}'::jsonb` (3) and `'[]'::jsonb` (1), enum literal casts such as `'confidential'::auth.oauth_client_type` and `'STANDARD'::storage.buckettype` (6), and one arithmetic expression `(now() + '00:03:00'::interval)`.
- Prisma 7 source: `packages/2-sql/2-authoring/contract-prisma7/src/defaults.ts` maps Prisma 7's `@default(dbgenerated("expr"))` to a raw expression default; fixtures under that package and `test/integration/test/fixtures/prisma7-source/{reference,supported,supported-verify}/schema.prisma` use `gen_random_uuid()` through it.
- Family: `packages/2-sql/9-family/src/core/migrations/contract-to-schema-ir.ts` comments describe the "function call that is actually a literal" case the normalisers exist for.
- Docs: `packages/2-sql/2-authoring/contract-psl/README.md` lists it as a storage default; ADR 167; `docs/releases/v0.16.0.md`; `skills/prisma-8/upgrading/extension/upgrades/0.15-to-0.16/instructions.md`.

## The replacement: ADR 129 template-tagged literals

Prisma 8 already has the design for opaque textual payloads in PSL: ADR 129 "Template-Tagged Literals for Extensions" (`docs/architecture docs/adrs/`), accepted and never implemented. A qualified tag followed by a backtick literal, no interpolation, canonicalised by the core, routed to the pack that owns the tag, stored with a `bodyHash` that participates in diffing. A database-expression default is spelled:

```prisma
@default(pg.sql`(now() + '00:03:00'::interval)`)
```

This is the feature `dbgenerated` was standing in for, and this slice builds it. Two facts from the code shape the work:

- Prisma 8 already carries opaque target SQL in three places, all content-addressed under ADR 234 and ADR 244 (`@@index(expression:, where:)`, `@@check(expression:)`, Postgres RLS `using:`/`withCheck:`), but all three were built as plain string arguments rather than ADR 129 literals. Column defaults are the only raw-SQL site compared by normalised text. ADR 129's "single mechanism" claim is currently false; this slice decides, in its ADR amendment, whether those three surfaces migrate to tagged literals now or in a follow-up, and states it.
- TypeScript authoring's `.defaultSql(expression)` (`packages/2-sql/2-authoring/contract-ts/src/contract-dsl.ts:320-324`) produces the same `{ kind: 'function', expression }` arm. It becomes the TS form of the same tagged-literal node, with the same canonicalisation and hash.

## Design

1. **Named storage default functions replace raw expressions for database functions.** A default that is a database function call gets a registered name in the target that owns it, the way `now()` and `autoincrement()` already are: Postgres gains `gen_random_uuid()` as a storage default function (lowered to the same column default, verified equal against the live `gen_random_uuid()` by the existing normaliser). Add others only when a shipped contract or fixture needs them, each with a test.
2. **Typed literal defaults replace literal casts.** A JSON column takes `@default("{}")` and `@default("[]")` (a string literal on a `Json`/`Jsonb` column, lowered through the column's codec to the JSON literal default the contract already models; verify already reads `'{}'::jsonb` back as a literal). An enum column takes the bare member, `@default(confidential)`, for domain enums and native enums alike; confirm the native-enum path (`packages/3-targets/3-targets/postgres/src/core/authoring.ts`) and add the test if it is missing. This is the ADR 167 "typed literal defaults in PSL" work, scoped to what the inventory needs.
3. **Tagged-literal defaults (ADR 129).** Tokenizer and parser support for `<pack>[.<flavor>]` followed by a backtick literal, with the canonicalisation rules and limits ADR 129 lists; the `TaggedLiteral` AST node it defines; routing by tag prefix to the owning pack at emit time; a Postgres `pg.sql` tag whose validation is "a single SQL expression, no semicolon"; lowering to a column default stored with the canonical body and `bodyHash`; migration renders the body verbatim as `DEFAULT (<body>)`; verify compares by hash under the ADR 234/244 wire-name rule, with the introspected side canonicalised the same way. Language server: language injection by tag and diagnostics spanning the literal, per ADR 129 § Editor integration; the formatter never touches literal interiors. `.defaultSql` produces the same node. An ADR amendment records what was built, that `dbgenerated` is gone, and the position on the three string-argument surfaces. The one Supabase default `(now() + '00:03:00'::interval)` is regenerated as `@default(pg.sql\`...\`)`.
4. **Remove the function.** Delete the `dbgenerated` entries and helpers from both registries and the SQLite `NOW_SYNONYMS` rewrite that served it (a `CURRENT_TIMESTAMP` live default still verifies against `now()` through the introspection-side parser; keep that side). An authored `@default(dbgenerated(...))` then fails with the existing `PSL_UNKNOWN_DEFAULT_FUNCTION` diagnostic; give that diagnostic a hint naming the replacement spellings above.
5. **Infer prints the new spellings.** `postgres-default-mapping.ts` maps `gen_random_uuid()` to `@default(gen_random_uuid())`, JSON and enum literals to their typed spellings, and everything else to `@default(pg.sql\`<expression>\`)`. The family's `// Raw default:` comment fallback (`packages/2-sql/9-family/src/core/psl-contract-infer/default-mapping.ts:15-31`) becomes unreachable on Postgres and is removed if no other target reaches it. Regenerate the Supabase contract through `contract infer` (the pack has a generation script) so the diff is exactly the 21 sites.
6. **The Prisma 7 source stops accepting it.** `defaults.ts` maps Prisma 7's `dbgenerated("gen_random_uuid()")` to the named function, a literal cast to the typed literal, and anything else to a new hard error `PRISMA7_DBGENERATED_UNSUPPORTED` whose message shows the expression and says Prisma 8 has no raw-expression defaults. Update that package's fixtures, the three Prisma 7 reference schemas (keep `gen_random_uuid()`, it now maps cleanly), and the package README.
7. **Docs.** Remove every mention as an accepted spelling; add the named function and the typed literals to the contract-psl README and the CLI reference; amend ADR 167's PSL-parity note to record that the escape hatch was removed and what replaced it; add an upgrade instruction under `skills/prisma-8/upgrading/` for users whose contracts carry `dbgenerated`, with the mechanical rewrite for the three shapes and the "no spelling" case.

## Test-first

- Registry: `@default(dbgenerated("x"))` is rejected with the hinted diagnostic on Postgres and SQLite (red before removal is not meaningful; instead assert the hint text).
- Named function: a PSL contract with `@default(gen_random_uuid())` emits, migrates onto `withDevDatabase`, and `db verify` reports zero findings; the same column introspected by `contract infer` prints `@default(gen_random_uuid())`.
- Typed literals: `Json @default("{}")`, `Jsonb @default("[]")`, and an enum member default on both a domain enum and a native enum, each emitted, migrated, verified with zero findings, and round-tripped through infer to the same spelling. These are red before item 2 exists; quote the failing diagnostic.
- Tagged literal: a PSL contract with `@default(pg.sql`(now() + '00:03:00'::interval)`)` parses with the literal's span, emits with the canonical body and hash, migrates onto `withDevDatabase`, verifies with zero findings, and round-trips through infer to the same spelling; `${` inside the literal is a diagnostic at the literal's span; a body with a semicolon is rejected by the `pg.sql` tag's validation; a multi-line body dedents per ADR 129.
- Supabase: `pnpm --filter @internal/extension-supabase test` green and the regenerated contract differs from the old one at exactly the 21 sites (plus the one dropped default).
- Prisma 7 source: fixtures for the three mappings and the new error; `pnpm --filter integration-tests test prisma7-source cli-journeys/prisma7-source` green; `examples/prisma7-adoption` test green.

## Completed when

- [ ] `git grep -n dbgenerated packages examples test docs skills` returns only the ADR 167 amendment, the upgrade instruction, and the Prisma 7 source's error path and its fixtures.
- [ ] All tests above pass; `pnpm test:packages`, `pnpm test:integration`, `pnpm fixtures:check` (expect the Supabase contract and any fixture that carried `dbgenerated` to change, nothing else), `pnpm lint:deps`, `pnpm lint:docs`, root typecheck.
- [ ] Artefact-format rule: a contract JSON produced before this change that carries a `{ kind: 'function', expression }` default still loads; the loader is unchanged, only the PSL spelling is gone. State this in the PR with the test that shows it (the Supabase pack's previous `contract.json` is a real snapshot to load).

## Halt conditions

- A shipped contract or example carries a default that none of items 1 to 3 covers and is not the interval expression. List it and stop.
- The typed-literal lowering for JSON or enum needs a change to the contract's `ColumnDefault` shape. Report the shape; the artefact-format rule applies.
- The SQLite side has a default only `dbgenerated` could express in a committed fixture. List it and stop.

## Repo rules that apply

`CLAUDE.md`, `.agents/rules/running-tests.mdc`, `.agents/rules/git-staging.mdc`, `.agents/rules/contract-default-values.mdc`, `.agents/rules/no-backward-compatibility.mdc` (no shim that keeps `dbgenerated` parsing), `drive/calibration/failure-modes.md` F3, F12 (exhaustive doc sweep), F13, F14, F25, F28, and `drive/calibration/dod.md` § Project-DoD "Artefact-format changes load the previous format". Commits carry both sign-offs as every commit on this repo's agent branches does.
