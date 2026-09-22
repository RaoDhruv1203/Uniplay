const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = path.join(__dirname, '..');
  const profile = path.join(root, 'qa-v12-profile');
  const folder = path.join(root, 'qa-v12-files');
  fs.mkdirSync(profile, { recursive: true }); fs.mkdirSync(folder, { recursive: true });
  const videoPath = path.join(folder, 'preview-test.mp4');
  const audioPath = path.join(folder, 'audio-test.mp3');
  fs.copyFileSync(path.join(root, 'qa-output', 'video-test.mp4'), videoPath);
  fs.copyFileSync(path.join(root, 'qa-output', 'probe-path2.mp3'), audioPath);
  const base = { status: 'completed', progress: 100, channel: 'QA', folder, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify({ settings: { folder, concurrent: 1, notifications: false, audioFormat: 'mp3' }, jobs: [
    { ...base, id: 'qa-video', title: 'Preview video', kind: 'video', quality: '720p', filePath: videoPath },
    { ...base, id: 'qa-audio', title: 'Audio session', kind: 'audio', quality: 'MP3', filePath: audioPath },
    { ...base, id: 'qa-missing', title: 'Missing from disk', kind: 'audio', quality: 'MP3', filePath: path.join(folder, 'not-here.mp3') },
  ], playlists: [{ id: 'liked', name: 'Liked', items: [] }] }));
  const app = await electron.launch({ executablePath: process.env.DOWNYT_SMOKE_SOURCE ? require('electron') : path.join(root, 'release', 'win-unpacked', 'UNiPLAY.exe'), args: process.env.DOWNYT_SMOKE_SOURCE ? ['.', '--no-sandbox'] : ['--no-sandbox'], cwd: root, env: { ...process.env, DOWNYT_TEST_PROFILE: profile } });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-view="library"]').click();
    await page.locator('#library-list .library-item').first().waitFor();
    if (await page.locator('#library-list .library-item').count() !== 2) throw new Error('Library showed a file missing from disk');
    await page.waitForFunction(() => document.querySelector('[data-preview-id="qa-video"]')?.src.startsWith('file:'), null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-preview-id="qa-video"]')?.naturalWidth > 0, null, { timeout: 15000 });
    await page.screenshot({ path: path.join(root, 'release', 'library-preview-qa.png'), timeout: 8000 }).catch(() => {});
    console.log('Library filtered missing file and rendered first video frame');
    await page.locator('[data-job-id="qa-audio"] [data-action="like"]').click();
    await page.waitForFunction(async () => (await window.downyt.state()).playlists.find(list => list.id === 'liked')?.items.some(item => item.id === 'qa-audio'));
    await page.locator('#new-playlist').fill('Session');
    await page.locator('#create-playlist').click();
    await page.locator('#library-select-all').check();
    await page.locator('#library-add-playlist').click();
    await page.waitForFunction(async () => (await window.downyt.state()).playlists.find(list => list.name === 'Session')?.items.length === 2);
    console.log('Liked and custom playlist persisted');
    await page.locator('[data-job-id="qa-audio"] [data-action="play"]').click();
    let pip;
    for (let n = 0; n < 30; n++) { pip = (await app.windows()).find(window => window.url().includes('pip.html')); if (pip) break; await page.waitForTimeout(300); }
    if (!pip) throw new Error('Floating audio window did not open');
    await pip.locator('#audio-mode').dispatchEvent('click');
    await pip.locator('#pip.audio-mode').waitFor();
    await pip.locator('#audio-list').click();
    await pip.locator('#pip.audio-expanded').waitFor();
    await pip.locator('#audio-playlist').selectOption({ label: 'Session · 2' });
    await pip.locator('#audio-search').fill('Audio session');
    await pip.locator('#audio-tracks .shelf-track').first().waitFor();
    await pip.screenshot({ path: path.join(root, 'release', 'audio-qa.png'), timeout: 8000 }).catch(() => {});
    console.log('Compact audio mode and playlist shelf worked');
    await page.locator('[data-job-id="qa-video"] [data-select-id="qa-video"]').check();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#library-delete').click();
    await page.waitForFunction(() => !document.querySelector('[data-job-id="qa-video"]'), null, { timeout: 15000 });
    if (fs.existsSync(videoPath)) throw new Error('Deleting in Library did not move the actual video file');
    console.log('Selected file moved to Recycle Bin and removed from Library');
    await page.screenshot({ path: path.join(root, 'release', 'library-qa.png'), timeout: 8000 }).catch(() => {});
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
