const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('streamBridge', { fetch: input => ipcRenderer.invoke('stream:fetch', input) });
contextBridge.exposeInMainWorld('downytPip', {
  onSource: handler => ipcRenderer.on('pip:source', (_, source) => handler(source)),
  onThumbnail: handler => ipcRenderer.on('pip:thumbnail', (_, artwork) => handler(artwork)),
  close: () => ipcRenderer.invoke('pip:close'),
  pin: () => ipcRenderer.invoke('pip:pin'),
  searchVideos: query => ipcRenderer.invoke('video:search', query),
  selectYoutube: video => ipcRenderer.invoke('pip:youtube-select', video),
  prepareAudio: url => ipcRenderer.invoke('pip:prepare-audio', url),
  catalog: () => ipcRenderer.invoke('audio:catalog'),
  playlists: () => ipcRenderer.invoke('playlists:list'),
  createPlaylist: name => ipcRenderer.invoke('playlists:create', name),
  addToPlaylist: (id, input) => ipcRenderer.invoke('playlists:add', id, input),
  removeFromPlaylist: (id, itemId) => ipcRenderer.invoke('playlists:remove', id, itemId),
  playItem: item => ipcRenderer.invoke('pip:play-item', item),
  setAudioMode: compact => ipcRenderer.invoke('pip:mode', compact),
  setAspect: ratio => ipcRenderer.invoke('pip:aspect', ratio),
  moveTo: (x, y) => ipcRenderer.send('pip:drag', { x, y }),
  dragEnd: () => ipcRenderer.send('pip:drag-end'),
  resizeTo: width => ipcRenderer.send('pip:resize', width),
  onPlaylists: handler => ipcRenderer.on('playlists:changed', (_, lists) => handler(lists)),
});
