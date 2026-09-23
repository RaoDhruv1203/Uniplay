const { createServer } = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { downloadVerified } = require('../update-download.cjs');

(async () => {
  const payload = crypto.randomBytes(2 * 1024 * 1024 + 97);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'uniplay-update-'));
  let requests = 0, resumed = false;
  const server = createServer((request, response) => {
    requests++;
    const start = Number(request.headers.range?.match(/^bytes=(\d+)-$/)?.[1] || 0);
    if (start) resumed = true;
    response.writeHead(start ? 206 : 200, { 'Content-Length': payload.length - start, ...(start ? { 'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}` } : {}) });
    if (requests === 1) { response.write(payload.subarray(0, 120000)); setTimeout(() => response.socket.destroy(), 50); }
    else response.end(payload.subarray(start));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const target = path.join(temp, 'update.exe');
    await downloadVerified({ fetcher: fetch, url: `http://127.0.0.1:${server.address().port}/update.exe`, target, size: payload.length, digest: `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}` });
    if (!resumed || !fs.readFileSync(target).equals(payload)) throw new Error('Interrupted download was not resumed correctly.');
    console.log('Resumable, verified update passed');
  } finally { server.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
