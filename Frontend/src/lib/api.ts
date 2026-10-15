const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

let authToken: string | null = null;

export function setApiToken(token: string | null): void {
  authToken = token;
}

export function getApiToken(): string | null {
  return authToken;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const url = `${BACKEND_URL}${endpoint}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (netErr: any) {
    throw new Error(
      `Network error connecting to backend at ${BACKEND_URL}. Ensure the backend server is running.`
    );
  }

  if (!response.ok) {
    let errorMsg = `Request failed (${response.status})`;
    try {
      const errorJson = await response.json();
      if (errorJson.error) {
        errorMsg = errorJson.error;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export interface BackendUser {
  _id: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  initials: string;
  role: string;
  online: boolean;
  lastSeen?: string;
}

export interface BackendConversation {
  id: string;
  name: string;
  role: string;
  initials: string;
  online: boolean;
  unread: number;
  lastMessageText: string;
  lastMessageTime: string;
  otherUser?: {
    id: string;
    displayName: string;
    email: string;
    initials: string;
    online: boolean;
  } | null;
}

export interface BackendMessage {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
  createdAt: string;
  status: "sent" | "delivered" | "read";
  isEdited?: boolean;
  editedAt?: string;
  isDeletedForEveryone?: boolean;
  deliveredAt?: string;
  readAt?: string;
  sender?: {
    id: string;
    displayName: string;
    initials: string;
  };
}

export interface MessageInfoResponse {
  id: string;
  text: string;
  status: "sent" | "delivered" | "read";
  isEdited: boolean;
  editedAt?: string;
  isDeletedForEveryone: boolean;
  sentAt: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  sender: {
    id: string;
    displayName: string;
    email: string;
    initials: string;
  };
  recipient?: {
    id: string;
    displayName: string;
    email: string;
    initials: string;
    online: boolean;
  } | null;
}

export const api = {
  getMe: () => request<{ user: BackendUser }>("/api/auth/me"),
  getUsers: () => request<{ users: BackendUser[] }>("/api/auth/users"),
  getConversations: () => request<{ conversations: BackendConversation[] }>("/api/conversations"),
  createConversation: (recipientId: string) =>
    request<{ conversation: BackendConversation; isExisting: boolean }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ recipientId }),
    }),
  getMessages: (conversationId: string, limit = 50) =>
    request<{ messages: BackendMessage[]; total: number }>(
      `/api/conversations/${conversationId}/messages?limit=${limit}`
    ),
  sendMessage: (conversationId: string, text: string) =>
    request<{ message: BackendMessage }>(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  editMessage: (conversationId: string, messageId: string, text: string) =>
    request<{ success: boolean; message: { id: string; text: string; isEdited: boolean; editedAt: string } }>(
      `/api/conversations/${conversationId}/messages/${messageId}`,
      {
        method: "PUT",
        body: JSON.stringify({ text }),
      }
    ),
  deleteMessage: (conversationId: string, messageId: string, deleteType: "everyone" | "me") =>
    request<{ success: boolean; deleteType: string; messageId: string }>(
      `/api/conversations/${conversationId}/messages/${messageId}`,
      {
        method: "DELETE",
        body: JSON.stringify({ deleteType }),
      }
    ),
  getMessageInfo: (conversationId: string, messageId: string) =>
    request<{ info: MessageInfoResponse }>(
      `/api/conversations/${conversationId}/messages/${messageId}/info`
    ),
  markConversationRead: (conversationId: string) =>
    request<{ success: boolean; count: number }>(`/api/conversations/${conversationId}/read`, {
      method: "POST",
    }),
};
