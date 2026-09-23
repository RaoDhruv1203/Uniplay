const studio = {
  canvas: document.querySelector('#studio-canvas'),
  video: document.createElement('video'), players: [], sources: [], layers: [], active: -1, selectedSource: -1,
  selectedLayer: null, hls: null, recorder: null, audioContext: null,
  audioDestination: null, audioNodes: [], broadcast: null, sent: Promise.resolve(),
  loaders: new Map(), pending: null, requestSequence: 0, switching: false, sourceStartedAt: 0, pausedAt: 0, pausedMs: 0,
};
studio.players = [studio.video, document.createElement('video')];
for (const player of studio.players) { player.playsInline = true; player.preload = 'auto'; player.autoplay = false; player.loop = false; player.style.display = 'none'; document.body.appendChild(player); }
const S = selector => document.querySelector(selector);
const se = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const studioTransport = document.createElement('div');
studioTransport.className = 'studio-transport';
studioTransport.innerHTML = '<button class="subtle small" id="studio-toggle" aria-label="Pause or play preview">Pause</button><input id="studio-seek" type="range" min="0" max="1000" value="0" aria-label="Studio video timeline"><span id="studio-position">0:00 / 0:00</span>';
studio.canvas.after(studioTransport);
const studioSourceControls = document.createElement('div');
studioSourceControls.className = 'studio-source-controls';
studioSourceControls.innerHTML = '<strong id="studio-source-label">Select a source</strong><div><label>Play <select id="studio-play-mode"><option value="once">Once, then next</option><option value="loop">Loop segment</option></select></label><label>From <input id="studio-start-at" placeholder="0:00" inputmode="numeric"></label><label>To <input id="studio-end-at" placeholder="End" inputmode="numeric"></label><label>Duration <input id="studio-duration" placeholder="Full" inputmode="numeric" title="Maximum time on air, including loops; works for live streams"></label></div><small id="studio-source-hint">Set a maximum duration for a live stream or trim a local video. Leave blank to play the full source.</small>';
S('#studio-sources').after(studioSourceControls);
const studioRemote = document.createElement('div');
studioRemote.className = 'studio-remote'; studioRemote.id = 'studio-remote'; studioRemote.hidden = true;
studioRemote.innerHTML = '<div><button class="subtle small" id="studio-remote-start">Share outside my network</button><button class="subtle small" id="studio-remote-stop" hidden>Stop remote link</button><span id="studio-remote-state">Off</span></div><div class="studio-link" id="studio-remote-link" hidden><input id="studio-remote-url" readonly aria-label="Public broadcast link"><button class="subtle small" id="studio-remote-copy">Copy link</button></div><small>Anyone with this link can watch while your PC is live. This temporary link changes each session and uses Cloudflare’s testing tunnel, which has no uptime guarantee.</small>';
S('#studio-link').after(studioRemote);
function studioFeedback(message) { S('#studio-feedback').textContent = message || ''; }
const studioTime = seconds => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0'); };
function parseStudioTime(value) { if (!String(value || '').trim()) return 0; const parts = String(value).trim().split(':'); if (parts.length > 3 || parts.some(part => !/^\d+$/.test(part))) return NaN; return parts.reduce((total, part) => total * 60 + Number(part), 0); }
function sourceElapsed() { if (!studio.sourceStartedAt) return 0; return Math.max(0, (performance.now() - studio.sourceStartedAt - studio.pausedMs - (studio.pausedAt ? performance.now() - studio.pausedAt : 0)) / 1000); }
function studioSourceFields() {
  const source = studio.sources[studio.selectedSource];
  studioSourceControls.hidden = !source;
  if (!source) return;
  S('#studio-source-label').textContent = source.name;
  S('#studio-play-mode').value = source.playMode || 'once';
  S('#studio-start-at').value = source.type === 'file' && source.startAt ? studioTime(source.startAt) : '';
  S('#studio-end-at').value = source.type === 'file' && source.endAt ? studioTime(source.endAt) : '';
  S('#studio-duration').value = source.limit ? studioTime(source.limit) : '';
  S('#studio-start-at').disabled = S('#studio-end-at').disabled = source.type !== 'file';
  S('#studio-play-mode').disabled = source.type !== 'file';
  S('#studio-source-hint').textContent = source.type === 'stream' ? 'A live stream plays until its duration ends or you select another source.' : 'Loop repeats the selected range. Duration is the maximum total time before moving to the next source.';
}
function studioSources() {
  S('#studio-sources').innerHTML = studio.sources.length ? studio.sources.map((source, index) => '<div class="studio-source' + (index === studio.active ? ' active' : '') + '"><button data-play="' + index + '"><span>' + (source.type === 'stream' ? '◉' : '▶') + '</span><strong>' + se(source.name) + '</strong></button><small>' + (source.limit ? studioTime(source.limit) : source.playMode === 'loop' ? 'Loop' : 'Once') + '</small><button data-edit="' + index + '" title="Set playback timing">Edit</button><button data-raise="' + index + '" title="Move up">↑</button><button data-remove="' + index + '" title="Remove from queue">×</button></div>').join('') : '<div class="studio-empty">Add a video or stream to the queue.</div>';
  studioSourceFields();
}
function studioLayers() {
  S('#studio-layers').innerHTML = studio.layers.length ? studio.layers.map(layer => '<div class="studio-layer' + (layer.id === studio.selectedLayer ? ' active' : '') + '"><input type="checkbox" data-visible="' + se(layer.id) + '" ' + (layer.visible ? 'checked' : '') + ' title="Show layer"><button data-layer="' + se(layer.id) + '">' + (layer.type === 'text' ? 'T' : layer.type === 'live-badge' ? '●' : '▣') + ' ' + se(layer.name) + '</button><button data-up="' + se(layer.id) + '" title="Bring forward">↑</button></div>').join('') : '<div class="studio-empty">Add text, a ticker, LIVE badge, logo, image or GIF.</div>';
  const layer = studio.layers.find(item => item.id === studio.selectedLayer);
  S('#studio-layer-controls').hidden = !layer;
  if (!layer) return;
  S('#studio-text').parentElement.hidden = layer.type !== 'text';
  S('#studio-ticker-speed').parentElement.hidden = layer.type !== 'text' || layer.motion !== 'ticker';
  S('#studio-ticker-speed').value = layer.tickerSpeed || 120;
  S('#studio-text').value = layer.text || '';
  for (const [id, key] of [['color', 'color'], ['background', 'background'], ['stroke', 'stroke'], ['size', 'size'], ['outline', 'outline'], ['shadow', 'shadow'], ['width', 'w'], ['height', 'h'], ['x', 'x'], ['y', 'y'], ['opacity', 'opacity'], ['motion', 'motion']]) S('#studio-' + id).value = layer[key];
  S('#studio-backdrop-enabled').checked = layer.backdrop;
}
function selectStudioLayer(id) { studio.selectedLayer = id; studioLayers(); }
function newStudioLayer(type, source) {
  const layer = { id: crypto.randomUUID(), type, name: source?.name || (type === 'live-badge' ? 'LIVE badge' : 'Text'), text: type === 'text' ? 'Your message' : '', image: source?.url || '', x: 75, y: 76, w: type === 'image' ? 160 : type === 'live-badge' ? 180 : 310, h: type === 'image' ? 160 : type === 'live-badge' ? 62 : 120, size: 52, color: '#ffffff', background: '#000000', stroke: '#000000', outline: 0, shadow: 8, opacity: 100, motion: 'none', tickerSpeed: 120, backdrop: false, visible: true, created: performance.now() };
  studio.layers.push(layer); selectStudioLayer(layer.id);
}
function clearStudioPlayer(player) { studio.loaders.get(player)?.destroy(); studio.loaders.delete(player); player.pause(); player.removeAttribute('src'); player.load(); }
function cueStudio(index) {
  const source = studio.sources[index]; if (!source) return null;
  if (studio.pending?.source === source && studio.pending.index === index) return studio.pending;
  const player = studio.active < 0 ? studio.video : studio.players.find(item => item !== studio.video);
  clearStudioPlayer(player); player.muted = true;
  const promise = new Promise((resolve, reject) => {
    let finished = false;
    const complete = error => { if (finished) return; finished = true; clearTimeout(timer); player.removeEventListener('loadeddata', ready); player.removeEventListener('error', failed); player.removeEventListener('seeked', ready); error ? reject(error) : resolve(player); };
    const ready = () => { if (source.type === 'file' && source.startAt && Math.abs(player.currentTime - source.startAt) > .25) return; if (player.readyState >= 2) complete(); };
    const failed = () => complete(new Error('This source could not load. The current video will stay on air.'));
    const timer = setTimeout(() => complete(new Error('The next source did not become ready. The current video will stay on air.')), 18000);
    player.addEventListener('loadeddata', ready); player.addEventListener('seeked', ready); player.addEventListener('error', failed);
    if (source.type === 'file') player.addEventListener('loadedmetadata', () => { if (source.startAt) player.currentTime = Math.min(source.startAt, Math.max(0, player.duration - .1)); }, { once: true });
    if (source.type === 'stream' && window.Hls?.isSupported()) { const hls = new Hls(window.streamLoaderConfig(window.streamBridge)); studio.loaders.set(player, hls); hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) complete(new Error('The stream could not be prepared: ' + data.details)); }); hls.loadSource(source.url); hls.attachMedia(player); }
    else player.src = source.url;
  });
  studio.pending = { index, source, player, promise };
  return studio.pending;
}
async function studioPlay(index) {
  const source = studio.sources[index]; if (!source) return;
  const sequence = ++studio.requestSequence, previous = studio.video;
  studio.switching = true;
  const cued = cueStudio(index);
  if (!cued) return;
  try {
    const ready = await cued.promise;
    if (sequence !== studio.requestSequence || studio.sources[index] !== source) return;
    studio.video = ready; studio.active = index; studio.selectedSource = index; studio.pending = null;
    ready.muted = false; ready.volume = 1;
    studio.sourceStartedAt = performance.now(); studio.pausedMs = 0; studio.pausedAt = 0;
    for (const node of studio.audioNodes) node.gain.gain.value = node.player === ready ? 1 : 0;
    await ready.play();
    if (previous !== ready) { previous.pause(); previous.muted = true; }
    studioSources(); studioFeedback('');
  } catch (error) { if (sequence === studio.requestSequence) { studio.pending = null; studioFeedback(error.message); } }
  finally { if (sequence === studio.requestSequence) studio.switching = false; }
}
for (const player of studio.players) {
  player.addEventListener('ended', () => { if (player !== studio.video || studio.switching) return; const source = studio.sources[studio.active]; if (!source) return; if (source.playMode === 'loop' && (!source.limit || sourceElapsed() < source.limit)) { player.currentTime = source.startAt || 0; player.play().catch(error => studioFeedback(error.message)); } else studioPlay((studio.active + 1) % studio.sources.length); });
  player.addEventListener('pause', () => { if (player === studio.video && !studio.pausedAt) studio.pausedAt = performance.now(); });
  player.addEventListener('play', () => { if (player === studio.video && studio.pausedAt) { studio.pausedMs += performance.now() - studio.pausedAt; studio.pausedAt = 0; } });
}
S('#studio-add-file').onclick = async () => { try { const chosen = await window.studioBridge.pick(); studio.sources.push(...chosen.filter(item => item.type === 'video').map(item => ({ ...item, type: 'file', playMode: 'once', startAt: 0, endAt: 0, limit: 0 }))); if (!studio.sources.length) studioFeedback('Choose a video file. Use Image / GIF for overlays.'); studioSources(); if (studio.active < 0 && studio.sources.length) studioPlay(0); } catch (error) { studioFeedback(error.message); } };
S('#studio-add-stream').onclick = () => { try { const url = new URL(S('#studio-stream-url').value.trim()); if (!['http:', 'https:'].includes(url.protocol)) throw Error(); studio.sources.push({ type: 'stream', name: url.hostname, url: url.href, limit: 0 }); S('#studio-stream-url').value = ''; studioSources(); if (studio.active < 0) studioPlay(0); } catch { studioFeedback('Enter a valid HTTP or HTTPS stream link.'); } };
S('#studio-stream-url').onkeydown = event => { if (event.key === 'Enter') S('#studio-add-stream').click(); };
S('#studio-sources').onclick = event => { const play = event.target.closest('[data-play]'), edit = event.target.closest('[data-edit]'), remove = event.target.closest('[data-remove]'), raise = event.target.closest('[data-raise]'); if (play) studioPlay(Number(play.dataset.play)); if (edit) { studio.selectedSource = Number(edit.dataset.edit); studioSourceFields(); } if (raise) { const index = Number(raise.dataset.raise); if (index > 0) { [studio.sources[index - 1], studio.sources[index]] = [studio.sources[index], studio.sources[index - 1]]; if (studio.active === index) studio.active--; else if (studio.active === index - 1) studio.active++; if (studio.selectedSource === index) studio.selectedSource--; else if (studio.selectedSource === index - 1) studio.selectedSource++; studioSources(); } } if (remove) { const index = Number(remove.dataset.remove); studio.sources.splice(index, 1); if (studio.selectedSource === index) studio.selectedSource = Math.min(index, studio.sources.length - 1); else if (studio.selectedSource > index) studio.selectedSource--; if (studio.active === index) { if (studio.sources.length) { studio.active = -1; studioPlay(Math.min(index, studio.sources.length - 1)); } else { studio.active = -1; clearStudioPlayer(studio.video); } } else if (studio.active > index) studio.active--; studioSources(); } };
S('#studio-next').onclick = () => { if (studio.sources.length) studioPlay((studio.active + 1) % studio.sources.length); };
S('#studio-toggle').onclick = () => { if (studio.video.paused) studio.video.play().catch(error => studioFeedback(error.message)); else studio.video.pause(); };
S('#studio-seek').oninput = event => { if (Number.isFinite(studio.video.duration) && studio.video.duration) studio.video.currentTime = Number(event.target.value) / 1000 * studio.video.duration; };
for (const [id, key] of [['studio-start-at', 'startAt'], ['studio-end-at', 'endAt'], ['studio-duration', 'limit']]) S('#' + id).addEventListener('change', event => { const source = studio.sources[studio.selectedSource]; if (!source) return; const value = parseStudioTime(event.target.value); if (!Number.isFinite(value) || value < 0 || value > 86400) { studioFeedback('Use a time such as 1:30 or 30:00, up to 24 hours.'); event.target.value = source[key] ? studioTime(source[key]) : ''; return; } if (key === 'endAt' && value && value <= (source.startAt || 0)) { studioFeedback('End must be after Start.'); return; } source[key] = value; studioFeedback(''); studioSources(); });
S('#studio-play-mode').onchange = event => { const source = studio.sources[studio.selectedSource]; if (source?.type === 'file') { source.playMode = event.target.value; studioSources(); } };
S('#studio-add-text').onclick = () => newStudioLayer('text');
const tickerButton = document.createElement('button'); tickerButton.className = 'subtle small'; tickerButton.id = 'studio-add-ticker'; tickerButton.textContent = 'Ticker'; S('#studio-add-text').after(tickerButton);
const liveButton = document.createElement('button'); liveButton.className = 'subtle small'; liveButton.id = 'studio-add-live'; liveButton.textContent = 'LIVE'; S('#studio-add-ticker').after(liveButton);
const tickerOption = document.createElement('option'); tickerOption.value = 'ticker'; tickerOption.textContent = 'Ticker scroll'; S('#studio-motion').appendChild(tickerOption);
const tickerSpeedRow = document.createElement('label'); tickerSpeedRow.innerHTML = 'Ticker speed <input id="studio-ticker-speed" type="number" min="25" max="500" value="120">'; S('#studio-motion').parentElement.after(tickerSpeedRow);
tickerButton.onclick = () => { newStudioLayer('text'); const layer = studio.layers.at(-1); layer.name = 'Ticker'; layer.text = 'Live from UNiPLAY'; layer.motion = 'ticker'; layer.x = 90; layer.y = 655; layer.w = 1080; layer.h = 68; layer.size = 42; layer.backdrop = true; studioLayers(); };
liveButton.onclick = () => { newStudioLayer('live-badge'); const layer = studio.layers.at(-1); layer.x = 1060; layer.y = 35; studioLayers(); };
S('#studio-add-logo').onclick = () => newStudioLayer('image', { name: 'UNiPLAY logo', url: 'uniplay.svg' });
S('#studio-add-image').onclick = () => S('#studio-image-input').click();
S('#studio-image-input').onchange = event => { const file = event.target.files[0]; if (!file) return; const url = URL.createObjectURL(file); newStudioLayer('image', { name: file.name, url }); event.target.value = ''; };
S('#studio-layers').onclick = event => { const select = event.target.closest('[data-layer]'), up = event.target.closest('[data-up]'); if (select) selectStudioLayer(select.dataset.layer); if (up) { const index = studio.layers.findIndex(item => item.id === up.dataset.up); if (index >= 0 && index < studio.layers.length - 1) [studio.layers[index], studio.layers[index + 1]] = [studio.layers[index + 1], studio.layers[index]]; studioLayers(); } };
S('#studio-layers').onchange = event => { const input = event.target.closest('[data-visible]'); if (!input) return; const layer = studio.layers.find(item => item.id === input.dataset.visible); if (layer) layer.visible = input.checked; };
for (const [id, key] of [['text', 'text'], ['color', 'color'], ['background', 'background'], ['stroke', 'stroke'], ['size', 'size'], ['outline', 'outline'], ['shadow', 'shadow'], ['width', 'w'], ['height', 'h'], ['x', 'x'], ['y', 'y'], ['opacity', 'opacity'], ['motion', 'motion']]) S('#studio-' + id).addEventListener('input', event => { const layer = studio.layers.find(item => item.id === studio.selectedLayer); if (layer) { layer[key] = ['size', 'outline', 'shadow', 'opacity', 'w', 'h', 'x', 'y'].includes(key) ? Number(event.target.value) : event.target.value; if (key === 'text') { layer.name = layer.text.slice(0, 25) || 'Text'; studioLayers(); } } });
S('#studio-ticker-speed').oninput = event => { const layer = studio.layers.find(item => item.id === studio.selectedLayer); if (layer) layer.tickerSpeed = Math.max(25, Math.min(500, Number(event.target.value) || 120)); };
S('#studio-motion').onchange = () => studioLayers();
S('#studio-backdrop-enabled').onchange = event => { const layer = studio.layers.find(item => item.id === studio.selectedLayer); if (layer) layer.backdrop = event.target.checked; };
S('#studio-remove-layer').onclick = () => { studio.layers = studio.layers.filter(item => item.id !== studio.selectedLayer); studio.selectedLayer = null; studioLayers(); };
const ctx = studio.canvas.getContext('2d', { alpha: false });
const studioImages = new Map();
let lastTransportTick = 0;
function drawStudio(time) {
  const width = studio.canvas.width, height = studio.canvas.height;
  ctx.fillStyle = '#151519'; ctx.fillRect(0, 0, width, height);
  if (studio.video.readyState >= 2 && studio.video.videoWidth && studio.video.videoHeight) { const scale = Math.min(width / studio.video.videoWidth, height / studio.video.videoHeight); const w = studio.video.videoWidth * scale, h = studio.video.videoHeight * scale; try { ctx.drawImage(studio.video, (width - w) / 2, (height - h) / 2, w, h); } catch {} }
  else { ctx.fillStyle = '#aa7d9f'; ctx.font = '700 32px Arial'; ctx.textAlign = 'center'; ctx.fillText('UNiPLAY LIVE STUDIO', width / 2, height / 2); ctx.textAlign = 'start'; }
  const activeSource = studio.sources[studio.active], video = studio.video;
  if (activeSource && !studio.switching && !video.paused) {
    const elapsed = sourceElapsed(), limitLeft = activeSource.limit ? activeSource.limit - elapsed : Infinity;
    const end = activeSource.type === 'file' ? activeSource.endAt || video.duration : Infinity;
    const segmentLeft = Number.isFinite(end) ? end - video.currentTime : Infinity;
    const next = (studio.active + 1) % studio.sources.length;
    const willAdvance = activeSource.type === 'stream' || activeSource.playMode !== 'loop' || Number.isFinite(limitLeft);
    const advanceLeft = activeSource.playMode === 'loop' ? limitLeft : Math.min(limitLeft, segmentLeft);
    if (studio.sources.length > 1 && willAdvance && advanceLeft < 8 && time > (studio.preloadAfter || 0)) {
      const pending = cueStudio(next);
      if (pending) pending.promise.catch(() => { studio.preloadAfter = performance.now() + 5000; });
    }
    if (limitLeft <= 0) studioPlay(next);
    else if (activeSource.type === 'file' && segmentLeft <= 0) {
      if (activeSource.playMode === 'loop') { video.currentTime = activeSource.startAt || 0; video.play().catch(() => {}); }
      else studioPlay(next);
    }
  }
  if (time - lastTransportTick > 120) {
    lastTransportTick = time;
    const seekable = activeSource?.type === 'file' && Number.isFinite(video.duration) && video.duration > 0;
    S('#studio-seek').disabled = !seekable;
    if (seekable) S('#studio-seek').value = String(Math.round(video.currentTime / video.duration * 1000));
    S('#studio-position').textContent = studioTime(video.currentTime) + ' / ' + (seekable ? studioTime(video.duration) : 'LIVE');
    S('#studio-toggle').textContent = video.paused ? 'Play' : 'Pause';
    S('#studio-toggle').disabled = !activeSource;
  }
  for (const layer of studio.layers) {
    if (!layer.visible) continue; ctx.save();
    const t = (time - layer.created) / 1000;
    ctx.globalAlpha = layer.opacity / 100 * (layer.motion === 'fade' ? Math.min(1, Math.max(0, t)) : layer.motion === 'pulse' ? .75 + .25 * Math.sin(t * 3) : 1);
    const x = layer.x, y = layer.y + (layer.motion === 'float' ? Math.sin(t * 2) * 9 : 0);
    ctx.shadowColor = '#000000'; ctx.shadowBlur = layer.shadow;
    if (layer.type === 'live-badge') {
      const pulse = .75 + .25 * Math.sin(time / 430);
      ctx.fillStyle = '#17171ce0'; ctx.beginPath(); ctx.roundRect(x, y, layer.w, layer.h, 14); ctx.fill();
      ctx.fillStyle = `rgba(239,62,87,${pulse})`; ctx.shadowColor = '#ef3e57'; ctx.shadowBlur = 12 * pulse; ctx.beginPath(); ctx.arc(x + 25, y + layer.h / 2, Math.min(9, layer.h / 6), 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.font = `800 ${Math.min(layer.size, layer.h * .58)}px Arial`; ctx.textBaseline = 'middle'; ctx.fillText('LIVE', x + 46, y + layer.h / 2);
    } else if (layer.type === 'text') {
      ctx.font = `800 ${layer.size}px Arial`; const lines = (layer.text || '').split('\n').slice(0, 5); const lineHeight = layer.size * 1.2;
      const textWidth = Math.max(100, ...lines.map(line => ctx.measureText(line).width));
      if (layer.motion !== 'ticker') { layer.w = Math.ceil(Math.max(layer.w, textWidth + 24)); layer.h = Math.ceil(Math.max(layer.h, lines.length * lineHeight + 18)); }
      if (layer.backdrop) { ctx.fillStyle = layer.background + 'cc'; ctx.fillRect(x - 12, y - layer.size - 8, layer.w, layer.h); }
      ctx.textBaseline = 'alphabetic'; ctx.lineWidth = layer.outline; ctx.strokeStyle = layer.stroke; ctx.fillStyle = layer.color;
      if (layer.motion === 'ticker') { ctx.beginPath(); ctx.rect(x, y - layer.size - 7, layer.w, layer.h); ctx.clip(); const scroll = (t * (layer.tickerSpeed || 120)) % (textWidth + layer.w + 30); const textX = x + layer.w - scroll; if (layer.outline) ctx.strokeText(layer.text || '', textX, y); ctx.fillText(layer.text || '', textX, y); }
      else lines.forEach((line, index) => { if (layer.outline) ctx.strokeText(line, x, y + index * lineHeight); ctx.fillText(line, x, y + index * lineHeight); });
    } else {
      let image = studioImages.get(layer.id); if (!image) { image = new Image(); image.src = layer.image; studioImages.set(layer.id, image); }
      if (image.complete && image.naturalWidth) ctx.drawImage(image, x, y, layer.w, layer.h);
    }
    ctx.restore();
  }
  requestAnimationFrame(drawStudio);
}
requestAnimationFrame(drawStudio);
let dragLayer = null;
studio.canvas.onpointerdown = event => { const scale = studio.canvas.width / studio.canvas.getBoundingClientRect().width; const x = event.offsetX * scale, y = event.offsetY * scale; const layer = [...studio.layers].reverse().find(item => item.visible && x >= item.x - 15 && x <= item.x + item.w && y >= item.y - (item.type === 'text' ? item.size : 0) - 15 && y <= item.y + item.h); if (!layer) return; selectStudioLayer(layer.id); dragLayer = { id: layer.id, startX: x, startY: y, x: layer.x, y: layer.y }; studio.canvas.setPointerCapture(event.pointerId); };
studio.canvas.onpointermove = event => { if (!dragLayer) return; const scale = studio.canvas.width / studio.canvas.getBoundingClientRect().width; const layer = studio.layers.find(item => item.id === dragLayer.id); if (layer) { layer.x = Math.max(0, Math.min(1280, dragLayer.x + event.offsetX * scale - dragLayer.startX)); layer.y = Math.max(0, Math.min(720, dragLayer.y + event.offsetY * scale - dragLayer.startY)); } };
studio.canvas.onpointerup = studio.canvas.onpointercancel = () => { dragLayer = null; };
async function refreshStudioStatus() { if (!studio.broadcast) return; try { const data = await window.studioBridge.status(); S('#studio-bitrate').textContent = data.bitrate + ' kb/s sent'; S('#studio-viewers').textContent = data.viewers + (data.viewers === 1 ? ' viewer' : ' viewers'); S('#studio-timer').textContent = String(Math.floor(data.seconds / 60)).padStart(2, '0') + ':' + String(data.seconds % 60).padStart(2, '0'); if (data.error) studioFeedback(data.error); S('#studio-health').textContent = data.error ? 'Stream needs attention' : data.bitrate ? 'Streaming' : 'Connecting…'; if (data.remoteUrl) { S('#studio-remote-url').value = data.remoteUrl; S('#studio-remote-link').hidden = false; S('#studio-remote-stop').hidden = false; S('#studio-remote-start').hidden = true; S('#studio-remote-state').textContent = 'Public link active'; } else if (S('#studio-remote-link').hidden === false) { S('#studio-remote-link').hidden = true; S('#studio-remote-stop').hidden = true; S('#studio-remote-start').hidden = false; S('#studio-remote-state').textContent = 'Off'; } } catch (error) { studioFeedback(error.message); } }
setInterval(refreshStudioStatus, 2000);
S('#studio-remote-start').onclick = async () => { const button = S('#studio-remote-start'); button.disabled = true; S('#studio-remote-state').textContent = 'Connecting…'; try { const data = await window.studioBridge.remoteStart(); S('#studio-remote-url').value = data.remoteUrl; S('#studio-remote-link').hidden = false; S('#studio-remote-stop').hidden = false; button.hidden = true; S('#studio-remote-state').textContent = 'Public link active'; studioFeedback('Remote link is ready. Share it only with people you trust.'); } catch (error) { S('#studio-remote-state').textContent = 'Could not connect'; studioFeedback(error.message); } finally { button.disabled = false; } };
S('#studio-remote-stop').onclick = async () => { try { await window.studioBridge.remoteStop(); S('#studio-remote-link').hidden = true; S('#studio-remote-stop').hidden = true; S('#studio-remote-start').hidden = false; S('#studio-remote-state').textContent = 'Off'; } catch (error) { studioFeedback(error.message); } };
S('#studio-remote-copy').onclick = async () => { try { await navigator.clipboard.writeText(S('#studio-remote-url').value); S('#studio-remote-copy').textContent = 'Copied'; setTimeout(() => S('#studio-remote-copy').textContent = 'Copy link', 1600); } catch { studioFeedback('Select the remote link and copy it.'); } };
S('#studio-start').onclick = async () => {
  try {
    if (!studio.sources.length) throw new Error('Add a video or M3U8 stream first.');
    if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) throw new Error('This PC cannot encode a live scene.');
    if (studio.active < 0) studioPlay(0);
    studio.audioContext ||= new AudioContext();
    studio.audioDestination ||= studio.audioContext.createMediaStreamDestination();
    if (!studio.audioNodes.length) for (const player of studio.players) { const source = studio.audioContext.createMediaElementSource(player), gain = studio.audioContext.createGain(); source.connect(gain); gain.connect(studio.audioContext.destination); gain.connect(studio.audioDestination); gain.gain.value = player === studio.video ? 1 : 0; studio.audioNodes.push({ player, gain }); }
    await studio.audioContext.resume();
    const canvasStream = studio.canvas.captureStream(30);
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...studio.audioDestination.stream.getAudioTracks()]);
    const details = await window.studioBridge.start();
    studio.broadcast = details;
    studio.recorder = new MediaRecorder(combined, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 });
    studio.recorder.ondataavailable = event => { if (event.data.size) studio.sent = studio.sent.then(() => event.data.arrayBuffer()).then(buffer => window.studioBridge.chunk(new Uint8Array(buffer))).catch(error => studioFeedback(error.message)); };
    studio.recorder.onerror = event => studioFeedback(event.error?.message || 'Broadcast recorder stopped.');
    studio.recorder.start(1000);
    S('#studio-start').disabled = true; S('#studio-stop').disabled = false; S('#studio-live-badge').textContent = 'LIVE'; S('#studio-live-badge').classList.add('live'); S('#studio-url').value = details.url; S('#studio-link').hidden = false; S('#studio-remote').hidden = false; S('#studio-health').textContent = 'Connecting…'; studioFeedback(details.note);
  } catch (error) { studioFeedback(error.message); }
};
S('#studio-stop').onclick = async () => { try { if (studio.recorder?.state !== 'inactive') studio.recorder.stop(); await studio.sent; await window.studioBridge.stop(); studio.broadcast = null; S('#studio-start').disabled = false; S('#studio-stop').disabled = true; S('#studio-live-badge').textContent = 'OFF AIR'; S('#studio-live-badge').classList.remove('live'); S('#studio-link').hidden = true; S('#studio-remote').hidden = true; S('#studio-remote-link').hidden = true; S('#studio-remote-stop').hidden = true; S('#studio-remote-start').hidden = false; S('#studio-remote-state').textContent = 'Off'; S('#studio-health').textContent = 'Ready to broadcast'; studioFeedback('Broadcast ended.'); } catch (error) { studioFeedback(error.message); } };
S('#studio-copy').onclick = async () => { try { await navigator.clipboard.writeText(S('#studio-url').value); S('#studio-copy').textContent = 'Copied'; setTimeout(() => S('#studio-copy').textContent = 'Copy link', 1600); } catch { studioFeedback('Select the link and copy it.'); } };
studioSources(); studioLayers();
