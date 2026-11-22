const { app, BrowserWindow, shell, ipcMain, Notification, Menu, nativeImage, session } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");
const { fork } = require("child_process");

app.setName("ActionFlow");
if (process.platform === "win32") {
  app.setAppUserModelId("com.actionflow.desktop");
}

function ensureWindowsShortcut() {
  if (process.platform !== "win32") return;
  try {
    const startMenuDir = path.join(
      app.getPath("appData"),
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs"
    );
    const shortcutPath = path.join(startMenuDir, "ActionFlow.lnk");
    const iconIcoPath = path.join(__dirname, "assets", "icon.ico");
    const targetIcon = fs.existsSync(iconIcoPath) ? iconIcoPath : process.execPath;

    const shortcutDetails = {
      target: process.execPath,
      args: "",
      appUserModelId: "com.actionflow.desktop",
      description: "ActionFlow Real-Time Messenger",
      icon: targetIcon,
      iconIndex: 0,
    };

    // Use "replace" if shortcut exists so it always points to the current executable with the proper AppUserModelId
    const operation = fs.existsSync(shortcutPath) ? "replace" : "create";
    const success = shell.writeShortcutLink(shortcutPath, operation, shortcutDetails);
    console.log(`[Electron] Start Menu shortcut ${operation}d (success: ${success}):`, shortcutPath);

    // Also update any subfolder shortcut if installed inside Start Menu\Programs\ActionFlow\
    const subDir = path.join(startMenuDir, "ActionFlow");
    if (fs.existsSync(subDir)) {
      const subShortcut = path.join(subDir, "ActionFlow.lnk");
      shell.writeShortcutLink(subShortcut, fs.existsSync(subShortcut) ? "replace" : "create", shortcutDetails);
    }
  } catch (err) {
    console.warn("[Electron] Could not ensure Start Menu shortcut:", err);
  }
}

let mainWindow = null;
let serverProcess = null;

const isDev = process.env.NODE_ENV === "development" || (!app.isPackaged && !process.env.TEST_PACKAGED);
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

// Find an open local port dynamically
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

// Probe local server until ready to accept connections
function waitForServerReady(port, maxAttempts = 60) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
        } else if (attempts < maxAttempts) {
          setTimeout(check, 200);
        } else {
          resolve(false);
        }
      });
      req.on("error", () => {
        if (attempts < maxAttempts) {
          setTimeout(check, 200);
        } else {
          resolve(false);
        }
      });
      req.setTimeout(500, () => req.destroy());
    };
    check();
  });
}

// Locate packaged or unpackaged Nitro production server
function getProductionServerPath() {
  if (app.isPackaged) {
    // 1. Packaged location via asarUnpack
    const unpackedPath = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "Frontend",
      ".output",
      "server",
      "index.mjs"
    );
    if (fs.existsSync(unpackedPath)) return unpackedPath;

    // 2. Direct resources path
    const directPath = path.join(
      process.resourcesPath,
      "Frontend",
      ".output",
      "server",
      "index.mjs"
    );
    if (fs.existsSync(directPath)) return directPath;
  }

  // 3. Local build folder (development test)
  const localPath = path.join(__dirname, "../Frontend/.output/server/index.mjs");
  if (fs.existsSync(localPath)) return localPath;

  return null;
}

// Fork the packaged production server process
async function startProductionServer() {
  const serverPath = getProductionServerPath();
  if (!serverPath) {
    console.warn("[Electron Server] Production server script not found at expected paths.");
    return null;
  }

  try {
    const port = await getAvailablePort();
    console.log(`[Electron Server] Spawning production server on 127.0.0.1:${port} from ${serverPath}`);

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
      console.error("[Electron Server] Error in production server process:", err);
    });

    serverProcess.on("exit", (code, signal) => {
      console.log(`[Electron Server] Server process stopped (code: ${code}, signal: ${signal})`);
      serverProcess = null;
    });

    const isReady = await waitForServerReady(port);
    if (isReady) {
      console.log(`[Electron Server] Local production server successfully verified on port ${port}`);
      return port;
    } else {
      console.warn("[Electron Server] Local server probe timed out; falling back to cloud.");
      return null;
    }
  } catch (err) {
    console.error("[Electron Server] Failed to initialize production server:", err);
    return null;
  }
}

// Differentiate internal ActionFlow navigation from external links
function isInternalUrl(targetUrl, currentUrl) {
  if (!targetUrl) return false;
  try {
    const parsedTarget = new URL(targetUrl);
    // Local development or local production server
    if (parsedTarget.hostname === "localhost" || parsedTarget.hostname === "127.0.0.1") {
      return true;
    }
    // File scheme
    if (parsedTarget.protocol === "file:") {
      return true;
    }
    // Production domains
    if (
      parsedTarget.hostname.endsWith("action-flow-messenger.vercel.app") ||
      parsedTarget.hostname.endsWith("vercel.app") ||
      parsedTarget.hostname.endsWith("onrender.com")
    ) {
      return true;
    }
    // Match current window origin
    if (currentUrl) {
      const parsedCurrent = new URL(currentUrl);
      if (parsedTarget.origin === parsedCurrent.origin) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function createWindow() {
  const windowIconPath = path.join(
    __dirname,
    "assets",
    process.platform === "win32" ? "icon.ico" : "icon.png"
  );

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    title: "ActionFlow",
    icon: fs.existsSync(windowIconPath) ? windowIconPath : path.join(__dirname, "assets/icon.png"),
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

  let initialUrl = CLOUD_APP_URL;

  if (isDev) {
    // Development Mode: Connect to local dev server if running, otherwise use cloud app URL
    if (process.env.ELECTRON_START_URL) {
      initialUrl =
        process.env.ELECTRON_START_URL +
        (process.env.ELECTRON_START_URL.includes("?") ? "&" : "?") +
        "desktop=true";
    } else {
      const devPortReady = await waitForServerReady(8080, 5);
      if (devPortReady) {
        initialUrl = "http://localhost:8080?desktop=true";
        console.log("[Electron] Running in Development Mode, connected to local dev server on http://localhost:8080");
      } else {
        console.log("[Electron] Local dev server on 8080 not active; loading production cloud URL:", CLOUD_APP_URL);
        initialUrl = CLOUD_APP_URL;
      }
    }
  } else {
    // Production Mode: Load packaged frontend files inside BrowserWindow
    console.log("[Electron] Running in Production Mode, attempting local server initialization...");
    const localPort = await startProductionServer();
    if (localPort) {
      initialUrl = `http://127.0.0.1:${localPort}?desktop=true`;
      console.log("[Electron] Packaged frontend server loaded successfully on:", initialUrl);
    } else {
      console.log("[Electron] Local server fallback; connecting to production cloud:", CLOUD_APP_URL);
      initialUrl = CLOUD_APP_URL;
    }
  }

  try {
    await mainWindow.loadURL(initialUrl);
  } catch (err) {
    console.error("[Electron] Initial loadURL error:", err);
    if (initialUrl !== CLOUD_APP_URL) {
      mainWindow.loadURL(CLOUD_APP_URL).catch(() => {});
    }
  }

  // Gracefully retry on network reconnections
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Page failed to load: ${errorDescription} (${errorCode}) at ${validatedURL}`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(initialUrl || CLOUD_APP_URL).catch(() => {});
      }
    }, 4000);
  });

  if (isDev || process.env.OPEN_DEVTOOLS === "true") {
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

  // External websites open in user's default browser only; internal navigation remains in Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const currentUrl = mainWindow ? mainWindow.webContents.getURL() : "";
    if (isInternalUrl(url, currentUrl)) {
      mainWindow.loadURL(url);
      return { action: "deny" };
    }
    if (url.startsWith("http:") || url.startsWith("https:") || url.startsWith("mailto:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow ? mainWindow.webContents.getURL() : "";
    if (!isInternalUrl(url, currentUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("focus", () => {
    mainWindow.flashFrame(false);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function cleanupProcesses() {
  if (serverProcess) {
    console.log("[Electron] Stopping local production server process...");
    try {
      serverProcess.kill();
    } catch {}
    serverProcess = null;
  }
}

// IPC Handlers
ipcMain.handle("send-native-notification", (event, { title, body }) => {
  try {
    console.log("[Electron Main] Received send-native-notification request:", { title, body });

    // Flash taskbar button if window is in background or minimized
    if (mainWindow && (!mainWindow.isFocused() || mainWindow.isMinimized())) {
      mainWindow.flashFrame(true);
    }

    if (Notification.isSupported()) {
      const notifOptions = {
        title: title || "ActionFlow",
        body: body || "",
        silent: false,
      };

      const notifIcon = path.join(__dirname, "assets", "notification-icon.png");
      const defaultIcon = path.join(__dirname, "assets", "icon.png");
      const chosenIcon = fs.existsSync(notifIcon) ? notifIcon : defaultIcon;

      if (fs.existsSync(chosenIcon)) {
        if (process.platform === "win32") {
          // On Windows, pass direct file path string so Windows Toast XML parses it directly
          notifOptions.icon = chosenIcon;
        } else {
          try {
            const nImg = nativeImage.createFromPath(chosenIcon);
            if (!nImg.isEmpty()) notifOptions.icon = nImg;
          } catch {
            notifOptions.icon = chosenIcon;
          }
        }
      }

      const notif = new Notification(notifOptions);
      notif.on("click", () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.flashFrame(false);
        }
      });
      notif.on("failed", (ev, error) => {
        console.error("[Electron Main] Windows notification display failed:", error);
      });
      notif.show();

      if (process.platform === "darwin" && app.dock) {
        app.dock.bounce("informational");
      }
      return true;
    } else {
      console.warn("[Electron Main] Notification.isSupported() returned false");
    }
  } catch (err) {
    console.error("[Electron Main] Error showing notification:", err);
  }
  return false;
});

ipcMain.handle("flash-frame", (event, flag) => {
  if (mainWindow) {
    mainWindow.flashFrame(Boolean(flag));
    return true;
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
  ensureWindowsShortcut();
  if (session && session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === "notifications") {
        callback(true);
      } else {
        callback(false);
      }
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      if (permission === "notifications") {
        return true;
      }
      return false;
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

app.on("before-quit", cleanupProcesses);
app.on("will-quit", cleanupProcesses);

app.on("window-all-closed", () => {
  cleanupProcesses();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
