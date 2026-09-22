const { _electron: electron } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const root = path.join(__dirname, '..');
  const profile = process.env.DOWNYT_TEST_PROFILE || path.join(root, 'qa-profile');
  fs.mkdirSync(profile, { recursive: true });
  if (!fs.existsSync(path.join(profile, 'data.json'))) fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify({ settings: { folder: path.join(root, 'qa-output') }, jobs: [], playlists: [] }));
  const app = await electron.launch({
    executablePath: process.env.DOWNYT_SMOKE_SOURCE ? require('electron') : path.join(__dirname, '..', 'release', 'win-unpacked', 'UNiPLAY.exe'),
    args: process.env.DOWNYT_SMOKE_SOURCE ? ['.', '--no-sandbox'] : ['--no-sandbox'],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DOWNYT_TEST_PROFILE: profile },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#engine.ready', { timeout: 15000 });
    console.log('Engine:', await page.locator('#engine').innerText());
    await page.locator('#url').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('#analyze').click();
    try { await page.locator('#result:not([hidden])').waitFor({ timeout: 30000 }); }
    catch (error) { console.log('Download feedback:', await page.locator('#download-feedback').innerText()); console.log('Display:', await page.locator('#result').evaluate(el => ({ hidden: el.hidden, display: getComputedStyle(el).display, parent: getComputedStyle(el.parentElement).display }))); throw error; }
    console.log('Analyzed:', await page.locator('#video-title').innerText());
    await page.screenshot({ path: path.join(__dirname, '..', 'release', 'ui-qa.png'), fullPage: true, timeout: 8000 }).catch(() => {});
    await page.locator('#quality').selectOption('720');
    await page.locator('#start-download').click();
    await page.locator('#queue-list .item').first().waitFor({ timeout: 10000 });
    console.log('Queued from Both:', await page.locator('#queue-list .item').count());
    if (!await page.locator('#queue-list').getByText('720p', { exact: false }).count()) throw new Error('Chosen quality is missing from queue');
    for (let n = 0; n < 2; n++) {
      const button = page.locator('#queue-list [data-action="cancel"]').first();
      if (await button.count()) await button.click();
    }
    await page.locator('[data-view="settings"]').click();
    await page.locator('#save-location').waitFor();
    console.log('Save folder:', await page.locator('#save-location').innerText());
    await page.locator('[data-view="queue"]').click();
    await page.locator('#queue-list').waitFor();
    console.log('Queue opens');
    await page.locator('[data-view="clip"]').click();
    await page.locator('#clip-url').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('#clip-preview').click();
    try { await page.locator('#clip-editor:not([hidden])').waitFor({ timeout: 30000 }); }
    catch (error) { console.log('Clip feedback:', await page.locator('#clip-feedback').innerText()); throw error; }
    console.log('Clip opens:', await page.locator('#clip-title').innerText());
    await page.locator('#start-time').fill('0:00');
    await page.locator('#start-time').press('Enter');
    await page.locator('#end-time').fill('0:02');
    await page.locator('#end-time').press('Enter');
    if (await page.locator('#clip-end').inputValue() !== '2') throw new Error('Manual clip end time was not applied');
    await page.locator('#play-range').click();
    const clipFrame = page.frameLocator('#clip-player');
    await clipFrame.locator('video').waitFor({ timeout: 30000 });
    await clipFrame.locator('video').evaluate(video => new Promise((resolve, reject) => {
      if (video.readyState >= 2) return resolve();
      const timer = setTimeout(() => reject(new Error('Embedded clip did not load media')), 30000);
      video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
    }));
    console.log('Embedded clip loaded media');
    if (!await page.locator('#clip-quality option[value="720"]').count()) throw new Error('Video clip quality choices were not loaded');
    await page.locator('#clip-mode-choice [data-clip-mode="audio"]').click();
    await page.locator('#clip-quality').selectOption('192K');
    await page.locator('#download-clip').click();
    if (!await page.locator('#queue-list').getByText('MP3 · 192 kbps', { exact: false }).count()) throw new Error('Audio clip quality was not shown in queue');
    const newClipId = (await page.evaluate(() => window.downyt.state())).jobs.at(-1).id;
    let audioClip;
    for (let attempt = 0; attempt < 120; attempt++) {
      audioClip = await page.evaluate(id => window.downyt.state().then(state => state.jobs.find(job => job.id === id)), newClipId);
      if (audioClip?.status === 'completed' || audioClip?.status === 'error') break;
      await page.waitForTimeout(500);
    }
    if (audioClip?.status !== 'completed') throw new Error('Audio clip did not complete: ' + JSON.stringify(audioClip));
    const clipJobs = (await page.evaluate(() => window.downyt.state())).jobs.filter(job => job.kind === 'clip-audio' && job.status === 'completed');
    const savedClip = clipJobs.at(-1);
    if (!savedClip?.filePath || !fs.existsSync(savedClip.filePath) || !savedClip.filePath.includes('[clip 0-2s]')) throw new Error('Clip file cannot be found at its recorded location: ' + savedClip?.filePath);
    console.log('Clip file:', savedClip.filePath);
    console.log('Audio clip completed');
    await page.locator('[data-view="clip"]').click();
    await page.locator('#clip-mode-choice [data-clip-mode="video"]').click();
    await page.locator('#clip-quality').selectOption('720');
    await page.locator('#download-clip').click();
    const videoClipId = (await page.evaluate(() => window.downyt.state())).jobs.at(-1).id;
    let videoClip;
    for (let attempt = 0; attempt < 180; attempt++) {
      videoClip = await page.evaluate(id => window.downyt.state().then(state => state.jobs.find(job => job.id === id)), videoClipId);
      if (videoClip?.status === 'completed' || videoClip?.status === 'error') break;
      await page.waitForTimeout(500);
    }
    if (videoClip.kind !== 'clip-video' || videoClip.quality !== '720p' || !videoClip.filePath || !fs.existsSync(videoClip.filePath)) throw new Error('Video clip quality or saved file was not correct: ' + JSON.stringify(videoClip));
    console.log('Video clip completed:', videoClip.filePath);
    await page.locator('[data-view="library"]').click();
    await page.locator('#library-list [data-action="play"]').first().click();
    let localPip;
    for (let n = 0; n < 30; n++) { localPip = (await app.windows()).find(w => w.url().includes('pip.html')); if (localPip) break; await page.waitForTimeout(300); }
    if (!localPip) throw new Error('Saved file player did not open');
    await localPip.waitForFunction(() => document.querySelector('#video').readyState >= 2, { timeout: 15000 });
    console.log('Saved clip plays in floating window');
    await page.locator('[data-view="live"]').click();
    await page.locator('#playlist-file').setInputFiles({ name: 'channels.m3u', mimeType: 'audio/x-mpegurl', buffer: Buffer.from('#EXTM3U\n#EXTINF:-1,QA imported channel\nhttps://example.com/qa-import-' + Date.now() + '.m3u8\n') });
    try { await page.locator('#streams .stream-name').filter({ hasText: 'QA imported channel' }).last().waitFor({ timeout: 5000 }); }
    catch (error) { console.log('M3U feedback:', await page.locator('#live-feedback').innerText()); throw error; }
    console.log('M3U channel imported');
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['#EXTM3U\n#EXTINF:-1,QA dropped channel\nhttps://example.com/qa-drop-' + Date.now() + '.m3u8\n'], 'dropped.m3u', { type: 'audio/x-mpegurl' }));
      document.querySelector('#playlist-drop').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));
    });
    await page.locator('#streams .stream-name').filter({ hasText: 'QA dropped channel' }).last().waitFor({ timeout: 5000 });
    console.log('M3U drag and drop imported');
    await page.locator('#stream-name').fill('QA stream');
    await page.locator('#stream-url').fill('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
    await page.locator('#add-stream').click();
    await page.locator('#streams [data-action="playstream"]').last().click();
    let pip;
    for (let n = 0; n < 30; n++) { pip = (await app.windows()).find(w => w.url().includes('pip.html')); if (pip) break; await page.waitForTimeout(300); }
    if (!pip) throw new Error('Floating player did not open');
    await pip.waitForSelector('#video');
    try { await pip.waitForFunction(() => document.querySelector('#video').readyState >= 2, { timeout: 30000 }); console.log('Floating live player loaded media'); }
    catch { throw new Error('Floating stream did not load'); }
    await page.locator('[data-view="download"]').click();
    await page.locator('#url').fill('https://www.youtube.com/playlist?list=PLR8TbGWIhJJIiukJJlIZDlG7oG6zs5y4Y');
    await page.locator('#analyze').click();
    await page.getByText('6 videos', { exact: false }).first().waitFor({ timeout: 30000 });
    console.log('Playlist analyzed:', await page.locator('#video-meta').innerText());
    await page.locator('[data-view="youtube"]').click();
    await page.locator('#youtube-query').fill('lofi study music');
    await page.locator('#youtube-search').click();
    await page.locator('#youtube-results .youtube-card').first().waitFor({ timeout: 30000 });
    await page.locator('#youtube-results .youtube-card').first().click();
    const youtubePip = (await app.windows()).find(w => w.url().includes('pip.html'));
    if (!youtubePip) throw new Error('YouTube floating player did not open');
    await youtubePip.locator('#pip.youtube').waitFor();
    await youtubePip.frameLocator('#youtube-frame').locator('video').waitFor({ timeout: 30000 });
    await youtubePip.frameLocator('#youtube-frame').locator('video').evaluate(video => new Promise((resolve, reject) => {
      if (video.readyState >= 2) return resolve();
      const timer = setTimeout(() => reject(new Error('YouTube floating media did not load')), 30000);
      video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
    }));
    await youtubePip.locator('#explore-tab').click();
    await youtubePip.locator('#pip.exploring').waitFor();
    await youtubePip.locator('#explore-query').fill('jazz music');
    await youtubePip.locator('#explore-query').press('Enter');
    await youtubePip.locator('#explore-results .explore-item').first().waitFor({ timeout: 30000 });
    await youtubePip.locator('#explore-results .explore-item').first().click();
    console.log('YouTube floating search and switch worked');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
