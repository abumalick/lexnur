import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { constants, createZstdCompress } from 'node:zlib';

export interface BuildRecord {
  id: string;
  version: string;
  entry_count: number;
  size_bytes: number;
  installed_size_bytes: number;
  sha256: string;
  source_date: string;
  schema_version?: 1 | 2;
}

export async function compressPackage(
  sqlitePath: string,
  zstPath: string,
): Promise<{ size_bytes: number; installed_size_bytes: number; sha256: string }> {
  const hash = createHash('sha256');
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    },
  });
  await pipeline(
    createReadStream(sqlitePath),
    createZstdCompress({ params: { [constants.ZSTD_c_compressionLevel]: 19, [constants.ZSTD_c_windowLog]: 23 } }),
    tap,
    createWriteStream(zstPath),
  );
  return { size_bytes: statSync(zstPath).size, installed_size_bytes: statSync(sqlitePath).size, sha256: hash.digest('hex') };
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
