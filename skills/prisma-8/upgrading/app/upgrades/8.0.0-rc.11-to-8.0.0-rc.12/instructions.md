---
from: "8.0.0-rc.11"
to: "8.0.0-rc.12"
changes:
  - id: json-default-literal-is-json-text
    summary: |
      A string literal `@default("…")` on a `Json` or `Jsonb` column, or each string element of a list default on a `Json[]`/`Jsonb[]` column, is now read as JSON text; a default that meant the JSON string itself must quote it.
    detection:
      glob: "**/*.prisma"
      matches:
        - '\b(?:Json|Jsonb)(?:\[\])?\??(?:\s+@(?!default\b)\w+(?:\([^)\r\n]*\))?)*\s+@default\(\s*(?:\[\s*)?"'
  - id: scalar-list-fields-keep-type-params
    summary: |
      Emitted `contract.d.ts` now carries `typeParams` on scalar list fields; run `prisma contract emit` once and commit the regenerated artifacts.
    detection:
      glob: "**/contract.json"
      matches:
        - '"many":\s*true'
---

# 8.0.0-rc.11 → 8.0.0-rc.12 — User upgrade instructions

## `json-default-literal-is-json-text`

For every Prisma schema matched by `detection`, decide what each string default on a `Json` or `Jsonb` field means. Before rc.12 the literal was stored as a JSON string: `payload Jsonb @default("{}")` meant the string `"{}"`. From rc.12 the literal is JSON text: `@default("{}")` means the empty object, `@default("[]")` the empty array, and `@default("{\"a\":1}")` the object `{ "a": 1 }`; text that does not parse as JSON fails `prisma contract emit` with `PSL_INVALID_JSON_DEFAULT`. The rule applies per element to a list default on a `Json[]` or `Jsonb[]` field: `tags Jsonb[] @default(["{}"])` now means a list holding the empty object. If the default was meant as the JSON *string* value, wrap it in JSON quotes: change `@default("hello")` to `@default("\"hello\"")` and `@default(["hello"])` to `@default(["\"hello\""])`. If it was meant as the JSON document the text spells, leave it as it is. `dbgenerated("…")` defaults are unaffected. Run `prisma contract emit` afterwards and commit the regenerated `contract.json` and `contract.d.ts`.

## `scalar-list-fields-keep-type-params`

For every project whose `contract.json` matches `detection` (it has at least one scalar list field), run `prisma contract emit` once and commit the regenerated `contract.json` and `contract.d.ts`. Scalar list fields (`String[]`, `VarChar(32)[]`, `pg.enum(Role)[]`, …) now carry the same `typeParams` in the domain plane as the single-valued fields of the same type, so `contract.d.ts` field types gain `readonly typeParams: { … }` where the column has a length, precision, scale, or enum type name, and enum list fields gain their value-set reference in `contract.json`. No source edits are needed; a contract without list fields regenerates unchanged.
