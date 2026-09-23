const video = document.querySelector('#video');
const pip = document.querySelector('#pip');
const toggle = document.querySelector('#toggle img');
const seek = document.querySelector('#seek');
const youtubeFrame = document.querySelector('#youtube-frame');
const dragHandle = document.querySelector('.drag');
const resizeHandle = document.querySelector('#resize-handle');
const cover = document.querySelector('#audio-cover');
const artwork = document.createElement('div');
artwork.className = 'audio-art';
cover.parentElement.insertBefore(artwork, cover);
artwork.appendChild(cover);
let overlayTimer;
function revealOverlay() { pip.classList.remove('controls-idle'); clearTimeout(overlayTimer); overlayTimer = setTimeout(() => pip.classList.add('controls-idle'), 1900); }
pip.addEventListener('pointermove', revealOverlay);
pip.addEventListener('pointerenter', revealOverlay);
pip.addEventListener('pointerleave', () => { clearTimeout(overlayTimer); pip.classList.add('controls-idle'); });
revealOverlay();
let dragStart;
dragHandle.addEventListener('pointerdown', event => { if (event.button !== 0) return; dragStart = { screenX: event.screenX, screenY: event.screenY, windowX: window.screenX, windowY: window.screenY }; dragHandle.setPointerCapture(event.pointerId); event.preventDefault(); });
dragHandle.addEventListener('pointermove', event => { if (!dragStart) return; window.downytPip.moveTo(dragStart.windowX + event.screenX - dragStart.screenX, dragStart.windowY + event.screenY - dragStart.screenY); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) dragHandle.addEventListener(type, () => { if (dragStart) window.downytPip.dragEnd(); dragStart = null; });
let resizeStart;
resizeHandle.addEventListener('pointerdown', event => { if (event.button !== 0) return; resizeStart = { screenX: event.screenX, screenY: event.screenY, width: window.innerWidth, ratio: window.innerWidth / window.innerHeight }; resizeHandle.setPointerCapture(event.pointerId); event.preventDefault(); });
resizeHandle.addEventListener('pointermove', event => { if (!resizeStart) return; const dx = event.screenX - resizeStart.screenX, dy = (event.screenY - resizeStart.screenY) * resizeStart.ratio; window.downytPip.resizeTo(resizeStart.width + (Math.abs(dx) >= Math.abs(dy) ? dx : dy)); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) resizeHandle.addEventListener(type, () => { resizeStart = null; });
let source, hls, channelIndex = -1, exploreResults = [], searchSequence = 0;
let audioMode = false, shelfOpen = false, playlists = [], catalog = [], activePlaylist = 'liked';
let noticeTimer;
function playerNotice(message) { const notice = document.querySelector('#player-notice'); notice.textContent = message; notice.classList.add('visible'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.classList.remove('visible'), 5200); }
const escaped = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const formatTime = seconds => Math.floor((Number(seconds) || 0) / 60) + ':' + String(Math.floor(Number(seconds) || 0) % 60).padStart(2, '0');
function load(next) {
  source = next; hls?.destroy(); hls = null;
  video.pause(); video.removeAttribute('src'); video.load();
  youtubeFrame.removeAttribute('src');
  document.querySelector('#title').textContent = next.title || 'UNiPLAY';
  pip.classList.toggle('live', next.type === 'live');
  pip.classList.toggle('youtube', next.type === 'youtube');
  pip.classList.toggle('direct', next.type === 'direct');
  pip.classList.toggle('file', next.type === 'file' || next.type === 'direct');
  pip.classList.remove('exploring');
  if (next.type === 'youtube' && audioMode) setAudioMode(false);
  document.querySelector('#audio-title').textContent = next.title || 'UNiPLAY';
  document.querySelector('#audio-artist').textContent = next.channel || 'Saved locally';
  document.querySelector('#audio-cover').src = next.thumbnail || 'uniplay.svg';
  refreshAudioData();
  if (next.type === 'youtube') {
    youtubeFrame.src = `https://www.youtube.com/embed/${encodeURIComponent(next.id)}?autoplay=1&rel=0&playsinline=1`;
    document.querySelector('#explore-query').value = '';
    searchExplore([next.title, next.channel].filter(Boolean).join(' '));
    return;
  }
  if (next.type === 'direct') { document.querySelector('#explore-query').value = ''; searchExplore([next.title, next.channel].filter(Boolean).join(' ')); }
  if (next.type === 'live' && Array.isArray(next.channels)) channelIndex = next.channels.findIndex(c => c.url === next.url);
  if (next.type === 'live' && !video.canPlayType('application/vnd.apple.mpegurl') && window.Hls?.isSupported()) {
    hls = new Hls(window.streamLoaderConfig(window.streamBridge)); hls.loadSource(next.url); hls.attachMedia(video); hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
  } else { video.src = next.url; video.play().catch(() => {}); }
}
window.downytPip.onSource(load);
window.downytPip.onThumbnail(({ jobId, url }) => { if (source?.jobId === jobId) { source.thumbnail = url; cover.src = url; } });
document.querySelector('#close').onclick = () => window.downytPip.close();
document.querySelector('#pin').onclick = async () => { const pinned = await window.downytPip.pin(); document.querySelector('#pin img').src = pinned ? 'icons/pin.svg' : 'icons/pin-off.svg'; };
document.querySelector('#toggle').onclick = () => video.paused ? video.play() : video.pause();
video.onplay = () => { toggle.src = 'icons/pause.svg'; document.querySelector('#audio-toggle img').src = 'icons/pause.svg'; };
video.onloadedmetadata = () => { if (video.videoWidth && video.videoHeight) window.downytPip.setAspect(video.videoWidth / video.videoHeight).catch(() => {}); };
video.onpause = () => { toggle.src = 'icons/play.svg'; document.querySelector('#audio-toggle img').src = 'icons/play.svg'; };
video.onerror = () => { if (source?.type === 'direct' && source.id) { const failed = source; load({ ...failed, type: 'youtube', url: failed.originalUrl }); playerNotice('Direct playback stopped. Trying the YouTube player.'); } };
document.querySelector('#rewind').onclick = () => { if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, video.currentTime - 10); };
document.querySelector('#skip').onclick = () => { if (Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, video.currentTime + 10); };
function channel(step) { if (!source?.channels?.length) return; channelIndex = (channelIndex + step + source.channels.length) % source.channels.length; const next = source.channels[channelIndex]; load({ ...source, url: next.url, title: next.name }); }
document.querySelector('#back').onclick = () => channel(-1);
document.querySelector('#forward').onclick = () => channel(1);
video.ontimeupdate = () => { if (!Number.isFinite(video.duration) || !video.duration) return; const pct = video.currentTime / video.duration * 100; seek.value = Math.round(pct * 10); seek.style.setProperty('--progress', pct + '%'); const audioSeek = document.querySelector('#audio-seek'); audioSeek.value = seek.value; audioSeek.style.setProperty('--progress', pct + '%'); document.querySelector('#audio-current').textContent = formatTime(video.currentTime); document.querySelector('#audio-total').textContent = formatTime(video.duration); };
seek.oninput = () => { if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value) / 1000 * video.duration; };
document.querySelector('#audio-seek').oninput = event => { if (Number.isFinite(video.duration)) video.currentTime = Number(event.target.value) / 1000 * video.duration; };
async function setAudioMode(enabled, expanded = false) { audioMode = enabled; shelfOpen = expanded && enabled; pip.classList.toggle('audio-mode', enabled); pip.classList.toggle('audio-expanded', shelfOpen); await window.downytPip.setAudioMode(shelfOpen ? 'audio-expanded' : enabled ? 'audio' : 'video'); if (enabled) refreshAudioData(); }
document.querySelector('#audio-mode').onclick = async () => { if (source?.type === 'file' || source?.type === 'live' || source?.type === 'direct') { setAudioMode(!audioMode).catch(error => playerNotice(error.message)); return; } if (source?.type === 'youtube') playerNotice('This video uses the embedded YouTube player and cannot switch to compact audio.'); };
document.querySelector('#audio-toggle').onclick = () => video.paused ? video.play() : video.pause();
document.querySelector('#audio-list').onclick = () => setAudioMode(true, !shelfOpen);
document.querySelector('#audio-shelf-close').onclick = () => setAudioMode(true, false);
function currentList() { return playlists.find(list => list.id === activePlaylist) || playlists[0]; }
function currentItem() { return source?.jobId ? { type: 'job', id: source.jobId, title: source.title, channel: source.channel, thumbnail: source.thumbnail } : null; }
function renderAudioHeart() { const liked = playlists.find(list => list.id === 'liked')?.items.some(item => item.type === 'job' && item.id === source?.jobId); document.querySelector('#audio-heart').classList.toggle('liked', !!liked); }
function renderAudioLists() {
  const selection = document.querySelector('#audio-playlist');
  selection.innerHTML = playlists.map(list => `<option value="${escaped(list.id)}">${escaped(list.name)} · ${list.items.length}</option>`).join('');
  if (!playlists.some(list => list.id === activePlaylist)) activePlaylist = 'liked';
  selection.value = activePlaylist; renderAudioHeart(); renderAudioTracks();
}
function renderAudioTracks() {
  const query = document.querySelector('#audio-search').value.trim().toLowerCase();
  const list = currentList();
  const items = query ? catalog.filter(item => item.title.toLowerCase().includes(query) || item.channel.toLowerCase().includes(query)) : (list?.items || []).filter(item => item.type !== 'job' || catalog.some(saved => saved.id === item.id));
  document.querySelector('#audio-tracks').innerHTML = items.length ? items.map(item => {
    const present = !!list?.items.some(saved => saved.type === item.type && saved.id === item.id);
    return `<div class="shelf-track"><span title="${escaped(item.title)}">${escaped(item.title)}</span><button data-audio-play="${escaped(item.id)}">Play</button><button data-audio-action="${present ? 'remove' : 'add'}" data-audio-id="${escaped(item.id)}">${present ? '−' : '+'}</button></div>`;
  }).join('') : '<div style="padding:10px;color:#baa2c0;font-size:10px">' + (query ? 'No saved tracks match.' : 'Add a saved track from search or Library.') + '</div>';
}
async function refreshAudioData() { try { [catalog, playlists] = await Promise.all([window.downytPip.catalog(), window.downytPip.playlists()]); renderAudioLists(); } catch { /* The player still works without playlist data. */ } }
window.downytPip.onPlaylists(next => { playlists = next; renderAudioLists(); });
document.querySelector('#audio-playlist').onchange = event => { activePlaylist = event.target.value; renderAudioTracks(); };
document.querySelector('#audio-search').oninput = renderAudioTracks;
document.querySelector('#audio-new').onclick = () => { document.querySelector('#audio-new-row').hidden = false; document.querySelector('#audio-new-name').focus(); };
document.querySelector('#audio-new-save').onclick = async () => { try { const list = await window.downytPip.createPlaylist(document.querySelector('#audio-new-name').value); activePlaylist = list.id; document.querySelector('#audio-new-name').value = ''; document.querySelector('#audio-new-row').hidden = true; await refreshAudioData(); } catch (error) { document.querySelector('#audio-new-name').setCustomValidity(error.message); document.querySelector('#audio-new-name').reportValidity(); } };
document.querySelector('#audio-new-name').oninput = event => event.target.setCustomValidity('');
document.querySelector('#audio-new-name').onkeydown = event => { if (event.key === 'Enter') document.querySelector('#audio-new-save').click(); };
document.querySelector('#audio-heart').onclick = async () => { const item = currentItem(); if (!item) return; const liked = playlists.find(list => list.id === 'liked'); if (liked?.items.some(saved => saved.type === 'job' && saved.id === item.id)) await window.downytPip.removeFromPlaylist('liked', item.id); else await window.downytPip.addToPlaylist('liked', { jobId: item.id }); };
document.querySelector('#audio-tracks').onclick = async event => {
  const play = event.target.closest('[data-audio-play]'), action = event.target.closest('[data-audio-action]');
  const list = currentList(), id = play?.dataset.audioPlay || action?.dataset.audioId;
  const item = [...(list?.items || []), ...catalog].find(track => track.id === id); if (!item) return;
  try { if (play) await window.downytPip.playItem(item); else if (action.dataset.audioAction === 'add') await window.downytPip.addToPlaylist(list.id, item.type === 'job' ? { jobId: item.id } : item); else await window.downytPip.removeFromPlaylist(list.id, item.id); }
  catch (error) { document.querySelector('#audio-search').setCustomValidity(error.message); document.querySelector('#audio-search').reportValidity(); }
};
async function stepAudio(step) { const listItems = currentList()?.items.filter(item => item.type !== 'job' || catalog.some(saved => saved.id === item.id)) || []; const items = listItems.length ? listItems : catalog; if (!items.length) return; const index = items.findIndex(item => item.type === 'job' && item.id === source?.jobId); const target = items[index < 0 ? step > 0 ? 0 : items.length - 1 : (index + step + items.length) % items.length]; await window.downytPip.playItem(target); }
document.querySelector('#audio-back').onclick = () => stepAudio(-1);
document.querySelector('#audio-forward').onclick = () => stepAudio(1);
video.onended = () => { if (audioMode) stepAudio(1); };
function renderExplore() {
  document.querySelector('#explore-results').innerHTML = exploreResults.length ? exploreResults.map((item, index) => `<button class="explore-item" data-index="${index}"><img src="${escaped(item.thumbnail)}" alt=""><span><strong>${escaped(item.title)}</strong><small>${escaped(item.channel)}</small></span></button>`).join('') : '<div style="padding:10px;color:#c5a9ca">No videos found.</div>';
}
async function searchExplore(query) {
  const text = String(query || '').trim(); if (!text) return;
  const sequence = ++searchSequence;
  document.querySelector('#explore-status').textContent = 'Finding videos…';
  try {
    const results = await window.downytPip.searchVideos(text);
    if (!['youtube', 'direct'].includes(source?.type) || sequence !== searchSequence) return;
    exploreResults = results.filter(item => item.id !== source.id);
    renderExplore();
    document.querySelector('#explore-status').textContent = exploreResults.length + ' videos';
  } catch (error) { document.querySelector('#explore-status').textContent = error.message || 'Search failed.'; }
}
document.querySelector('#explore-tab').addEventListener('click', () => pip.classList.add('exploring'));
document.querySelector('#explore-close').addEventListener('click', () => pip.classList.remove('exploring'));
document.querySelector('#explore-go').addEventListener('click', () => searchExplore(document.querySelector('#explore-query').value));
document.querySelector('#explore-query').addEventListener('keydown', event => { if (event.key === 'Enter') searchExplore(event.target.value); });
document.querySelector('#explore-results').addEventListener('click', async event => { const button = event.target.closest('[data-index]'); if (!button) return; const item = exploreResults[Number(button.dataset.index)]; if (!item) return; button.disabled = true; try { await window.downytPip.selectYoutube(item); } catch (error) { playerNotice(error.message || 'Could not switch video.'); button.disabled = false; } });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (pip.classList.contains('exploring')) pip.classList.remove('exploring'); else window.downytPip.close(); } if (event.key === ' ' && source?.type !== 'youtube' && event.target.tagName !== 'INPUT') { event.preventDefault(); video.paused ? video.play() : video.pause(); } });
