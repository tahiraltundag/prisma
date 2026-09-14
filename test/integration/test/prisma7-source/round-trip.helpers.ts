/**
 * The round-trip assertion for the Prisma 7 to Prisma 8 conversion: two
 * serialized Postgres contracts are the same contract when their storage,
 * execution, and profile hashes agree and their domain planes are deeply
 * equal. The domain plane is compared whole because no hash covers it, and
 * it is what `contract.d.ts` and the user's client code see.
 */
import type { Contract } from '@internal/contract/types';
import type { SqlStorage } from '@internal/sql-contract/types';
import { PostgresContractSerializer } from '@internal/target-postgres/runtime';
import { expect } from 'vitest';

interface SerializedPostgresContract {
  readonly profileHash?: unknown;
  readonly domain?: unknown;
  readonly storage?: { readonly storageHash?: unknown };
  readonly execution?: { readonly executionHash?: unknown };
}

function comparablePlanes(contract: Contract) {
  const serialized: SerializedPostgresContract = new PostgresContractSerializer().serializeContract(
    contract as Contract<SqlStorage>,
  );
  return {
    domain: serialized.domain,
    storageHash: serialized.storage?.storageHash,
    executionHash: serialized.execution?.executionHash,
    profileHash: serialized.profileHash,
  };
}

export function expectSameContract(actual: Contract, expected: Contract): void {
  expect(comparablePlanes(actual)).toEqual(comparablePlanes(expected));
}
