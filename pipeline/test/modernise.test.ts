import { describe, expect, it } from 'vitest';
import type { Body, Sense } from '@lexnur/core';
import { isSlurSense } from '../src/filter/content.ts';
import { moderniseEnglish, moderniseFrench, reviseBody } from '../src/filter/modernise.ts';

describe('moderniseEnglish', () => {
  it.each([
    // Lane
    ['A black, or negro, boy or young man, (S, K,) or slave', 'A Black boy or young man, (S, K,) or slave'],
    ['the father of the blacks, or negroes. (S, K.)', 'the father of Black people. (S, K.)'],
    ['The blacks, or negroes. (T, TA.', 'Black people. (T, TA.'],
    ['and by the latter, the negroes: but some hold', 'and by the latter, Black people: but some hold'],
    ['because they are of the Greeks and the Negroes: (S, K:)', 'because they are of the Greeks and Black people: (S, K:)'],
    ['to the Abyssinian: (TA in art. عور:) or to the negro: and', 'to the Abyssinian: (TA in art. عور:) or to a Black person: and'],
    ['very crisp, or such as we term woolly, like that of the negro: see', 'very crisp, or such as we term woolly, like that of a Black person: see'],
    ['Said of the hair of a negro, It became very crisp', 'Said of the hair of a Black person, It became very crisp'],
    ['means The white man: opposed to أَبُوالبَيْضَآءِ meaning the negro.', 'means The white man: opposed to أَبُوالبَيْضَآءِ meaning a Black person.'],
    ['and hence a negro is called لُوبِىٌّ and نُوبِىٌّ, [and negroes collectively are called', 'and hence a Black person is called لُوبِىٌّ and نُوبِىٌّ, [and Black people collectively are called'],
    ['“ a certain race, or nation, of the negroes. ” (RA.)', '“ a certain race, or nation, of Black people. ” (RA.)'],
    ['or as likened to the nation of negroes called النُّوبَةُ', 'or as likened to the nation of Black people called النُّوبَةُ'],
    ['[The Nubians;] a nation of the Negroes [or rather Ethiopians]', '[The Nubians;] a nation of Black people [or rather Ethiopians]'],
    ['(The land, or the country, of the negroes,) or the like', '(The land, or the country, of Black people,) or the like'],
    ['[sometimes applied to the Negroes absolutely; for]', '[sometimes applied to Black people absolutely; for]'],
    ['or at least the whole of the countries of the Negroes known to the Arabs', 'or at least the whole of the countries of Black people known to the Arabs'],
    [
      'السُّودَانُ is said in the R to denote [The negroes;] that particular people, or race, who are the most stinking of mankind in the armpits and sweat, and the more so those who are eunuchs. (TA.) [It',
      'السُّودَانُ is said in the R to denote [Black people]. (TA.) [It',
    ],
    ['A certain race of the blacks; (S, A, Msb, K, &c.;)', 'A certain race of Black people; (S, A, Msb, K, &c.;)'],
    ['A certain nation of the blacks; (S, Msb, K;)', 'A certain nation of Black people; (S, Msb, K;)'],
    ['an appellation of (assumed tropical:) The blacks [lit. crows] of the Arabs', 'an appellation of (assumed tropical:) The Black people [lit. crows] of the Arabs'],
    // Salmoné
    ['Negroes, blacks; Soudanese.', 'Black people; Soudanese.'],
    ['[coll.] Negro.', '[coll.] Black person.'],
    ['Inaccuracy. — مَهْجَنَة, Mongrels, halfcasts; rabble &c.', 'Inaccuracy. — مَهْجَنَة, people of mixed descent; rabble &c.'],
    ['Vile, base, low-bred; half-bred, half-cast; mongrel; son of a slave-woman.', 'Vile, base, low-bred; of mixed descent; son of a slave-woman.'],
    ['Low-born; mongrel.', 'Low-born; of mixed descent.'],
    ['Was of mixed origin, was a mongrel.', 'Was of mixed origin.'],
    // WordNet, Wiktionary
    ['the makeup (usually burnt cork) used by a performer in order to imitate a Negro', 'the makeup (usually burnt cork) used by a performer in order to imitate a Black person'],
    ['a troupe of performers in blackface typically giving a comic program of negro songs and jokes', 'a troupe of performers in blackface typically giving a comic program of African American songs and jokes'],
    ['a member of a Negroid people living chiefly in northern Nigeria', 'a member of a Black African people living chiefly in northern Nigeria'],
    ['a member of the tall Negroid people of eastern South Africa', 'a member of the tall Black African people of eastern South Africa'],
    ['A negro slave of Madagascan origin.', 'A Black slave of Madagascan origin.'],
    ['A negress.', 'A Black woman.'],
    ['negresses', 'Black women'],
  ])('%s', (before, after) => {
    expect(moderniseEnglish(before)).toBe(after);
  });

  it.each([
    'A barangay of Bais, Negros Oriental, Philippines.',
    'A city in Río Negro department, Uruguay.',
    'into the Rio Negro, in Venezuela.',
    'the former Negro Leagues, and independent leagues.',
    'Initialism of United Negro College Fund.',
    'Synonym of Bush Negro.',
    'Synonym of negro bug.',
    'Synonym of Negro-African',
    'African American spiritual; Negro spiritual; black spiritual',
    'a person with African ancestry, ‘Negro’ and ‘Negroid’ are archaic and pejorative today',
    'A Negroid.',
    'A subtype of the Caucasoid race transitional to the Negroid race',
    'The two blacks of the eye [or rather of the two eyes].',
    'cast the blacks of their eyes at me.',
    'signifies blacks inclining to redness.',
    'who, however, are not properly called “ blacks: ”]',
    'Mongrel, halfbred (horse).',
    'Moor.',
  ])('leaves %s', (text) => {
    expect(moderniseEnglish(text)).toBe(text);
  });
});

describe('moderniseFrench', () => {
  it.each([
    ['Nègre.', 'Noir.'],
    ['nègres', 'Noirs'],
    ['Négresse.', 'Noire.'],
    ['négresses', 'Noires'],
  ])('%s', (before, after) => {
    expect(moderniseFrench(before)).toBe(after);
  });

  it('leaves compounds and proper nouns', () => {
    for (const text of ['nègre littéraire', 'tête de nègre', 'rio Negro', 'Négritude']) expect(moderniseFrench(text)).toBe(text);
  });
});

describe('reviseBody', () => {
  const body = (...senses: Sense[]): Body => ({ v: 1, senses });

  it('rewrites English glosses and parents, not examples, links or relations', () => {
    const before: Body = {
      v: 1,
      senses: [{ gloss: 'A negro slave.', parents: ['imitate a Negro'], examples: [{ text: 'expel Negroes from' }], links: [['negro', 'negro']] }],
      relations: [{ kind: 'synonyms', words: ['Negro'] }],
    };
    const r = reviseBody('Madagass', before, 'en');
    expect(r.body).toEqual({
      v: 1,
      senses: [{ gloss: 'A Black slave.', parents: ['imitate a Black person'], examples: [{ text: 'expel Negroes from' }], links: [['negro', 'negro']] }],
      relations: [{ kind: 'synonyms', words: ['Negro'] }],
    });
    expect(r.rewrites).toEqual(['A negro slave. → A Black slave.', 'imitate a Negro → imitate a Black person']);
  });

  it('rewrites French glosses only when asked', () => {
    expect(reviseBody('سُودَانِيٌّ', body({ gloss: 'Nègre.' }), 'fr').body.senses[0]!.gloss).toBe('Noir.');
    expect(reviseBody('سُودَانِيٌّ', body({ gloss: 'Nègre.' })).body.senses[0]!.gloss).toBe('Nègre.');
    expect(reviseBody('x', body({ gloss: 'A negro slave.' })).body.senses[0]!.gloss).toBe('A negro slave.');
  });

  it('leaves entries about the word itself alone', () => {
    const b = body({ gloss: 'plural of negro', formOf: 'negro', labels: ['plural'] });
    expect(reviseBody('negroes', b, 'en').body).toEqual(b);
  });

  it('labels the dated headwords as dated and offensive', () => {
    expect(reviseBody('negro', body({ gloss: 'A slave, especially one of African ancestry.', labels: ['archaic'] })).body.senses[0]!.labels).toEqual([
      'archaic',
      'dated',
      'offensive',
    ]);
    expect(reviseBody('negress', body({ gloss: 'a Black woman or girl' })).labelled).toBe(true);
    expect(reviseBody('尼格罗', body({ gloss: 'negro (loanword)' })).body.senses[0]!.labels).toEqual(['dated', 'offensive']);
    expect(reviseBody('Negro', body({ gloss: 'A surname.' })).labelled).toBe(false);
    expect(reviseBody('negro', body({ gloss: 'x', labels: ['offensive'] })).labelled).toBe(false);
  });

  it('drops slur senses that no usage tag marked', () => {
    expect(reviseBody('nigger', body({ gloss: 'A friend, particularly a fellow black person.' }, { gloss: 'To clear land.' })).body.senses).toEqual([]);
    expect(reviseBody('Yid', body({ gloss: 'A Jew.' }, { gloss: 'A supporter of Tottenham Hotspur F.C..' })).body.senses).toEqual([
      { gloss: 'A supporter of Tottenham Hotspur F.C..' },
    ]);
    expect(reviseBody('darky', body({ gloss: 'Alternative spelling of darkey (“dark-skinned person”).' }, { gloss: 'Alternative spelling of darkey (“dark lantern”).' })).dropped).toBe(1);
    expect(reviseBody('bicot', body({ gloss: 'wog (north-African or middle-eastern person)' }, { gloss: 'kid (young goat)' })).body.senses).toEqual([{ gloss: 'kid (young goat)' }]);
    expect(reviseBody('wog', body({ gloss: 'bougnoule', parents: ['an offensive term for a dark-skinned person'] })).dropped).toBe(1);
    expect(reviseBody('Pakis', body({ gloss: 'plural of Paki', formOf: 'Paki' }, { gloss: 'The Pakistan cricket team.' })).dropped).toBe(1);
    expect(reviseBody('paki', body({ gloss: 'Haschisch en provenance du Pakistan.' })).dropped).toBe(0);
  });

  it('returns the same body when nothing applies', () => {
    const b = body({ gloss: 'book' });
    expect(reviseBody('كتاب', b, 'en').body).toBe(b);
  });
});

describe('isSlurSense', () => {
  it('does not read headwords as object properties', () => {
    expect(isSlurSense('constructor', { gloss: 'One who constructs.' })).toBe(false);
    expect(isSlurSense('toString', { gloss: 'x' })).toBe(false);
  });
});

describe('reviseBody on variants of the word', () => {
  const body = (...senses: Sense[]): Body => ({ v: 1, senses });

  it('leaves glosses that point at the word as a word, and labels the variants', () => {
    for (const [headword, gloss] of [
      ['Nigra', 'Alternative form of Negro.'],
      ['nigro', 'Obsolete spelling of negro.'],
      ['niggro', 'Archaic form of negro.'],
      ['ebony bug', 'Synonym of negro bug.'],
    ]) expect(reviseBody(headword!, body({ gloss: gloss! }), 'en').body.senses[0]!.gloss).toBe(gloss);
    expect(reviseBody('Nigra', body({ gloss: 'Alternative form of Negro.', labels: ['Southern-US'] })).body.senses[0]!.labels).toEqual(['Southern-US', 'dated', 'offensive']);
  });

  it('does not label family names', () => {
    expect(reviseBody('Negro', body({ gloss: 'Nom de famille.' })).labelled).toBe(false);
  });
});

it('still rewrites prose that mentions a form of a word further on', () => {
  const gloss = 'a nation of the Negroes: the latter is a form of the word';
  expect(reviseBody('النُّوبَةُ', { v: 1, senses: [{ gloss }] }, 'en').body.senses[0]!.gloss).toBe('a nation of Black people: the latter is a form of the word');
});
