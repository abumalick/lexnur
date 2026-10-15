// Usage: tsx scripts/range-server.ts <file> [--port 8787] [--throttle <bytes/s>] [--drop-at <bytes>]
import { createServer, type Server } from 'node:http';
import { createReadStream, statSync } from 'node:fs';

export interface RangeServerOptions { file: string; port: number; throttle?: number; dropAt?: number }

export function startRangeServer(o: RangeServerOptions): Promise<Server> {
  const size = statSync(o.file).size;
  let dropped = false;
  const server = createServer((req, res) => {
    const m = /^bytes=(\d+)-$/.exec(req.headers.range ?? '');
    const start = m ? Number(m[1]) : 0;
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} range=${req.headers.range ?? '-'}`);
    if (start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    res.writeHead(m ? 206 : 200, {
      'Content-Type': 'application/zstd', 'Accept-Ranges': 'bytes', ETag: `"${size}"`,
      'Content-Length': String(size - start),
      ...(m ? { 'Content-Range': `bytes ${start}-${size - 1}/${size}` } : {}),
    });
    const stream = createReadStream(o.file, { start, highWaterMark: 64 * 1024 });
    let sent = start;
    stream.on('data', (chunk) => {
      if (o.dropAt && !dropped && sent + chunk.length >= o.dropAt) {
        dropped = true;
        console.log(`dropping connection at ${sent}`);
        stream.destroy(); req.socket.destroy(); return;
      }
      sent += chunk.length;
      if (!res.write(chunk) || o.throttle) {
        stream.pause();
        const wait = o.throttle ? (chunk.length / o.throttle) * 1000 : 0;
        const resume = () => setTimeout(() => stream.resume(), wait);
        if (res.writableNeedDrain) res.once('drain', resume); else resume();
      }
    });
    stream.on('end', () => res.end());
  });
  return new Promise((ok) => server.listen(o.port, '0.0.0.0', () => ok(server)));
}

if (process.argv[1]?.endsWith('range-server.ts')) {
  const [file, ...rest] = process.argv.slice(2);
  const flag = (n: string) => { const i = rest.indexOf(n); return i >= 0 ? Number(rest[i + 1]) : undefined; };
  startRangeServer({ file, port: flag('--port') ?? 8787, throttle: flag('--throttle'), dropAt: flag('--drop-at') })
    .then(() => console.log(`serving ${file}`));
}
