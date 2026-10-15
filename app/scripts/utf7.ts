export function encodeModifiedUtf7(text: string): string {
  let out = '';
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const bytes = new Uint8Array(run.length * 2);
    run.forEach((u, i) => { bytes[i * 2] = u >> 8; bytes[i * 2 + 1] = u & 0xff; });
    out += '&' + Buffer.from(bytes).toString('base64').replace(/=+$/, '').replace(/\//g, ',') + '-';
    run = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7e) { flush(); out += c === 0x26 ? '&-' : text[i]; }
    else run.push(c);
  }
  flush();
  return out;
}

if (process.argv[1]?.endsWith('utf7.ts')) process.stdout.write(encodeModifiedUtf7(process.argv[2] ?? ''));
