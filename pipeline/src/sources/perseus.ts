import { execFileSync } from 'node:child_process';
import { normalizeKey, normalizeRoot } from '@lexnur/core';
import { perseusToArabic } from './perseus-translit.ts';

// Perseus TEI P4 texts declare external DTD entities that a strict parser cannot
// resolve, so entries are cut out with a regex and parsed by a small tolerant reader.
export interface PerseusEntry {
  root: string | null;
  key: string;
  type: string;
  xml: string;
}

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: (XmlNode | string)[];
}

const MAX_BUFFER = 256 * 1024 * 1024;

export function archiveMembers(archive: string): string[] {
  return execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: MAX_BUFFER }).split('\n').filter(Boolean);
}

export function readArchiveMember(archive: string, member: string): string {
  return execFileSync('tar', ['-xOzf', archive, member], { encoding: 'utf8', maxBuffer: MAX_BUFFER });
}

const ATTR = /([\w:-]+)\s*=\s*"([^"]*)"/g;

function attrsOf(source: string): Record<string, string> {
  return Object.fromEntries([...source.matchAll(ATTR)].map((m) => [m[1]!, decode(m[2]!)]));
}

export function* perseusEntries(xml: string): Generator<PerseusEntry> {
  let root: string | null = null;
  for (const m of xml.matchAll(/<div2\b([^>]*)>|<\/div2>|<entryFree\b([^>]*)>[\s\S]*?<\/entryFree>/g)) {
    if (m[1] !== undefined) root = attrsOf(m[1]).n?.trim() ?? null;
    else if (m[2] === undefined) root = null;
    else {
      const attrs = attrsOf(m[2]);
      yield { root, key: attrs.key ?? '', type: attrs.type ?? '', xml: m[0] };
    }
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(\w+);/g, (all, name: string) => ENTITIES[name] ?? all);
}

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  for (const m of xml.matchAll(/<(\/?)([\w:.-]+)([^>]*?)(\/?)>|<[!?][^>]*>|[^<]+/g)) {
    const top = stack.at(-1)!;
    if (m[2] === undefined) {
      if (!m[0].startsWith('<')) top.children.push(decode(m[0]));
    } else if (m[1]) {
      const at = stack.findLastIndex((n) => n.tag === m[2]);
      if (at > 0) stack.length = at;
    } else {
      const node: XmlNode = { tag: m[2], attrs: attrsOf(m[3]!), children: [] };
      top.children.push(node);
      if (!m[4]) stack.push(node);
    }
  }
  return root;
}

// A div2 n of 2 to 4 letters, after Lane's "Quasi" prefix; anything else
// ("ktE ktf ktl", "$Sw and $SY", "wqZ [yqZ]") names several roots.
export function perseusRoot(n: string | null): string | null {
  if (!n) return null;
  const root = normalizeRoot(perseusToArabic(n.replace(/^Quasi /, '')));
  return /^\p{Script=Arabic}( \p{Script=Arabic}){1,3}$/u.test(root) ? root : null;
}

// Perseus files some words under a neighbouring root; a root whose strong letter is
// missing from the headword is dropped rather than shown wrong.
export function rootFor(root: string | null, headword: string): string | null {
  if (!root) return null;
  const letters = new Set(normalizeKey(headword));
  return root.split(' ').every((l) => 'اوي'.includes(l) || letters.has(l)) ? root : null;
}

export function textContent(node: XmlNode | string): string {
  return typeof node === 'string' ? node : node.children.map(textContent).join(' ');
}

export function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)\]])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .trim();
}

export function* withCounts<T>(name: string, rows: (counts: Map<string, number>) => Iterable<T>): Generator<T> {
  const counts = new Map<string, number>();
  yield* rows(counts);
  const parts = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} ${v}`);
  console.log(`${name}: ${parts.join(', ') || 'no notes'}`);
}
