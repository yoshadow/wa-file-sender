'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// No generic invoke, filesystem, shell, credentials or Electron objects are exposed.
contextBridge.exposeInMainWorld('waFileSender', {
  getAppInfo: (...args) => ipcRenderer.invoke('app:get-info', ...args),
  setLanguage: (...args) => ipcRenderer.invoke('app:set-language', ...args),
  close: (...args) => ipcRenderer.invoke('app:close', ...args),
  getWhatsAppState: (...args) => ipcRenderer.invoke('wa:get-state', ...args),
  connectWhatsApp: (...args) => ipcRenderer.invoke('wa:connect', ...args),
  unlinkWhatsApp: (...args) => ipcRenderer.invoke('wa:unlink', ...args),
  getContacts: (...args) => ipcRenderer.invoke('contacts:get', ...args),
  saveContactsTemplate: (...args) =>
    ipcRenderer.invoke('contacts:template', ...args),
  selectContactsCsv: (...args) =>
    ipcRenderer.invoke('contacts:select', ...args),
  clearContacts: (...args) => ipcRenderer.invoke('contacts:clear', ...args),
  getPreview: (...args) => ipcRenderer.invoke('preview:get', ...args),
  selectRoot: (...args) => ipcRenderer.invoke('preview:select-root', ...args),
  clearPreview: (...args) => ipcRenderer.invoke('preview:clear', ...args),
  getQueue: (...args) => ipcRenderer.invoke('queue:get', ...args),
  getSessionResults: (...args) => ipcRenderer.invoke('queue:results', ...args),
  prepareQueue: (...args) => ipcRenderer.invoke('queue:prepare', ...args),
  startQueue: (...args) => ipcRenderer.invoke('queue:start', ...args),
  stopQueue: (...args) => ipcRenderer.invoke('queue:stop', ...args),
  resolveBatchAttempt: (...args) =>
    ipcRenderer.invoke('queue:resolve', ...args),
  selectPreviewItem: (...args) =>
    ipcRenderer.invoke('preview:select-item', ...args),
});
