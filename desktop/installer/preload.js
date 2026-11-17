'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'astroKidInstaller',
  Object.freeze({
    getManifest: () => ipcRenderer.invoke('installer:getManifest'),
    minimize: () => ipcRenderer.invoke('installer:minimize'),
    close: () => ipcRenderer.invoke('installer:close'),
    startSpikeInstall: () => ipcRenderer.invoke('installer:startSpikeInstall'),
    cancelInstall: () => ipcRenderer.invoke('installer:cancelInstall'),
    onProgress: (cb) => {
      if (typeof cb !== 'function') return () => {};
      const listener = (_event, data) => cb(data);
      ipcRenderer.on('installer:progress', listener);
      return () => ipcRenderer.removeListener('installer:progress', listener);
    },
  })
);
