import { io, Socket } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

let socket: Socket | null = null;
let currentToken: string | null = null;

export type SocketConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

export function getSocket(): Socket | null {
  return socket;
}

export function initSocketClient(
  token: string,
  onStatusChange?: (status: SocketConnectionStatus) => void
): Socket {
  if (socket && currentToken === token && socket.connected) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  currentToken = token;
  onStatusChange?.("connecting");

  socket = io(BACKEND_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
    timeout: 10000,
  });

  socket.on("connect", () => {
    console.log("[Socket.IO Client] Connected to backend, socket ID:", socket?.id);
    onStatusChange?.("connected");
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket.IO Client] Disconnected:", reason);
    onStatusChange?.("disconnected");
  });

  socket.on("connect_error", (error) => {
    console.warn("[Socket.IO Client] Connection error:", error.message);
    onStatusChange?.("error");
  });

  return socket;
}

export function disconnectSocketClient(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}

export function joinConversationRoom(conversationId: string): void {
  if (socket?.connected) {
    socket.emit("join_conversation", { conversationId });
  }
}

export function leaveConversationRoom(conversationId: string): void {
  if (socket?.connected) {
    socket.emit("leave_conversation", { conversationId });
  }
}
