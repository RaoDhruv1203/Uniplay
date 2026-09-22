const { _electron: electron } = require('playwright-core');
const path = require('node:path');

(async () => {
  const app = await electron.launch({ executablePath: path.join(__dirname, '..', 'release', 'win-unpacked', 'UNiPLAY.exe'), args: ['--no-sandbox'], cwd: path.join(__dirname, '..'), env: { ...process.env, DOWNYT_TEST_PROFILE: path.join(__dirname, '..', 'qa-profile') } });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ clipboard }) => clipboard.writeText('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    await app.evaluate(({ BrowserWindow }) => { globalThis.downytContextParams = null; BrowserWindow.getAllWindows()[0].webContents.on('context-menu', (_, params) => { globalThis.downytContextParams = { editable: params.isEditable, canPaste: params.editFlags.canPaste }; }); });
    await page.locator('#url').click({ button: 'right' });
    await page.waitForTimeout(400);
    const params = await app.evaluate(() => globalThis.downytContextParams);
    if (!params?.editable || !params.canPaste) throw new Error('Right-click Paste is not available for the link field');
    console.log('Right-click menu opened for the link field');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
