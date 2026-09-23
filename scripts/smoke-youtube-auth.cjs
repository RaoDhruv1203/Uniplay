const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const root = path.join(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'uniplay-auth-'));
  const cookieFile = path.join(temp, 'youtube-cookies.txt');
  fs.writeFileSync(cookieFile, '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1893456000\tTEST_COOKIE\tplaceholder\n');
  const app = await electron.launch({ executablePath: process.env.DOWNYT_SMOKE_SOURCE ? require('electron') : path.join(root, 'release', 'win-unpacked', 'UNiPLAY.exe'), args: process.env.DOWNYT_SMOKE_SOURCE ? ['.', '--no-sandbox'] : ['--no-sandbox'], cwd: root, env: { ...process.env, DOWNYT_TEST_PROFILE: path.join(temp, 'profile') } });
  try {
    const page = await app.firstWindow();
    await page.locator('#url').fill('https://www.youtube.com/watch?v=_ijaEtNzZgw');
    await page.locator('#analyze').click();
    await page.locator('#auth-help:not([hidden])').waitFor({ timeout: 30000 });
    const message = await page.locator('#download-feedback').innerText();
    if (!message.includes('cookies.txt') || message.includes('Error invoking remote method')) throw new Error('Bot-check message was not clear: ' + message);
    await page.locator('#auth-help').click();
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, cookieFile);
    await page.locator('#cookies-choose').click();
    await page.getByText('Connected · youtube-cookies.txt').waitFor();
    await page.locator('#cookies-clear').click();
    await page.getByText('Not connected · only needed').waitFor();
    if (!fs.existsSync(cookieFile)) throw new Error('Disconnect unexpectedly deleted the user-selected file');
    console.log('YouTube bot-check guidance and opt-in local file controls passed');
  } finally { await app.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
