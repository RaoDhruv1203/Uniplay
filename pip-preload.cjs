const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('downytPip', {
  onSource: handler => ipcRenderer.on('pip:source', (_, source) => handler(source)),
  close: () => ipcRenderer.invoke('pip:close'),
  pin: () => ipcRenderer.invoke('pip:pin'),
  searchVideos: query => ipcRenderer.invoke('video:search', query),
  selectYoutube: video => ipcRenderer.invoke('pip:youtube-select', video),
  catalog: () => ipcRenderer.invoke('audio:catalog'),
  playlists: () => ipcRenderer.invoke('playlists:list'),
  createPlaylist: name => ipcRenderer.invoke('playlists:create', name),
  addToPlaylist: (id, input) => ipcRenderer.invoke('playlists:add', id, input),
  removeFromPlaylist: (id, itemId) => ipcRenderer.invoke('playlists:remove', id, itemId),
  playItem: item => ipcRenderer.invoke('pip:play-item', item),
  setAudioMode: compact => ipcRenderer.invoke('pip:mode', compact),
  onPlaylists: handler => ipcRenderer.on('playlists:changed', (_, lists) => handler(lists)),
});
