<script lang="ts">
  // Times DictionaryStore.suggest() and entry() on packages copied into the packages directory
  // (VITE_SMOKE_STORE: comma-separated relative paths), so a plain and a compacted build of the same
  // dictionary can be compared on a device. Results go to bench-store.json in the app data directory.
  // VITE_SMOKE_STORE=clean deletes the bench packages instead (devicectl cannot delete files on iOS).
  import { onMount } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
  import { LexnurNative } from '@lexnur/native';
  import { DictionaryStore } from '../lib/data/dictionary-store';
  import { capacitorDriver } from '../lib/sql/capacitor-driver';
  import { percentiles, prefixesOf, type Stats } from './bench';

  const WORDS = 60;
  const dataDir = Capacitor.getPlatform() === 'ios' ? Directory.Library : Directory.Data;
  const files = import.meta.env.VITE_SMOKE_STORE!.split(',');
  type Result = { file: string; words: string[]; openMs: number; firstSuggestMs: number; suggest: Stats; firstEntryMs: number; entry: Stats; error?: string };
  const results: Result[] = [];
  let status = $state('starting…');

  const save = () => Filesystem.writeFile({
    path: 'bench-store.json', directory: dataDir, encoding: Encoding.UTF8,
    data: JSON.stringify({ platform: Capacitor.getPlatform(), ua: navigator.userAgent, results }, null, 1),
  });

  const time = async <T,>(f: () => Promise<T>): Promise<[number, T]> => { const t = performance.now(); const r = await f(); return [performance.now() - t, r]; };

  // The same words for every build of a dictionary: evenly spaced search keys, independent of row ids.
  async function wordsOf(path: string): Promise<{ from: string; to: string; words: string[] }> {
    const conn = await capacitorDriver.open(path);
    try {
      const meta = Object.fromEntries((await conn.query("SELECT key, value FROM meta WHERE key IN ('from', 'to')")).map((r) => [r.key, String(r.value)]));
      const n = Number((await conn.query('SELECT count(*) AS n FROM entry'))[0]?.n);
      const words: string[] = [];
      for (let i = 0; i < WORDS; i++) {
        const [r] = await conn.query(`SELECT search_key FROM entry ORDER BY search_key LIMIT 1 OFFSET ${Math.floor(((i + 0.5) * n) / WORDS)}`);
        const w = [...String(r?.search_key ?? '')].slice(0, 8).join('');
        if (w) words.push(w);
      }
      return { from: meta.from!, to: meta.to!, words };
    } finally {
      await conn.close();
    }
  }

  async function bench(file: string): Promise<Result> {
    const { packagesDir } = await LexnurNative.paths();
    const { from, to, words } = await wordsOf(`${packagesDir}/${file}`);
    const store = new DictionaryStore(capacitorDriver, async (rel) => `${packagesDir}/${rel}`);
    const [openMs] = await time(() => store.setInstalled([{ id: 'bench', title: file, from, to, relativePath: file }]));
    if (store.broken.has('bench')) throw new Error(`${file} did not open`);
    const scope = { kind: 'one', id: 'bench' } as const;
    const [firstSuggestMs, first] = await time(() => store.suggest(words[0]!, scope));
    if (!first.items[0]) throw new Error(`${file}: no suggestion for ${words[0]}`);
    const [firstEntryMs] = await time(() => store.entry('bench', first.items[0]!.entryId));
    const s: number[] = [];
    const e: number[] = [];
    for (const w of words) {
      let last = first;
      for (const p of prefixesOf(w)) {
        const [ms, r] = await time(() => store.suggest(p, scope));
        s.push(ms);
        last = r;
      }
      for (const hit of last.items.slice(0, 3)) {
        const [ms, entry] = await time(() => store.entry('bench', hit.entryId));
        if (!entry?.body.senses) throw new Error(`${file}: entry ${hit.entryId} has no senses`);
        e.push(ms);
      }
    }
    await store.close();
    return { file, words, openMs, firstSuggestMs, suggest: percentiles(s), firstEntryMs, entry: percentiles(e) };
  }

  onMount(async () => {
    if (import.meta.env.VITE_SMOKE_STORE === 'clean') {
      const { packagesDir } = await LexnurNative.paths();
      await Filesystem.rmdir({ path: `file://${packagesDir}/bench`, recursive: true }).catch((e) => console.warn(e));
      status = 'cleaned';
      return;
    }
    for (const file of files) {
      status = `benchmarking ${file}…`;
      try {
        results.push(await bench(file));
      } catch (error) {
        results.push({ file, error: String(error) } as Result);
      }
      await save();
    }
    status = 'done';
    await save();
  });
</script>

<main class="smoke">
  <p data-testid="status">{status}</p>
  {#each results as r (r.file)}
    <p>{r.file}: {r.error ?? `suggest p50 ${r.suggest.p50.toFixed(1)} p95 ${r.suggest.p95.toFixed(1)} · entry p50 ${r.entry.p50.toFixed(1)} p95 ${r.entry.p95.toFixed(1)} ms`}</p>
  {/each}
</main>

<style>
  .smoke { padding: calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 8px) 16px 16px; }
</style>
