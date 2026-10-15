<script lang="ts">
  import { onMount } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
  import { TextZoom } from '@capacitor/text-zoom';
  import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
  import { LexnurNative } from '@lexnur/native';
  import InstallProbe from './InstallProbe.svelte';
  import { normalizeKey, prefixUpperBound } from '@lexnur/core';
  import { BENCH_SQL, percentiles, prefixesOf, type Stats } from './bench';

  type Row = { id: number; headword: string; pos: string | null; gloss: string | null };
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const dataDir = Capacitor.getPlatform() === 'ios' ? Directory.Library : Directory.Data;
  let db: SQLiteDBConnection | null = null;
  let status = $state('opening…');
  let native = $state('');
  let query = $state('');
  let rows = $state<Row[]>([]);
  let single = $state<Stats | null>(null);
  let triple = $state<Stats | null>(null);
  let cold = $state<number | null>(null);
  let readOnly = $state<'rejected' | 'unchanged' | 'ACCEPTED' | 'inconclusive' | null>(null);
  let readOnlyError: string | null = null;
  const typing: { value: string; count: number; first: string | null; ms: number; error?: string }[] = [];
  let seq = 0;

  async function run(q: string): Promise<Row[]> {
    const key = normalizeKey(q);
    if (!key || !db) return [];
    const r = await db.query(BENCH_SQL, [key, prefixUpperBound(key)]);
    return (r.values ?? []) as Row[];
  }

  async function onInput(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    query = value;
    const mine = ++seq;
    const t = performance.now();
    try {
      const res = await run(value);
      if (mine !== seq) return;
      rows = res;
      typing.push({ value, count: res.length, first: res[0]?.headword ?? null, ms: performance.now() - t });
    } catch (e) {
      typing.push({ value, count: 0, first: null, ms: performance.now() - t, error: String(e) });
    }
    await save();
  }

  async function workload(callsPerPrefix: number): Promise<Stats> {
    const words = import.meta.env.VITE_SMOKE_DB
      ? ((await import('./bench-words.json')).default as string[])
      : ((await db!.query('SELECT word FROM bench_word')).values ?? []).map((r) => r.word as string);
    const samples: number[] = [];
    for (const w of words) for (const p of prefixesOf(w)) {
      const t = performance.now();
      await Promise.all(Array.from({ length: callsPerPrefix }, () => run(p)));
      samples.push(performance.now() - t);
    }
    return percentiles(samples);
  }

  async function save() {
    const zoom = Capacitor.getPlatform() === 'ios' ? (await TextZoom.getPreferred()).value : null;
    await Filesystem.writeFile({
      path: 'bench-result.json', directory: dataDir, encoding: Encoding.UTF8,
      data: JSON.stringify({ platform: Capacitor.getPlatform(), ua: navigator.userAgent, cold, readOnly, readOnlyError, native, single, triple, typing, zoom }, null, 1),
    });
  }

  const userVersion = async () => ((await db!.query('PRAGMA user_version')).values?.[0]?.user_version ?? null) as number | null;

  // C5 relies on createNCConnection opening read-only. The write goes through query(), which reaches
  // sqlite3 on both platforms; execute()/run() are refused by the plugin's JS flag before SQLite is involved.
  // iOS swallows a non-ROW step result, so a refused write may return no error and leave the value unchanged.
  async function probeReadOnly() {
    const before = await userVersion();
    if (before === null) return 'inconclusive';
    try {
      await db!.query(`PRAGMA user_version = ${before + 1}`);
    } catch (e) {
      readOnlyError = String(e);
    }
    const after = await userVersion();
    if (after !== before) {
      await db!.query(`PRAGMA user_version = ${before}`);
      return 'ACCEPTED';
    }
    if (readOnlyError === null) return 'unchanged';
    return /read-?only|SQLITE_READONLY/i.test(readOnlyError) ? 'rejected' : 'inconclusive';
  }

  onMount(async () => {
    if (Capacitor.getPlatform() === 'ios') await TextZoom.set({ value: (await TextZoom.getPreferred()).value });
    native = JSON.stringify({ ...(await LexnurNative.paths()), ...(await LexnurNative.freeSpace()), ...(await LexnurNative.systemColors()) });
    await save();
    if (import.meta.env.VITE_SMOKE_INSTALL) return;
    const path = import.meta.env.VITE_SMOKE_DB
      ? `${(await LexnurNative.paths()).packagesDir}/${import.meta.env.VITE_SMOKE_DB}`
      : decodeURIComponent((await Filesystem.getUri({ directory: dataDir, path: 'bench/bench.sqlite' })).uri.replace(/^file:\/\//, ''));
    db = await sqlite.createNCConnection(path, 1);
    await db.open();
    readOnly = await probeReadOnly();
    const t = performance.now();
    await run('w');
    cold = performance.now() - t;
    status = 'benchmarking…';
    await save();
    single = await workload(1);
    triple = await workload(3);
    status = 'done';
    await save();
  });
</script>

<main class="smoke">
  {#if import.meta.env.VITE_SMOKE_INSTALL}<InstallProbe />{/if}
  <p data-testid="status">{status}</p>
  <p data-testid="native">{native}</p>
  <input
    type="text" inputmode="text" enterkeyhint="search" autocapitalize="off" autocorrect="off" spellcheck="false"
    dir="auto" aria-label="Search" value={query} oninput={onInput} />
  <p data-testid="readonly">read-only: {readOnly}</p>
  {#if single}<p>1 call: p50 {single.p50.toFixed(1)} · p95 {single.p95.toFixed(1)} · max {single.max.toFixed(1)} ms ({single.count})</p>{/if}
  {#if triple}<p>3 calls: p50 {triple.p50.toFixed(1)} · p95 {triple.p95.toFixed(1)} · max {triple.max.toFixed(1)} ms</p>{/if}
  <ul>
    {#each rows as r (r.id)}
      <li><button type="button" aria-label={[r.headword, r.pos, r.gloss].filter(Boolean).join(', ')}>
        <span dir="auto" class="hw">{r.headword}</span> <span class="pos">{r.pos}</span><br /><span class="gloss">{r.gloss}</span>
      </button></li>
    {/each}
  </ul>
</main>

<style>
  .smoke { padding: calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 8px) 16px 16px; }
  input { width: 100%; box-sizing: border-box; font-size: 17px; min-height: 48px; padding: 0 12px; }
  ul { list-style: none; padding: 0; }
  button { all: unset; display: block; padding: 8px 0; min-height: 48px; width: 100%; }
  .hw { font-size: 1.25rem; font-weight: 600; }
  .gloss, .pos { font-size: 0.875rem; }
</style>
