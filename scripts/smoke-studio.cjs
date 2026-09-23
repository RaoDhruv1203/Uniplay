const { _electron: electron } = require('playwright-core');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.join(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'uniplay-studio-'));
  const file = path.join(temp, 'sample.mp4');
  const made = spawnSync(path.join(root, 'tools', 'ffmpeg.exe'), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-movflags', '+faststart', file], { timeout: 30000 });
  if (made.status !== 0) throw new Error(String(made.stderr));
  const app = await electron.launch({ executablePath: process.env.DOWNYT_SMOKE_SOURCE ? require('electron') : path.join(root, 'release', 'win-unpacked', 'UNiPLAY.exe'), args: process.env.DOWNYT_SMOKE_SOURCE ? ['.', '--no-sandbox'] : ['--no-sandbox'], cwd: root, env: { ...process.env, DOWNYT_TEST_PROFILE: path.join(temp, 'profile') } });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => console.log('Page error:', error.message));
    await page.locator('[data-view="studio"]').click();
    await page.locator('#studio-remote-setup').evaluate(element => { element.open = true; });
    await page.locator('#studio-remote-hostname').fill('live.example.com');
    await page.locator('#studio-remote-token').fill('test-token-value-that-is-long-enough-for-validation-12345');
    await page.locator('#studio-remote-save').click();
    await page.waitForFunction(() => document.querySelector('#studio-remote-config-state').textContent.includes('Securely saved'));
    const tunnelSettings = fs.readFileSync(path.join(temp, 'profile', 'live-tunnel.json'), 'utf8');
    if (tunnelSettings.includes('test-token-value')) throw new Error('Remote tunnel token was stored in plain text');
    await page.locator('#studio-remote-remove').click();
    await page.waitForFunction(() => document.querySelector('#studio-remote-config-state').textContent.includes('Not configured'));
    await page.evaluate(url => { studio.sources.push({ type: 'file', name: 'Sample video', url }); studioSources(); studioPlay(0); }, pathToFileURL(file).href);
    await page.waitForFunction(() => studio.video.readyState >= 2, null, { timeout: 20000 });
    await page.evaluate(url => { studio.sources.push({ type: 'file', name: 'Next video', url, playMode: 'once', startAt: 0, endAt: 0, limit: 0 }); studioSources(); }, pathToFileURL(file).href);
    await page.locator('[data-edit="1"]').click();
    await page.locator('#studio-duration').fill('10'); await page.locator('#studio-duration').press('Tab');
    if (await page.evaluate(() => studio.sources[1].limit !== 10 || studio.active !== 0)) throw new Error('Queued source duration could not be set without putting it on air');
    await page.locator('[data-edit="0"]').click();
    await page.locator('#studio-start-at').fill('0:02'); await page.locator('#studio-start-at').press('Tab');
    await page.locator('#studio-end-at').fill('0:06'); await page.locator('#studio-end-at').press('Tab');
    await page.locator('#studio-play-mode').selectOption('loop');
    await page.locator('#studio-duration').fill('3'); await page.locator('#studio-duration').press('Tab');
    await page.locator('#studio-crop-left').fill('10'); await page.locator('#studio-crop-left').press('Tab');
    if (await page.evaluate(() => studio.sources[0].startAt !== 2 || studio.sources[0].endAt !== 6 || studio.sources[0].limit !== 3 || studio.sources[0].playMode !== 'loop' || studio.sources[0].transform.cropLeft !== 10)) throw new Error('Studio source timing or crop did not save');
    await page.locator('#studio-toggle').click();
    await page.waitForFunction(() => studio.video.paused);
    await page.locator('#studio-seek').fill('500');
    await page.locator('#studio-toggle').click();
    await page.waitForFunction(() => !studio.video.paused);
    await page.locator('#studio-add-ticker').click();
    await page.locator('#studio-add-live').click();
    if (await page.evaluate(() => !studio.layers.some(layer => layer.motion === 'ticker') || !studio.layers.some(layer => layer.type === 'live-badge'))) throw new Error('Ticker or LIVE layer missing');
    await page.locator('#studio-text').fill('ON AIR');
    await page.locator('#studio-color-mode').selectOption('gradient');
    await page.locator('#studio-background-opacity').fill('55');
    await page.locator('#studio-radius').fill('20');
    if (await page.evaluate(() => { const ticker = studio.layers.find(layer => layer.motion === 'ticker'), badge = studio.layers.find(layer => layer.type === 'live-badge'); return ticker.w !== 1280 || badge.text !== 'ON AIR' || badge.colorMode !== 'gradient' || badge.backdropOpacity !== 55 || badge.radius !== 20; })) throw new Error('Ticker width or badge design settings did not save');
    await page.waitForFunction(() => studio.active === 1, null, { timeout: 10000 });
    if (await page.evaluate(() => studio.video.readyState < 2)) throw new Error('Studio switched to an unready source');
    await page.locator('#studio-add-text').click();
    await page.locator('#studio-text').fill('Live from UNiPLAY');
    await page.locator('#studio-motion').selectOption('pulse');
    await page.screenshot({ path: path.join(root, 'release', 'studio-qa.png'), fullPage: true });
    await page.locator('#studio-start').click();
    await page.locator('#studio-live-badge.live').waitFor({ timeout: 15000 });
    const url = await page.locator('#studio-url').inputValue();
    const localUrl = url.replace(/^http:\/\/[^/]+/, `http://127.0.0.1:${new URL(url).port}`);
    let playlist = '';
    for (let n = 0; n < 30; n++) { await page.waitForTimeout(1000); const response = await fetch(localUrl); if (response.ok) { playlist = await response.text(); if (playlist.includes('.ts')) break; } }
    if (!playlist.includes('.ts')) throw new Error('Broadcast did not produce playable HLS. Feedback: ' + await page.locator('#studio-feedback').innerText());
    const segment = playlist.match(/segment\d+\.ts/)?.[0];
    const segmentResponse = await fetch(new URL(segment, localUrl));
    if (!segmentResponse.ok || (await segmentResponse.arrayBuffer()).byteLength < 1000) throw new Error('Broadcast segment unavailable');
    if (process.env.DOWNYT_TEST_REMOTE) {
      await page.locator('#studio-remote-start').click();
      await page.locator('#studio-remote-link:not([hidden])').waitFor({ timeout: 60000 });
      const publicUrl = await page.locator('#studio-remote-url').inputValue();
      console.log('Remote URL:', publicUrl);
      if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\//.test(publicUrl)) throw new Error('Public tunnel URL was not created');
      let reached = false;
      for (let n = 0; n < 10; n++) { try { const response = await fetch(publicUrl, { signal: AbortSignal.timeout(10000) }); console.log('Remote response:', response.status); if (response.ok && (await response.text()).includes('.ts')) { reached = true; break; } } catch (error) { console.log('Remote probe:', error.message, error.cause?.message); } await page.waitForTimeout(1000); }
      if (!reached) throw new Error('Remote HLS playlist could not be reached through the tunnel');
      await page.locator('#studio-remote-stop').click();
      await page.locator('#studio-remote-link[hidden]').waitFor();
    }
    await page.locator('#studio-stop').click();
    await page.locator('#studio-live-badge:not(.live)').waitFor();
    console.log('Live Studio scene, overlay, HLS link, and stop passed');
  } finally { await app.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
