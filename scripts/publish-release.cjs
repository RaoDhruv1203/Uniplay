const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const owner = 'RaoDhruv1203';
const repo = 'Uniplay';
const version = require('../package.json').version;
const tag = `v${version}`;
const installer = path.resolve(__dirname, '..', 'release', 'UNiPLAY.exe');
if (!fs.statSync(installer).isFile()) throw new Error('Installer is missing.');

const raw = execFileSync('git', ['credential', 'fill'], {
  input: `protocol=https\nhost=github.com\nusername=${owner}\n\n`,
  encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
});
const credential = Object.fromEntries(raw.trim().split(/\r?\n/).map(line => {
  const split = line.indexOf('=');
  return [line.slice(0, split), line.slice(split + 1)];
}));
if (credential.username?.toLowerCase() !== owner.toLowerCase() || !credential.password) throw new Error('RaoDhruv1203 is not connected in Git Credential Manager.');
const token = credential.password;

function request(method, address, body, contentType = 'application/vnd.github+json') {
  const url = new URL(address);
  const stream = typeof body === 'string' && fs.existsSync(body) ? fs.createReadStream(body) : null;
  const payload = stream ? null : body == null ? null : Buffer.from(JSON.stringify(body));
  const size = stream ? fs.statSync(body).size : payload?.length;
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'UNiPLAY-Release-Publisher',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(size == null ? {} : { 'Content-Length': size }),
      ...(body == null ? {} : { 'Content-Type': contentType }),
    } }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { if (text.length < 1000000) text += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = { message: text.slice(0, 500) }; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(`GitHub returned ${res.statusCode}: ${parsed.message || 'Unknown error'}`));
      });
    });
    req.on('error', reject);
    if (stream) { stream.on('error', reject); stream.pipe(req); }
    else req.end(payload);
  });
}

(async () => {
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const hash = require('node:crypto').createHash('sha256');
  for await (const chunk of fs.createReadStream(installer)) hash.update(chunk);
  const digest = hash.digest('hex').toUpperCase();
  let release;
  try { release = await request('GET', `${api}/releases/tags/${tag}`); }
  catch (error) { if (!error.message.includes('returned 404')) throw error; }
  if (!release) {
    release = await request('POST', `${api}/releases`, {
      tag_name: tag,
      target_commitish: 'main',
      name: `UNiPLAY ${version}`,
      body: `UNiPLAY for Windows. Download and run **UNiPLAY.exe**, or update from the bell in version 1.3.0.\n\nNew: violet interface and app/installer artwork; large-thumbnail IPTV channel view; right-click Copy stream URL; clear in-player errors and retry for broken streams; smoother, faster floating-player drift and clean rounded corners; auto-hiding PiP controls; a separate control rail in YouTube PiP; immediate return to in-app playback when PiP closes; actual saved-video frame and a violet vignette in compact audio mode.\n\nThis update also explains YouTube's sign-in/bot-check errors in plain language and adds an opt-in local YouTube cookies.txt setting. UNiPLAY never reads browser cookies automatically, copies your cookies file into the installer, or uploads it to GitHub. YouTube may still rate-limit a network or require additional verification.\n\nThe installer is not code-signed, so Windows may display an Unknown publisher warning.\n\nSHA-256 (UNiPLAY.exe): \`${digest}\``,
      draft: true,
      prerelease: false,
    });
    console.log('Draft release created.');
  }
  let asset = release.assets?.find(item => item.name === 'UNiPLAY.exe' && item.state === 'uploaded');
  if (!asset) {
    const uploadUrl = release.upload_url.split('{')[0] + '?name=UNiPLAY.exe';
    console.log(`Uploading installer (${(fs.statSync(installer).size / 1048576).toFixed(1)} MB)…`);
    asset = await request('POST', uploadUrl, installer, 'application/octet-stream');
  }
  if (asset.state !== 'uploaded' || asset.size !== fs.statSync(installer).size) throw new Error('The uploaded asset could not be verified.');
  if (release.draft) release = await request('PATCH', `${api}/releases/${release.id}`, { draft: false });
  const published = await request('GET', `${api}/releases/tags/${tag}`);
  const publicAsset = published.assets?.find(item => item.name === 'UNiPLAY.exe' && item.state === 'uploaded');
  if (published.draft || publicAsset?.size !== fs.statSync(installer).size || publicAsset.digest?.toLowerCase() !== `sha256:${digest.toLowerCase()}`) throw new Error('The public release did not match the local installer.');
  console.log(`Published: ${published.html_url}`);
  console.log(`Installer: ${publicAsset.browser_download_url}`);
  console.log(`SHA-256: ${digest}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
