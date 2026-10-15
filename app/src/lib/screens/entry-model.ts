import type { Body } from '@lexnur/core';

export interface Segment { text: string; target?: string }

export function splitLinks(text: string, links?: [string, string][]): Segment[] {
  if (!links?.length) return [{ text }];
  const out: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    let best: { at: number; text: string; target: string } | null = null;
    for (const [t, target] of links) {
      if (!t) continue;
      const at = text.indexOf(t, i);
      if (at >= 0 && (!best || at < best.at || (at === best.at && t.length > best.text.length))) best = { at, text: t, target };
    }
    if (!best) break;
    if (best.at > i) out.push({ text: text.slice(i, best.at) });
    out.push({ text: best.text, target: best.target });
    i = best.at + best.text.length;
  }
  if (i < text.length) out.push({ text: text.slice(i) });
  return out;
}

export function firstGloss(body: Body): string | null {
  return body.senses.find((s) => !s.formOf)?.gloss ?? body.senses[0]?.gloss ?? null;
}

export function shareText(headword: string, body: Body, dictTitle: string, license: string): string {
  const g = firstGloss(body);
  return [headword, ...(g ? [g] : []), '', `${dictTitle} · ${license}`].join('\n');
}
