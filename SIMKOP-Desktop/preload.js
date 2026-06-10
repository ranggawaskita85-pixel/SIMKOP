const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStore: () => ipcRenderer.invoke('get-store'),
  setStore: (data) => ipcRenderer.invoke('set-store', data),
  getFirebaseConfig: () => ipcRenderer.invoke('get-firebase-config'),
  initFirebase: (config) => ipcRenderer.invoke('init-firebase', config),
  syncToFirebase: (data) => ipcRenderer.invoke('sync-to-firebase', data),
  syncFromFirebase: () => ipcRenderer.invoke('sync-from-firebase'),
  onFirebaseUpdate: (callback) => {
    ipcRenderer.on('firebase-data-updated', (event, data) => callback(data));
  },
  checkPassword: (password) => ipcRenderer.invoke('check-password', password),
  checkFirstRun: () => ipcRenderer.invoke('check-first-run')
});