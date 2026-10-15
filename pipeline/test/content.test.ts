import { describe, expect, it } from 'vitest';
import { blockedArabicTerm, blockedFrenchTermReason, blockedKaikkiFrEntryReason, blockedKaikkiFrReason, blockedKaikkiReason, blockedOewnReason, blockedTermReason } from '../src/filter/content.ts';

describe('blockedKaikkiReason', () => {
  it.each(['vulgar', 'offensive', 'derogatory', 'slur', 'pejorative'])('blocks the %s tag', (tag) => {
    expect(blockedKaikkiReason({ tags: ['transitive', tag] })).toBe(`tag:${tag}`);
  });

  it.each([
    ['English vulgarities', 'category:vulgarities'],
    ['English offensive terms', 'category:offensive terms'],
    ['English derogatory terms', 'category:derogatory terms'],
    ['English ethnic slurs', 'category:ethnic slurs'],
    ['English religious slurs', 'category:religious slurs'],
    ['Arabic derogatory terms', 'category:derogatory terms'],
    ['en:Sex', 'topic:en:Sex'],
    ['en:Sex positions', 'topic:en:Sex positions'],
  ])('blocks the category %s as %s', (category, reason) => {
    expect(blockedKaikkiReason({ categories: [category] })).toBe(reason);
  });

  it('accepts categories given as objects', () => {
    expect(blockedKaikkiReason({ categories: [{ name: 'English vulgarities' }] })).toBe('category:vulgarities');
  });

  it('reports the tag first when a sense has both', () => {
    expect(blockedKaikkiReason({ tags: ['slur'], categories: ['English ethnic slurs'] })).toBe('tag:slur');
  });

  it.each([
    [{ tags: ['transitive', 'archaic'] }],
    [{ categories: ['English terms derived from Vulgar Latin', 'en:Sexuality', 'Sussex English', 'English unisex given names'] }],
    [{}],
  ])('keeps %j', (sense) => {
    expect(blockedKaikkiReason(sense)).toBeNull();
  });
});

describe('blockedOewnReason', () => {
  it('blocks by sense-level usage domain', () => {
    expect(blockedOewnReason({ exemplifies: ['obscenity%1:10:00::'] }, {})).toBe('oewn:obscenity');
    expect(blockedOewnReason({ exemplifies: ['ethnic_slur%1:10:00::'] }, {})).toBe('oewn:ethnic-slur');
    expect(blockedOewnReason({ exemplifies: ['derogation%1:10:00::'] }, {})).toBe('oewn:derogation');
  });

  it('blocks by synset-level usage domain', () => {
    expect(blockedOewnReason({}, { exemplifies: ['07139048-n'] })).toBe('oewn:obscenity');
    expect(blockedOewnReason({}, { exemplifies: ['06730109-n'] })).toBe('oewn:disparagement');
    expect(blockedOewnReason({}, { exemplifies: ['06731387-n'] })).toBe('oewn:slur');
  });

  it('keeps spelling and register domains', () => {
    expect(blockedOewnReason({ exemplifies: ['british_spelling%1:10:01::'] }, { exemplifies: ['06306016-n'] })).toBeNull();
    expect(blockedOewnReason({}, {})).toBeNull();
  });
});

describe('blockedKaikkiFrReason', () => {
  it.each(['vulgar', 'offensive', 'pejorative'])('blocks the %s tag', (tag) => {
    expect(blockedKaikkiFrReason({ tags: [tag] })).toBe(`tag:${tag}`);
  });

  it.each([
    ['Termes vulgaires en arabe', 'category:Termes vulgaires'],
    ['Termes péjoratifs en arabe', 'category:Termes péjoratifs'],
    ['Insultes en arabe', 'category:Insultes'],
  ])('blocks the category %s as %s', (category, reason) => {
    expect(blockedKaikkiFrReason({ categories: [category] })).toBe(reason);
  });

  it.each(['sexuality', 'pornography', 'eroticism'])('blocks the %s topic', (topic) => {
    expect(blockedKaikkiFrReason({ topics: ['anatomy', topic] })).toBe(`topic:${topic}`);
  });

  it.each([
    [{ tags: ['figuratively', 'familiar'] }],
    [{ categories: ['Termes familiers en arabe', 'Termes argotiques en arabe', 'Lexique en arabe de la religion'], topics: ['Islam'] }],
    [{}],
  ])('keeps %j', (sense) => {
    expect(blockedKaikkiFrReason(sense)).toBeNull();
  });
});

describe('blockedTermReason', () => {
  it.each([
    ['What the fuck', 'term:fuck'],
    ['An ethnic slur: nigger', 'term:nigger'],
    ['Whores', 'term:whores'],
    ['A trollop; a hussy.', 'term:trollop'],
    ['Hussies', 'term:hussies'],
  ])('blocks %j as %s in every source', (text, reason) => {
    expect(blockedTermReason(text)).toBe(reason);
    expect(blockedTermReason(text, 'classical')).toBe(reason);
  });

  it.each([
    ['Sexual intercourse.', 'term:sexual intercourse'],
    ['Had carnal  intercourse with her', 'term:carnal intercourse'],
    ['Prostitute, strumpet, harlot.', 'term:prostitute'],
    ['Penis, pudendum.', 'term:penis'],
    ['Inivit eam; he compressed her.', 'term:inivit'],
    ['He  compressed\nher.', 'term:compressed her'],
    ['threesome', 'term:threesome'],
    ['group Orgy party', 'term:orgy'],
    ['porn star', 'term:porn'],
    ['pornographic film', 'term:pornographic'],
  ])('blocks %j as %s only in classical sources', (text, reason) => {
    expect(blockedTermReason(text, 'classical')).toBe(reason);
    expect(blockedTermReason(text)).toBeNull();
  });

  it.each([
    'Scunthorpe',
    'he wrote',
    'Conversation; social intercourse.',
    'Cock; rooster.',
    'Crack, crevice, chink.',
    'Dam, dyke.',
    'Pimple, blotch.',
    'a honky-tonk bar',
    'spic-and-span',
    'Menstruation; pregnancy; marriage.',
    'Committed adultery.',
    '',
  ])('keeps %j', (text) => {
    expect(blockedTermReason(text, 'classical')).toBeNull();
  });
});

describe('French-edition raw tags and entry lexicons', () => {
  it.each(['Vulgaire', 'Injurieux', 'Péjoratif', 'Raciste'])('blocks the raw tag %s', (tag) => {
    expect(blockedKaikkiFrReason({ raw_tags: ['Belgique', tag] })).toBe(`raw-tag:${tag}`);
  });

  it.each([
    ['Lexique en français de la sexualité', 'entry-category:sexualité'],
    ['Lexique en français de la pornographie japonaise', 'entry-category:pornographie'],
    ['Lexique en français du fétichisme sexuel', 'entry-category:fétichisme sexuel'],
    ['Lexique en arabe de l’érotisme', 'entry-category:érotisme'],
  ])('drops an entry in %s', (category, reason) => {
    expect(blockedKaikkiFrEntryReason({ categories: [category] })).toBe(reason);
  });

  it('keeps an entry in the antiracism lexicon', () => {
    expect(blockedKaikkiFrEntryReason({ categories: ['Lexique en français de l’antiracisme'] })).toBeNull();
  });
});

describe('blockedFrenchTermReason', () => {
  it.each([
    ['Avoir des relations sexuelles', 'term:relations sexuelles'],
    ['Avoir un rapport sexuel', 'term:rapport sexuel'],
    ['Rapports sexuels hors mariage', 'term:rapports sexuels'],
    ['Pratiquer le coït', 'term:coït'],
    ['Copuler', 'term:copuler'],
    ['Sodomiser quelqu’un', 'term:sodomiser'],
    ['Se masturber', 'term:masturber'],
    ['Prostituée', 'term:prostituée'],
    ['Fils de putain', 'term:putain'],
    ['Maison close', 'term:maison close'],
  ])('blocks %j as %s', (text, reason) => {
    expect(blockedFrenchTermReason(text)).toBe(reason);
  });

  it.each(['Donner un baiser', 'Relatif à la sexualité', 'Organe sexuel', 'Reproduction sexuée', 'Rapport financier', ''])('keeps %j', (text) => {
    expect(blockedFrenchTermReason(text)).toBeNull();
  });

  it('blocks the raw tag Emploi à manier avec précaution', () => {
    expect(blockedKaikkiFrReason({ raw_tags: ['Esclavagisme', 'Emploi à manier avec précaution'] })).toBe('raw-tag:Emploi à manier avec précaution');
  });
});

describe('blockedArabicTerm', () => {
  it.each(['ناك', 'يَنِيك', 'زُبّ', 'كُسّ', 'قَحْبَة', 'عزي د زب', 'شرموطة', 'ﻧﺎﻙ', 'قحبه', 'شَرْمُوطَه', 'نآك', 'ـزب'])('blocks %s', (word) => {
    expect(blockedArabicTerm(word)).toBe('term:ar-vulgar');
  });

  it.each(['هُنَاكَ', 'هناك', 'عَاهِرَة', 'نِكَاح', 'نيكوتين', 'كسول', 'زبدة', 'يجب ان ناكل لنعيش', 'بالزب', 'قحبتي', ''])('keeps %s', (word) => {
    expect(blockedArabicTerm(word)).toBeNull();
  });
});
