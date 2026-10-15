import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadOewn, oewnRows, type OewnEntries, type OewnSynsets } from '../src/sources/oewn.ts';
import { SOURCES } from '../src/paths.ts';
import { newStats, type EntryRow } from '../src/rows.ts';

const synsets: OewnSynsets = {
  '01702148-v': {
    definition: ['produce a literary work'],
    example: ['She composed a poem', 'He wrote four novels', 'a third example'],
    members: ['write', 'compose', 'pen', 'indite'],
    partOfSpeech: 'v',
    hypernym: ['01701711-v'],
  },
  '01701711-v': { definition: ['create'], members: ['make', 'create'], partOfSpeech: 'v' },
  '99999999-n': { definition: ['an offensive word'], members: ['badword'], partOfSpeech: 'n', exemplifies: ['07139048-n'] },
  '00000002-a': { definition: ['not heavy'], members: ['light'], partOfSpeech: 'a' },
  '00000001-s': { definition: ['bright'], members: ['light', 'bright'], partOfSpeech: 's' },
};
const entries: OewnEntries = {
  write: {
    v: { sense: [{ id: 'write%2:36:00::', synset: '01702148-v' }], pronunciation: [{ value: 'ɹaɪt' }], form: ['wrote', 'written'] },
  },
  badword: { n: { sense: [{ id: 'badword%1:10:00::', synset: '99999999-n' }] } },
  light: {
    a: { sense: [{ id: 'light%3:00:00::', synset: '00000002-a' }] },
    s: { sense: [{ id: 'light%5:00:00::', synset: '00000001-s' }] },
  },
};

describe('oewnRows', () => {
  it('maps a lemma and part of speech to one row', () => {
    const stats = newStats();
    const rows = [...oewnRows({ entries, synsets }, stats)];
    const write = rows.find((r) => r.headword === 'write');
    expect(write).toEqual<EntryRow>({
      headword: 'write',
      search_key: 'write',
      pos: 'verb',
      root: null,
      gloss: 'produce a literary work',
      sort_order: 0,
      body: {
        v: 1,
        ipa: ['/ɹaɪt/'],
        senses: [{ gloss: 'produce a literary work', examples: [{ text: 'She composed a poem' }, { text: 'He wrote four novels' }] }],
        forms: [
          { label: 'form', form: 'wrote' },
          { label: 'form', form: 'written' },
        ],
        relations: [
          { kind: 'synonyms', words: ['compose', 'pen', 'indite'] },
          { kind: 'hypernyms', words: ['make', 'create'] },
        ],
      },
    });
  });

  it('drops an entry whose senses are all offensive, and counts both', () => {
    const stats = newStats();
    const rows = [...oewnRows({ entries, synsets }, stats)];
    expect(rows.some((r) => r.headword === 'badword')).toBe(false);
    expect(stats.droppedSenses).toBe(1);
    expect(stats.droppedEntries).toBe(1);
    expect(stats.noGlossEntries).toBe(0);
    expect(stats.droppedByReason).toEqual({ 'oewn:obscenity': 1 });
  });

  it('counts an entry whose senses have no synset apart from the filter', () => {
    const stats = newStats();
    const rows = [...oewnRows({ entries: { ghost: { n: { sense: [{ id: 'ghost%1:00:00::', synset: 'missing-n' }] } } }, synsets }, stats)];
    expect(rows).toEqual([]);
    expect(stats).toMatchObject({ droppedSenses: 0, droppedEntries: 0, noGlossEntries: 1 });
  });

  it('merges satellite adjectives into one adjective row', () => {
    const rows = [...oewnRows({ entries, synsets }, newStats())].filter((r) => r.headword === 'light');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body.senses.map((s) => s.gloss)).toEqual(['not heavy', 'bright']);
    expect(rows[0]?.body.relations).toEqual([{ kind: 'synonyms', words: ['bright'] }]);
  });

  it('merges heteronym parts into one row per part of speech', () => {
    const lead: OewnEntries = {
      lead: {
        'n-1': { sense: [{ id: 'lead%1:27:00::', synset: '00000003-n' }], pronunciation: [{ value: 'lɛd' }] },
        'n-2': { sense: [{ id: 'lead%1:04:00::', synset: '00000004-n' }], pronunciation: [{ value: 'liːd' }] },
      },
    };
    const heteronymSynsets: OewnSynsets = {
      '00000003-n': { definition: ['a soft heavy metal'], members: ['lead'], partOfSpeech: 'n' },
      '00000004-n': { definition: ['the position at the front'], members: ['lead'], partOfSpeech: 'n' },
    };
    const rows = [...oewnRows({ entries: lead, synsets: heteronymSynsets }, newStats())];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ headword: 'lead', pos: 'noun' });
    expect(rows[0]?.body.senses.map((s) => s.gloss)).toEqual(['a soft heavy metal', 'the position at the front']);
    expect(rows[0]?.body.ipa).toEqual(['/lɛd/', '/liːd/']);
  });

  it('stops at the limit', () => {
    expect([...oewnRows({ entries, synsets }, newStats(), 1)]).toHaveLength(1);
  });
});

describe.skipIf(!existsSync(SOURCES.oewnZip))('OEWN 2025 source', () => {
  it('builds over 100k rows with write as a verb', { timeout: 120_000 }, () => {
    const stats = newStats();
    const rows = [...oewnRows(loadOewn(SOURCES.oewnZip), stats)];
    expect(rows.length).toBeGreaterThan(100_000);
    expect(rows.every((r) => r.search_key !== '')).toBe(true);
    const write = rows.find((r) => r.headword === 'write' && r.pos === 'verb');
    expect(write?.body.senses.map((s) => s.gloss)).toContain('produce a literary work');
    expect(write?.body.ipa).toContain('/ɹaɪt/');
    expect(write?.body.forms?.map((f) => f.form)).toContain('wrote');
    expect(stats.droppedSenses).toBeGreaterThan(0);
    expect(rows.some((r) => r.headword === 'lead' && r.pos === 'noun')).toBe(true);
    expect(rows.some((r) => r.headword === 'lead' && r.pos === 'verb')).toBe(true);
  });
});
