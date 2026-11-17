'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const version = ipcRenderer.sendSync('astrokid:getVersion');

contextBridge.exposeInMainWorld(
  'astroKidDesktop',
  Object.freeze({
    platform: 'desktop',
    version: typeof version === 'string' && version ? version : '0.1.0',
    toggleFullscreen: () => ipcRenderer.invoke('astrokid:toggleFullscreen'),
    quit: () => ipcRenderer.invoke('astrokid:quit'),
    openExternal: (key) => ipcRenderer.invoke('astrokid:openExternal', key),
  })
);
