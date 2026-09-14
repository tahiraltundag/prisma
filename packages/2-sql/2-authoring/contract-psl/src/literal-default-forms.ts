import type { ColumnDefaultLiteralValue } from '@internal/contract/types';
import type { ExpressionAst } from '@internal/psl-parser/syntax';
import { ArrayLiteralAst, NumberLiteralExprAst } from '@internal/psl-parser/syntax';
import { blindCast } from '@internal/utils/casts';

/**
 * Codecs whose literal `@default` value takes a different form from the PSL
 * token that spells it: an integer literal on a bigint-valued codec is the
 * exact integer. Codec descriptors expose no such discriminator (their traits
 * are equality, order, boolean, numeric, and textual), so the codecs are named
 * here.
 */
const BIGINT_LITERAL_CODEC_IDS: ReadonlySet<string> = new Set([
  'pg/int8@1',
  'pg/unboundedint@1',
  'sqlite/bigint@1',
]);

export type LiteralDefaultForm = 'bigint';

export function literalDefaultForm(codecId: string): LiteralDefaultForm | undefined {
  if (BIGINT_LITERAL_CODEC_IDS.has(codecId)) return 'bigint';
  return undefined;
}

/**
 * Builds the bigint from the number token's source text, never through a JS
 * `number`, which rounds past 2^53. A token that is not a plain integer is
 * left as parsed for the codec to judge.
 */
export function bigintLiteralFromToken(
  expression: ExpressionAst | undefined,
  parsed: ColumnDefaultLiteralValue,
): ColumnDefaultLiteralValue {
  const text =
    expression === undefined
      ? undefined
      : NumberLiteralExprAst.cast(expression.syntax)?.token()?.text;
  if (text === undefined || !/^-?\d+$/.test(text)) return parsed;
  return blindCast<
    ColumnDefaultLiteralValue,
    'the bigint codecs encode a bigint to JSON as decimal text'
  >(BigInt(text));
}

export function listElementExpressions(
  expression: ExpressionAst | undefined,
): readonly ExpressionAst[] | undefined {
  if (expression === undefined) return undefined;
  const array = ArrayLiteralAst.cast(expression.syntax);
  return array === undefined ? undefined : [...array.elements()];
}
