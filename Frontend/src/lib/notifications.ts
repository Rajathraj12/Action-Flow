/**
 * Cross-platform desktop and browser notification dispatcher for ActionFlow.
 * Automatically delegates to Service Worker / Electron IPC for native OS notifications on macOS/Windows/Linux,
 * and standard Web Notification API (Windows Action Center) when running in the browser.
 */

interface NotifyOptions {
  title: string;
  body: string;
  icon?: string;
  conversationId?: string;
  silent?: boolean;
}

let originalTitle = typeof document !== "undefined" ? document.title : "ActionFlow";
let titleFlashInterval: any = null;
let swRegistration: ServiceWorkerRegistration | null = null;

// Initialize Service Worker for persistent Windows Action Center notifications
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      swRegistration = reg;
      console.log("[ActionFlow] Service Worker registered for Windows notifications:", reg.scope);
    })
    .catch((err) => {
      console.warn("[ActionFlow] Service Worker registration failed:", err);
    });
}

// Clean WhatsApp-style synthesized dual-tone audio chime using Web Audio API
export function playNotificationChime() {
  try {
    if (typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    // Resume audio context if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.08);
    gain2.gain.setValueAtTime(0.28, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.45);
  } catch (err) {
    console.warn("[ActionFlow] Audio chime playback error:", err);
  }
}

// Flashes tab title when user is on another tab/window
export function flashDocumentTitle(alertMessage: string) {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") return;

  if (titleFlashInterval) {
    clearInterval(titleFlashInterval);
  }

  let showMsg = true;
  titleFlashInterval = setInterval(() => {
    if (document.visibilityState === "visible") {
      document.title = originalTitle;
      clearInterval(titleFlashInterval);
      titleFlashInterval = null;
    } else {
      document.title = showMsg ? `(1) 💬 ${alertMessage}` : originalTitle;
      showMsg = !showMsg;
    }
  }, 1200);
}

// Detects whether we are running inside the native Windows/macOS Electron desktop app
export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as any).isDesktop ||
    (window as any).isElectron ||
    (window as any).electronAPI ||
    window.location.search.includes("desktop=true") ||
    document.documentElement.getAttribute("data-desktop-app") === "true" ||
    document.body?.getAttribute("data-desktop-app") === "true"
  );
}

// Request permission from an explicit user gesture (button click)
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof window === "undefined") return null;

  // In native desktop app, permissions are always granted natively
  if (isDesktopApp()) {
    sendTestNotification();
    return "granted";
  }

  if (!("Notification" in window)) {
    return null;
  }
  try {
    let perm: NotificationPermission;
    const req = Notification.requestPermission();
    if (req && typeof (req as any).then === "function") {
      perm = await req;
    } else {
      perm = await new Promise<NotificationPermission>((resolve) => {
        Notification.requestPermission(resolve);
      });
    }

    if (perm === "granted") {
      sendTestNotification();
    }
    return perm;
  } catch (err) {
    console.warn("[ActionFlow] Error requesting notification permission:", err);
    return null;
  }
}

// Sends a test notification to verify Windows Action Center integration
export function sendTestNotification() {
  notifyDesktop({
    title: "ActionFlow • Windows Notifications Active",
    body: "WhatsApp-style desktop alerts are working! You will get notified when new messages arrive. 🚀",
  });
}

// Checks if desktop notifications are already permitted
export function getNotificationPermissionStatus(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined") return "unsupported";

  // Inside the Windows Desktop Electron App, OS notifications are always native & granted!
  if (isDesktopApp()) {
    return "granted";
  }

  if (!("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

let lastNotificationKey = "";
let lastNotificationTime = 0;

export async function notifyDesktop({ title, body, conversationId }: NotifyOptions) {
  if (typeof window === "undefined") return;

  // Deduplicate identical alerts within 1.5 seconds across global and local listeners
  const notifKey = `${title}:::${body}`;
  const now = Date.now();
  if (notifKey === lastNotificationKey && now - lastNotificationTime < 1500) {
    return;
  }
  lastNotificationKey = notifKey;
  lastNotificationTime = now;

  // 1. Play alert chime
  playNotificationChime();

  // 2. Flash tab title when outside the tab
  flashDocumentTitle(title);

  // 3. Flash taskbar button in Electron when in background
  if ((window as any).electronAPI?.flashFrame) {
    try {
      (window as any).electronAPI.flashFrame(true).catch(() => {});
    } catch {}
  }

  // 4. Native Electron OS Notification (macOS Notification Center / Windows Action Center)
  let nativeDispatched = false;
  if ((window as any).electronAPI?.sendNotification) {
    try {
      const res = await (window as any).electronAPI.sendNotification(title, body);
      nativeDispatched = Boolean(res);
    } catch (err) {
      console.warn("[ActionFlow Desktop] Native notification error:", err);
    }
  }

  if (nativeDispatched) return;

  // 5. Web Notification API (Windows Action Center via Browser or HTML5 fallback)
  if ("Notification" in window && Notification.permission === "granted") {
    const iconUrl = new URL("/notification-icon.png", window.location.origin).href;

    // Strategy A: ServiceWorker showNotification (Recommended by Chrome for Windows Action Center)
    try {
      const reg = swRegistration || (await navigator.serviceWorker?.ready.catch(() => null));
      if (reg && "showNotification" in reg) {
        await reg.showNotification(title, {
          body,
          icon: iconUrl,
          badge: iconUrl,
          tag: conversationId || "actionflow-message",
          data: { conversationId },
          renotify: true,
          requireInteraction: false,
        });
        return;
      }
    } catch (swErr) {
      console.warn("[ActionFlow SW Notification] Fallback to standard Notification:", swErr);
    }

    // Strategy B: Standard new Notification(...) fallback
    try {
      const notif = new Notification(title, {
        body,
        icon: iconUrl,
        badge: iconUrl,
        tag: conversationId || "actionflow-message",
        silent: false,
      });

      notif.onclick = () => {
        try {
          window.focus();
          if (conversationId) {
            const url = new URL(window.location.href);
            url.searchParams.set("conversationId", conversationId);
            window.location.href = url.toString();
          }
        } catch {}
        notif.close();
      };
    } catch (err) {
      console.warn("[ActionFlow Web] HTML5 Notification error:", err);
    }
  }
}

/**
 * Updates OS Dock / Taskbar unread counter badge.
 */
export function updateDesktopBadge(count: number) {
  if (typeof window === "undefined") return;

  // 1. Electron Dock / Taskbar badge count
  if ((window as any).electronAPI?.setBadgeCount) {
    (window as any).electronAPI.setBadgeCount(count).catch(() => {});
  }

  // 2. Standard Web App Badge API
  if ("setAppBadge" in navigator) {
    try {
      if (count > 0) {
        (navigator as any).setAppBadge(count).catch(() => {});
      } else {
        (navigator as any).clearAppBadge().catch(() => {});
      }
    } catch {}
  }
}
