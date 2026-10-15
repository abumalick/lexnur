import { hexToBytes, type BodyDecoder } from './zstd.ts';

// Package reading shared by the app and the pipeline's round-trip check, so both decode a body the same way.
export const SUPPORTED_SCHEMA_VERSIONS = [1, 2] as const;
export type SchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];
export const isSupportedSchema = (v: unknown): v is SchemaVersion => SUPPORTED_SCHEMA_VERSIONS.includes(Number(v) as SchemaVersion);

export const ENTRY_SQL: Record<SchemaVersion, string> = {
  1: 'SELECT id, headword, pos, root, body FROM entry WHERE id = ?',
  2: 'SELECT e.id, e.headword, e.pos, e.root, e.body, hex(coalesce(e.z, r.z)) AS z FROM entry e LEFT JOIN entry r ON r.id = e.zref WHERE e.id = ?',
};
export const BODY_DICT_SQL = 'SELECT hex(data) AS data FROM body_dict WHERE id = 1';

export function entryBodyText(row: Record<string, unknown>, decoder: BodyDecoder | null): string {
  if (row.body !== null && row.body !== undefined) return String(row.body);
  if (!decoder || typeof row.z !== 'string' || row.z === '') throw new Error(`entry ${String(row.id)} has no body`);
  return decoder.decode(hexToBytes(row.z));
}

export const COLS = 'id, headword, pos, root, gloss, search_key, sort_order';

// Headword-prefix suggestions; alias rows (same headword and pos, or gloss when pos is null) show once.
export const prefixSql = (limit: number) => `SELECT ${COLS} FROM entry e WHERE search_key >= ? AND search_key < ?
      AND NOT EXISTS (SELECT 1 FROM entry p WHERE p.search_key = e.search_key AND p.headword = e.headword AND p.pos IS e.pos AND (e.pos IS NOT NULL OR p.gloss IS e.gloss)
        AND (p.sort_order < e.sort_order OR (p.sort_order = e.sort_order AND p.id < e.id)))
      ORDER BY search_key, sort_order, id LIMIT ${Math.floor(limit)}`;
