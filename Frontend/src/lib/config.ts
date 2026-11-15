const ENV_BACKEND = import.meta.env.VITE_BACKEND_URL;

export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    // If accessing from another device via Wi-Fi IP or external hostname (e.g. 172.21.1.104),
    // automatically point API & WebSocket requests to that same host on port 5000.
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      if (!ENV_BACKEND || ENV_BACKEND.includes("localhost") || ENV_BACKEND.includes("127.0.0.1")) {
        return `${window.location.protocol}//${window.location.hostname}:5000`;
      }
    }
  }
  return ENV_BACKEND || "http://localhost:5000";
}

export const BACKEND_URL = getBackendUrl();

