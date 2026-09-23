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
    await page.evaluate(url => { studio.sources.push({ type: 'file', name: 'Sample video', url }); studioSources(); studioPlay(0); }, pathToFileURL(file).href);
    await page.waitForFunction(() => studio.video.readyState >= 2, null, { timeout: 20000 });
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
    await page.locator('#studio-stop').click();
    await page.locator('#studio-live-badge:not(.live)').waitFor();
    console.log('Live Studio scene, overlay, HLS link, and stop passed');
  } finally { await app.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
