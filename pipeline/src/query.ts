import { DatabaseSync } from 'node:sqlite';
import { normalizeKey, parseRootQuery, prefixUpperBound } from '@lexnur/core';

export interface QueryHit {
  headword: string;
  pos: string | null;
  root: string | null;
  gloss: string | null;
}

export function queryPackage(path: string, text: string, limit = 10): QueryHit[] {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const root = parseRootQuery(text);
    if (root) {
      return db
        .prepare('SELECT headword, pos, root, gloss FROM entry WHERE root = ? ORDER BY sort_order, search_key LIMIT ?')
        .all(root, limit) as unknown as QueryHit[];
    }
    const key = normalizeKey(text);
    return db
      .prepare('SELECT headword, pos, root, gloss FROM entry WHERE search_key >= ? AND search_key < ? ORDER BY search_key, sort_order LIMIT ?')
      .all(key, prefixUpperBound(key), limit) as unknown as QueryHit[];
  } finally {
    db.close();
  }
}
