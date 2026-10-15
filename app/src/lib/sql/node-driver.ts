import { DatabaseSync } from 'node:sqlite';
import type { Row, SqlDriver } from './driver';

export const nodeDriver: SqlDriver = {
  async open(location) {
    const db = new DatabaseSync(location, { readOnly: true });
    return {
      async query(sql, params = []) { return db.prepare(sql).all(...params) as Row[]; },
      async close() { db.close(); },
    };
  },
};
