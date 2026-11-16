const { app, BrowserWindow, shell, ipcMain, Notification, Menu, nativeImage, session } = require("electron");
const path = require("path");

app.setName("ActionFlow");
if (process.platform === "win32") {
  app.setAppUserModelId("com.actionflow.desktop");
}

let mainWindow = null;

// Target cloud production URL (hosted on Vercel & connected to Render backend)
const CLOUD_APP_URL = (process.env.ELECTRON_START_URL || "https://action-flow-messenger.vercel.app/") + "?desktop=true";

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

  // Load cloud deployed ActionFlow directly from Vercel / Render
  try {
    await mainWindow.loadURL(CLOUD_APP_URL);
  } catch (err) {
    console.error("[Electron] Initial loadURL error:", err);
  }

  // Gracefully retry if user was offline or reconnecting
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Page failed to load: ${errorDescription} (${errorCode}) at ${validatedURL}`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(CLOUD_APP_URL).catch(() => {});
      }
    }, 4000);
  });

  if (process.env.OPEN_DEVTOOLS === "true") {
    mainWindow.webContents.openDevTools({ mode: "right" });
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Fallback to guarantee window visibility
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 2000);

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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
