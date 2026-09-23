const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const root = path.join(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'uniplay-youtube-'));
  const url = 'https://www.youtube.com/watch?v=_ijaEtNzZgw';
  const app = await electron.launch({ executablePath: process.env.DOWNYT_SMOKE_SOURCE ? require('electron') : path.join(root, 'release', 'win-unpacked', 'UNiPLAY.exe'), args: process.env.DOWNYT_SMOKE_SOURCE ? ['.', '--no-sandbox'] : ['--no-sandbox'], cwd: root, env: { ...process.env, DOWNYT_TEST_PROFILE: path.join(temp, 'profile') } });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => console.log('Page error:', error.message));
    await page.locator('#url').fill(url); await page.locator('#analyze').click();
    await page.locator('#result:not([hidden])').waitFor({ timeout: 60000 });
    const info = await page.evaluate(() => current);
    if (!info.playbackUrl?.startsWith('http://127.0.0.1:')) throw new Error('Anonymous analysis did not return locally served playable media');
    const probe = await page.evaluate(async url => { const result = await window.streamBridge.fetch({ url, rangeStart: 0, rangeEnd: 32 }); return { status: result.status, bytes: [...(result.data || [])].slice(0, 32) }; }, info.playbackUrl);
    if (probe.status !== 206 || String.fromCharCode(...probe.bytes.slice(4, 8)) !== 'ftyp') throw new Error('Local YouTube playback did not return MP4 video data');
    const studioSource = await page.evaluate(url => window.studioBridge.resolve(url), url);
    if (studioSource.type !== 'video' || !studioSource.url.startsWith('http://127.0.0.1:')) throw new Error('YouTube URL did not resolve as a Studio source');
    await page.locator('[data-view="youtube"]').click();
    await page.locator('#youtube-query').fill(url); await page.locator('#youtube-search').click();
    try { await page.waitForFunction(() => document.querySelector('#youtube-player').readyState >= 2, null, { timeout: 60000 }); }
    catch (error) { console.log('YouTube diagnostic:', await page.evaluate(async () => ({ feedback: document.querySelector('#youtube-feedback').textContent, ready: document.querySelector('#youtube-player').readyState, mediaError: document.querySelector('#youtube-player').error?.message, current: currentYoutube?.id, host: new URL(currentYoutube.playbackUrl).hostname, streamProbe: await window.streamBridge.fetch({ url: currentYoutube.playbackUrl, rangeStart: 0, rangeEnd: 1024 }).then(response => ({ status: response.status, error: response.error, size: response.data?.length })).catch(probeError => ({ error: probeError.message })) }))); throw error; }
    await page.locator('#youtube-float').click();
    let pip;
    for (let n = 0; n < 60; n++) { pip = (await app.windows()).find(window => window.url().includes('pip.html')); if (pip) break; await page.waitForTimeout(300); }
    if (!pip) throw new Error('Floating player did not open');
    try { await pip.waitForFunction(() => document.querySelector('#video').readyState >= 2, null, { timeout: 60000 }); }
    catch (error) { console.log('Floating diagnostic:', await pip.evaluate(() => ({ ready: document.querySelector('#video').readyState, mediaError: document.querySelector('#video').error?.message, source: document.querySelector('#video').currentSrc.slice(0, 120), feedback: document.querySelector('#pip-status')?.textContent }))); throw error; }
    await pip.locator('#pip').hover();
    await pip.locator('#pip:not(.controls-idle)').waitFor();
    await pip.locator('#audio-mode').click();
    await pip.locator('#pip.audio-mode').waitFor();
    await pip.locator('#audio-mode').click();
    await pip.locator('#pip:not(.audio-mode)').waitFor();
    await pip.locator('#explore-tab').click();
    await pip.locator('#explore-query').fill('jazz music');
    await pip.locator('#explore-query').press('Enter');
    try { await pip.locator('#explore-results .explore-item').first().waitFor({ timeout: 30000 }); }
    catch (error) { console.log('Explore feedback:', await pip.locator('#explore-status').innerText()); throw error; }
    console.log('Anonymous YouTube analysis, in-app playback, floating audio and Explore search passed');
  } finally { await app.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
