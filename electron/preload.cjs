const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('native', {
  platform: 'electron',
  claude: (key, body) => ipcRenderer.invoke('claude:call', { key, body })
});
