import { describe, expect, it } from 'vitest';
import { LexnurNativeWeb } from './web';

describe('LexnurNativeWeb', () => {
  it('refuses native-only calls', async () => {
    const web = new LexnurNativeWeb();
    await expect(web.paths()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(web.startInstall()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('reports no jobs and no system colour', async () => {
    const web = new LexnurNativeWeb();
    expect(await web.status()).toEqual({ jobs: [] });
    expect(await web.systemColors()).toEqual({ seed: null });
  });
});
