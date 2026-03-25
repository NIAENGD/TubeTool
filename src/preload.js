const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tubeTool', {
  analyze: (url) => ipcRenderer.invoke('media:analyze', { url }),
  startDownload: (payload) => ipcRenderer.invoke('media:download', payload),
  listDownloads: () => ipcRenderer.invoke('media:downloads'),
  onProgress: (listener) => {
    ipcRenderer.on('media:progress', (_event, payload) => listener(payload));
  },
  openFile: (filePath) => ipcRenderer.invoke('app:open-file', filePath)
});
