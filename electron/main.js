const { app, BrowserWindow, shell, ipcMain, Notification, Menu, nativeImage, session } = require("electron");
const path = require("path");
const net = require("net");
const http = require("http");
const { fork } = require("child_process");

app.setName("ActionFlow");
if (process.platform === "win32") {
  app.setAppUserModelId("com.actionflow.desktop");
}

const isDev = process.env.NODE_ENV === "development" || (app && !app.isPackaged);
let mainWindow = null;
let serverProcess = null;

// Find an open local port
function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// Single application instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function waitForServerReady(port, maxAttempts = 40) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
        } else if (attempts < maxAttempts) {
          setTimeout(check, 250);
        } else {
          resolve(false);
        }
      });
      req.on("error", () => {
        if (attempts < maxAttempts) {
          setTimeout(check, 250);
        } else {
          resolve(false);
        }
      });
      req.setTimeout(500, () => req.destroy());
    };
    check();
  });
}

async function startProductionServer() {
  const port = await getAvailablePort();
  const serverPath = path.join(__dirname, "../Frontend/.output/server/index.mjs");

  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "production",
    },
    silent: false,
  });

  serverProcess.on("error", (err) => {
    console.error("[Electron Server] Failed to start production server:", err);
  });

  // Wait until server is fully responsive and returning 200 OK
  await waitForServerReady(port);
  return port;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    title: "ActionFlow",
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 11 } : undefined,
    show: false,
    backgroundColor: "#090d16",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
  });

  const customUA = mainWindow.webContents.getUserAgent() + " ActionFlowDesktop/1.0.0";
  mainWindow.webContents.setUserAgent(customUA);

  if (isDev) {
    const devUrl = (process.env.ELECTRON_START_URL || "http://localhost:8080") + "?desktop=true";
    await mainWindow.loadURL(devUrl);
  } else {
    try {
      const port = await startProductionServer();
      await mainWindow.loadURL(`http://127.0.0.1:${port}?desktop=true`);
    } catch (err) {
      console.error("[Electron] Production server startup error:", err);
    }
  }

  if (isDev) {
    // Open DevTools only during development
    mainWindow.webContents.openDevTools({ mode: "right" });
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Fallback in case ready-to-show is delayed
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 2000);

  // Fallback to guarantee window visibility
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 2500);

  // Open external links (http/https) in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle("send-native-notification", (event, { title, body }) => {
  try {
    console.log("[Electron Main] Received send-native-notification request:", { title, body });
    if (Notification.isSupported()) {
      const notifOptions = {
        title: title || "ActionFlow",
        body: body || "",
        silent: false,
      };

      try {
        const iconPath = path.join(__dirname, "assets/icon.png");
        const nImg = nativeImage.createFromPath(iconPath);
        if (!nImg.isEmpty()) {
          notifOptions.icon = nImg;
        }
      } catch (iconErr) {
        // Fallback without explicit icon (uses app bundle icon)
      }

      const notif = new Notification(notifOptions);
      notif.on("click", () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      });
      notif.show();

      if (process.platform === "darwin" && app.dock) {
        app.dock.bounce("informational");
      }
      return true;
    }
  } catch (err) {
    console.error("[Electron Main] Error showing notification:", err);
  }
  return false;
});

ipcMain.handle("set-badge-count", (event, count) => {
  const numericCount = typeof count === "number" ? Math.max(0, count) : 0;
  if (app.setBadgeCount) {
    app.setBadgeCount(numericCount);
  }
  if (process.platform === "darwin" && app.dock) {
    app.dock.setBadge(numericCount > 0 ? String(numericCount) : "");
  }
  return true;
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

// Build standard application menu
function setupMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  if (session && session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === "notifications") {
        callback(true);
      } else {
        callback(false);
      }
    });
  }
  setupMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
