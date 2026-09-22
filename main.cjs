const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Notification, session, Menu, net } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { screen } = require('electron');
const { driftDestination } = require('./drift.cjs');

let win, pipWin, pipTimer, previousCursor, lastDrift = 0, settings, jobs = [], playlists = [], saveTimer, driftAnimation;
let updateInfo = { status: 'checking', message: 'Checking for updates…' };
const UPDATE_REPO = 'RaoDhruv1203/Uniplay';
const active = new Map();
const dataPath = () => path.join(app.getPath('userData'), 'data.json');
const binary = name => path.join(app.isPackaged ? process.resourcesPath : __dirname, 'tools', `${name}.exe`);
const defaults = () => ({ folder: path.join(app.getPath('downloads'), 'UNiPLAY'), concurrent: 2, thumbnail: false, notifications: true, prefix: '', suffix: '', audioFormat: 'mp3' });
function load() { try { const data = JSON.parse(fs.readFileSync(dataPath(), 'utf8')); settings = { ...defaults(), ...data.settings }; jobs = (data.jobs || []).map(j => ({ ...j, status: ['downloading', 'queued'].includes(j.status) ? 'queued' : j.status })); playlists = Array.isArray(data.playlists) ? data.playlists : []; } catch { settings = defaults(); jobs = []; playlists = []; } if (!playlists.some(list => list.id === 'liked')) playlists.unshift({ id: 'liked', name: 'Liked', items: [] }); }
function save() { fs.mkdirSync(path.dirname(dataPath()), { recursive: true }); fs.writeFileSync(dataPath(), JSON.stringify({ settings, jobs, playlists }, null, 2)); }
function emit() { if (win && !win.isDestroyed()) win.webContents.send('state:changed', { settings, jobs, playlists }); if (pipWin && !pipWin.isDestroyed()) pipWin.webContents.send('playlists:changed', playlists); clearTimeout(saveTimer); saveTimer = setTimeout(save, 350); }
function fileInJobFolder(job) { if (!job?.filePath || !fs.existsSync(job.filePath)) return false; try { const file = fs.realpathSync(job.filePath), folder = fs.realpathSync(job.folder || path.dirname(job.filePath)); return file.startsWith(folder + path.sep) && fs.statSync(file).isFile(); } catch { return false; } }
function libraryJobs() { return jobs.filter(job => job.status === 'completed' && fileInJobFolder(job)); }
function itemForJob(job) { return { type: 'job', id: job.id, title: job.title, channel: job.channel || '', thumbnail: job.thumbnailUrl || '' }; }
function newerVersion(remote, local) { const clean = value => String(value || '').replace(/^v/i, '').split('.').map(part => Number(part) || 0); const a = clean(remote), b = clean(local); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; }
async function checkUpdates() {
  try {
    const response = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'UNiPLAY-Updater' } });
    if (response.status === 404) updateInfo = { status: 'unpublished', message: 'No public update has been published yet.' };
    else if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
    else {
      const release = await response.json(), current = app.getVersion(), available = newerVersion(release.tag_name, current);
      const asset = (release.assets || []).find(item => item.name === 'UNiPLAY.exe' && item.browser_download_url?.startsWith(`https://github.com/${UPDATE_REPO}/releases/download/`));
      updateInfo = available ? { status: 'available', message: `Version ${release.tag_name} is available.`, version: release.tag_name, url: asset?.browser_download_url || release.html_url } : { status: 'current', message: `You're up to date (version ${current}).` };
    }
  } catch (error) { updateInfo = { status: 'error', message: `Could not check updates: ${error.message}` }; }
  if (win && !win.isDestroyed()) win.webContents.send('updates:changed', updateInfo);
  return updateInfo;
}
function playlistItem(input) { if (input.jobId) { const job = jobs.find(job => job.id === input.jobId && fileInJobFolder(job)); if (!job) throw new Error('That file is no longer available.'); return itemForJob(job); } const id = youtubeId(input.url); if (!id) throw new Error('Choose a saved file or a YouTube video.'); return { type: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}`, title: String(input.title || 'YouTube video').slice(0, 200), channel: String(input.channel || '').slice(0, 100), thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` }; }
async function firstFrame(job) {
  if (!job || !['video', 'clip-video'].includes(job.kind) || !fileInJobFolder(job)) return null;
  const cache = path.join(app.getPath('userData'), 'previews'); fs.mkdirSync(cache, { recursive: true });
  const target = path.join(cache, `${job.id}.jpg`);
  if (!fs.existsSync(target) || fs.statSync(target).mtimeMs < fs.statSync(job.filePath).mtimeMs) {
    try { await run(binary('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', '-i', job.filePath, '-frames:v', '1', '-vf', 'scale=480:270:force_original_aspect_ratio=increase,crop=480:270', target], null, null, cache); }
    catch { return null; }
  }
  return pathToFileURL(target).href;
}
function run(exe, args, onLine, onStart, cwd = settings.folder) { return new Promise((resolve, reject) => { const child = spawn(exe, args, { windowsHide: true, cwd }); onStart?.(child); let out = '', err = '', pending = ''; child.stdout?.on('data', chunk => { const text = chunk.toString(); out += text; pending += text; const lines = pending.split(/\r?\n|\r/g); pending = lines.pop(); lines.forEach(line => onLine?.(line)); }); child.stderr?.on('data', chunk => { err += chunk.toString(); }); let done = false; child.once('error', error => { if (!done) { done = true; reject(error); } }); child.once('close', code => { if (done) return; done = true; if (pending) onLine?.(pending); code === 0 ? resolve(out) : reject(new Error(err || `Engine stopped with code ${code}`)); }); }); }
function validUrl(value) { try { const url = new URL(value); return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(url.hostname) && ['https:', 'http:'].includes(url.protocol); } catch { return false; } }
function youtubeId(value) { try { const url = new URL(value); if (!validUrl(value)) return null; const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : url.searchParams.get('v'); return /^[\w-]{11}$/.test(id || '') ? id : null; } catch { return null; } }
async function searchVideos(query) { const text = String(query || '').trim().slice(0, 100); if (!text) return []; const list = JSON.parse(await run(binary('yt-dlp'), ['--no-config', '--no-warnings', '--flat-playlist', '-J', `ytsearch10:${text}`])); return (list.entries || []).filter(item => /^[\w-]{11}$/.test(item.id || '')).map(item => ({ id: item.id, url: `https://www.youtube.com/watch?v=${item.id}`, title: item.title || 'YouTube video', channel: item.channel || item.uploader || 'YouTube', thumbnail: `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`, duration: item.duration || 0 })); }
async function analyze(url) { if (!validUrl(url)) throw new Error('Paste a YouTube video, Short, or playlist link.'); const parsed = new URL(url); if (parsed.pathname === '/playlist' && parsed.searchParams.has('list')) { const list = JSON.parse(await run(binary('yt-dlp'), ['--no-config', '--no-warnings', '--flat-playlist', '-J', url])); const entries = (list.entries || []).filter(item => item.id).map(item => ({ url: 'https://www.youtube.com/watch?v=' + item.id, id: item.id, title: item.title || 'YouTube video', channel: item.channel || item.uploader || '', thumbnail: item.thumbnails?.at(-1)?.url || '' })); if (!entries.length) throw new Error('No videos were found in this playlist.'); return { url, id: list.id, title: list.title || 'YouTube playlist', channel: list.channel || list.uploader || 'YouTube', duration: 0, thumbnail: list.thumbnail || entries[0].thumbnail, resolutions: [], playlist: entries }; } const info = JSON.parse(await run(binary('yt-dlp'), ['--no-config', '--no-warnings', '--no-playlist', '-J', '--skip-download', url])); return { url, id: info.id, title: info.title || 'Untitled video', channel: info.channel || info.uploader || 'YouTube', duration: info.duration || 0, thumbnail: info.thumbnail || '', resolutions: [...new Set((info.formats || []).filter(f => f.vcodec && f.vcodec !== 'none' && f.height).map(f => f.height))].sort((a, b) => b - a) }; }
function outputTemplate(job) { const safe = value => String(value || '').replace(/[<>:"/\\|?*]/g, '').slice(0, 48); const clipTag = job.kind.startsWith('clip-') ? ` [clip ${Math.floor(job.start)}-${Math.floor(job.end)}s]` : ''; return path.join(job.folder || settings.folder, `${safe(job.prefix)}%(title).160B${clipTag}${safe(job.suffix)}.%(ext)s`); }
function argsFor(job) { const args = ['--no-config', '--no-playlist', '--newline', '--progress', '--continue', '--ffmpeg-location', path.dirname(binary('ffmpeg')), '--print', 'after_move:DOWNYT_OUTPUT:%(filepath)s', '-o', outputTemplate(job)]; if (job.thumbnail || job.kind === 'thumbnail') args.push('--write-thumbnail', '--convert-thumbnails', 'jpg'); if (job.kind === 'thumbnail') args.push('--skip-download'); else if (job.kind === 'audio' || job.kind === 'clip-audio') args.push('-x', '--audio-format', job.audioFormat || settings.audioFormat, '--audio-quality', job.audioQuality || '0'); else args.push('-f', job.format || 'bv*+ba/b', '--merge-output-format', 'mp4'); if (job.kind.startsWith('clip-')) args.push('--download-sections', `*${job.start}-${job.end}`, '--force-keyframes-at-cuts'); args.push(job.url); return args; }
function processQueue() { while (active.size < settings.concurrent) { const job = jobs.find(j => j.status === 'queued'); if (!job) break; fs.mkdirSync(job.folder || settings.folder, { recursive: true }); job.status = 'downloading'; emit(); const promise = run(binary('yt-dlp'), argsFor(job), line => { const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/); if (match) { job.progress = Number(match[1]); emit(); } if (line.startsWith('DOWNYT_OUTPUT:')) job.filePath = line.slice('DOWNYT_OUTPUT:'.length).trim(); else { const dest = line.match(/(?:Destination:|Merging formats into|Writing video thumbnail to:)\s*"?(.+?)"?$/); if (dest) job.filePath = dest[1].replace(/^"|"$/g, ''); } }, child => active.set(job.id, child), job.folder || settings.folder); promise.then(() => { if (job.status !== 'paused' && job.status !== 'cancelled') { job.status = 'completed'; job.progress = 100; job.completedAt = new Date().toISOString(); if (settings.notifications && Notification.isSupported()) new Notification({ title: 'UNiPLAY', body: `${job.title} is ready` }).show(); } }).catch(error => { if (!active.get(job.id)?.killed && job.status !== 'paused' && job.status !== 'cancelled') { job.status = 'error'; job.error = String(error.message).slice(-700); } }).finally(() => { active.delete(job.id); emit(); processQueue(); }); } }
function createWindow() { win = new BrowserWindow({ width: 1120, height: 740, minWidth: 820, minHeight: 560, show: false, backgroundColor: '#100914', title: 'UNiPLAY', icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'uniplay.ico')), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } }); win.once('ready-to-show', () => win.show()); win.loadFile(path.join(__dirname, 'ui', 'index.html')); win.webContents.setWindowOpenHandler(({ url }) => { if (url === 'https://instagram.com/ungyani' || url === 'https://www.instagram.com/ungyani') shell.openExternal(url); return { action: 'deny' }; }); }
function startDrift() {
  clearInterval(pipTimer);
  pipTimer = setInterval(() => {
    if (!pipWin || pipWin.isDestroyed()) return;
    const point = screen.getCursorScreenPoint(), bounds = pipWin.getBounds(), band = 64;
    const inside = point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    const close = point.x >= bounds.x - band && point.x <= bounds.x + bounds.width + band && point.y >= bounds.y - band && point.y <= bounds.y + bounds.height + band;
    if (driftAnimation) {
      const elapsed = Math.min(1, (Date.now() - driftAnimation.started) / driftAnimation.duration);
      const eased = elapsed < 0.5 ? 4 * elapsed ** 3 : 1 - Math.pow(-2 * elapsed + 2, 3) / 2;
      const x = Math.round(driftAnimation.fromX + (driftAnimation.toX - driftAnimation.fromX) * eased);
      const y = Math.round(driftAnimation.fromY + (driftAnimation.toY - driftAnimation.fromY) * eased);
      if (x !== bounds.x || y !== bounds.y) pipWin.setPosition(x, y, false);
      if (elapsed === 1) driftAnimation = null;
      previousCursor = point; return;
    }
    if (inside) { previousCursor = point; return; }
    if (!close || Date.now() - lastDrift < 1600 || !previousCursor) { previousCursor = point; return; }
    const centerX = bounds.x + bounds.width / 2, centerY = bounds.y + bounds.height / 2;
    const nowDistance = Math.hypot(point.x - centerX, point.y - centerY);
    const priorDistance = Math.hypot(previousCursor.x - centerX, previousCursor.y - centerY);
    if (nowDistance >= priorDistance - 1) { previousCursor = point; return; }
    const display = screen.getDisplayMatching(bounds).workArea;
    const target = driftDestination(bounds, point, display);
    if (target.x !== bounds.x || target.y !== bounds.y) { driftAnimation = { fromX: bounds.x, fromY: bounds.y, toX: target.x, toY: target.y, duration: target.duration, started: Date.now() }; lastDrift = Date.now(); }
    previousCursor = point;
  }, 16);
}
function openPip(input) {
  let source;
  if (input.jobId) {
    const job = jobs.find(j => j.id === input.jobId && j.status === 'completed');
    if (!job?.filePath || !fs.existsSync(job.filePath)) throw new Error('The saved file could not be found. Use Reveal in folder to check its location.');
    source = { type: 'file', url: pathToFileURL(job.filePath).href, title: job.title, channel: job.channel, thumbnail: job.thumbnailUrl, jobId: job.id };
  } else if (input.youtubeUrl) {
    const id = youtubeId(input.youtubeUrl);
    if (!id) throw new Error('Paste a valid YouTube video link.');
    source = { type: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}`, title: String(input.title || 'YouTube video').slice(0, 200), channel: String(input.channel || '').slice(0, 100) };
  } else {
    const parsed = new URL(input.streamUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use a valid stream URL.');
    source = { type: 'live', url: parsed.href, title: String(input.title || 'Live stream'), channels: Array.isArray(input.channels) ? input.channels.filter(s => { try { return ['http:', 'https:'].includes(new URL(s.url).protocol); } catch { return false; } }).slice(0, 200) : [] };
  }
  if (!pipWin || pipWin.isDestroyed()) {
    pipWin = new BrowserWindow({ width: source.type === 'youtube' ? 480 : 360, height: source.type === 'youtube' ? 300 : 226, minWidth: 280, minHeight: 150, frame: false, transparent: true, alwaysOnTop: true, resizable: true, movable: true, skipTaskbar: false, hasShadow: true, backgroundColor: '#00000000', title: 'UNiPLAY Floating Player', webPreferences: { preload: path.join(__dirname, 'pip-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    pipWin.loadFile(path.join(__dirname, 'ui', 'pip.html'));
    pipWin.on('closed', () => { clearInterval(pipTimer); pipWin = null; });
    pipWin.webContents.once('did-finish-load', () => { pipWin.webContents.send('pip:source', source); pipWin.show(); pipWin.moveTop(); startDrift(); });
  } else { if (source.type === 'youtube' && pipWin.getSize()[0] < 400) pipWin.setSize(480, 300); pipWin.webContents.send('pip:source', source); pipWin.show(); pipWin.moveTop(); pipWin.focus(); }
  return true;
}
app.whenReady().then(() => { app.setAppUserModelId('com.downyt.desktop'); if (process.env.DOWNYT_TEST_PROFILE) app.setPath('userData', process.env.DOWNYT_TEST_PROFILE); else {
    const newProfile = path.join(app.getPath('appData'), 'UNiPLAY');
    fs.mkdirSync(newProfile, { recursive: true });
    if (!fs.existsSync(path.join(newProfile, 'data.json'))) for (const oldName of ['DOWNYT', 'downyt']) {
      const previous = path.join(app.getPath('appData'), oldName, 'data.json');
      if (fs.existsSync(previous)) { fs.copyFileSync(previous, path.join(newProfile, 'data.json')); break; }
    }
    app.setPath('userData', newProfile);
  } load(); fs.mkdirSync(settings.folder, { recursive: true });
  // A file:// parent has no HTTP Referer, which YouTube rejects with player error 153.
  // Identify only DOWNYT's embedded player request; leave all other traffic untouched.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube.com/embed/*', 'https://www.youtube-nocookie.com/embed/*'], types: ['subFrame'] }, (details, callback) => {
    if ((win && details.webContentsId === win.webContents.id || pipWin && details.webContentsId === pipWin.webContents.id) && !details.requestHeaders.Referer) details.requestHeaders.Referer = 'https://downyt.local/';
    callback({ requestHeaders: details.requestHeaders });
  });
  app.on('web-contents-created', (_, contents) => contents.on('context-menu', (_, params) => {
    if (!params.isEditable) return;
    const menu = Menu.buildFromTemplate([
      { label: 'Undo', role: 'undo', enabled: params.editFlags.canUndo },
      { label: 'Redo', role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
      { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
      { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
      { label: 'Select all', role: 'selectAll' },
    ]);
    menu.popup({ window: BrowserWindow.fromWebContents(contents) || win });
  }));
  ipcMain.handle('state:get', () => ({ settings, jobs, playlists, engine: { ready: fs.existsSync(binary('yt-dlp')) && fs.existsSync(binary('ffmpeg')) } }));
  ipcMain.handle('library:list', () => libraryJobs());
  ipcMain.handle('library:preview', (_, id) => firstFrame(jobs.find(job => job.id === id)));
  ipcMain.handle('library:delete', async (_, ids) => {
    if (!Array.isArray(ids) || !ids.length || ids.length > 500) throw new Error('Select up to 500 files to delete.');
    const selected = libraryJobs().filter(job => ids.includes(job.id));
    const succeeded = new Set(), failed = [];
    for (const filePath of new Set(selected.map(job => job.filePath))) {
      try { await shell.trashItem(filePath); succeeded.add(filePath); }
      catch (error) { failed.push(`${path.basename(filePath)}: ${error.message}`); }
    }
    if (succeeded.size) {
      const removedIds = new Set(jobs.filter(job => succeeded.has(job.filePath)).map(job => job.id));
      jobs = jobs.filter(job => !removedIds.has(job.id));
      for (const list of playlists) list.items = list.items.filter(item => item.type !== 'job' || !removedIds.has(item.id));
      emit();
    }
    return { deleted: succeeded.size, failed };
  });
  ipcMain.handle('playlists:list', () => playlists);
  ipcMain.handle('playlists:create', (_, name) => { const title = String(name || '').trim().slice(0, 55); if (!title) throw new Error('Name your playlist.'); if (playlists.some(list => list.name.toLowerCase() === title.toLowerCase())) throw new Error('That playlist already exists.'); const list = { id: crypto.randomUUID(), name: title, items: [] }; playlists.push(list); emit(); return list; });
  ipcMain.handle('playlists:delete', (_, id) => { if (id === 'liked') throw new Error('Liked is a built-in playlist.'); const count = playlists.length; playlists = playlists.filter(list => list.id !== id); if (playlists.length === count) return false; emit(); return true; });
  ipcMain.handle('playlists:add', (_, listId, input) => { const list = playlists.find(item => item.id === listId); if (!list) throw new Error('Playlist not found.'); const item = playlistItem(input); if (!list.items.some(saved => saved.type === item.type && saved.id === item.id)) list.items.push(item); emit(); return list; });
  ipcMain.handle('playlists:remove', (_, listId, itemId) => { const list = playlists.find(item => item.id === listId); if (!list) throw new Error('Playlist not found.'); list.items = list.items.filter(item => item.id !== itemId); emit(); return list; });
  ipcMain.handle('audio:catalog', () => libraryJobs().filter(job => job.kind !== 'thumbnail').map(itemForJob));
  ipcMain.handle('pip:play-item', (_, item) => item.type === 'job' ? openPip({ jobId: item.id }) : openPip({ youtubeUrl: item.url, title: item.title, channel: item.channel }));
  ipcMain.handle('pip:mode', (_, mode) => { if (!pipWin || pipWin.isDestroyed()) return false; const compact = mode === 'audio' || mode === 'audio-expanded'; pipWin.setMinimumSize(compact ? 320 : 280, compact ? 145 : 150); pipWin.setSize(compact ? 390 : 480, mode === 'audio-expanded' ? 420 : compact ? 180 : 300, true); pipWin.moveTop(); return true; });
  ipcMain.handle('video:analyze', (_, url) => analyze(url));
  ipcMain.handle('video:search', (_, query) => searchVideos(query));
  ipcMain.handle('updates:check', () => checkUpdates());
  ipcMain.handle('updates:open', () => { if (updateInfo.status !== 'available' || !updateInfo.url) throw new Error('No update is available.'); const url = new URL(updateInfo.url); if (url.hostname !== 'github.com' || !url.pathname.startsWith(`/${UPDATE_REPO}/releases/`)) throw new Error('Update link was not trusted.'); return shell.openExternal(url.href); });
  ipcMain.handle('jobs:add', (_, input) => { if (!validUrl(input.url)) throw new Error('Paste a valid YouTube link.'); if (!['video', 'audio', 'thumbnail', 'clip-video', 'clip-audio'].includes(input.kind)) throw new Error('Invalid download type.'); if (input.kind.startsWith('clip-') && (!(input.end > input.start) || input.start < 0)) throw new Error('Choose a valid clip range.'); const audioQuality = ['0', '320K', '256K', '192K', '128K', '96K'].includes(input.audioQuality) ? input.audioQuality : '0'; const job = { id: crypto.randomUUID(), title: String(input.title || 'YouTube video').slice(0, 300), channel: String(input.channel || ''), thumbnailUrl: input.thumbnailUrl || '', url: input.url, kind: input.kind, format: input.format || 'bv*+ba/b', quality: String(input.quality || (input.kind.includes('audio') ? (input.audioFormat || settings.audioFormat).toUpperCase() : 'Best')), audioFormat: input.audioFormat || settings.audioFormat, audioQuality, thumbnail: !!input.thumbnail, start: input.start, end: input.end, folder: settings.folder, prefix: settings.prefix, suffix: settings.suffix, progress: 0, status: 'queued', createdAt: new Date().toISOString(), filePath: null, error: null }; jobs.push(job); emit(); processQueue(); return job; });
  ipcMain.handle('jobs:action', (_, { id, action }) => { const job = jobs.find(j => j.id === id); if (!job) return false; if (action === 'pause' && ['queued', 'downloading'].includes(job.status)) { job.status = 'paused'; active.get(id)?.kill(); } else if (action === 'resume' && ['paused', 'error', 'cancelled'].includes(job.status)) { job.status = 'queued'; job.error = null; } else if (action === 'cancel' && job.status !== 'completed') { job.status = 'cancelled'; active.get(id)?.kill(); } else if (action === 'remove' && !['downloading', 'queued'].includes(job.status)) jobs = jobs.filter(j => j.id !== id); else return false; emit(); processQueue(); return true; });
  ipcMain.handle('jobs:clearCompleted', () => { for (const job of jobs) if (job.status === 'completed') job.hiddenFromQueue = true; emit(); return true; });
  ipcMain.handle('settings:update', (_, patch) => { for (const key of ['concurrent', 'thumbnail', 'notifications', 'prefix', 'suffix', 'audioFormat']) if (Object.hasOwn(patch, key)) settings[key] = patch[key]; settings.concurrent = Math.max(1, Math.min(5, Number(settings.concurrent) || 2)); emit(); processQueue(); return settings; });
  ipcMain.handle('folder:choose', async () => { const choice = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: settings.folder }); if (!choice.canceled && choice.filePaths[0]) { settings.folder = choice.filePaths[0]; emit(); } return settings.folder; });
  ipcMain.handle('folder:open', (_, filePath, folder) => filePath && fs.existsSync(filePath) ? shell.showItemInFolder(filePath) : shell.openPath(folder && fs.existsSync(folder) ? folder : settings.folder));
  ipcMain.handle('pip:open', (_, input) => openPip(input));
  ipcMain.handle('pip:youtube-select', (_, video) => openPip({ youtubeUrl: video.url, title: video.title, channel: video.channel }));
  ipcMain.handle('pip:close', () => { pipWin?.close(); return true; });
  ipcMain.handle('pip:pin', () => { if (!pipWin || pipWin.isDestroyed()) return false; pipWin.setAlwaysOnTop(!pipWin.isAlwaysOnTop()); return pipWin.isAlwaysOnTop(); });
  createWindow(); processQueue(); setTimeout(checkUpdates, 2500); setInterval(checkUpdates, 24 * 60 * 60 * 1000).unref(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('before-quit', () => { clearTimeout(saveTimer); for (const child of active.values()) child.kill(); if (settings) save(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
