const ENV_BACKEND = import.meta.env.VITE_BACKEND_URL;
const PRODUCTION_FALLBACK_BACKEND = "https://action-flow-802k.onrender.com";

export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    // Check if accessing from a local network IP (e.g. 192.168.x.x, 10.x.x.x, 172.16-31.x.x) or .local
    const isLocalIp =
      /^(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.0\.0\.1)/.test(hostname) ||
      hostname.endsWith(".local");

    // Local Wi-Fi device access to developer machine
    if (isLocalIp && !isLocalhost) {
      if (!ENV_BACKEND || ENV_BACKEND.includes("localhost") || ENV_BACKEND.includes("127.0.0.1")) {
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

  if (ENV_BACKEND && !ENV_BACKEND.includes("your-backend-app")) {
    return ENV_BACKEND;
  }
  return PRODUCTION_FALLBACK_BACKEND;
}

export const BACKEND_URL = getBackendUrl();

