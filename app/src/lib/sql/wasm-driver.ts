import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import type { Row, SqlDriver } from './driver';

let ready: Promise<Sqlite3Static> | null = null;
const init = () => (ready ??= sqlite3InitModule());

// Web fixture mode only: each package lives in memory, deserialized read-only from its bytes.
export function wasmDriver(bytesFor: (location: string) => Uint8Array | undefined): SqlDriver {
  return {
    async open(location) {
      const bytes = bytesFor(location);
      if (!bytes) throw new Error(`no package bytes for ${location}`);
      const sqlite3 = await init();
      const db = new sqlite3.oo1.DB();
      const p = sqlite3.wasm.allocFromTypedArray(bytes);
      const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY;
      db.checkRc(sqlite3.capi.sqlite3_deserialize(db.pointer!, 'main', p, bytes.byteLength, bytes.byteLength, flags));
      return {
        async query(sql, params = []) { return db.exec({ sql, bind: params, rowMode: 'object', returnValue: 'resultRows' }) as Row[]; },
        async close() { db.close(); },
      };
    },
  };
}
