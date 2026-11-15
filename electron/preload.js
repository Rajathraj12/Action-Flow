const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isDesktop: true,
  platform: process.platform,
  sendNotification: (title, body) =>
    ipcRenderer.invoke("send-native-notification", { title, body }),
  setBadgeCount: (count) =>
    ipcRenderer.invoke("set-badge-count", count),
  getVersion: () =>
    ipcRenderer.invoke("get-app-version"),
});
