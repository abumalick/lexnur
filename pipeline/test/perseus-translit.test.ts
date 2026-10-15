import { describe, expect, it } from 'vitest';
import { alifUnderscore, perseusToArabic, seatHamza } from '../src/sources/perseus-translit.ts';

describe('perseusToArabic', () => {
  it.each([
    ['kataba', 'كَتَبَ'],
    ['A^ab~a', 'أَبَّ'],
    ['A^aroDN', 'أَرْضٌ'],
    ['A_ixotaSafa', 'اِخْتَصَفَ'],
    ['A_ilaY', 'إِلَى'],
    ['kitaAbN', 'كِتَابٌ'],
    ['mahomuwsap', 'مَهْمُوسَة'],
    ['$ajariy~ap', 'شَجَرِيَّة'],
    ['fulaAnFA', 'فُلَانًا'],
    ['bixayorK', 'بِخَيْرٍ'],
    ['EalaY', 'عَلَى'],
    ['suw^aAl', 'سُؤَال'],
    ["$ayoy^FA", 'شَيْئًا'],
    ["$aYo'N", 'شَىْءٌ'],
    ['bisomi A@ll~`hi', 'بِسْمِ ٱللّٰهِ'],
    ['h`*aA', 'هٰذَا'],
    ['A=xaru', 'آخَرُ'],
    ["kisaA='", 'كِسَآء'],
    ['A^awofaAoD', 'أَوْفَاض'],
    ['maA^ow', 'مَأْو'],
    ['A^aDolarRoqar', 'أَشْقَر'],
    ['Alr~amoYBa', 'الرَّمْيَ'],
    ['zarodaJuwbap', 'زَرْدَچُوبَة'],
    ['ParowaAz', 'پَرْوَاز'],
    ['buzurG', 'بُزُرگ'],
    ['laACowrodo', 'لَاژْورْدْ'],
    ['h`w^ulaA=\'i', 'هٰؤُلَآءِ'],
    ['A=l=m=', 'آلٓمٓ'],
    ['H`m=', 'حٰمٓ'],
  ])('%s → %s', (translit, arabic) => {
    expect(perseusToArabic(translit)).toBe(arabic.normalize('NFC'));
  });

  it('keeps Arabic script, spaces and punctuation as they are', () => {
    const unknown = new Map<string, number>();
    expect(perseusToArabic('كتب (??) [x], y.', unknown)).toBe('كتب (??) [خ], ي.');
    expect(unknown.size).toBe(0);
  });

  it('keeps unknown characters and counts them', () => {
    const unknown = new Map<string, number>();
    expect(perseusToArabic('qaSVSa', unknown)).toBe('قَصVصَ'.normalize('NFC'));
    perseusToArabic('la2V3a', unknown);
    expect(Object.fromEntries(unknown)).toEqual({ V: 2, '2': 1, '3': 1 });
  });
});

describe('perseusToArabic leaves 4 to the caller', () => {
  it('keeps 4 in place and counts it', () => {
    const unknown = new Map<string, number>();
    expect(perseusToArabic('A^araAoni4u', unknown)).toBe('أَرَانِ4ُ'.normalize('NFC'));
    expect(Object.fromEntries(unknown)).toEqual({ '4': 1 });
  });
});

describe('alifUnderscore', () => {
  it.each([
    'A_inoqalaba',
    'A_inoqilaAbN',
    'A_ixotaSafa',
    'A_imotiHaAnN',
    'A_iT~alaEa',
    'A_it~axa*a',
    'A_izodaHama',
    'A_iHomar~a',
    'A_iHomiraArN',
    'A_isotaEobada',
    'A_isotiEobaAdN',
    'AlA_isotiEobaAdu',
    'A_ibonN',
    'A_ibonap',
    'A_isomN',
    'A_imoraA^apN',
    'A_imorN',
    'A_ivonaAni',
    'A_ivonataAni',
    'A_isotu',
    "A_iEotiraA='N",
    'A_ay^otamara',
    'A_isomaAod~a',
    'A_i$oraworaqa',
    'A_iqolaEaT~a',
    'A_iHoranojama',
  ])('%s has hamzat wasl', (word) => {
    expect(alifUnderscore(word.slice(word.indexOf('A_')))).toBe('ا');
  });

  it.each(['A_ilaY', 'A_in~a', 'A_inosaAnN', 'A_ikoraAmN', 'A_ibilN', 'A_isomaAEN', "A_isom`Eiylu", 'A_imoraArN', "A_ivonaA='N", 'A_layohi'])(
    '%s has hamza below',
    (word) => {
      expect(alifUnderscore(word)).toBe('إ');
    },
  );

  it.each(['A_uxoraY', 'A_alay'])('%s has hamza above', (word) => {
    expect(alifUnderscore(word)).toBe('أ');
  });

  it('is applied by perseusToArabic', () => {
    expect(perseusToArabic('A_isotaEobada A_ilaY A_uxoraY')).toBe('اِسْتَعْبَدَ إِلَى أُخْرَى'.normalize('NFC'));
  });
});

describe('perseusToArabic spelling fixes', () => {
  it('gives the hamzated form VIII its kasra', () => {
    expect(perseusToArabic('A_ay^otavara')).toBe('اِئْتَثَرَ'.normalize('NFC'));
  });

  it('writes the alif of tanwin once', () => {
    expect(perseusToArabic('A^aholAFA wasaholAFA')).toBe('أَهْلًا وَسَهْلًا'.normalize('NFC'));
  });
});

describe('seatHamza', () => {
  it.each([
    ['ta^oliyof', 'taA^oliyof'],
    ['wada^a', 'wadaA^a'],
    ['bado^', "bado'"],
    ['kahorabaAt^iy~ap', 'kahorabaAty^iy~ap'],
    ['suw^aAl', 'suw^aAl'],
  ])('%s → %s', (word, out) => {
    expect(seatHamza(word)).toBe(out);
  });

  it('gives null when the seat cannot be told', () => {
    expect(seatHamza('suw~^al')).toBeNull();
    expect(seatHamza('*aAa^a')).toBeNull();
  });
});
