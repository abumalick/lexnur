import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async checkConnectionsConsistency() { calls.push('consistency'); return { result: false }; }
    async createNCConnection(path: string) {
      calls.push(`create ${path}`);
      return { open: async () => {}, query: async () => ({ values: [] }) };
    }
    async closeNCConnection(path: string) { calls.push(`close ${path}`); }
  },
}));

describe('capacitorDriver', () => {
  beforeEach(() => { calls.length = 0; vi.resetModules(); });

  // After a WebView reload the native plugin still holds the previous page's connections.
  it('reconciles native connections once, before the first open', async () => {
    const { capacitorDriver } = await import('./capacitor-driver');
    await capacitorDriver.open('/a.sqlite');
    await capacitorDriver.open('/b.sqlite');
    expect(calls).toEqual(['consistency', 'create /a.sqlite', 'create /b.sqlite']);
  });
});
