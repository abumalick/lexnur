import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { Row, SqlDriver } from './driver';

const sqlite = new SQLiteConnection(CapacitorSQLite);

// A WebView reload (iOS kills the content process under memory pressure) keeps the native plugin and
// its open connections while this module starts empty, so createNCConnection would throw "already
// exists". With no JS connections, the consistency check closes every native one.
let reconciled: Promise<unknown> | null = null;
const reconcile = () => (reconciled ??= sqlite.checkConnectionsConsistency().catch((e) => console.warn('sqlite connection check failed', e)));

// createNCConnection opens the file in place, read-only (C5); a second open of the same path throws,
// which DictionaryStore prevents by keeping one connection per path.
export const capacitorDriver: SqlDriver = {
  async open(path) {
    await reconcile();
    const db = await sqlite.createNCConnection(path, 1);
    await db.open();
    return {
      async query(sql, params = []) { return ((await db.query(sql, params)).values ?? []) as Row[]; },
      async close() { await sqlite.closeNCConnection(path); },
    };
  },
};
