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
    const initialBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('pip.html')).getBounds());
    if (Math.abs(initialBounds.width / initialBounds.height - 16 / 9) > 0.02) throw new Error('Floating YouTube player did not open at 16:9');
    if (!await pip.locator('#audio-mode').isVisible()) throw new Error('Audio control is hidden');
    await pip.locator('#audio-mode').click();
    await page.locator('#download.active').waitFor();
    if (await page.locator('#url').inputValue() !== 'https://www.youtube.com/watch?v=' + new URL(await pip.locator('#youtube-frame').getAttribute('src')).pathname.split('/').pop()) throw new Error('Audio control did not prepare the current video');
    if (!await page.locator('#mode-choice [data-mode="audio"]').evaluate(element => element.classList.contains('selected'))) throw new Error('Audio mode was not selected in Download');
    await pip.locator('#explore-tab').click();
    await pip.locator('#pip.exploring').waitFor();
    await pip.locator('#explore-query').fill('jazz music');
    await pip.locator('#explore-query').press('Enter');
    await pip.locator('#explore-results .explore-item').first().waitFor({ timeout: 30000 });
    await pip.screenshot({ path: path.join(__dirname, '..', 'release', 'pip-qa.png'), timeout: 8000 }).catch(() => {});
    const previousVideo = await pip.locator('#youtube-frame').getAttribute('src');
    await pip.locator('#explore-results .explore-item').first().click();
    await pip.waitForFunction(previous => document.querySelector('#youtube-frame').getAttribute('src') !== previous, previousVideo, { timeout: 15000 });
    await pip.waitForTimeout(1800);
    const switchedBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('pip.html')).getBounds());
    if (switchedBounds.width !== initialBounds.width || switchedBounds.height !== initialBounds.height) throw new Error('Floating player changed size while switching videos');
    await pip.evaluate(() => window.downytPip.moveTo(window.screenX - 80, window.screenY - 60));
    await pip.waitForTimeout(250);
    const positionedBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('pip.html')).getBounds());
    if (Math.hypot(positionedBounds.x - switchedBounds.x, positionedBounds.y - switchedBounds.y) < 70) throw new Error('Player did not accept a custom position');
    if (Math.abs(positionedBounds.width - switchedBounds.width) > 2 || Math.abs(positionedBounds.height - switchedBounds.height) > 3) throw new Error('Moving the player changed its size');
    await pip.mouse.move(195, 12);
    await pip.mouse.down();
    await pip.mouse.move(315, 92, { steps: 12 });
    await pip.mouse.up();
    await pip.waitForTimeout(400);
    const draggedBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('pip.html')).getBounds());
    if (Math.hypot(draggedBounds.x - positionedBounds.x, draggedBounds.y - positionedBounds.y) < 4) throw new Error('Player drag strip did not respond');
    await pip.evaluate(() => window.downytPip.resizeTo(640));
    await pip.waitForTimeout(300);
    const resizedBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('pip.html')).getBounds());
    if (resizedBounds.width < 600 || Math.abs(resizedBounds.width / resizedBounds.height - 16 / 9) > 0.03) throw new Error('Player resize did not preserve the video aspect ratio: ' + JSON.stringify(resizedBounds));
    const measured = [];
    for (let n = 0; n < 8; n++) {
      await pip.evaluate(offset => window.downytPip.moveTo(window.screenX + offset, window.screenY + 2), n % 2 ? -36 : 36);
      await pip.waitForTimeout(70);
      measured.push(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('pip.html')).getBounds()));
    }
    if (Math.max(...measured.map(bounds => bounds.width)) - Math.min(...measured.map(bounds => bounds.width)) > 3 || Math.max(...measured.map(bounds => bounds.height)) - Math.min(...measured.map(bounds => bounds.height)) > 3) throw new Error('Repeated player moves changed its size');
    console.log('Manual player drag worked');
    console.log('Floating search and switch worked');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
