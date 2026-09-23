const studio = {
  canvas: document.querySelector('#studio-canvas'),
  video: document.createElement('video'), sources: [], layers: [], active: -1,
  selectedLayer: null, hls: null, recorder: null, audioContext: null,
  audioDestination: null, broadcast: null, sent: Promise.resolve(),
};
studio.video.playsInline = true; studio.video.autoplay = true; studio.video.loop = false;
studio.video.style.display = 'none'; document.body.appendChild(studio.video);
const S = selector => document.querySelector(selector);
const se = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function studioFeedback(message) { S('#studio-feedback').textContent = message || ''; }
function studioSources() {
  S('#studio-sources').innerHTML = studio.sources.length ? studio.sources.map((source, index) => '<div class="studio-source' + (index === studio.active ? ' active' : '') + '"><button data-play="' + index + '"><span>' + (source.type === 'stream' ? '◉' : '▶') + '</span><strong>' + se(source.name) + '</strong></button><button data-raise="' + index + '" title="Move up">↑</button><button data-remove="' + index + '" title="Remove from queue">×</button></div>').join('') : '<div class="studio-empty">Add a video or stream to the queue.</div>';
}
function studioLayers() {
  S('#studio-layers').innerHTML = studio.layers.length ? studio.layers.map(layer => '<div class="studio-layer' + (layer.id === studio.selectedLayer ? ' active' : '') + '"><input type="checkbox" data-visible="' + se(layer.id) + '" ' + (layer.visible ? 'checked' : '') + ' title="Show layer"><button data-layer="' + se(layer.id) + '">' + (layer.type === 'text' ? 'T' : '▣') + ' ' + se(layer.name) + '</button><button data-up="' + se(layer.id) + '" title="Bring forward">↑</button></div>').join('') : '<div class="studio-empty">Add a text, logo, image or GIF.</div>';
  const layer = studio.layers.find(item => item.id === studio.selectedLayer);
  S('#studio-layer-controls').hidden = !layer;
  if (!layer) return;
  S('#studio-text').parentElement.hidden = layer.type !== 'text';
  S('#studio-text').value = layer.text || '';
  for (const [id, key] of [['color', 'color'], ['background', 'background'], ['stroke', 'stroke'], ['size', 'size'], ['outline', 'outline'], ['shadow', 'shadow'], ['width', 'w'], ['height', 'h'], ['x', 'x'], ['y', 'y'], ['opacity', 'opacity'], ['motion', 'motion']]) S('#studio-' + id).value = layer[key];
  S('#studio-backdrop-enabled').checked = layer.backdrop;
}
function selectStudioLayer(id) { studio.selectedLayer = id; studioLayers(); }
function newStudioLayer(type, source) {
  const layer = { id: crypto.randomUUID(), type, name: source?.name || 'Text', text: type === 'text' ? 'Your message' : '', image: source?.url || '', x: 75, y: 76, w: type === 'image' ? 160 : 310, h: type === 'image' ? 160 : 120, size: 52, color: '#ffffff', background: '#000000', stroke: '#000000', outline: 0, shadow: 8, opacity: 100, motion: 'none', backdrop: false, visible: true, created: performance.now() };
  studio.layers.push(layer); selectStudioLayer(layer.id);
}
function studioPlay(index) {
  const source = studio.sources[index]; if (!source) return;
  studio.active = index; studio.hls?.destroy(); studio.hls = null; studio.video.pause(); studio.video.removeAttribute('src'); studio.video.load();
  if (source.type === 'stream' && window.Hls?.isSupported()) { studio.hls = new Hls(window.streamLoaderConfig(window.streamBridge)); studio.hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) studioFeedback('Source stream could not play: ' + data.details); }); studio.hls.loadSource(source.url); studio.hls.attachMedia(studio.video); studio.hls.on(Hls.Events.MANIFEST_PARSED, () => studio.video.play().catch(() => {})); }
  else { studio.video.src = source.url; studio.video.play().catch(error => studioFeedback(error.message)); }
  studio.video.onended = () => studioPlay((studio.active + 1) % studio.sources.length);
  studioSources(); studioFeedback('');
}
S('#studio-add-file').onclick = async () => { try { const chosen = await window.studioBridge.pick(); studio.sources.push(...chosen.filter(item => item.type === 'video').map(item => ({ ...item, type: 'file' }))); if (!studio.sources.length) studioFeedback('Choose a video file. Use Image / GIF for overlays.'); studioSources(); if (studio.active < 0 && studio.sources.length) studioPlay(0); } catch (error) { studioFeedback(error.message); } };
S('#studio-add-stream').onclick = () => { try { const url = new URL(S('#studio-stream-url').value.trim()); if (!['http:', 'https:'].includes(url.protocol)) throw Error(); studio.sources.push({ type: 'stream', name: url.hostname, url: url.href }); S('#studio-stream-url').value = ''; studioSources(); if (studio.active < 0) studioPlay(0); } catch { studioFeedback('Enter a valid HTTP or HTTPS stream link.'); } };
S('#studio-stream-url').onkeydown = event => { if (event.key === 'Enter') S('#studio-add-stream').click(); };
S('#studio-sources').onclick = event => { const play = event.target.closest('[data-play]'), remove = event.target.closest('[data-remove]'), raise = event.target.closest('[data-raise]'); if (play) studioPlay(Number(play.dataset.play)); if (raise) { const index = Number(raise.dataset.raise); if (index > 0) { [studio.sources[index - 1], studio.sources[index]] = [studio.sources[index], studio.sources[index - 1]]; if (studio.active === index) studio.active--; else if (studio.active === index - 1) studio.active++; studioSources(); } } if (remove) { const index = Number(remove.dataset.remove); studio.sources.splice(index, 1); if (studio.active === index) { studio.active = -1; studio.video.pause(); studio.video.removeAttribute('src'); studio.video.load(); if (studio.sources.length) studioPlay(0); } else if (studio.active > index) studio.active--; studioSources(); } };
S('#studio-next').onclick = () => { if (studio.sources.length) studioPlay((studio.active + 1) % studio.sources.length); };
S('#studio-add-text').onclick = () => newStudioLayer('text');
S('#studio-add-logo').onclick = () => newStudioLayer('image', { name: 'UNiPLAY logo', url: 'uniplay.svg' });
S('#studio-add-image').onclick = () => S('#studio-image-input').click();
S('#studio-image-input').onchange = event => { const file = event.target.files[0]; if (!file) return; const url = URL.createObjectURL(file); newStudioLayer('image', { name: file.name, url }); event.target.value = ''; };
S('#studio-layers').onclick = event => { const select = event.target.closest('[data-layer]'), up = event.target.closest('[data-up]'); if (select) selectStudioLayer(select.dataset.layer); if (up) { const index = studio.layers.findIndex(item => item.id === up.dataset.up); if (index >= 0 && index < studio.layers.length - 1) [studio.layers[index], studio.layers[index + 1]] = [studio.layers[index + 1], studio.layers[index]]; studioLayers(); } };
S('#studio-layers').onchange = event => { const input = event.target.closest('[data-visible]'); if (!input) return; const layer = studio.layers.find(item => item.id === input.dataset.visible); if (layer) layer.visible = input.checked; };
for (const [id, key] of [['text', 'text'], ['color', 'color'], ['background', 'background'], ['stroke', 'stroke'], ['size', 'size'], ['outline', 'outline'], ['shadow', 'shadow'], ['width', 'w'], ['height', 'h'], ['x', 'x'], ['y', 'y'], ['opacity', 'opacity'], ['motion', 'motion']]) S('#studio-' + id).addEventListener('input', event => { const layer = studio.layers.find(item => item.id === studio.selectedLayer); if (layer) { layer[key] = ['size', 'outline', 'shadow', 'opacity', 'w', 'h', 'x', 'y'].includes(key) ? Number(event.target.value) : event.target.value; if (key === 'text') { layer.name = layer.text.slice(0, 25) || 'Text'; studioLayers(); } } });
S('#studio-backdrop-enabled').onchange = event => { const layer = studio.layers.find(item => item.id === studio.selectedLayer); if (layer) layer.backdrop = event.target.checked; };
S('#studio-remove-layer').onclick = () => { studio.layers = studio.layers.filter(item => item.id !== studio.selectedLayer); studio.selectedLayer = null; studioLayers(); };
const ctx = studio.canvas.getContext('2d', { alpha: false });
const studioImages = new Map();
function drawStudio(time) {
  const width = studio.canvas.width, height = studio.canvas.height;
  ctx.fillStyle = '#151519'; ctx.fillRect(0, 0, width, height);
  if (studio.video.readyState >= 2 && studio.video.videoWidth && studio.video.videoHeight) { const scale = Math.min(width / studio.video.videoWidth, height / studio.video.videoHeight); const w = studio.video.videoWidth * scale, h = studio.video.videoHeight * scale; try { ctx.drawImage(studio.video, (width - w) / 2, (height - h) / 2, w, h); } catch {} }
  else { ctx.fillStyle = '#aa7d9f'; ctx.font = '700 32px Arial'; ctx.textAlign = 'center'; ctx.fillText('UNiPLAY LIVE STUDIO', width / 2, height / 2); ctx.textAlign = 'start'; }
  for (const layer of studio.layers) {
    if (!layer.visible) continue; ctx.save();
    const t = (time - layer.created) / 1000;
    ctx.globalAlpha = layer.opacity / 100 * (layer.motion === 'fade' ? Math.min(1, Math.max(0, t)) : layer.motion === 'pulse' ? .75 + .25 * Math.sin(t * 3) : 1);
    const x = layer.x, y = layer.y + (layer.motion === 'float' ? Math.sin(t * 2) * 9 : 0);
    ctx.shadowColor = '#000000'; ctx.shadowBlur = layer.shadow;
    if (layer.type === 'text') {
      ctx.font = `800 ${layer.size}px Arial`; const lines = (layer.text || '').split('\n').slice(0, 5); const lineHeight = layer.size * 1.2;
      const textWidth = Math.max(100, ...lines.map(line => ctx.measureText(line).width));
      layer.w = Math.ceil(Math.max(layer.w, textWidth + 24)); layer.h = Math.ceil(Math.max(layer.h, lines.length * lineHeight + 18));
      if (layer.backdrop) { ctx.fillStyle = layer.background + 'cc'; ctx.fillRect(x - 12, y - layer.size - 8, layer.w, layer.h); }
      ctx.textBaseline = 'alphabetic'; ctx.lineWidth = layer.outline; ctx.strokeStyle = layer.stroke; ctx.fillStyle = layer.color;
      lines.forEach((line, index) => { if (layer.outline) ctx.strokeText(line, x, y + index * lineHeight); ctx.fillText(line, x, y + index * lineHeight); });
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
async function refreshStudioStatus() { if (!studio.broadcast) return; try { const data = await window.studioBridge.status(); S('#studio-bitrate').textContent = data.bitrate + ' kb/s sent'; S('#studio-viewers').textContent = data.viewers + (data.viewers === 1 ? ' viewer' : ' viewers'); S('#studio-timer').textContent = String(Math.floor(data.seconds / 60)).padStart(2, '0') + ':' + String(data.seconds % 60).padStart(2, '0'); if (data.error) studioFeedback(data.error); S('#studio-health').textContent = data.error ? 'Stream needs attention' : data.bitrate ? 'Streaming' : 'Connecting…'; } catch (error) { studioFeedback(error.message); } }
setInterval(refreshStudioStatus, 2000);
S('#studio-start').onclick = async () => {
  try {
    if (!studio.sources.length) throw new Error('Add a video or M3U8 stream first.');
    if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) throw new Error('This PC cannot encode a live scene.');
    if (studio.active < 0) studioPlay(0);
    studio.audioContext ||= new AudioContext();
    studio.audioDestination ||= studio.audioContext.createMediaStreamDestination();
    if (!studio.audioSource) { studio.audioSource = studio.audioContext.createMediaElementSource(studio.video); studio.audioSource.connect(studio.audioContext.destination); studio.audioSource.connect(studio.audioDestination); }
    await studio.audioContext.resume();
    const canvasStream = studio.canvas.captureStream(30);
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...studio.audioDestination.stream.getAudioTracks()]);
    const details = await window.studioBridge.start();
    studio.broadcast = details;
    studio.recorder = new MediaRecorder(combined, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 });
    studio.recorder.ondataavailable = event => { if (event.data.size) studio.sent = studio.sent.then(() => event.data.arrayBuffer()).then(buffer => window.studioBridge.chunk(new Uint8Array(buffer))).catch(error => studioFeedback(error.message)); };
    studio.recorder.onerror = event => studioFeedback(event.error?.message || 'Broadcast recorder stopped.');
    studio.recorder.start(1000);
    S('#studio-start').disabled = true; S('#studio-stop').disabled = false; S('#studio-live-badge').textContent = 'LIVE'; S('#studio-live-badge').classList.add('live'); S('#studio-url').value = details.url; S('#studio-link').hidden = false; S('#studio-health').textContent = 'Connecting…'; studioFeedback(details.note);
  } catch (error) { studioFeedback(error.message); }
};
S('#studio-stop').onclick = async () => { try { if (studio.recorder?.state !== 'inactive') studio.recorder.stop(); await studio.sent; await window.studioBridge.stop(); studio.broadcast = null; S('#studio-start').disabled = false; S('#studio-stop').disabled = true; S('#studio-live-badge').textContent = 'OFF AIR'; S('#studio-live-badge').classList.remove('live'); S('#studio-link').hidden = true; S('#studio-health').textContent = 'Ready to broadcast'; studioFeedback('Broadcast ended.'); } catch (error) { studioFeedback(error.message); } };
S('#studio-copy').onclick = async () => { try { await navigator.clipboard.writeText(S('#studio-url').value); S('#studio-copy').textContent = 'Copied'; setTimeout(() => S('#studio-copy').textContent = 'Copy link', 1600); } catch { studioFeedback('Select the link and copy it.'); } };
studioSources(); studioLayers();
