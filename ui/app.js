const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let state = { settings: {}, jobs: [], playlists: [] }, current = null, clipInfo = null, mode = 'both', clipMode = 'video', libraryFilter = 'all';
let libraryItems = [], selectedFiles = new Set(), previewUrls = {}, pendingPreviews = new Set(), selectedPlaylist = 'liked';
let streams = JSON.parse(localStorage.getItem('downyt-streams') || '[]');
const icons = { video: 'video', audio: 'music-2', thumbnail: 'image', 'clip-video': 'scissors', 'clip-audio': 'scissors' };
const escaped = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = (name, title, action, id) => '<button class="iconbutton" title="' + title + '" aria-label="' + title + '" data-action="' + action + '" data-id="' + id + '"><img src="icons/' + name + '.svg" alt=""></button>';
const duration = seconds => { const value = Math.floor(Number(seconds) || 0); return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0'); };
const parseTime = value => { const parts = String(value).trim().split(':'); if (!parts.length || parts.length > 3 || parts.some(part => !/^\d+$/.test(part))) return NaN; return parts.reduce((total, part) => total * 60 + Number(part), 0); };
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 4300); }
function view(name) { $$('.nav').forEach(n => n.classList.toggle('active', n.dataset.view === name)); $$('.view').forEach(n => n.classList.toggle('active', n.id === name)); if (name === 'library') refreshLibrary(); }
$$('.nav').forEach(n => n.addEventListener('click', () => view(n.dataset.view)));
function setFeedback(selector, text) { $(selector).textContent = text || ''; }
function renderSettings() { const s = state.settings; $('#save-location').textContent = s.folder || ''; $('#concurrent').value = String(s.concurrent || 2); $('#default-thumbnail').checked = !!s.thumbnail; $('#notifications').checked = !!s.notifications; $('#prefix').value = s.prefix || ''; $('#suffix').value = s.suffix || ''; $('#audio-format').value = s.audioFormat || 'mp3'; }
function row(job, library = false) {
  if (library) {
    const liked = state.playlists?.find(list => list.id === 'liked')?.items.some(item => item.type === 'job' && item.id === job.id);
    const cover = previewUrls[job.id] || job.thumbnailUrl || 'uniplay.svg';
    const quality = job.quality || (job.kind.includes('audio') ? (job.audioFormat || 'mp3').toUpperCase() : 'Best');
    return '<div class="item library-item" data-job-id="' + job.id + '"><label class="selectbox"><input type="checkbox" data-select-id="' + job.id + '" aria-label="Select ' + escaped(job.title) + '" ' + (selectedFiles.has(job.id) ? 'checked' : '') + '></label><div class="item-icon"><img data-preview-id="' + job.id + '" src="' + escaped(cover) + '" alt="Preview of ' + escaped(job.title) + '"></div><div><div class="item-title" title="' + escaped(job.title) + '">' + escaped(job.title) + '</div><div class="item-sub">' + escaped(job.kind.replace('-', ' ')) + ' · ' + escaped(quality) + '</div></div><div class="item-status">On disk</div><div class="item-actions">' + (job.kind === 'thumbnail' ? '' : '<button class="float-label" data-action="play" data-id="' + job.id + '">Float ↗</button>') + icon('heart', liked ? 'Remove from Liked' : 'Add to Liked', 'like', job.id).replace('class="iconbutton"', 'class="iconbutton' + (liked ? ' liked' : '') + '"') + icon('folder-open', 'Show in folder', 'reveal', job.id) + '</div></div>';
  }
  const actions = library ? (job.kind === 'thumbnail' ? '' : icon('play', 'Play in floating player', 'play', job.id)) + icon('folder-open', 'Show in folder', 'reveal', job.id) + icon('rotate-ccw', 'Download again', 'again', job.id) :
    job.status === 'downloading' || job.status === 'queued' ? icon('pause', 'Pause', 'pause', job.id) + icon('x', 'Cancel', 'cancel', job.id) :
    job.status === 'paused' || job.status === 'error' || job.status === 'cancelled' ? icon('play', 'Resume', 'resume', job.id) + icon('trash-2', 'Remove', 'remove', job.id) :
    icon('folder-open', 'Show in folder', 'reveal', job.id) + icon('trash-2', 'Remove', 'remove', job.id);
  const stateText = job.status === 'downloading' ? Math.round(job.progress || 0) + '%' : job.status;
  const error = job.error ? '<div class="item-sub" title="' + escaped(job.error) + '">' + escaped(job.error) + '</div>' : '';
  const progress = job.status === 'downloading' ? '<div class="progress"><i style="width:' + Math.min(100, Math.max(0, job.progress || 0)) + '%"></i></div>' : '';
  const kind = job.kind.replace('-', ' ');
  const quality = job.quality || (job.kind.includes('audio') ? (job.audioFormat || 'mp3').toUpperCase() : job.kind === 'thumbnail' ? 'JPG' : 'Best');
  const clipRange = job.kind.startsWith('clip-') ? ' · ' + duration(job.start) + '–' + duration(job.end) : '';
  return '<div class="item"><div class="item-icon"><img src="icons/' + (icons[job.kind] || 'download') + '.svg" alt=""></div><div><div class="item-title" title="' + escaped(job.title) + '">' + escaped(job.title) + '</div><div class="item-sub">' + escaped(kind) + ' · ' + escaped(quality) + clipRange + ' · ' + escaped(job.channel || 'YouTube') + '</div>' + error + progress + '</div><div class="item-status ' + (job.status === 'error' ? 'error' : '') + '">' + escaped(stateText) + '</div><div class="item-actions">' + actions + '</div></div>';
}
function renderLists() {
  const jobs = [...state.jobs].filter(j => !j.hiddenFromQueue).reverse();
  $('#queue-list').innerHTML = jobs.length ? jobs.map(j => row(j)).join('') : '<div class="empty">Nothing queued. Paste a link to start.</div>';
  const term = $('#library-search').value.trim().toLowerCase();
  const completed = [...libraryItems].reverse().filter(j => (!term || j.title.toLowerCase().includes(term)) && (libraryFilter === 'all' || (libraryFilter === 'clip' ? j.kind.startsWith('clip-') : j.kind === libraryFilter)));
  $('#library-list').innerHTML = completed.length ? completed.map(j => row(j, true)).join('') : '<div class="empty">No matching downloads yet.</div>';
  $('#library-count').textContent = selectedFiles.size + ' selected';
  $('#library-delete').disabled = !selectedFiles.size;
  $('#library-select-all').checked = completed.length > 0 && completed.every(job => selectedFiles.has(job.id));
  renderPlaylists();
}
async function refreshLibrary() {
  if (!window.downyt) return;
  try {
    libraryItems = await window.downyt.library();
    const available = new Set(libraryItems.map(job => job.id));
    selectedFiles = new Set([...selectedFiles].filter(id => available.has(id)));
    renderLists();
    for (const job of libraryItems.filter(job => ['video', 'clip-video'].includes(job.kind) && !previewUrls[job.id] && !pendingPreviews.has(job.id))) {
      pendingPreviews.add(job.id);
      window.downyt.preview(job.id).then(url => { if (url) { previewUrls[job.id] = url; const image = document.querySelector('[data-preview-id="' + job.id + '"]'); if (image) image.src = url; } }).finally(() => pendingPreviews.delete(job.id));
    }
  } catch (error) { toast(error.message); }
}
async function analyze(url, target) {
  if (!window.downyt) throw new Error('Desktop bridge did not start. Reinstall UNiPLAY.');
  if (!url.trim()) throw new Error('Paste a YouTube link.');
  const button = target === 'clip' ? $('#clip-preview') : $('#analyze');
  button.disabled = true; const old = button.textContent; button.textContent = 'Reading…';
  try { return await window.downyt.analyze(url.trim()); }
  finally { button.disabled = false; button.textContent = old; }
}
$('#analyze').addEventListener('click', async () => {
  setFeedback('#download-feedback', '');
  try {
    current = await analyze($('#url').value, 'download');
    $('#video-title').textContent = current.title;
    $('#video-meta').textContent = current.playlist ? current.playlist.length + ' videos · ' + current.channel : current.channel + ' · ' + duration(current.duration);
    $('#thumb').src = current.thumbnail || 'uniplay.svg';
    const choices = ['Best', ...current.resolutions.map(x => x + 'p')];
    $('#quality').innerHTML = choices.map((x, i) => '<option value="' + (i ? current.resolutions[i - 1] : 'best') + '">' + x + '</option>').join('');
    $('#thumbnail-only').hidden = !!current.playlist;
    $('#result').hidden = false;
  } catch (error) { current = null; $('#result').hidden = true; setFeedback('#download-feedback', error.message || 'Could not read this link.'); }
});
$('#url').addEventListener('keydown', event => { if (event.key === 'Enter') $('#analyze').click(); });
$$('#mode-choice button').forEach(button => button.addEventListener('click', () => { mode = button.dataset.mode; $$('#mode-choice button').forEach(x => x.classList.toggle('selected', x === button)); $('#quality').disabled = mode === 'audio'; }));
async function queueItem(kind, info, extra = {}) {
  return window.downyt.add({ url: info.url, title: info.title, channel: info.channel, thumbnailUrl: info.thumbnail, kind, ...extra });
}
$('#start-download').addEventListener('click', async () => {
  if (!current) return;
  const height = $('#quality').value;
  const format = height === 'best' ? 'bv*+ba/b' : 'bv*[height<=' + Number(height) + ']+ba/b';
  const button = $('#start-download'); button.disabled = true;
  try {
    const targets = current.playlist || [current];
    for (const target of targets) {
      if (mode === 'video' || mode === 'both') await queueItem('video', target, { format, quality: height === 'best' ? 'Best available' : height + 'p', thumbnail: $('#thumbnail-toggle').checked });
      if (mode === 'audio' || mode === 'both') await queueItem('audio', target, { quality: state.settings.audioFormat.toUpperCase(), thumbnail: mode === 'audio' && $('#thumbnail-toggle').checked });
    }
    view('queue'); toast(current.playlist ? targets.length + ' videos added to the queue.' : mode === 'both' ? 'Video and audio added to the queue.' : 'Download added to the queue.');
  } catch (error) { setFeedback('#download-feedback', error.message); }
  finally { button.disabled = false; }
});
$('#thumbnail-only').addEventListener('click', async () => { if (!current) return; try { await queueItem('thumbnail', current, { quality: 'JPG' }); view('queue'); toast('Thumbnail added to the queue.'); } catch (error) { setFeedback('#download-feedback', error.message); } });
$('#queue-list').addEventListener('click', handleRowAction);
$('#library-list').addEventListener('click', handleRowAction);
async function handleRowAction(event) {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const job = state.jobs.find(j => j.id === button.dataset.id); if (!job) return;
  try {
    if (button.dataset.action === 'reveal') await window.downyt.openFolder(job.filePath, job.folder);
    else if (button.dataset.action === 'play') await window.downyt.openPip({ jobId: job.id });
    else if (button.dataset.action === 'like') {
      const list = state.playlists.find(item => item.id === 'liked');
      const wasLiked = list.items.some(item => item.type === 'job' && item.id === job.id);
      if (wasLiked) await window.downyt.removeFromPlaylist('liked', job.id);
      else await window.downyt.addToPlaylist('liked', { jobId: job.id });
      toast(wasLiked ? 'Removed from Liked.' : 'Added to Liked.');
    }
    else if (button.dataset.action === 'again') { await window.downyt.add(job); view('queue'); }
    else await window.downyt.action(job.id, button.dataset.action);
  } catch (error) { toast(error.message); }
}
$('#clear-completed').addEventListener('click', () => window.downyt.clearCompleted());
$('#library-search').addEventListener('input', renderLists);
$$('#library-filters button').forEach(button => button.addEventListener('click', () => { libraryFilter = button.dataset.filter; $$('#library-filters button').forEach(x => x.classList.toggle('selected', x === button)); renderLists(); }));
$('#library-list').addEventListener('change', event => { const id = event.target.dataset.selectId; if (!id) return; if (event.target.checked) selectedFiles.add(id); else selectedFiles.delete(id); renderLists(); });
$('#library-select-all').addEventListener('change', event => { const term = $('#library-search').value.trim().toLowerCase(); const visible = libraryItems.filter(job => (!term || job.title.toLowerCase().includes(term)) && (libraryFilter === 'all' || (libraryFilter === 'clip' ? job.kind.startsWith('clip-') : job.kind === libraryFilter))); for (const job of visible) { if (event.target.checked) selectedFiles.add(job.id); else selectedFiles.delete(job.id); } renderLists(); });
$('#library-delete').addEventListener('click', async () => {
  const count = selectedFiles.size; if (!count) return;
  if (!window.confirm(`Move ${count} selected file${count === 1 ? '' : 's'} to the Recycle Bin? This removes the actual files from their folders.`)) return;
  try { const result = await window.downyt.deleteFiles([...selectedFiles]); selectedFiles.clear(); await refreshLibrary(); toast(`${result.deleted} file${result.deleted === 1 ? '' : 's'} moved to the Recycle Bin.`); if (result.failed.length) toast(result.failed.join(' · ')); }
  catch (error) { toast(error.message); }
});
function renderPlaylists() {
  const lists = state.playlists || [];
  if (!lists.some(list => list.id === selectedPlaylist)) selectedPlaylist = lists[0]?.id || 'liked';
  const target = $('#library-playlist-target'), previous = target.value;
  target.innerHTML = lists.map(list => '<option value="' + escaped(list.id) + '">' + escaped(list.name) + '</option>').join('');
  target.value = lists.some(list => list.id === previous) ? previous : selectedPlaylist;
  $('#playlist-tabs').innerHTML = lists.map(list => '<button class="' + (selectedPlaylist === list.id ? 'active' : '') + '" data-list-id="' + escaped(list.id) + '">' + escaped(list.name) + ' · ' + list.items.length + '</button>').join('');
  const list = lists.find(item => item.id === selectedPlaylist);
  $('#playlist-items').innerHTML = !list ? '<div class="playlist-empty">Create a playlist to get started.</div>' : (list.items.length ? list.items.map(item => '<div class="playlist-track"><span title="' + escaped(item.title) + '">' + escaped(item.title) + '</span><button data-play-item="' + escaped(item.id) + '">Float ↗</button><button data-remove-item="' + escaped(item.id) + '">Remove</button></div>').join('') : '<div class="playlist-empty">Add saved files here, or tap the heart to fill Liked.</div>') + (list.id === 'liked' ? '' : '<button class="subtle small" id="delete-playlist">Delete playlist</button>');
}
$('#create-playlist').addEventListener('click', async () => { try { const list = await window.downyt.createPlaylist($('#new-playlist').value); $('#new-playlist').value = ''; selectedPlaylist = list.id; renderPlaylists(); $('#library-playlist-target').value = list.id; toast('Playlist created.'); } catch (error) { toast(error.message); } });
$('#new-playlist').addEventListener('keydown', event => { if (event.key === 'Enter') $('#create-playlist').click(); });
$('#library-add-playlist').addEventListener('click', async () => { if (!selectedFiles.size) { toast('Select saved files first.'); return; } try { for (const id of selectedFiles) await window.downyt.addToPlaylist($('#library-playlist-target').value, { jobId: id }); toast('Added to playlist.'); selectedFiles.clear(); renderLists(); } catch (error) { toast(error.message); } });
$('#playlist-tabs').addEventListener('click', event => { const tab = event.target.closest('[data-list-id]'); if (!tab) return; selectedPlaylist = tab.dataset.listId; renderPlaylists(); });
$('#playlist-items').addEventListener('click', async event => {
  const list = state.playlists.find(item => item.id === selectedPlaylist); if (!list) return;
  const play = event.target.closest('[data-play-item]'), remove = event.target.closest('[data-remove-item]');
  try {
    if (play) { const item = list.items.find(item => item.id === play.dataset.playItem); if (item) await window.downyt.openPip(item.type === 'job' ? { jobId: item.id } : { youtubeUrl: item.url, title: item.title, channel: item.channel }); }
    else if (remove) await window.downyt.removeFromPlaylist(list.id, remove.dataset.removeItem);
    else if (event.target.id === 'delete-playlist' && window.confirm(`Delete playlist “${list.name}”? The saved media files will stay on disk.`)) { await window.downyt.deletePlaylist(list.id); selectedPlaylist = 'liked'; }
  } catch (error) { toast(error.message); }
});
$('#clip-preview').addEventListener('click', async () => {
  setFeedback('#clip-feedback', '');
  try {
    clipInfo = await analyze($('#clip-url').value, 'clip');
    if (!clipInfo.duration) throw new Error('This video has no trim timeline.');
    $('#clip-title').textContent = clipInfo.title; $('#clip-duration').textContent = duration(clipInfo.duration);
    $('#clip-start').max = Math.max(0, Math.floor(clipInfo.duration) - 1); $('#clip-start').value = 0;
    $('#clip-end').max = Math.floor(clipInfo.duration); $('#clip-end').value = Math.floor(clipInfo.duration);
    $('#clip-editor').hidden = false; updateClipTimes();
    renderClipQuality();
    $('#clip-folder').textContent = 'Save to ' + state.settings.folder + '  ↗';
    $('#clip-player').src = 'https://www.youtube.com/embed/' + encodeURIComponent(clipInfo.id) + '?rel=0';
  } catch (error) { clipInfo = null; $('#clip-editor').hidden = true; setFeedback('#clip-feedback', error.message); }
});
function updateClipTimes(changed = '') {
  let start = Number($('#clip-start').value), end = Number($('#clip-end').value);
  if (start >= end) { if (changed === 'start') end = Math.min(Math.floor(clipInfo.duration), start + 1); else start = Math.max(0, end - 1); }
  $('#clip-start').value = start; $('#clip-end').value = end;
  $('#clip-end').min = start + 1; $('#clip-start').max = end - 1;
  $('#start-time').value = duration(start); $('#end-time').value = duration(end);
}
$('#clip-start').addEventListener('input', () => updateClipTimes('start'));
$('#clip-end').addEventListener('input', () => updateClipTimes('end'));
for (const [field, slider, other] of [['#start-time', '#clip-start', '#clip-end'], ['#end-time', '#clip-end', '#clip-start']]) {
  const input = $(field);
  function applyTime() {
    if (!clipInfo) return;
    const seconds = parseTime(input.value), durationMax = Math.floor(clipInfo.duration);
    const valid = Number.isFinite(seconds) && seconds >= 0 && seconds <= durationMax && (field === '#start-time' ? seconds < Number($(other).value) : seconds > Number($(other).value));
    input.classList.toggle('invalid', !valid);
    if (!valid) { setFeedback('#clip-feedback', 'Enter a time within the video and keep Start before End.'); return; }
    setFeedback('#clip-feedback', ''); $(slider).value = seconds; updateClipTimes();
  }
  input.addEventListener('change', applyTime);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { applyTime(); input.blur(); } });
  input.addEventListener('input', () => input.classList.remove('invalid'));
}
$('#play-range').addEventListener('click', () => { if (!clipInfo) return; $('#clip-player').src = 'https://www.youtube.com/embed/' + encodeURIComponent(clipInfo.id) + '?autoplay=1&start=' + $('#clip-start').value + '&end=' + $('#clip-end').value; });
function renderClipQuality() {
  if (!clipInfo) return;
  const options = clipMode === 'video' ? [{ value: 'best', label: 'Best available' }, ...clipInfo.resolutions.map(height => ({ value: String(height), label: height + 'p' }))] :
    (state.settings.audioFormat === 'wav' || state.settings.audioFormat === 'flac' ? [{ value: '0', label: 'Lossless output' }] : [{ value: '0', label: 'Best source' }, ...['320K', '256K', '192K', '128K', '96K'].map(value => ({ value, label: value.slice(0, -1) + ' kbps output' }))]);
  $('#clip-quality').innerHTML = options.map(option => '<option value="' + option.value + '">' + option.label + '</option>').join('');
}
$$('#clip-mode-choice button').forEach(button => button.addEventListener('click', () => { clipMode = button.dataset.clipMode; $$('#clip-mode-choice button').forEach(item => item.classList.toggle('selected', item === button)); renderClipQuality(); }));
$('#download-clip').addEventListener('click', async () => {
  if (!clipInfo) return;
  if ($$('.time-input.invalid').length) { setFeedback('#clip-feedback', 'Correct the time before downloading.'); return; }
  const button = $('#download-clip'); button.disabled = true;
  try {
    const selected = $('#clip-quality').value, audio = clipMode === 'audio';
    const format = selected === 'best' ? 'bv*+ba/b' : 'bv*[height<=' + Number(selected) + ']+ba/b';
    const quality = audio ? state.settings.audioFormat.toUpperCase() + ' · ' + (selected === '0' ? 'Best source' : selected.slice(0, -1) + ' kbps') : selected === 'best' ? 'Best available' : selected + 'p';
    await queueItem(audio ? 'clip-audio' : 'clip-video', clipInfo, { start: Number($('#clip-start').value), end: Number($('#clip-end').value), format: audio ? undefined : format, audioFormat: state.settings.audioFormat, audioQuality: audio ? selected : '0', quality });
    view('queue'); toast('Clip added to the queue. Use the folder icon when it finishes.');
  } catch (error) { setFeedback('#clip-feedback', error.message); }
  finally { button.disabled = false; }
});
$('#clip-folder').addEventListener('click', () => window.downyt.openFolder(null, state.settings.folder));
function renderStreams() { $('#streams').innerHTML = streams.length ? streams.map(s => '<div class="stream-row"><img src="icons/radio.svg" width="19" alt=""><div class="stream-name">' + escaped(s.name) + '<small>' + escaped(s.url) + '</small></div>' + icon('play', 'Play stream', 'playstream', s.id) + icon('trash-2', 'Remove stream', 'removestream', s.id) + '</div>').join('') : '<div class="empty">No streams added yet.</div>'; }
$('#add-stream').addEventListener('click', () => {
  const name = $('#stream-name').value.trim(), url = $('#stream-url').value.trim();
  try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw Error(); if (!name) throw Error(); streams.push({ id: String(Date.now()), name, url }); localStorage.setItem('downyt-streams', JSON.stringify(streams)); $('#stream-name').value = ''; $('#stream-url').value = ''; setFeedback('#live-feedback', ''); renderStreams(); } catch { setFeedback('#live-feedback', 'Enter a channel name and a valid stream URL.'); }
});
$('#streams').addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (!button) return; const stream = streams.find(s => s.id === button.dataset.id); if (!stream) return; if (button.dataset.action === 'removestream') { streams = streams.filter(s => s.id !== stream.id); localStorage.setItem('downyt-streams', JSON.stringify(streams)); renderStreams(); return; } playStream(stream); });
async function playStream(stream) { try { await window.downyt.openPip({ streamUrl: stream.url, title: stream.name, channels: streams }); } catch (error) { toast(error.message); } }
function parsePlaylist(text) {
  if (/^#EXT-X-/m.test(text)) throw new Error('This is an HLS stream manifest. Paste its online M3U8 URL above.');
  const found = []; let label = '';
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const item = line.trim();
    if (item.startsWith('#EXTINF:')) { label = item.split(',').slice(1).join(',').trim() || item.match(/tvg-name="([^"]+)"/)?.[1] || ''; continue; }
    if (!item || item.startsWith('#')) continue;
    try { const url = new URL(item); if (['http:', 'https:'].includes(url.protocol)) found.push({ id: crypto.randomUUID(), name: label || url.hostname, url: url.href }); } catch { /* Local paths cannot be played as remote streams. */ }
    label = '';
  }
  return found;
}
async function importPlaylist(file) {
  if (!file) return;
  try {
    if (!/\.m3u8?$/i.test(file.name)) throw new Error('Choose an .m3u or .m3u8 playlist.');
    const found = parsePlaylist(await file.text());
    if (!found.length) throw new Error('No online channel links were found in that playlist.');
    const existing = new Set(streams.map(item => item.url));
    const added = found.filter(item => !existing.has(item.url));
    streams.push(...added); localStorage.setItem('downyt-streams', JSON.stringify(streams)); renderStreams();
    setFeedback('#live-feedback', ''); toast(added.length ? `${added.length} channel${added.length === 1 ? '' : 's'} imported.` : 'These channels are already in your list.');
  } catch (error) { setFeedback('#live-feedback', error.message); }
}
$('#browse-playlist').addEventListener('click', event => { event.stopPropagation(); $('#playlist-file').click(); });
$('#playlist-drop').addEventListener('click', () => $('#playlist-file').click());
$('#playlist-drop').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#playlist-file').click(); } });
$('#playlist-file').addEventListener('change', event => { importPlaylist(event.target.files[0]); event.target.value = ''; });
for (const name of ['dragenter', 'dragover']) $('#playlist-drop').addEventListener(name, event => { event.preventDefault(); $('#playlist-drop').classList.add('dragover'); });
for (const name of ['dragleave', 'drop']) $('#playlist-drop').addEventListener(name, event => { event.preventDefault(); $('#playlist-drop').classList.remove('dragover'); if (name === 'drop') importPlaylist(event.dataTransfer.files[0]); });
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => event.preventDefault());
let youtubeResults = [];
function renderYoutubeResults() {
  $('#youtube-results').innerHTML = youtubeResults.length ? youtubeResults.map((video, index) => '<button class="youtube-card" data-index="' + index + '"><img src="' + escaped(video.thumbnail) + '" alt=""><span><strong>' + escaped(video.title) + '</strong><small>' + escaped(video.channel) + (video.duration ? ' · ' + duration(video.duration) : '') + '</small></span></button>').join('') : '<div class="empty">No videos found.</div>';
}
$('#youtube-search').addEventListener('click', async () => {
  const query = $('#youtube-query').value.trim(); if (!query) { setFeedback('#youtube-feedback', 'Search or paste a video link.'); return; }
  const button = $('#youtube-search'); button.disabled = true; button.textContent = 'Finding…'; setFeedback('#youtube-feedback', '');
  try {
    if (/^https?:\/\//i.test(query)) { const info = await window.downyt.analyze(query); if (info.playlist) throw new Error('Paste a single video link here.'); await window.downyt.openPip({ youtubeUrl: info.url, title: info.title, channel: info.channel }); youtubeResults = [info]; renderYoutubeResults(); }
    else { youtubeResults = await window.downyt.searchVideos(query); renderYoutubeResults(); }
  } catch (error) { setFeedback('#youtube-feedback', error.message); }
  finally { button.disabled = false; button.textContent = 'Search'; }
});
$('#youtube-query').addEventListener('keydown', event => { if (event.key === 'Enter') $('#youtube-search').click(); });
$('#youtube-results').addEventListener('click', async event => { const card = event.target.closest('[data-index]'); if (!card) return; const video = youtubeResults[Number(card.dataset.index)]; if (!video) return; try { await window.downyt.openPip({ youtubeUrl: video.url, title: video.title, channel: video.channel }); } catch (error) { setFeedback('#youtube-feedback', error.message); } });
$('#youtube-float').addEventListener('click', async () => { const query = $('#youtube-query').value.trim(); try { let info; if (/^https?:\/\//i.test(query)) info = await window.downyt.analyze(query); else info = youtubeResults[0]; if (!info || info.playlist) throw new Error('Paste a video link or search first.'); await window.downyt.openPip({ youtubeUrl: info.url, title: info.title, channel: info.channel }); } catch (error) { setFeedback('#youtube-feedback', error.message); } });
let latestUpdate = { status: 'checking', message: 'Checking for updates…' };
function renderUpdate(info) { latestUpdate = info; $('#updates-message').textContent = info.message; $('#update-badge').hidden = info.status !== 'available'; $('#updates-action').hidden = info.status !== 'available'; }
$('#updates-button').addEventListener('click', () => { $('#updates-panel').hidden = !$('#updates-panel').hidden; });
$('#updates-refresh').addEventListener('click', async () => { renderUpdate({ status: 'checking', message: 'Checking for updates…' }); try { renderUpdate(await window.downyt.checkUpdates()); } catch (error) { renderUpdate({ status: 'error', message: error.message }); } });
$('#updates-action').addEventListener('click', async () => { try { await window.downyt.openUpdate(); } catch (error) { toast(error.message); } });
$('#choose-folder').addEventListener('click', async () => { try { const folder = await window.downyt.chooseFolder(); $('#save-location').textContent = folder; } catch (error) { toast(error.message); } });
for (const [selector, key, eventName, value] of [['#concurrent', 'concurrent', 'change', e => Number(e.target.value)], ['#default-thumbnail', 'thumbnail', 'change', e => e.target.checked], ['#notifications', 'notifications', 'change', e => e.target.checked], ['#prefix', 'prefix', 'change', e => e.target.value], ['#suffix', 'suffix', 'change', e => e.target.value], ['#audio-format', 'audioFormat', 'change', e => e.target.value]]) $(selector).addEventListener(eventName, event => window.downyt.updateSettings({ [key]: value(event) }).then(next => { state.settings = next; if (key === 'audioFormat') renderClipQuality(); }).catch(error => toast(error.message)));
async function boot() { renderStreams(); if (!window.downyt) { $('#engine-status').textContent = 'App connection failed'; $('#engine-detail').textContent = 'Unavailable'; setFeedback('#download-feedback', 'The desktop connection did not start. Please reinstall UNiPLAY.'); return; } try { const initial = await window.downyt.state(); state = initial; $('#engine').classList.toggle('ready', initial.engine.ready); $('#engine-status').textContent = initial.engine.ready ? 'Engine online' : 'Engine unavailable'; $('#engine-detail').textContent = initial.engine.ready ? 'Working' : 'Missing tools'; $('#thumbnail-toggle').checked = !!initial.settings.thumbnail; renderSettings(); renderLists(); window.downyt.onUpdates(renderUpdate); window.downyt.onState(next => { state = { ...state, ...next }; $('#save-location').textContent = state.settings.folder; if (clipInfo) $('#clip-folder').textContent = 'Save to ' + state.settings.folder + '  ↗'; renderLists(); if ($('#library').classList.contains('active')) refreshLibrary(); }); setInterval(() => { if ($('#library').classList.contains('active')) refreshLibrary(); }, 5000); } catch (error) { $('#engine-status').textContent = 'Connection error'; setFeedback('#download-feedback', error.message); } }
boot();
