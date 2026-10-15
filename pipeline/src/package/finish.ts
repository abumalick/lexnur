import { renameSync, rmSync, statSync } from 'node:fs';
import { compactPackage, type CompactOptions, type CompactResult } from './compact.ts';
import { checkSqlite336 } from './sqlite336.ts';
import { verifyCompacted } from './verify.ts';

export interface FinishResult {
  schema_version: 1 | 2;
  plain_bytes: number;
  compact: CompactResult;
  verified_rows: number;
}

// The last pipeline step, after every filter and revision: compacts the plain package at plainPath into
// outPath, keeping the zstd bodies (schema 2) only when they make the installed file smaller than the
// compacted plain layout (schema 1), then runs the round-trip and SQLite 3.36 gates. Removes plainPath.
// `schema` forces one layout (fixtures that must exercise a given reader).
export async function finishPackage(plainPath: string, outPath: string, options: Partial<CompactOptions> = {}, schema?: 1 | 2): Promise<FinishResult> {
  const plain_bytes = statSync(plainPath).size;
  const plainLayout = `${outPath}.schema1`;
  try {
    const a = await compactPackage(plainPath, plainLayout, { ...options, compress: false });
    let compact = a;
    let schema_version: 1 | 2 = 1;
    if (schema !== 1) {
      // Too few bodies to train a dictionary on means zstd cannot pay either: keep schema 1.
      const b = await compactPackage(plainPath, outPath, { ...options, compress: true }).catch((error: Error) => {
        if (schema === 2 || !error.message.includes('nb of samples too low')) throw error;
        return null;
      });
      if (b && (schema === 2 || statSync(outPath).size < statSync(plainLayout).size)) {
        compact = b;
        schema_version = 2;
      }
    }
    if (schema_version === 1) renameSync(plainLayout, outPath);
    const { rows } = await verifyCompacted(plainPath, outPath);
    checkSqlite336(outPath);
    rmSync(plainPath);
    return { schema_version, plain_bytes, compact, verified_rows: rows };
  } finally {
    rmSync(plainLayout, { force: true });
  }
}

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export function describeFinish(f: FinishResult, outPath: string): string {
  const c = f.compact;
  const parts = [`compacted to schema ${f.schema_version}: plain ${mb(f.plain_bytes)} → ${mb(statSync(outPath).size)}`];
  if (c.templated) parts.push(`${c.templated} form-of rows on ${c.templates} templates`);
  if (c.compressed) parts.push(`${c.compressed} zstd bodies ${mb(c.rawBodyBytes)} → ${mb(c.frameBytes)} (dictionary ${c.dictBytes} bytes)`);
  if (c.deduped) parts.push(`${c.deduped} shared bodies`);
  parts.push(`round-trip ${f.verified_rows} rows, SQLite 3.36 ok`);
  return parts.join('; ');
}
