import { parseArgs } from 'node:util';
import { buildCommand, describeBuild } from './build.ts';
import { writeCatalog } from './catalog/publish.ts';
import { compactCommand, describeCompact } from './compact.ts';
import { buildFixtures } from './fixture/build.ts';
import { publish } from './publish/r2.ts';
import { queryPackage } from './query.ts';
import { describeRefilter, refilterCommand } from './refilter.ts';

const USAGE = `usage: tsx src/cli.ts <command>
  build <id> [--limit N]       build build/packages/<id>/<version>.sqlite(.zst) and its .json record
  fixture                      rebuild fixtures/ from fixtures/lemmas.json
  query <file.sqlite> <text>   prefix query, or a root query such as "ك ت ب"
  catalog                      regenerate catalog/v2.json from catalog.json + releases.json (v1.json is frozen)
  compact <id>                 republish the live package's content in the compact layout into build/packages/<id>/
  publish <id> <version>       upload a build to R2, then update and upload the catalog
  refilter <id> [--dry-run]    re-apply the package filters to the live package into build/packages/<id>/ (never publishes)`;

const { positionals, values } = parseArgs({ allowPositionals: true, options: { limit: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
const [command, a, b] = positionals;

switch (command) {
  case 'build': {
    if (!a) throw new Error(USAGE);
    console.log(describeBuild(await buildCommand(a, values.limit ? Number(values.limit) : undefined)));
    break;
  }
  case 'fixture':
    await buildFixtures();
    break;
  case 'query': {
    if (!a || !b) throw new Error(USAGE);
    for (const hit of queryPackage(a, b, 20)) console.log([hit.headword, hit.pos, hit.root, hit.gloss].filter(Boolean).join(' · '));
    break;
  }
  case 'catalog': {
    const { v1, v2 } = writeCatalog();
    console.log(`catalog/v1.json is frozen with ${v1.dictionaries.length} dictionaries; wrote catalog/v2.json with ${v2.dictionaries.length}`);
    break;
  }
  case 'publish': {
    if (!a || !b) throw new Error(USAGE);
    await publish(a, b);
    break;
  }
  case 'compact': {
    if (!a) throw new Error(USAGE);
    console.log(describeCompact(await compactCommand(a)));
    break;
  }
  case 'refilter': {
    if (!a) throw new Error(USAGE);
    console.log(describeRefilter(await refilterCommand(a, values['dry-run'])));
    break;
  }
  default:
    console.error(USAGE);
    process.exitCode = 2;
}
