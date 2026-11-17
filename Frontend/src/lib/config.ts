const ENV_BACKEND = import.meta.env.VITE_BACKEND_URL;
const PRODUCTION_FALLBACK_BACKEND = "https://action-flow-802k.onrender.com";

export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    // Explicit opt-in for local backend only if ?backend=local is passed
    if (urlParams.get("backend") === "local") {
      return "http://localhost:5000";
    }

    const isDesktop =
      urlParams.get("desktop") === "true" ||
      (window as any).electronAPI?.isDesktop ||
      (window as any).isDesktop ||
      (window as any).isElectron ||
      window.navigator.userAgent.toLowerCase().includes("actionflowdesktop");

    // In desktop mode or standalone Electron window, always connect directly to Render cloud backend
    if (isDesktop) {
      if (
        ENV_BACKEND &&
        !ENV_BACKEND.includes("localhost") &&
        !ENV_BACKEND.includes("127.0.0.1") &&
        !ENV_BACKEND.includes("your-backend-app")
      ) {
        return ENV_BACKEND;
      }
      return PRODUCTION_FALLBACK_BACKEND;
    }

    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    // Check if accessing from a local network IP (e.g. 192.168.x.x, 10.x.x.x, 172.16-31.x.x) or .local
    const isLocalIp =
      /^(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.0\.0\.1)/.test(hostname) ||
      hostname.endsWith(".local");

    // Local Wi-Fi device access to developer machine (only if ENV_BACKEND is explicitly set to localhost)
    if (isLocalIp && !isLocalhost) {
      if (ENV_BACKEND && (ENV_BACKEND.includes("localhost") || ENV_BACKEND.includes("127.0.0.1"))) {
        return `${window.location.protocol}//${hostname}:5000`;
      }
    }

    // If running on a public production cloud domain (e.g. *.vercel.app, *.onrender.com, custom domains)
    const isPublicWeb = !isLocalhost && !isLocalIp;
    if (isPublicWeb) {
      if (
        ENV_BACKEND &&
        !ENV_BACKEND.includes("localhost") &&
        !ENV_BACKEND.includes("127.0.0.1") &&
        !ENV_BACKEND.includes("your-backend-app")
      ) {
        return ENV_BACKEND;
      }
      return PRODUCTION_FALLBACK_BACKEND;
    }
  }

  if (
    ENV_BACKEND &&
    !ENV_BACKEND.includes("your-backend-app") &&
    !ENV_BACKEND.includes("localhost") &&
    !ENV_BACKEND.includes("127.0.0.1")
  ) {
    return ENV_BACKEND;
  }
  return PRODUCTION_FALLBACK_BACKEND;
}

export const BACKEND_URL = getBackendUrl();

