import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = /^(\d{8})\.(\d+)$/;

export function nextVersion(now: Date, taken: Iterable<string>): string {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  let max = 0;
  for (const version of taken) {
    const m = VERSION.exec(version);
    if (m && m[1] === day) max = Math.max(max, Number(m[2]));
  }
  return `${day}.${max + 1}`;
}

export function takenVersions(id: string, buildDir: string, releases: Record<string, { version: string }>): string[] {
  const dir = join(buildDir, 'packages', id);
  const built = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -'.json'.length))
    : [];
  const live = releases[id]?.version;
  return live ? [...built, live] : built;
}
