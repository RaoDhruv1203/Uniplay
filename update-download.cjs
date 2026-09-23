const fs = require('node:fs');
const crypto = require('node:crypto');

async function downloadVerified({ fetcher, url, target, size, digest, onProgress, attempts = 5 }) {
  if (!Number.isSafeInteger(size) || size < 1 || !/^sha256:[a-f0-9]{64}$/i.test(digest || '')) throw new Error('Update details are not verifiable.');
  let received = fs.existsSync(target) ? fs.statSync(target).size : 0;
  if (received > size) { fs.truncateSync(target, 0); received = 0; }
  for (let attempt = 0; received < size && attempt < attempts; attempt++) {
    const start = received;
    const controller = new AbortController();
    let idle = setTimeout(() => controller.abort(), 30000);
    const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => controller.abort(), 30000); };
    let stream;
    try {
      const response = await fetcher(url, { headers: { 'User-Agent': 'UNiPLAY-Updater', ...(start ? { Range: `bytes=${start}-` } : {}) }, signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`Download server returned ${response.status}.`);
      if (start && response.status !== 206) {
        if (response.status !== 200) throw new Error('Download server cannot resume this file.');
        fs.truncateSync(target, 0); received = 0;
      } else if (start && !String(response.headers.get('content-range') || '').startsWith(`bytes ${start}-`)) throw new Error('Download server returned a different file range.');
      stream = fs.createWriteStream(target, { flags: received ? 'a' : 'w' });
      for await (const chunk of response.body) {
        resetIdle();
        received += chunk.byteLength;
        if (received > size) throw new Error('The update is larger than expected.');
        if (!stream.write(Buffer.from(chunk))) await new Promise((resolve, reject) => {
          const onDrain = () => { stream.off('error', onError); resolve(); };
          const onError = error => { stream.off('drain', onDrain); reject(error); };
          stream.once('drain', onDrain); stream.once('error', onError);
        });
        onProgress?.(received, size, attempt);
      }
      await new Promise((resolve, reject) => stream.end(error => error ? reject(error) : resolve())); stream = null;
    } catch (error) {
      if (stream) { stream.destroy(); await new Promise(resolve => stream.closed ? resolve() : stream.once('close', resolve)); }
      received = fs.existsSync(target) ? fs.statSync(target).size : 0;
      if (attempt === attempts - 1) throw new Error(`Download paused after ${attempts} attempts. Retry to resume it. ${error.message}`);
      onProgress?.(received, size, attempt + 1);
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 8000)));
    } finally { clearTimeout(idle); }
  }
  if (received !== size) throw new Error('The update is incomplete. Retry to resume it.');
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(target)) hash.update(chunk);
  if (hash.digest('hex').toLowerCase() !== digest.slice(7).toLowerCase()) { fs.rmSync(target, { force: true }); throw new Error('The downloaded update failed its safety check. Please try again.'); }
  return target;
}
module.exports = { downloadVerified };
