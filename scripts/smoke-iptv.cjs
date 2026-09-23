const { _electron: electron } = require('playwright-core');
const { spawnSync } = require('node:child_process');
const { createServer } = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const root = path.join(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'uniplay-iptv-'));
  const segment = path.join(temp, 'clip.ts');
  let playlistRevision = 1, playlistOffline = false;
  const made = spawnSync(path.join(root, 'tools', 'ffmpeg.exe'), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-f', 'mpegts', segment], { timeout: 30000 });
  if (made.status !== 0) throw new Error('Could not prepare test stream: ' + made.stderr?.toString());
  console.log('Segment bytes:', fs.statSync(segment).size);
  const server = createServer((req, res) => {
    console.log('Stream request:', req.url);
    if (req.url === '/live.m3u8') { res.setHeader('content-type', 'application/vnd.apple.mpegurl'); res.end('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nclip.ts\n#EXT-X-ENDLIST\n'); }
    else if (req.url === '/channels.m3u') { if (playlistOffline) { res.statusCode = 503; res.end(); } else { res.setHeader('content-type', 'audio/x-mpegurl'); res.end(`#EXTM3U\n#EXTINF:-1 group-title="News",Local News\n${url}\n` + (playlistRevision > 1 ? `#EXTINF:-1 group-title="Sports",Sports Extra\n${url.replace('live.m3u8', 'sport.m3u8')}\n` : '')); } }
    else if (req.url === '/clip.ts') { res.setHeader('content-type', 'video/mp2t'); res.end(fs.readFileSync(segment)); }
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/live.m3u8`;
  const app = await electron.launch({ executablePath: process.env.DOWNYT_SMOKE_SOURCE ? require('electron') : path.join(root, 'release', 'win-unpacked', 'UNiPLAY.exe'), args: process.env.DOWNYT_SMOKE_SOURCE ? ['.', '--no-sandbox'] : ['--no-sandbox'], cwd: root, env: { ...process.env, DOWNYT_TEST_PROFILE: path.join(temp, 'profile') } });
  try {
    const page = await app.firstWindow();
    page.on('console', message => console.log('Renderer:', message.type(), message.text()));
    page.on('pageerror', error => console.log('Page error:', error.message));
    await page.locator('[data-view="live"]').click();
    console.log('Direct fetch:', await page.evaluate(url => window.streamBridge.fetch({ url }).then(r => ({ status: r.status, size: r.data?.length, error: r.error })).catch(e => ({ error: e.message })), url));
    console.log('Segment fetch:', await page.evaluate(url => window.streamBridge.fetch({ url }).then(r => ({ status: r.status, size: r.data?.length, error: r.error })).catch(e => ({ error: e.message })), url.replace('live.m3u8', 'clip.ts')));
    await page.locator('#stream-url').fill(url);
    await page.locator('#add-stream').click();
    try { await page.waitForFunction(() => document.querySelector('#live-video').readyState >= 2, { timeout: 20000 }); }
    catch (error) { console.log('Live feedback:', await page.locator('#live-feedback').innerText()); console.log('Live title:', await page.locator('#live-playing-title').innerText()); console.log('Channel count:', await page.locator('.iptv-channel').count()); console.log('Media state:', await page.evaluate(() => ({ ready: document.querySelector('#live-video').readyState, error: document.querySelector('#live-video').error?.message, levels: liveHls?.levels?.length, state: liveHls?.media?.readyState, source: document.querySelector('#live-video').src, buffered: document.querySelector('#live-video').buffered.length, mediaSource: liveHls?.bufferController?.mediaSource?.readyState, fragment: liveHls?.streamController?.fragCurrent?.url, level: liveHls?.currentLevel }))); throw error; }
    if ((await app.windows()).some(w => w.url().includes('pip.html'))) throw new Error('Direct stream opened floating player automatically');
    await page.locator('#playlist-file').setInputFiles({ name: 'News.m3u', mimeType: 'audio/x-mpegurl', buffer: Buffer.from(`#EXTM3U\n#EXTINF:-1 group-title="News",Local News\n${url}\n`) });
    await page.locator('#iptv-source').selectOption({ label: 'News (1)' });
    await page.locator('#iptv-category').selectOption('News');
    await page.locator('.iptv-channel').first().click({ button: 'right' });
    await page.locator('.channel-context-menu button').click();
    if (await app.evaluate(({ clipboard }) => clipboard.readText()) !== url) throw new Error('Right-click did not copy the channel URL');
    await page.locator('#iptv-view').click();
    await page.locator('#streams.grid .iptv-channel-icon').waitFor();
    if (!(await page.locator('#streams.grid .iptv-channel-icon').evaluate(element => element.getBoundingClientRect().width > 200))) throw new Error('Channel artwork did not enlarge in grid view');
    await page.locator('#iptv-view').click();
    await page.locator('#streams:not(.grid)').waitFor();
    await page.locator('.iptv-heart').click();
    if (!(await page.locator('#iptv-refresh-playlist').isDisabled())) throw new Error('File playlist unexpectedly offered URL refresh');
    await page.locator('#playlist-url').fill(url.replace('live.m3u8', 'channels.m3u'));
    await page.locator('#playlist-url-add').click();
    await page.locator('#iptv-source').selectOption({ label: 'channels (1)' });
    if (await page.locator('#iptv-refresh-playlist').isDisabled()) throw new Error('Link playlist refresh was disabled');
    await page.locator('.iptv-heart').click();
    playlistRevision = 2;
    await page.waitForTimeout(200);
    if (await page.locator('.iptv-channel').count() !== 1) throw new Error('Link playlist updated automatically');
    await page.locator('#iptv-refresh-playlist').click();
    await page.locator('#iptv-source').selectOption({ label: 'channels (2)' });
    await page.locator('#iptv-category').selectOption('all');
    if (await page.locator('.iptv-channel').count() !== 2 || !(await page.locator('.iptv-heart').first().getAttribute('class')).includes('active')) throw new Error('Manual playlist refresh lost channels or favorites');
    playlistOffline = true;
    await page.locator('#iptv-refresh-playlist').click();
    await page.waitForFunction(() => document.querySelector('#live-feedback').textContent.startsWith('Update failed:'));
    if (await page.locator('.iptv-channel').count() !== 2) throw new Error('Failed playlist refresh erased saved channels');
    playlistOffline = false;
    await page.locator('#iptv-source').selectOption('history');
    await page.locator('.iptv-select').check();
    await page.locator('#iptv-export').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Playlist saved.');
    if (!fs.readFileSync(path.join(temp, 'profile', 'UNiPLAY-streams.m3u'), 'utf8').includes(url)) throw new Error('M3U export failed');
    await page.locator('#live-float').click();
    let pip; for (let i = 0; i < 30; i++) { pip = (await app.windows()).find(w => w.url().includes('pip.html')); if (pip) break; await page.waitForTimeout(200); }
    if (!pip) throw new Error('Floating player did not open');
    await pip.waitForFunction(() => document.querySelector('#video').readyState >= 2, { timeout: 20000 });
    await pip.locator('#pip.controls-idle').waitFor({ timeout: 5000 });
    await pip.locator('#pip').hover();
    await pip.locator('#pip:not(.controls-idle)').waitFor();
    await pip.evaluate(() => window.downytPip.resizeTo(260));
    await page.waitForTimeout(300);
    const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('pip.html')).getBounds());
    if (bounds.width > 300) throw new Error('Floating player could not shrink');
    await pip.locator('#audio-mode').click();
    await pip.locator('#pip.audio-mode').waitFor();
    if (!(await pip.locator('#audio-cover').getAttribute('src')).endsWith('uniplay.svg')) throw new Error('Live audio did not use the UNiPLAY artwork');
    await pip.locator('#close').click();
    await page.waitForFunction(() => !document.querySelector('#live-video').paused, null, { timeout: 10000 });
    await page.locator('#live-float').click();
    await page.waitForFunction(() => document.querySelector('#live-video').paused);
    await page.locator('#live-float').click();
    await page.waitForFunction(() => !document.querySelector('#live-video').paused, null, { timeout: 10000 });
    await page.locator('#stream-url').fill(url.replace('live.m3u8', 'missing.m3u8'));
    await page.locator('#add-stream').click();
    await page.locator('#stream-status.failed').waitFor({ timeout: 20000 });
    if (await page.locator('#stream-status-title').innerText() !== 'Stream not found') throw new Error('Broken stream did not explain its 404 response');
    await page.screenshot({ path: path.join(root, 'release', 'iptv-error-qa.png') }).catch(() => {});
    await page.locator('#stream-retry').click();
    await page.locator('#stream-status.failed').waitFor({ timeout: 20000 });
    console.log('IPTV grid, in-app playback handoff, categories, favorites, export, resizing, and live audio artwork passed');
  } finally { await app.close(); server.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
