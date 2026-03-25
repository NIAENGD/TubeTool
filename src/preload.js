const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tubeTool', {
  analyze: (request) => ipcRenderer.invoke('media:analyze', typeof request === 'string' ? { url: request } : request),
  startDownload: (payload) => ipcRenderer.invoke('media:download', payload),
  listDownloads: () => ipcRenderer.invoke('media:downloads'),
  onProgress: (listener) => {
    ipcRenderer.on('media:progress', (_event, payload) => listener(payload));
  },
  openFile: (filePath) => ipcRenderer.invoke('app:open-file', filePath)
});
