# Test data

`kaikki-sample.jsonl` holds three unmodified lines of `raw-wiktextract-data.jsonl.gz` from https://kaikki.org (the Arabic `كتب` verb, the Arabic `كتاب` noun and the English `write` verb).
`kaikki-en-ar-sample.jsonl` holds eight English lines with Arabic translations (`book`, `dog` and `bitch` nouns, the `write` verb, the `prick` noun, both `ass` noun lines and the `water` noun), which pin the English–Arabic content and dialect filters. `kaikki-en-xx-sample.jsonl` holds seven English lines (`water`, `house`, `cat`, `dog` and `bitch` nouns, the `go` and `eat` verbs) for the French, Japanese and Chinese targets. Both are trimmed to the fields the mapper reads (word, part of speech, sense glosses, tags, blocking categories and form-of, two IPA, and the translations of the target languages); the values are unmodified.
`kaikki-fr-sample.jsonl` holds four unmodified lines of the French-edition dump (https://kaikki.org/frwiktionary/): the Arabic `كَتَبَ` verb (first of two), the two `شعر` nouns and the `عبد` noun, which has an offensive sense. Its content is from the French Wiktionary (https://fr.wiktionary.org), same licence.
`kaikki-frfr-sample.jsonl` holds seven unmodified lines of the same French-edition dump: the French `lire` verb and noun, the `été` noun and verb form, `fellatrice` (sexuality lexicon), `bougnoule` (offensive) and the first `lisons` verb form.
`kaikki-fr-en-sample.jsonl` holds seven unmodified French lines (`lang_code == "fr"`): the `été` noun and verb, the `manger` verb, the `être` verb and noun, and the `con` noun and adjective, whose senses are all vulgar.
The content is from Wiktionary (https://en.wiktionary.org), extracted by Wiktextract (T. Ylonen, LREC 2022), and is licensed CC BY-SA 4.0 and GFDL.
Regenerate it with `pnpm --filter @lexnur/pipeline exec tsx scripts/extract-kaikki-sample.ts`.

`salmone-sample.xml` holds the DOCTYPE and three unmodified `div2` root blocks (`'bb`, `'rn`, `wdn`) of `Arabic/Salmone/opensource/salmone.xml` in `hopper-texts-Arabic.tar.gz` from the Perseus Digital Library (https://www.perseus.tufts.edu), H. Anthony Salmoné, *An Advanced Learner's Arabic-English Dictionary* (1889), licensed CC BY-SA 3.0 US.

`lane-sample.xml` holds one unmodified `div2` root block (`kmH`) of `Arabic/Lane/opensource/k0.xml` from the same archive: Edward William Lane, *An Arabic-English Lexicon* (1863–1893), licensed CC BY-SA 3.0 US.
`jmdict-sample.xml` holds eight unmodified entries of `JMdict_e.gz` (食べる, 食べ過ぎ, 日本, おしゃぶり, ジャップ, こちらこそ, ありがとう) under a DOCTYPE reduced to the entities they use.
The content is from JMdict by the Electronic Dictionary Research and Development Group (https://www.edrdg.org/), licensed CC BY-SA 4.0.
`kaikki-frar-translations-sample.jsonl` holds four French-edition lines (`eau`, `chat`, `système`, `fornication`) trimmed to the fields the French→Arabic translation mapper reads: the Arabic, Moroccan Arabic and English translations, the senses' glosses, tags, topics and content categories, and up to three IPA values.
