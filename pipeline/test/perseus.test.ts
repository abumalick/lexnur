import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveMembers, parseXml, perseusEntries, readArchiveMember, tidy, type XmlNode } from '../src/sources/perseus.ts';
import { tempDir } from './tmp.ts';

const sample = readFileSync(new URL('./data/salmone-sample.xml', import.meta.url), 'utf8');

describe('perseusEntries', () => {
  it('yields each entryFree with the n of its enclosing root div2', () => {
    const entries = [...perseusEntries(sample)];
    expect(entries).toHaveLength(23);
    expect(entries[0]).toMatchObject({ root: "'bb", key: 'A^ab~a', type: 'main' });
    expect(entries[0]!.xml).toMatch(/^<entryFree[\s\S]*<\/entryFree>$/);
    expect(entries.find((e) => e.key === 'A^aronab')?.root).toBe("'rn");
    expect(entries.at(-1)?.root).toBe('wdn');
  });

  it('gives an empty key and type for a bare entryFree and a null root outside a div2', () => {
    const [entry] = [...perseusEntries('<body><entryFree><form><orth lang="ar">kat~aba</orth></form></entryFree></body>')];
    expect(entry).toEqual({ root: null, key: '', type: '', xml: '<entryFree><form><orth lang="ar">kat~aba</orth></form></entryFree>' });
  });
});

describe('parseXml', () => {
  it('builds a tree, decodes entities and tolerates self-closing and stray closing tags', () => {
    const root = parseXml('<a x="1">one &amp; <b lang="ar">two</b><pb n="3" /></c>three &gt;</a>');
    const a = root.children[0] as XmlNode;
    expect(a.tag).toBe('a');
    expect(a.attrs).toEqual({ x: '1' });
    expect(a.children).toEqual(['one & ', { tag: 'b', attrs: { lang: 'ar' }, children: ['two'] }, { tag: 'pb', attrs: { n: '3' }, children: [] }, 'three >']);
  });
});

describe('tidy', () => {
  it('collapses whitespace and removes spaces inside brackets and before punctuation', () => {
    expect(tidy('  Father ( see  أَبَوَ ) .\n Ever ;  [ La ] , x ')).toBe('Father (see أَبَوَ). Ever; [La], x');
  });
});

describe('archive reading', () => {
  it('lists the members of a tar.gz and reads one as UTF-8', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'Arabic/Lane'), { recursive: true });
    writeFileSync(join(dir, 'Arabic/Lane/k0.xml'), '<x>كتب</x>');
    const archive = join(dir, 'a.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', dir, 'Arabic']);
    expect(archiveMembers(archive)).toContain('Arabic/Lane/k0.xml');
    expect(readArchiveMember(archive, 'Arabic/Lane/k0.xml')).toBe('<x>كتب</x>');
  });
});
