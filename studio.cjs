const { ipcMain, dialog, app, net } = require('electron');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { networkInterfaces } = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

let server, encoder, tunnel, remoteBase = '', folder, token, startedAt, totalBytes = 0, lastBytes = 0, lastSample = 0, viewers = new Map(), lastError = '';
function localAddress() { for (const cards of Object.values(networkInterfaces())) for (const card of cards || []) if (card.family === 'IPv4' && !card.internal) return card.address; return '127.0.0.1'; }
function status() { const now = Date.now(); for (const [ip, seen] of viewers) if (now - seen > 10000) viewers.delete(ip); const seconds = Math.max(.5, (now - lastSample) / 1000); const bitrate = Math.round((totalBytes - lastBytes) * 8 / seconds / 1000); lastBytes = totalBytes; lastSample = now; return { live: !!server, viewers: viewers.size, bitrate, seconds: startedAt ? Math.floor((now - startedAt) / 1000) : 0, error: lastError, remoteUrl: remoteBase && token ? `${remoteBase}/${token}/index.m3u8` : '' }; }
function stopRemote() { if (tunnel) { tunnel.kill(); tunnel = null; } remoteBase = ''; return true; }
async function stop() {
  stopRemote();
  if (encoder) { const process = encoder; encoder = null; process.stdin.end(); await new Promise(resolve => { const timer = setTimeout(() => { process.kill(); resolve(); }, 3000); process.once('exit', () => { clearTimeout(timer); resolve(); }); }); }
  if (server) { const current = server; server = null; await new Promise(resolve => current.close(resolve)); }
  if (folder && fs.existsSync(folder)) { fs.rmSync(folder, { recursive: true, force: true }); folder = null; }
  token = null; startedAt = 0; viewers.clear(); return status();
}
function registerStudio(binary, mainWindow) {
  ipcMain.handle('studio:pick', async () => {
    const choice = await dialog.showOpenDialog(mainWindow(), { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Videos and images', extensions: ['mp4', 'mkv', 'mov', 'webm', 'm4v', 'png', 'jpg', 'jpeg', 'gif', 'webp'] }] });
    return choice.canceled ? [] : choice.filePaths.map(file => ({ name: path.basename(file), url: pathToFileURL(file).href, type: /\.(png|jpe?g|gif|webp)$/i.test(file) ? 'image' : 'video' }));
  });
  ipcMain.handle('studio:start', async () => {
    if (server) throw new Error('A broadcast is already live.');
    folder = fs.mkdtempSync(path.join(app.getPath('temp'), 'uniplay-live-'));
    token = crypto.randomBytes(18).toString('hex');
    viewers = new Map(); totalBytes = lastBytes = 0; lastSample = startedAt = Date.now(); lastError = '';
    server = createServer((request, response) => {
      const match = /^\/([a-f0-9]{36})\/(index\.m3u8|segment\d{3,8}\.ts)$/.exec(new URL(request.url, 'http://localhost').pathname);
      if (!match || match[1] !== token) { response.writeHead(404); response.end(); return; }
      const file = path.join(folder, match[2]);
      if (!fs.existsSync(file)) { response.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); response.end(); return; }
      if (match[2].endsWith('.ts')) viewers.set(request.socket.remoteAddress, Date.now());
      response.writeHead(200, { 'Content-Type': match[2].endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(response);
    });
    try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', resolve); }); }
    catch (error) { await stop(); throw error; }
    const port = server.address().port;
    encoder = spawn(binary('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-f', 'webm', '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60', '-c:a', 'aac', '-b:a', '128k', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '6', '-hls_flags', 'delete_segments+omit_endlist', '-hls_segment_filename', path.join(folder, 'segment%05d.ts'), path.join(folder, 'index.m3u8')], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    encoder.stderr.on('data', chunk => { lastError = String(chunk).slice(-300); });
    encoder.on('error', error => { lastError = error.message; });
    encoder.on('exit', code => { if (server && code) lastError = `Encoder stopped (${code}).`; });
    encoder.stdin.on('error', () => {});
    return { url: `http://${localAddress()}:${port}/${token}/index.m3u8`, port, note: 'This link works on your local network. Remote viewers need router port forwarding or a relay.' };
  });
  ipcMain.handle('studio:remote:start', async () => {
    if (!server || !token) throw new Error('Go live before sharing outside your network.');
    if (remoteBase) return status();
    if (tunnel) throw new Error('Remote sharing is still connecting.');
    const executable = binary('cloudflared');
    if (!fs.existsSync(executable)) throw new Error('Remote sharing component is missing. Reinstall UNiPLAY.');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const child = spawn(executable, ['tunnel', '--no-autoupdate', '--url', origin], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    tunnel = child;
    try {
      const hostname = await new Promise((resolve, reject) => {
        let output = '', settled = false;
        const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
        const read = chunk => { output = (output + chunk.toString()).slice(-6000); const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i); if (match) finish(null, match[0]); };
        const timer = setTimeout(() => finish(new Error('Remote link took too long to connect. Try again.')), 45000);
        child.stdout.on('data', read); child.stderr.on('data', read);
        child.once('error', error => finish(error));
        child.once('exit', code => finish(new Error(`Remote sharing stopped before it connected (${code}).`)));
      });
      if (tunnel !== child || !server) throw new Error('Broadcast ended while remote sharing was connecting.');
      const publicUrl = `${hostname}/${token}/index.m3u8`;
      let reachable = false;
      for (let attempt = 0; attempt < 15 && tunnel === child && server; attempt++) {
        try {
          const response = await net.fetch(publicUrl, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
          if (response.ok && (await response.text()).includes('.ts')) { reachable = true; break; }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (!reachable) throw new Error('The temporary public link could not be reached. Your network or the tunnel service may be blocking it. Try again later, or use a managed tunnel for a reliable public link.');
      remoteBase = hostname;
      child.once('exit', () => { if (tunnel === child) { tunnel = null; remoteBase = ''; lastError = 'Remote link disconnected. Start remote sharing again.'; } });
      return status();
    } catch (error) { if (tunnel === child) stopRemote(); throw error; }
  });
  ipcMain.handle('studio:remote:stop', stopRemote);
  ipcMain.on('studio:chunk', (_, bytes) => { if (!encoder || !encoder.stdin.writable || !(bytes instanceof Uint8Array) || bytes.byteLength > 4 * 1024 * 1024) return; totalBytes += bytes.byteLength; encoder.stdin.write(Buffer.from(bytes)); });
  ipcMain.handle('studio:status', status);
  ipcMain.handle('studio:stop', stop);
  app.on('before-quit', () => { stopRemote(); if (encoder) encoder.kill(); if (server) server.close(); });
}
module.exports = { registerStudio };
