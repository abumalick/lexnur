import type { Body } from '@lexnur/core';
import { isSlurSense } from './content.ts';

// Older sources use "negro" and its forms as a plain descriptive term; their glosses are
// reworded to modern terms. Doublets ("the blacks, or negroes") collapse first, then
// the article goes with the noun ("the negroes" → "Black people", "the negro" → "a Black
// person"). A bare form is only rewritten where it ends a phrase or a function word
// follows it, so names (Negros, Río Negro, the Negro Leagues, Bush Negro), species
// (negro bug) and genres (Negro spiritual) keep their wording, and so do words quoted
// as words (‘Negro’).
const END = String.raw`(?=\s*(?:[,;:.)\]”]|$)|\s+(?:is|are|was|were|and|or|but|called|collectively|absolutely|known|of|from|in|who|whose|with|to)\b)`;
const ADJECTIVE_NOUN = String.raw`(?:slaves?|boys?|girls?|m[ae]n|wom[ae]n|child(?:ren)?|servants?)\b`;

const RULES: [RegExp, string][] = [
  // Lane, أَسْوَدُ: the source's racist aside is cut, not reworded.
  [/\[The negroes;\] that particular people, or race, who are the most stinking of mankind in the armpits and sweat, and the more so those who are eunuchs\./g, '[Black people].'],
  [/\bA black, or negro, /g, 'A Black '],
  [/\b(?:the )?blacks, or negroes\b/gi, 'Black people'],
  [/\bNegroes, blacks\b/g, 'Black people'],
  [/\b(race|nation) of the blacks\b/g, '$1 of Black people'],
  [/\bThe blacks (?=\[lit\. crows\])/g, 'The Black people '],
  // Salmoné: words for people of mixed descent.
  [/\bMongrels, halfcasts\b/g, 'people of mixed descent'],
  [/\bhalf-bred, half-cast; mongrel\b/g, 'of mixed descent'],
  [/\bLow-born; mongrel\./g, 'Low-born; of mixed descent.'],
  [/\bWas of mixed origin, was a mongrel\./g, 'Was of mixed origin.'],
  // WordNet.
  [/\bnegro songs\b/g, 'African American songs'],
  [/\bNegroid people\b/g, 'Black African people'],
  [/(?<![‘'"“])\bthe negroes\b/gi, 'Black people'],
  [new RegExp(String.raw`(?<![‘'"“])\b[Tt]he negro${END}`, 'g'), 'a Black person'],
  [new RegExp(String.raw`(?<!\p{Lu}\p{L}+\s|[‘'"“-])\b[Nn]egro(?:es)? (?=${ADJECTIVE_NOUN})`, 'gu'), 'Black '],
  [new RegExp(String.raw`(?<!\p{Lu}\p{L}+\s|[‘'"“-])\b[Nn]egroes${END}`, 'gu'), 'Black people'],
  [new RegExp(String.raw`(?<!\p{Lu}\p{L}+\s|[‘'"“-])\b[Nn]egresses${END}`, 'gu'), 'Black women'],
  [new RegExp(String.raw`(?<!\p{Lu}\p{L}+\s|[‘'"“-])\b[Nn]egress${END}`, 'gu'), 'Black woman'],
  [new RegExp(String.raw`(?<!\p{Lu}\p{L}+\s|[‘'"“-])\b[Nn]egro${END}`, 'gu'), 'Black person'],
];

export function moderniseEnglish(text: string): string {
  if (!/negr|blacks|mongrel|halfcast|half-cast/i.test(text)) return text;
  return RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

// French glosses are only rewritten when the word is the whole gloss: "nègre" also
// lives in compounds (nègre littéraire, tête de nègre) that are names, not descriptions.
const FRENCH: Record<string, string> = { nègre: 'Noir', nègres: 'Noirs', négresse: 'Noire', négresses: 'Noires' };

export function moderniseFrench(text: string): string {
  const m = /^(\p{L}+)(\.?)$/u.exec(text);
  const word = m && FRENCH[m[1]!.toLowerCase()];
  return word ? `${word}${m[2]}` : text;
}

// Entries about the dated words themselves stay, marked as dated and offensive.
const DATED_HEADWORDS = new Set(['negro', 'Negro', 'negress', 'Negress', 'negroid', 'Negroid', 'Nigra', 'nigro', 'nigroe', 'niggro', '尼格罗']);
// "Obsolete spelling of negro", "Synonym of negro bug": the word named as a word.
const NAMES_A_WORD = /^(?:[\w-]+ ){0,3}(?:form|spelling|synonym|plural) of\b/i;

export interface Revision {
  body: Body;
  rewrites: string[];
  dropped: number;
  labelled: boolean;
}

export function reviseBody(headword: string, body: Body, language?: 'en' | 'fr'): Revision {
  const rewrites: string[] = [];
  const rewrite = (text: string) => {
    const out = language === 'en' ? moderniseEnglish(text) : language === 'fr' ? moderniseFrench(text) : text;
    if (out !== text) rewrites.push(`${text} → ${out}`);
    return out;
  };
  const about = /negr|nègr|négr/i.test(headword);
  const dated = DATED_HEADWORDS.has(headword);
  let labelled = false;
  const kept = body.senses.filter((s) => !isSlurSense(headword, s));
  const senses = kept.map((s) => {
    let out = s;
    if (!about && !NAMES_A_WORD.test(s.gloss)) {
      const gloss = rewrite(s.gloss);
      const parents = s.parents?.map(rewrite);
      if (gloss !== s.gloss || parents?.some((p, i) => p !== s.parents![i])) out = { ...out, gloss, ...(parents ? { parents } : {}) };
    }
    if (dated && !s.formOf && !/surname|nom de famille/i.test(s.gloss) && !s.labels?.includes('offensive')) {
      out = { ...out, labels: [...new Set([...(s.labels ?? []), 'dated', 'offensive'])] };
      labelled = true;
    }
    return out;
  });
  const dropped = body.senses.length - kept.length;
  const changed = dropped > 0 || senses.some((s, i) => s !== kept[i]);
  return { body: changed ? { ...body, senses } : body, rewrites, dropped, labelled };
}
