# Orphan slice: `contract infer` and `db verify` ignore tables that other Prisma versions own

_Hand-off brief, written 2026-09-14 for an implementer who has not seen the `prisma7-contract-source` conversation. Orphan slice: one PR against `main`, no dependency on the project. Linear issue: to be created by the operator; put the ticket in the PR title._

## Outcome

A Postgres database that still carries Prisma 7's migration ledger (`_prisma_migrations`) is handled as a Prisma 8 user expects: `prisma contract infer` writes no model for it, and `prisma db verify` reports nothing about it in either lenient or strict mode. The set of tables to ignore is data supplied by the Postgres facade and passed into the evaluators; no low-level component knows the name `_prisma_migrations`.

The property this preserves: infer and verify stay generic over the schema they are given. What to leave out is an input, decided at the facade, not a rule baked into the family or target evaluators.

## Why

The public guide [Prisma ORM 7 to 8 (PostgreSQL)](https://www.prisma.io/docs/guides/upgrade-prisma-orm/postgresql) tells users, after `contract infer`, to open the file and delete the `PrismaMigrations` model by hand, because infer picked up Prisma 7's ledger table. `projects/prisma-8-rc1/parallel-install.md` notes that strict verification "would flag v7's `_prisma_migrations` table as a foreign object, correctly but unhelpfully." Both are the same gap: nothing tells the evaluators that this table belongs to another tool.

## Design

1. **An ignore list as an evaluator input.** Both evaluators take a list of table names to leave out, matched by exact table name in any schema (Prisma 7 creates the ledger in whichever schema the connection targets). Apply it in one shared place in the SQL family, as a filter over the introspected schema tree before the evaluator reads it, so infer and verify cannot drift apart. The shape of the input is the family's to choose; a `readonly string[]` of table names is enough today, but name it so a later entry (a schema-qualified name, a pattern) is additive.
2. **The facade supplies the list.** `@prisma/orm-postgres`'s `defineConfig` (`packages/3-extensions/postgres/src/config/define-config.ts`) passes `['_prisma_migrations']` through the same path it passes the other target-specific inputs. Follow how `contract infer` reaches `inferPslContract` on the target descriptor through the control client (`packages/1-framework/3-tooling/cli/src/control-api/client.ts`, `packages/2-sql/9-family/src/core/control-instance.ts`, `control-target-descriptor.ts`) and how `db verify` reaches `verifySqlSchemaByDiff` (`packages/2-sql/9-family/src/core/diff/schema-verify.ts`), and thread the list along those paths. No user-facing config option in this slice; record in the PR that exposing an override is a possible follow-up.
3. **Nothing in `packages/1-framework`, `packages/2-sql`, or `packages/3-targets` names the table.** The only occurrence of the string `_prisma_migrations` in production code is in the facade's default list. Grep gate.
4. **Verify semantics.** An ignored table and everything under it (columns, indexes, constraints) is absent from the introspected side before the diff, so strict mode no longer reports it as foreign. A table not on the list is still reported in strict mode; that is the discriminating case.
5. **Infer semantics.** An ignored table produces no model, no comment, no relation stub; foreign keys from other tables into an ignored table, if any exist, are handled the way infer already handles a dangling foreign key (it prints a warning comment on the model that owns the key). Document the ignore in the `contract infer` section of `packages/1-framework/3-tooling/cli/README.md` and wherever `db verify --strict` is documented.

## Test-first

- Unit: the shared filter removes a listed table and its subtree from a schema tree and leaves an unlisted one alone.
- Integration, Postgres (`withDevDatabase` from `@repo/test-utils`, see `test/integration/test/cli.db-sign.e2e.test.ts` for the harness): create a user table and a `_prisma_migrations` table shaped like Prisma 7's (`id varchar(36) primary key, checksum varchar(64), finished_at timestamptz, migration_name varchar(255), logs text, rolled_back_at timestamptz, started_at timestamptz default now(), applied_steps_count integer default 0`); then (a) `contract infer` output contains no `PrismaMigrations` model and no mention of the table; (b) `db verify --strict` against a contract describing only the user table reports zero findings; (c) the same database with an extra unlisted table `_other` makes strict verify report exactly that table, proving the filter is by list and not by prefix. (a) and (b) must be red on the parent commit; quote the failing assertions in the PR.
- The adoption example's database (`examples/prisma7-adoption`, built by a real `prisma7 migrate deploy`) has the ledger; add a strict-mode verify step to its test once the fix is in, asserting zero findings.

## Completed when

- [ ] The three integration cases and the unit test pass; (a) and (b) were red before.
- [ ] `git grep -n '_prisma_migrations' packages/` returns only the facade's default list and documentation.
- [ ] `pnpm --filter` tests, typecheck, lint, and build for every touched package; `pnpm lint:deps`; `pnpm fixtures:check` (infer output for existing fixtures must not change, since none of them has the ledger); root `pnpm typecheck`.
- [ ] CLI README documents the behaviour for both commands.

## Halt conditions

- Threading the list needs a shape change in the framework's control capability types (`packages/1-framework/1-core/framework-components/src/control/control-capabilities.ts`) that breaks another family's descriptor. Report the type and stop; a family-neutral optional field is fine, a required one is not.
- The introspected tree cannot be filtered before the diff without also dropping foreign keys that point into the ignored table from declared tables, and the diff then reports those as missing. Report the case; do not special-case it silently.

## Repo rules that apply

`CLAUDE.md` (pnpm only, never npx, no `any`, no bare casts, tests before implementation, no comments where code can say it), `.agents/rules/running-tests.mdc`, `.agents/rules/git-staging.mdc`, `drive/calibration/failure-modes.md` F3, F13, F14, F16, F24, F25, F28. Commits carry both sign-offs as every commit on this repo's agent branches does.
