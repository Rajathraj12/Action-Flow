const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("isDesktop", true);
contextBridge.exposeInMainWorld("isElectron", true);

contextBridge.exposeInMainWorld("electronAPI", {
  isDesktop: true,
  platform: process.platform,
  sendNotification: (title, body) =>
    ipcRenderer.invoke("send-native-notification", { title, body }),
  setBadgeCount: (count) =>
    ipcRenderer.invoke("set-badge-count", count),
  getVersion: () =>
    ipcRenderer.invoke("get-app-version"),
  flashFrame: (flag) =>
    ipcRenderer.invoke("flash-frame", flag),
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.setAttribute("data-desktop-app", "true");
  if (document.body) {
    document.body.setAttribute("data-desktop-app", "true");
  }
});
