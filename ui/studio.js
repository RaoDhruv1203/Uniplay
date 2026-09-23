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
studioSourceControls.innerHTML = '<details id="studio-source-details"><summary id="studio-source-label">Select a source</summary><div class="studio-source-grid"><label>Play <select id="studio-play-mode"><option value="once">Once, then next</option><option value="loop">Loop segment</option></select></label><label>From (m:ss) <input id="studio-start-at" placeholder="0:00" inputmode="numeric"></label><label>To (m:ss) <input id="studio-end-at" placeholder="End" inputmode="numeric"></label><label>On air for <div class="studio-duration-row"><input id="studio-duration" type="number" min="0" step="1" placeholder="No limit"><select id="studio-duration-unit" aria-label="Duration unit"><option value="1">seconds</option><option value="60">minutes</option><option value="3600">hours</option></select></div></label><label>Media fit <select id="studio-media-fit"><option value="contain">Fit inside</option><option value="cover">Fill / crop</option></select></label><label>Crop left % <input id="studio-crop-left" type="number" min="0" max="90" step="1" value="0"></label><label>Crop right % <input id="studio-crop-right" type="number" min="0" max="90" step="1" value="0"></label><label>Crop top % <input id="studio-crop-top" type="number" min="0" max="90" step="1" value="0"></label><label>Crop bottom % <input id="studio-crop-bottom" type="number" min="0" max="90" step="1" value="0"></label></div><small id="studio-source-hint">Choose a time and unit. Leave duration empty to play the full source.</small></details>';
S('#studio-sources').after(studioSourceControls);
const studioCanvasWrap = document.createElement('div'); studioCanvasWrap.className = 'studio-canvas-wrap';
studio.canvas.before(studioCanvasWrap); studioCanvasWrap.appendChild(studio.canvas);
const studioTransformBox = document.createElement('div'); studioTransformBox.className = 'studio-transform-box'; studioTransformBox.hidden = true;
studioTransformBox.innerHTML = ['nw','n','ne','e','se','s','sw','w'].map(handle => '<i data-handle="' + handle + '"></i>').join(''); studioCanvasWrap.appendChild(studioTransformBox);
const studioLayerExtras = document.createElement('div'); studioLayerExtras.className = 'studio-layer-extras';
studioLayerExtras.innerHTML = '<label>Font <input id="studio-font" list="studio-fonts" placeholder="Search installed fonts"><datalist id="studio-fonts"></datalist></label><div class="studio-controls-grid"><label>Text fill <select id="studio-color-mode"><option value="solid">Solid</option><option value="gradient">Gradient</option></select></label><label>2nd text colour <input id="studio-color-end" type="color"></label><label>Background fill <select id="studio-background-mode"><option value="solid">Solid</option><option value="gradient">Gradient</option></select></label><label>2nd background colour <input id="studio-background-end" type="color"></label><label>Background opacity % <input id="studio-background-opacity" type="number" min="0" max="100"></label><label>Background stroke <input id="studio-background-stroke" type="color"></label><label>Stroke width <input id="studio-background-stroke-width" type="number" min="0" max="20"></label><label>Corner curve <input id="studio-radius" type="number" min="0" max="100"></label></div>';
S('#studio-backdrop-enabled').parentElement.after(studioLayerExtras);
window.studioBridge.fonts().then(fonts => { S('#studio-fonts').innerHTML = fonts.map(font => '<option value="' + se(font) + '"></option>').join(''); }).catch(() => {});
const studioRemote = document.createElement('div');
studioRemote.className = 'studio-remote'; studioRemote.id = 'studio-remote';
studioRemote.innerHTML = '<div><button class="subtle small" id="studio-remote-start" disabled>Share outside my network</button><button class="subtle small" id="studio-remote-stop" hidden>Stop remote link</button><span id="studio-remote-state">Go live to share</span></div><div class="studio-link" id="studio-remote-link" hidden><input id="studio-remote-url" readonly aria-label="Public broadcast link"><button class="subtle small" id="studio-remote-copy">Copy link</button></div><small>Anyone with this link can watch while your PC is live. Without setup, this uses a temporary test tunnel.</small><details id="studio-remote-setup"><summary>Reliable public link · one-time setup</summary><small>In your Cloudflare account, create a remotely managed tunnel and public hostname. Set its service URL to <strong>http://localhost:7767</strong>. Paste that hostname and tunnel token here. The token is encrypted on this PC and is never published with the app.</small><input id="studio-remote-hostname" placeholder="live.yourdomain.com" aria-label="Public hostname"><input id="studio-remote-token" type="password" autocomplete="off" placeholder="Cloudflare tunnel token" aria-label="Tunnel token"><div><button class="subtle small" id="studio-remote-save">Save connection</button><button class="subtle small" id="studio-remote-remove">Remove</button><span id="studio-remote-config-state">Not configured</span></div></details>';
S('#studio-link').after(studioRemote);
window.studioBridge.remoteSettings().then(data => { S('#studio-remote-hostname').value = data.hostname; S('#studio-remote-config-state').textContent = data.configured ? 'Securely saved' : 'Not configured'; }).catch(() => {});
function studioFeedback(message) { S('#studio-feedback').textContent = message || ''; }
const studioTime = seconds => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0'); };
function parseStudioTime(value) { if (!String(value || '').trim()) return 0; const parts = String(value).trim().split(':'); if (parts.length > 3 || parts.some(part => !/^\d+$/.test(part))) return NaN; return parts.reduce((total, part) => total * 60 + Number(part), 0); }
function sourceElapsed() { if (!studio.sourceStartedAt) return 0; return Math.max(0, (performance.now() - studio.sourceStartedAt - studio.pausedMs - (studio.pausedAt ? performance.now() - studio.pausedAt : 0)) / 1000); }
function studioVideoTransform(source) { return source.transform ||= { x: 0, y: 0, w: 1280, h: 720, fit: 'contain', cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 }; }
const seekableStudioSource = source => source?.type !== 'stream';
function studioSourceFields() {
  const source = studio.sources[studio.selectedSource];
  studioSourceControls.hidden = !source;
  if (!source) return;
  S('#studio-source-label').textContent = source.name;
  S('#studio-play-mode').value = source.playMode || 'once';
  S('#studio-start-at').value = seekableStudioSource(source) && source.startAt ? studioTime(source.startAt) : '';
  S('#studio-end-at').value = seekableStudioSource(source) && source.endAt ? studioTime(source.endAt) : '';
  const unit = source.limit && source.limit % 3600 === 0 ? 3600 : source.limit && source.limit % 60 === 0 ? 60 : 1;
  S('#studio-duration-unit').value = String(unit); S('#studio-duration').value = source.limit ? String(source.limit / unit) : '';
  S('#studio-start-at').disabled = S('#studio-end-at').disabled = !seekableStudioSource(source);
  S('#studio-play-mode').disabled = !seekableStudioSource(source);
  const transform = studioVideoTransform(source);
  S('#studio-media-fit').value = transform.fit;
  for (const edge of ['left','right','top','bottom']) S('#studio-crop-' + edge).value = transform['crop' + edge[0].toUpperCase() + edge.slice(1)];
  S('#studio-source-hint').textContent = source.type === 'stream' ? 'Live streams play until the chosen duration ends or you switch sources.' : 'Loop repeats the selected range; duration caps the total time on air.';
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
  S('#studio-text').parentElement.hidden = !['text', 'live-badge'].includes(layer.type);
  S('#studio-ticker-speed').parentElement.hidden = layer.type !== 'text' || layer.motion !== 'ticker';
  S('#studio-ticker-speed').value = layer.tickerSpeed || 120;
  S('#studio-text').value = layer.text || '';
  S('#studio-font').value = layer.font || 'Arial';
  for (const [id, key] of [['color-mode','colorMode'],['color-end','colorEnd'],['background-mode','backgroundMode'],['background-end','backgroundEnd'],['background-opacity','backdropOpacity'],['background-stroke','backgroundStroke'],['background-stroke-width','backgroundStrokeWidth'],['radius','radius']]) S('#studio-' + id).value = layer[key];
  for (const [id, key] of [['color', 'color'], ['background', 'background'], ['stroke', 'stroke'], ['size', 'size'], ['outline', 'outline'], ['shadow', 'shadow'], ['width', 'w'], ['height', 'h'], ['x', 'x'], ['y', 'y'], ['opacity', 'opacity'], ['motion', 'motion']]) S('#studio-' + id).value = layer[key];
  S('#studio-backdrop-enabled').checked = layer.backdrop;
}
function selectStudioLayer(id) { studio.selectedLayer = id; studio.selectedTransform = id; studioLayers(); }
function newStudioLayer(type, source) {
  const layer = { id: crypto.randomUUID(), type, name: source?.name || (type === 'live-badge' ? 'LIVE badge' : 'Text'), text: type === 'live-badge' ? 'LIVE' : type === 'text' ? 'Your message' : '', image: source?.url || '', x: 75, y: 76, w: type === 'image' ? 160 : type === 'live-badge' ? 180 : 310, h: type === 'image' ? 160 : type === 'live-badge' ? 62 : 120, size: type === 'live-badge' ? 38 : 52, font: 'Arial', color: '#ffffff', colorMode: 'solid', colorEnd: '#ba70ff', background: '#000000', backgroundMode: 'solid', backgroundEnd: '#6022a9', backgroundStroke: '#ffffff', backgroundStrokeWidth: 0, backdropOpacity: 80, radius: 12, stroke: '#000000', outline: 0, shadow: 8, opacity: 100, motion: 'none', tickerSpeed: 120, backdrop: type === 'live-badge', visible: true, created: performance.now() };
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
    const ready = () => { if (seekableStudioSource(source) && source.startAt && Math.abs(player.currentTime - source.startAt) > .25) return; if (player.readyState >= 2) complete(); };
    const failed = () => complete(new Error('This source could not load. The current video will stay on air.'));
    const timer = setTimeout(() => complete(new Error('The next source did not become ready. The current video will stay on air.')), 18000);
    player.addEventListener('loadeddata', ready); player.addEventListener('seeked', ready); player.addEventListener('error', failed);
    if (seekableStudioSource(source)) player.addEventListener('loadedmetadata', () => { if (source.startAt) player.currentTime = Math.min(source.startAt, Math.max(0, player.duration - .1)); }, { once: true });
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
S('#studio-add-stream').onclick = async () => { const button = S('#studio-add-stream'); button.disabled = true; studioFeedback('Checking this link…'); try { const source = await window.studioBridge.resolve(S('#studio-stream-url').value.trim()); studio.sources.push({ ...source, limit: 0, playMode: 'once', startAt: 0, endAt: 0 }); S('#studio-stream-url').value = ''; studioSources(); if (studio.active < 0) studioPlay(0); else studioFeedback('Added to the queue.'); } catch (error) { studioFeedback(String(error.message || error).replace(/^Error invoking remote method .*?: Error: /, '')); } finally { button.disabled = false; } };
S('#studio-stream-url').onkeydown = event => { if (event.key === 'Enter') S('#studio-add-stream').click(); };
S('#studio-sources').onclick = event => { const play = event.target.closest('[data-play]'), edit = event.target.closest('[data-edit]'), remove = event.target.closest('[data-remove]'), raise = event.target.closest('[data-raise]'); if (play) studioPlay(Number(play.dataset.play)); if (edit) { studio.selectedSource = Number(edit.dataset.edit); studio.selectedTransform = 'source'; studioSourceFields(); S('#studio-source-details').open = true; } if (raise) { const index = Number(raise.dataset.raise); if (index > 0) { [studio.sources[index - 1], studio.sources[index]] = [studio.sources[index], studio.sources[index - 1]]; if (studio.active === index) studio.active--; else if (studio.active === index - 1) studio.active++; if (studio.selectedSource === index) studio.selectedSource--; else if (studio.selectedSource === index - 1) studio.selectedSource++; studioSources(); } } if (remove) { const index = Number(remove.dataset.remove); studio.sources.splice(index, 1); if (studio.selectedSource === index) studio.selectedSource = Math.min(index, studio.sources.length - 1); else if (studio.selectedSource > index) studio.selectedSource--; if (studio.active === index) { if (studio.sources.length) { studio.active = -1; studioPlay(Math.min(index, studio.sources.length - 1)); } else { studio.active = -1; clearStudioPlayer(studio.video); } } else if (studio.active > index) studio.active--; studioSources(); } };
S('#studio-next').onclick = () => { if (studio.sources.length) studioPlay((studio.active + 1) % studio.sources.length); };
S('#studio-toggle').onclick = () => { if (studio.video.paused) studio.video.play().catch(error => studioFeedback(error.message)); else studio.video.pause(); };
S('#studio-seek').oninput = event => { if (Number.isFinite(studio.video.duration) && studio.video.duration) studio.video.currentTime = Number(event.target.value) / 1000 * studio.video.duration; };
for (const [id, key] of [['studio-start-at', 'startAt'], ['studio-end-at', 'endAt']]) S('#' + id).addEventListener('change', event => { const source = studio.sources[studio.selectedSource]; if (!source) return; const value = parseStudioTime(event.target.value); if (!Number.isFinite(value) || value < 0 || value > 86400) { studioFeedback('Use a time such as 1:30 or 30:00, up to 24 hours.'); event.target.value = source[key] ? studioTime(source[key]) : ''; return; } if (key === 'endAt' && value && value <= (source.startAt || 0)) { studioFeedback('End must be after Start.'); return; } source[key] = value; studioFeedback(''); studioSources(); });
function updateStudioDuration() { const source = studio.sources[studio.selectedSource]; if (!source) return; const amount = S('#studio-duration').value.trim() ? Number(S('#studio-duration').value) : 0, seconds = amount * Number(S('#studio-duration-unit').value); if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) { studioFeedback('Choose a duration up to 24 hours.'); return; } source.limit = seconds; studioFeedback(''); studioSources(); }
S('#studio-duration').addEventListener('change', updateStudioDuration); S('#studio-duration-unit').addEventListener('change', updateStudioDuration);
S('#studio-play-mode').onchange = event => { const source = studio.sources[studio.selectedSource]; if (seekableStudioSource(source)) { source.playMode = event.target.value; studioSources(); } };
S('#studio-media-fit').onchange = event => { const source = studio.sources[studio.selectedSource]; if (source) studioVideoTransform(source).fit = event.target.value; };
for (const edge of ['left','right','top','bottom']) S('#studio-crop-' + edge).addEventListener('change', event => { const source = studio.sources[studio.selectedSource]; if (!source) return; const transform = studioVideoTransform(source), key = 'crop' + edge[0].toUpperCase() + edge.slice(1); transform[key] = Math.max(0, Math.min(90, Number(event.target.value) || 0)); if (transform.cropLeft + transform.cropRight >= 95 || transform.cropTop + transform.cropBottom >= 95) { transform[key] = 0; studioFeedback('Keep at least 5% of the picture visible.'); } event.target.value = transform[key]; });
S('#studio-add-text').onclick = () => newStudioLayer('text');
const tickerButton = document.createElement('button'); tickerButton.className = 'subtle small'; tickerButton.id = 'studio-add-ticker'; tickerButton.textContent = 'Ticker'; S('#studio-add-text').after(tickerButton);
const liveButton = document.createElement('button'); liveButton.className = 'subtle small'; liveButton.id = 'studio-add-live'; liveButton.textContent = 'LIVE'; S('#studio-add-ticker').after(liveButton);
const tickerOption = document.createElement('option'); tickerOption.value = 'ticker'; tickerOption.textContent = 'Ticker scroll'; S('#studio-motion').appendChild(tickerOption);
const tickerSpeedRow = document.createElement('label'); tickerSpeedRow.innerHTML = 'Ticker speed <input id="studio-ticker-speed" type="number" min="25" max="500" value="120">'; S('#studio-motion').parentElement.after(tickerSpeedRow);
tickerButton.onclick = () => { newStudioLayer('text'); const layer = studio.layers.at(-1); layer.name = 'Ticker'; layer.text = 'Live from UNiPLAY'; layer.motion = 'ticker'; layer.x = 0; layer.y = 690; layer.w = 1280; layer.h = 68; layer.size = 42; layer.backdrop = true; studioLayers(); };
liveButton.onclick = () => { newStudioLayer('live-badge'); const layer = studio.layers.at(-1); layer.x = 1060; layer.y = 35; studioLayers(); };
S('#studio-add-logo').onclick = () => newStudioLayer('image', { name: 'UNiPLAY logo', url: 'uniplay.svg' });
S('#studio-add-image').onclick = () => S('#studio-image-input').click();
S('#studio-image-input').onchange = event => { const file = event.target.files[0]; if (!file) return; const url = URL.createObjectURL(file); newStudioLayer('image', { name: file.name, url }); event.target.value = ''; };
S('#studio-layers').onclick = event => { const select = event.target.closest('[data-layer]'), up = event.target.closest('[data-up]'); if (select) selectStudioLayer(select.dataset.layer); if (up) { const index = studio.layers.findIndex(item => item.id === up.dataset.up); if (index >= 0 && index < studio.layers.length - 1) [studio.layers[index], studio.layers[index + 1]] = [studio.layers[index + 1], studio.layers[index]]; studioLayers(); } };
S('#studio-layers').onchange = event => { const input = event.target.closest('[data-visible]'); if (!input) return; const layer = studio.layers.find(item => item.id === input.dataset.visible); if (layer) layer.visible = input.checked; };
for (const [id, key] of [['text', 'text'], ['color', 'color'], ['background', 'background'], ['stroke', 'stroke'], ['size', 'size'], ['outline', 'outline'], ['shadow', 'shadow'], ['width', 'w'], ['height', 'h'], ['x', 'x'], ['y', 'y'], ['opacity', 'opacity'], ['motion', 'motion']]) S('#studio-' + id).addEventListener('input', event => { const layer = studio.layers.find(item => item.id === studio.selectedLayer); if (layer) { layer[key] = ['size', 'outline', 'shadow', 'opacity', 'w', 'h', 'x', 'y'].includes(key) ? Number(event.target.value) : event.target.value; if (key === 'text') { layer.name = layer.text.slice(0, 25) || 'Text'; studioLayers(); } } });
S('#studio-font').addEventListener('change', event => { const layer = studio.layers.find(item => item.id === studio.selectedLayer); if (layer) layer.font = event.target.value.slice(0, 100) || 'Arial'; });
for (const [id, key] of [['color-mode','colorMode'],['color-end','colorEnd'],['background-mode','backgroundMode'],['background-end','backgroundEnd'],['background-opacity','backdropOpacity'],['background-stroke','backgroundStroke'],['background-stroke-width','backgroundStrokeWidth'],['radius','radius']]) S('#studio-' + id).addEventListener('input', event => { const layer = studio.layers.find(item => item.id === studio.selectedLayer); if (layer) layer[key] = ['backdropOpacity','backgroundStrokeWidth','radius'].includes(key) ? Number(event.target.value) : event.target.value; });
S('#studio-ticker-speed').oninput = event => { const layer = studio.layers.find(item => item.id === studio.selectedLayer); if (layer) layer.tickerSpeed = Math.max(25, Math.min(500, Number(event.target.value) || 120)); };
S('#studio-motion').onchange = () => studioLayers();
S('#studio-backdrop-enabled').onchange = event => { const layer = studio.layers.find(item => item.id === studio.selectedLayer); if (layer) layer.backdrop = event.target.checked; };
S('#studio-remove-layer').onclick = () => { studio.layers = studio.layers.filter(item => item.id !== studio.selectedLayer); studio.selectedLayer = null; studioLayers(); };
const ctx = studio.canvas.getContext('2d', { alpha: false });
const studioImages = new Map();
let lastTransportTick = 0;
function drawStudioVideo(video, source) {
  const area = studioVideoTransform(source), vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  let sx = vw * area.cropLeft / 100, sy = vh * area.cropTop / 100;
  let sw = vw * (1 - (area.cropLeft + area.cropRight) / 100), sh = vh * (1 - (area.cropTop + area.cropBottom) / 100);
  if (sw < 1 || sh < 1) return;
  const x = area.x, y = area.y, w = area.w, h = area.h;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
  if (area.fit === 'cover') {
    const scale = Math.max(w / sw, h / sh), visibleW = w / scale, visibleH = h / scale;
    sx += (sw - visibleW) / 2; sy += (sh - visibleH) / 2; sw = visibleW; sh = visibleH;
    ctx.drawImage(video, sx, sy, sw, sh, x, y, w, h);
  } else {
    const scale = Math.min(w / sw, h / sh), dw = sw * scale, dh = sh * scale;
    ctx.drawImage(video, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  ctx.restore();
}
function studioFill(mode, primary, secondary, x, y, w, h) { if (mode !== 'gradient') return primary; const gradient = ctx.createLinearGradient(x, y + h, x + w, y); gradient.addColorStop(0, primary); gradient.addColorStop(1, secondary || primary); return gradient; }
function drawStudioBackdrop(layer, x, y, w, h) {
  if (!layer.backdrop || !layer.backdropOpacity) return;
  ctx.save(); ctx.globalAlpha *= layer.backdropOpacity / 100;
  const radius = Math.max(0, Math.min(layer.radius || 0, w / 2, h / 2));
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = studioFill(layer.backgroundMode, layer.background, layer.backgroundEnd, x, y, w, h); ctx.fill();
  if (layer.backgroundStrokeWidth) { ctx.lineWidth = layer.backgroundStrokeWidth; ctx.strokeStyle = layer.backgroundStroke; ctx.stroke(); }
  ctx.restore();
}
function drawStudio(time) {
  const width = studio.canvas.width, height = studio.canvas.height;
  ctx.fillStyle = '#151519'; ctx.fillRect(0, 0, width, height);
  if (studio.video.readyState >= 2 && studio.video.videoWidth && studio.video.videoHeight) { try { drawStudioVideo(studio.video, studio.sources[studio.active]); } catch {} }
  else { ctx.fillStyle = '#aa7d9f'; ctx.font = '700 32px Arial'; ctx.textAlign = 'center'; ctx.fillText('UNiPLAY LIVE STUDIO', width / 2, height / 2); ctx.textAlign = 'start'; }
  const activeSource = studio.sources[studio.active], video = studio.video;
  if (activeSource && !studio.switching && !video.paused) {
    const elapsed = sourceElapsed(), limitLeft = activeSource.limit ? activeSource.limit - elapsed : Infinity;
    const end = seekableStudioSource(activeSource) ? activeSource.endAt || video.duration : Infinity;
    const segmentLeft = Number.isFinite(end) ? end - video.currentTime : Infinity;
    const next = (studio.active + 1) % studio.sources.length;
    const willAdvance = activeSource.type === 'stream' || activeSource.playMode !== 'loop' || Number.isFinite(limitLeft);
    const advanceLeft = activeSource.playMode === 'loop' ? limitLeft : Math.min(limitLeft, segmentLeft);
    if (studio.sources.length > 1 && willAdvance && advanceLeft < 8 && time > (studio.preloadAfter || 0)) {
      const pending = cueStudio(next);
      if (pending) pending.promise.catch(() => { studio.preloadAfter = performance.now() + 5000; });
    }
    if (limitLeft <= 0) studioPlay(next);
    else if (seekableStudioSource(activeSource) && segmentLeft <= 0) {
      if (activeSource.playMode === 'loop') { video.currentTime = activeSource.startAt || 0; video.play().catch(() => {}); }
      else studioPlay(next);
    }
  }
  if (time - lastTransportTick > 120) {
    lastTransportTick = time;
    const seekable = seekableStudioSource(activeSource) && Number.isFinite(video.duration) && video.duration > 0;
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
      drawStudioBackdrop(layer, x, y, layer.w, layer.h);
      ctx.fillStyle = `rgba(239,62,87,${pulse})`; ctx.shadowColor = '#ef3e57'; ctx.shadowBlur = 12 * pulse; ctx.beginPath(); ctx.arc(x + 25, y + layer.h / 2, Math.min(9, layer.h / 6), 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = studioFill(layer.colorMode, layer.color, layer.colorEnd, x, y, layer.w, layer.h); ctx.font = `800 ${Math.min(layer.size, layer.h * .68)}px "${String(layer.font || 'Arial').replace(/["\\]/g, '')}"`; ctx.textBaseline = 'middle'; ctx.fillText(layer.text || 'LIVE', x + 46, y + layer.h / 2, Math.max(20, layer.w - 55));
    } else if (layer.type === 'text') {
      ctx.font = `800 ${layer.size}px "${String(layer.font || 'Arial').replace(/["\\]/g, '')}"`; const lines = (layer.text || '').split('\n').slice(0, 5); const lineHeight = layer.size * 1.2;
      const textWidth = Math.max(100, ...lines.map(line => ctx.measureText(line).width));
      const top = y - layer.size - 8;
      drawStudioBackdrop(layer, x, top, layer.w, layer.h);
      ctx.textBaseline = 'alphabetic'; ctx.lineWidth = layer.outline; ctx.strokeStyle = layer.stroke; ctx.fillStyle = studioFill(layer.colorMode, layer.color, layer.colorEnd, x, top, layer.w, layer.h);
      ctx.beginPath(); ctx.rect(x, top, layer.w, layer.h); ctx.clip();
      if (layer.motion === 'ticker') { const scroll = (t * (layer.tickerSpeed || 120)) % (textWidth + layer.w + 30); const textX = x + layer.w - scroll; if (layer.outline) ctx.strokeText(layer.text || '', textX, y); ctx.fillText(layer.text || '', textX, y); }
      else lines.forEach((line, index) => { if (layer.outline) ctx.strokeText(line, x + 7, y + index * lineHeight, layer.w - 14); ctx.fillText(line, x + 7, y + index * lineHeight, layer.w - 14); });
    } else {
      let image = studioImages.get(layer.id); if (!image) { image = new Image(); image.src = layer.image; studioImages.set(layer.id, image); }
      if (image.complete && image.naturalWidth) ctx.drawImage(image, x, y, layer.w, layer.h);
    }
    ctx.restore();
  }
  updateStudioTransformBox(); requestAnimationFrame(drawStudio);
}
requestAnimationFrame(drawStudio);
function studioTransformObject() { if (studio.selectedTransform === 'source' && studio.selectedSource === studio.active && studio.sources[studio.active]) return studioVideoTransform(studio.sources[studio.active]); return studio.layers.find(layer => layer.id === studio.selectedTransform) || null; }
function studioTransformRect() { const target = studioTransformObject(); if (!target) return null; return { x: target.x, y: studio.selectedTransform === 'source' || target.type !== 'text' ? target.y : target.y - target.size - 8, w: target.w, h: target.h }; }
function updateStudioTransformBox() { const rect = studioTransformRect(); studioTransformBox.hidden = !rect; if (!rect) return; studioTransformBox.style.left = rect.x / 1280 * 100 + '%'; studioTransformBox.style.top = rect.y / 720 * 100 + '%'; studioTransformBox.style.width = rect.w / 1280 * 100 + '%'; studioTransformBox.style.height = rect.h / 720 * 100 + '%'; }
let studioResize;
studioTransformBox.addEventListener('pointerdown', event => { const handle = event.target.closest('[data-handle]'); if (!handle) return; const target = studioTransformObject(), rect = studioTransformRect(); if (!target || !rect) return; studioResize = { handle: handle.dataset.handle, target, rect, x: event.clientX, y: event.clientY, size: target.size }; handle.setPointerCapture(event.pointerId); event.preventDefault(); event.stopPropagation(); });
studioTransformBox.addEventListener('pointermove', event => { if (!studioResize) return; const scaleX = 1280 / studio.canvas.getBoundingClientRect().width, scaleY = 720 / studio.canvas.getBoundingClientRect().height; const dx = (event.clientX - studioResize.x) * scaleX, dy = (event.clientY - studioResize.y) * scaleY, { handle, target, rect } = studioResize; let x = rect.x, y = rect.y, w = rect.w, h = rect.h; if (handle.includes('e')) w += dx; if (handle.includes('s')) h += dy; if (handle.includes('w')) { x += dx; w -= dx; } if (handle.includes('n')) { y += dy; h -= dy; } x = Math.max(0, Math.min(1245, x)); y = Math.max(0, Math.min(695, y)); w = Math.max(35, Math.min(1280 - x, w)); h = Math.max(25, Math.min(720 - y, h)); target.x = x; target.y = studio.selectedTransform === 'source' || target.type !== 'text' ? y : y + target.size + 8; target.w = w; target.h = h; if (target.type === 'text' && handle.includes('s')) target.size = Math.max(12, Math.min(180, Math.round(studioResize.size * h / rect.h))); if (studio.selectedTransform !== 'source') for (const [field,value] of [['x',target.x],['y',target.y],['width',target.w],['height',target.h],['size',target.size]]) S('#studio-' + field).value = Math.round(value); updateStudioTransformBox(); event.preventDefault(); });
for (const type of ['pointerup','pointercancel','lostpointercapture']) studioTransformBox.addEventListener(type, () => { studioResize = null; });
let dragLayer = null;
studio.canvas.onpointerdown = event => { const scale = studio.canvas.width / studio.canvas.getBoundingClientRect().width; const x = event.offsetX * scale, y = event.offsetY * scale; const layer = [...studio.layers].reverse().find(item => item.visible && x >= item.x - 15 && x <= item.x + item.w && y >= item.y - (item.type === 'text' ? item.size : 0) - 15 && y <= item.y + item.h); if (!layer) { studio.selectedTransform = 'source'; studio.selectedSource = studio.active; studioSourceFields(); if (studio.sources[studio.active]) { const target = studioVideoTransform(studio.sources[studio.active]); dragLayer = { source: true, startX: x, startY: y, x: target.x, y: target.y }; studio.canvas.setPointerCapture(event.pointerId); } return; } selectStudioLayer(layer.id); dragLayer = { id: layer.id, startX: x, startY: y, x: layer.x, y: layer.y }; studio.canvas.setPointerCapture(event.pointerId); };
studio.canvas.onpointermove = event => { if (!dragLayer) return; const scale = studio.canvas.width / studio.canvas.getBoundingClientRect().width; const layer = dragLayer.source ? studioVideoTransform(studio.sources[studio.active]) : studio.layers.find(item => item.id === dragLayer.id); if (layer) { layer.x = Math.max(0, Math.min(1280 - layer.w, dragLayer.x + event.offsetX * scale - dragLayer.startX)); layer.y = Math.max(0, Math.min(720 - layer.h, dragLayer.y + event.offsetY * scale - dragLayer.startY)); } };
studio.canvas.onpointerup = studio.canvas.onpointercancel = () => { dragLayer = null; };
async function refreshStudioStatus() { if (!studio.broadcast) return; try { const data = await window.studioBridge.status(); S('#studio-bitrate').textContent = data.bitrate + ' kb/s sent'; S('#studio-viewers').textContent = data.viewers + (data.viewers === 1 ? ' viewer' : ' viewers'); S('#studio-timer').textContent = String(Math.floor(data.seconds / 60)).padStart(2, '0') + ':' + String(data.seconds % 60).padStart(2, '0'); if (data.error) studioFeedback(data.error); S('#studio-health').textContent = data.error ? 'Stream needs attention' : data.bitrate ? 'Streaming' : 'Connecting…'; if (data.remoteUrl) { S('#studio-remote-url').value = data.remoteUrl; S('#studio-remote-link').hidden = false; S('#studio-remote-stop').hidden = false; S('#studio-remote-start').hidden = true; S('#studio-remote-state').textContent = 'Public link active'; } else if (S('#studio-remote-link').hidden === false) { S('#studio-remote-link').hidden = true; S('#studio-remote-stop').hidden = true; S('#studio-remote-start').hidden = false; S('#studio-remote-state').textContent = 'Off'; } } catch (error) { studioFeedback(error.message); } }
setInterval(refreshStudioStatus, 2000);
S('#studio-remote-start').onclick = async () => { const button = S('#studio-remote-start'); button.disabled = true; S('#studio-remote-state').textContent = 'Connecting…'; try { const data = await window.studioBridge.remoteStart(); S('#studio-remote-url').value = data.remoteUrl; S('#studio-remote-link').hidden = false; S('#studio-remote-stop').hidden = false; button.hidden = true; S('#studio-remote-state').textContent = 'Public link active'; studioFeedback('Remote link is ready. Share it only with people you trust.'); } catch (error) { S('#studio-remote-state').textContent = 'Could not connect'; studioFeedback(error.message); } finally { button.disabled = false; } };
S('#studio-remote-stop').onclick = async () => { try { await window.studioBridge.remoteStop(); S('#studio-remote-link').hidden = true; S('#studio-remote-stop').hidden = true; S('#studio-remote-start').hidden = false; S('#studio-remote-state').textContent = 'Off'; } catch (error) { studioFeedback(error.message); } };
S('#studio-remote-copy').onclick = async () => { try { await navigator.clipboard.writeText(S('#studio-remote-url').value); S('#studio-remote-copy').textContent = 'Copied'; setTimeout(() => S('#studio-remote-copy').textContent = 'Copy link', 1600); } catch { studioFeedback('Select the remote link and copy it.'); } };
S('#studio-remote-save').onclick = async () => { const button = S('#studio-remote-save'); button.disabled = true; try { const data = await window.studioBridge.remoteConfigure({ hostname: S('#studio-remote-hostname').value, token: S('#studio-remote-token').value }); S('#studio-remote-token').value = ''; S('#studio-remote-hostname').value = data.hostname; S('#studio-remote-config-state').textContent = 'Securely saved'; studioFeedback('Reliable-link connection saved. Start remote sharing while live.'); } catch (error) { studioFeedback(String(error.message || error).replace(/^Error invoking remote method .*?: Error: /, '')); } finally { button.disabled = false; } };
S('#studio-remote-remove').onclick = async () => { try { await window.studioBridge.remoteClear(); S('#studio-remote-token').value = ''; S('#studio-remote-hostname').value = ''; S('#studio-remote-config-state').textContent = 'Not configured'; studioFeedback('Reliable-link connection removed.'); } catch (error) { studioFeedback(error.message); } };
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
    S('#studio-start').disabled = true; S('#studio-stop').disabled = false; S('#studio-live-badge').textContent = 'LIVE'; S('#studio-live-badge').classList.add('live'); S('#studio-url').value = details.url; S('#studio-link').hidden = false; S('#studio-remote-start').disabled = false; S('#studio-remote-state').textContent = 'Off'; S('#studio-health').textContent = 'Connecting…'; studioFeedback(details.note);
  } catch (error) { studioFeedback(error.message); }
};
S('#studio-stop').onclick = async () => { try { if (studio.recorder?.state !== 'inactive') studio.recorder.stop(); await studio.sent; await window.studioBridge.stop(); studio.broadcast = null; S('#studio-start').disabled = false; S('#studio-stop').disabled = true; S('#studio-live-badge').textContent = 'OFF AIR'; S('#studio-live-badge').classList.remove('live'); S('#studio-link').hidden = true; S('#studio-remote-link').hidden = true; S('#studio-remote-stop').hidden = true; S('#studio-remote-start').hidden = false; S('#studio-remote-start').disabled = true; S('#studio-remote-state').textContent = 'Go live to share'; S('#studio-health').textContent = 'Ready to broadcast'; studioFeedback('Broadcast ended.'); } catch (error) { studioFeedback(error.message); } };
S('#studio-copy').onclick = async () => { try { await navigator.clipboard.writeText(S('#studio-url').value); S('#studio-copy').textContent = 'Copied'; setTimeout(() => S('#studio-copy').textContent = 'Copy link', 1600); } catch { studioFeedback('Select the link and copy it.'); } };
studioSources(); studioLayers();
