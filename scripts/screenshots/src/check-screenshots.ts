import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matrix, outputPath, SIZES } from './matrix';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const platform = (process.argv.find((a) => a.startsWith('--platform='))?.split('=')[1] ?? 'all') as
  | 'ios'
  | 'android'
  | 'all';
const identify = existsSync('/opt/homebrew/bin/magick') ? ['magick', 'identify'] : ['identify'];

const errors: string[] = [];
const shots = matrix(platform);
for (const shot of shots) {
  const file = join(ROOT, outputPath(shot));
  if (!existsSync(file)) {
    errors.push(`missing ${outputPath(shot)}`);
    continue;
  }
  const [bin = 'identify', ...pre] = identify;
  const out = execFileSync(bin, [...pre, '-format', '%w %h %A', file], { encoding: 'utf8' }).trim();
  const [w, h, alpha] = out.split(' ');
  const [ew, eh] = SIZES[shot.device];
  if (Number(w) !== ew || Number(h) !== eh) errors.push(`${outputPath(shot)}: ${w}x${h}, expected ${ew}x${eh}`);
  if (alpha !== 'False' && alpha !== 'Undefined') errors.push(`${outputPath(shot)}: has an alpha channel (${alpha})`);
}

// No stale files: each folder holds exactly the files the matrix produces, so both languages have the same count
const expected = new Set(shots.map((s) => join(ROOT, outputPath(s))));
for (const dir of new Set([...expected].map((f) => dirname(f)))) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.png'))) {
    const file = join(dir, name);
    if (!expected.has(file)) errors.push(`unexpected ${file.slice(ROOT.length + 1)}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`screenshots OK (${shots.length})`);
