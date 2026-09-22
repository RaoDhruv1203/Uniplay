const { _electron: electron } = require('playwright-core');
const path = require('node:path');

(async () => {
  const app = await electron.launch({
    executablePath: process.env.DOWNYT_SMOKE_SOURCE ? require('electron') : path.join(__dirname, '..', 'release', 'win-unpacked', 'UNiPLAY.exe'),
    args: process.env.DOWNYT_SMOKE_SOURCE ? ['.', '--no-sandbox'] : ['--no-sandbox'],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DOWNYT_TEST_PROFILE: path.join(__dirname, '..', 'qa-profile') },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-view="youtube"]').click();
    await page.locator('#youtube-query').fill('lofi study music');
    await page.locator('#youtube-search').click();
    await page.locator('#youtube-results .youtube-card').first().waitFor({ timeout: 30000 });
    await page.locator('#youtube-results .youtube-card').first().click();
    let pip;
    for (let n = 0; n < 40; n++) { pip = (await app.windows()).find(w => w.url().includes('pip.html')); if (pip) break; await page.waitForTimeout(250); }
    if (!pip) throw new Error('YouTube floating player did not open');
    await pip.locator('#pip.youtube').waitFor();
    await pip.frameLocator('#youtube-frame').locator('video').waitFor({ timeout: 30000 });
    await pip.frameLocator('#youtube-frame').locator('video').evaluate(video => new Promise((resolve, reject) => {
      if (video.readyState >= 2) return resolve();
      const timer = setTimeout(() => reject(new Error('YouTube floating media did not load')), 30000);
      video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
    }));
    console.log('YouTube floating video loaded');
    await pip.locator('#explore-tab').click();
    await pip.locator('#pip.exploring').waitFor();
    await pip.locator('#explore-query').fill('jazz music');
    await pip.locator('#explore-query').press('Enter');
    await pip.locator('#explore-results .explore-item').first().waitFor({ timeout: 30000 });
    await pip.screenshot({ path: path.join(__dirname, '..', 'release', 'pip-qa.png'), timeout: 8000 }).catch(() => {});
    await pip.locator('#explore-results .explore-item').first().click();
    console.log('Floating search and switch worked');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
