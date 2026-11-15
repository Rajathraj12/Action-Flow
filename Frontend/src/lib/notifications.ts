/**
 * Cross-platform desktop and browser notification dispatcher for ActionFlow.
 * Automatically delegates to Electron IPC for native OS notifications on macOS/Windows/Linux,
 * and falls back to standard Web Notification API when running in the browser.
 */

interface NotifyOptions {
  title: string;
  body: string;
  icon?: string;
  conversationId?: string;
  silent?: boolean;
}

export function notifyDesktop({ title, body, conversationId }: NotifyOptions) {
  if (typeof window === "undefined") return;

  console.log("[ActionFlow Desktop] notifyDesktop invoked:", { title, body, conversationId });

  // 1. Native Electron OS Notification (macOS Notification Center / Windows Action Center)
  if ((window as any).electronAPI?.sendNotification) {
    try {
      (window as any).electronAPI.sendNotification(title, body).then((res: any) => {
        console.log("[ActionFlow Desktop] Native notification dispatched result:", res);
      }).catch((err: any) => {
        console.warn("[ActionFlow Desktop] Native notification error:", err);
      });
      return;
    } catch (err) {
      console.warn("[ActionFlow Desktop] Failed to invoke sendNotification:", err);
    }
  }

  // 2. Web Notification Fallback (if running in standard browser)
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      try {
        const notif = new Notification(title, {
          body,
          icon: "/icon.png",
          badge: "/icon.png",
          tag: conversationId || "actionflow-message",
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (err) {
        console.warn("[ActionFlow Web] HTML5 Notification error:", err);
      }
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          try {
            new Notification(title, { body, icon: "/icon.png" });
          } catch {}
        }
      }).catch(() => {});
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
