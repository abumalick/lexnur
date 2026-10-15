import type { DatabaseSync } from 'node:sqlite';
import { detectScript, normalizeKey, type Body, type Script, type Sense } from '@lexnur/core';
import { truncateGloss } from '../rows.ts';
import { blockedArabicTerm, blockedTermReason } from './content.ts';
import { moderniseEnglish, moderniseFrench, reviseBody } from './modernise.ts';

const GLOSS_SEPARATOR = '، ';
const DANGLING = 'formof:dangling';
const SLUR = 'slur:untagged';
const AR_VULGAR = 'term:ar-vulgar';
const GLOSS_AR_VULGAR = 'gloss:ar-vulgar';
const RELATION_AR_VULGAR = 'relation:ar-vulgar';
const FORM_AR_VULGAR = 'form:ar-vulgar';
// Kaikki sometimes leaves a gender, number or verb-form mark on the headword ("وَاحَة f .").
const TRAILING_MARK = /^(\S*\p{Script=Arabic}\S*)\s+(?:[mf]|du|[IVX]+)(?:\s*\.)?$/u;

export interface PackageFilterResult {
  droppedRows: Record<string, string[]>;
  droppedSenses: Record<string, number>;
  senseSamples: Record<string, string[]>;
  editedRows: number;
  cleanedHeadwords: number;
  rekeyed: number;
  rekeySamples: string[];
  formOfRows: number;
  rewrites: string[];
  labelled: string[];
}

export function stripArabicTerms(sense: Sense): Sense | null {
  const words = sense.gloss.split(GLOSS_SEPARATOR);
  const kept = words.filter((w) => !blockedArabicTerm(w));
  if (kept.length === words.length) return sense;
  if (!kept.length) return null;
  const out: Sense = { ...sense, gloss: kept.join(GLOSS_SEPARATOR) };
  const links = sense.links?.filter(([text, target]) => !blockedArabicTerm(text) && !blockedArabicTerm(target));
  if (links?.length) out.links = links;
  else delete out.links;
  return out;
}

// Kaikki lemmas and headwords sometimes carry Latin marks ("خَلِيَّة f"), so keys
// are compared on the words written in the headword's script.
function scriptKey(text: string, script: Script): string {
  return normalizeKey(text.normalize('NFKC').split(/\s+/).filter((w) => detectScript(w) === script).join(' '));
}

// A lemma in another script (a French letter name for an Arabic glyph) is not a
// headword of this package, so its absence says nothing.
export function isDanglingFormOf(headword: string, senses: Sense[], keys: Set<string>): boolean {
  if (!senses.length || !senses.every((s) => s.formOf)) return false;
  const script = detectScript(headword);
  if (script === 'other') return false;
  return senses.every((s) => detectScript((s.formOf as string).normalize('NFKC')) === script && !(s.formOf as string).split('/').some((f) => keys.has(scriptKey(f, script))));
}

function isFormOfRow(senses: Sense[]): boolean {
  return senses.length > 0 && senses.every((s) => s.formOf);
}

interface Row {
  id: number;
  headword: string;
  search_key: string;
  gloss: string | null;
  body: string;
}

export interface PackageFilterOptions {
  from: string;
  to: string;
  arabicGlosses?: boolean;
  rekey?: boolean;
  modernise?: 'en' | 'fr';
}

export function filterPackageDb(db: DatabaseSync, o: PackageFilterOptions): PackageFilterResult {
  const result: PackageFilterResult = { droppedRows: {}, droppedSenses: {}, senseSamples: {}, editedRows: 0, cleanedHeadwords: 0, rekeyed: 0, rekeySamples: [], formOfRows: 0, rewrites: [], labelled: [] };
  const drop = db.prepare('DELETE FROM entry WHERE id = ?');
  const update = db.prepare('UPDATE entry SET gloss = ?, body = ? WHERE id = ?');
  const dropRow = (r: Row, reason: string) => {
    drop.run(r.id);
    (result.droppedRows[reason] ??= []).push(r.headword);
  };
  const rows = () => db.prepare('SELECT id, headword, search_key, gloss, body FROM entry ORDER BY id').iterate() as Iterable<Row>;
  const drops: [Row, string][] = [];
  const edits: [string | null, string, number][] = [];
  const renames: [string, string, number][] = [];
  const rekeys: [string, number][] = [];
  for (const r of rows()) {
    const headwordReason = o.from === 'en' && o.to !== 'en' ? blockedTermReason(r.headword) : null;
    if (headwordReason) {
      drops.push([r, `headword:${headwordReason}`]);
      continue;
    }
    if (o.from === 'ar' && blockedArabicTerm(r.headword)) {
      drops.push([r, 'headword:ar-vulgar']);
      continue;
    }
    const clean = o.from === 'ar' ? TRAILING_MARK.exec(r.headword)?.[1] : undefined;
    if (clean) renames.push([clean, normalizeKey(clean), r.id]);
    else if (o.rekey !== false && normalizeKey(r.headword) !== r.search_key) {
      rekeys.push([normalizeKey(r.headword), r.id]);
      result.rekeySamples.push(`${r.search_key} → ${normalizeKey(r.headword)}`);
    }
    const parsed = JSON.parse(r.body) as Body;
    if (isFormOfRow(parsed.senses)) result.formOfRows++;
    const revision = reviseBody(r.headword, parsed, o.modernise);
    const body = revision.body;
    result.rewrites.push(...revision.rewrites.map((x) => `${r.headword}: ${x}`));
    if (revision.labelled) result.labelled.push(r.headword);
    if (revision.dropped) {
      result.droppedSenses[SLUR] = (result.droppedSenses[SLUR] ?? 0) + revision.dropped;
      if (!body.senses.length) {
        drops.push([r, SLUR]);
        continue;
      }
    }
    const revised = body !== parsed;
    // Rewrites and labels leave the row gloss in place (Lane's is a short meaning, not
    // the first sense); a dropped sense moves it to the next one.
    const rowGloss = () => {
      // A labelled entry about the word keeps its gloss as written.
      if (!revision.dropped) {
        if (!r.gloss || !revision.rewrites.length) return r.gloss;
        return o.modernise === 'fr' ? moderniseFrench(r.gloss) : moderniseEnglish(r.gloss);
      }
      const lead = body.senses.find((s) => !s.formOf) ?? body.senses[0]!;
      return truncateGloss(lead.gloss);
    };
    // A word can be cut out of a to-Arabic word list, not out of prose.
    const toArabic = o.to === 'ar';
    if (!toArabic && o.arabicGlosses === false) {
      if (revised) edits.push([rowGloss(), JSON.stringify(body), r.id]);
      continue;
    }
    const reason = toArabic ? AR_VULGAR : GLOSS_AR_VULGAR;
    const removed = (why: string, sample: string) => {
      result.droppedSenses[why] = (result.droppedSenses[why] ?? 0) + 1;
      (result.senseSamples[why] ??= []).push(`${r.headword}: ${sample}`);
    };
    const blocked = (why: string, word: string) => Boolean(blockedArabicTerm(word)) && (removed(why, word), true);
    const senses = body.senses.map((s) => (toArabic ? stripArabicTerms(s) : blockedArabicTerm(s.gloss) ? null : s));
    senses.forEach((s, i) => s === null && removed(reason, (body.senses[i] as Sense).gloss));
    const kept = senses.filter((s): s is Sense => s !== null);
    const relations = body.relations?.map((rel) => ({ ...rel, words: rel.words.filter((w) => !blocked(RELATION_AR_VULGAR, w)) }));
    const keepForm = (f: { form: string }) => o.from !== 'ar' || !blocked(FORM_AR_VULGAR, f.form);
    const forms = body.forms?.filter(keepForm);
    const tables = body.tables?.map((t) => ({ ...t, rows: t.rows.filter(keepForm) }));
    const changed =
      senses.some((s, i) => s !== body.senses[i]) ||
      relations?.some((rel, i) => rel.words.length !== body.relations?.[i]?.words.length) ||
      forms?.length !== body.forms?.length ||
      tables?.some((t, i) => t.rows.length !== body.tables?.[i]?.rows.length);
    if (!changed) {
      if (revised) edits.push([rowGloss(), JSON.stringify(body), r.id]);
      continue;
    }
    if (!kept.length && body.senses.length) {
      drops.push([r, reason]);
      continue;
    }
    const lead = kept.find((s) => !s.formOf) ?? kept[0];
    if (!lead) continue;
    const next: Body = { ...body, senses: kept };
    if (relations) next.relations = relations.filter((rel) => rel.words.length);
    if (forms) next.forms = forms;
    if (tables) next.tables = tables.filter((t) => t.rows.length);
    for (const key of ['relations', 'forms', 'tables'] as const) if (next[key]?.length === 0) delete next[key];
    edits.push([truncateGloss(lead.gloss), JSON.stringify(next), r.id]);
  }
  db.exec('BEGIN');
  for (const [r, reason] of drops) dropRow(r, reason);
  for (const edit of edits) update.run(...edit);
  const rename = db.prepare('UPDATE entry SET headword = ?, search_key = ? WHERE id = ?');
  for (const r of renames) rename.run(...r);
  result.cleanedHeadwords = renames.length;
  const rekey = db.prepare('UPDATE entry SET search_key = ? WHERE id = ?');
  for (const r of rekeys) rekey.run(...r);
  result.rekeyed = rekeys.length;
  result.editedRows = edits.length;
  for (;;) {
    const keys = new Set<string>();
    for (const r of db.prepare('SELECT search_key FROM entry').iterate() as Iterable<{ search_key: string }>) {
      keys.add(r.search_key);
      keys.add(scriptKey(r.search_key, detectScript(r.search_key)));
    }
    const dangling: Row[] = [];
    for (const r of rows()) if (isDanglingFormOf(r.headword, (JSON.parse(r.body) as Body).senses, keys)) dangling.push(r);
    if (!dangling.length) break;
    for (const r of dangling) dropRow(r, DANGLING);
  }
  db.exec('COMMIT');
  return result;
}
